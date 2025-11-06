// --- Global State & Config ---
let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
window.confirmationResult = null;

// Paystack Public Key
let paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e";
const callCostPerMinute = 13;

// --- AUDIO STATE AND UTILITIES (NEW) ---
let audioContext = null; // For general audio (TTS)
let announcementAudio = null; // To hold the TTS Audio object

let audioContextRing = null; // For ringback tone
let ringbackInterval = null;
let ringbackOscillator1 = null;
let ringbackOscillator2 = null;
let ringbackGainNode = null;

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Helper for WAV file generation
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Helper to convert PCM data to a WAV Blob (Signed 16-bit PCM)
function pcmToWav(pcm16, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + pcm16.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 = PCM)
    view.setUint16(20, 1, true);
    // number of channels
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate
    view.setUint32(28, byteRate, true);
    // block align
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, bitsPerSample, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, pcm16.length * 2, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcm16.length; i++, offset += 2) {
        view.setInt16(offset, pcm16[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

// --- FEATURE 1: CALL ANNOUNCEMENT (TTS) ---
async function playCallAnnouncement(message) {
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const payload = {
            contents: [{ parts: [{ text: message }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" } // Using Kore voice for a firm, clear tone
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

        // Retry mechanism for API call (Exponential Backoff)
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await response.json();
                const part = result?.candidates?.[0]?.content?.parts?.[0];
                const audioData = part?.inlineData?.data;
                const mimeType = part?.inlineData?.mimeType;

                if (audioData && mimeType && mimeType.startsWith("audio/L16")) {
                    const match = mimeType.match(/rate=(\d+)/);
                    const sampleRate = match ? parseInt(match[1], 10) : 16000;

                    const pcmData = base64ToArrayBuffer(audioData);
                    const pcm16 = new Int16Array(pcmData);
                    const wavBlob = pcmToWav(pcm16, sampleRate);
                    
                    const audioUrl = URL.createObjectURL(wavBlob);
                    announcementAudio = new Audio(audioUrl);
                    
                    // Start playback immediately and return a Promise that resolves when it's finished
                    return new Promise(resolve => {
                        announcementAudio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            resolve();
                        };
                        announcementAudio.onerror = (e) => {
                            console.error("Announcement audio playback error:", e);
                            URL.revokeObjectURL(audioUrl);
                            resolve(); // Resolve to continue call flow even on playback error
                        };
                        announcementAudio.play().catch(e => {
                            console.error("Failed to play audio (likely due to browser autoplay policy):", e);
                            // In case of autoplay block, resolve immediately to continue the call
                            resolve();
                        });
                    });
                } else {
                    console.error("TTS API did not return valid audio data.", result);
                    break; // Exit retry loop on invalid data
                }
            } catch (error) {
                console.warn(`TTS API call failed on attempt ${attempt + 1}. Retrying...`, error);
                if (attempt < maxRetries - 1) {
                    await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000)); // Exponential backoff
                }
            }
        }
        return Promise.resolve(); // Fallback: resolve immediately if all retries fail
    } catch (error) {
        console.error("Error during TTS setup or playback:", error);
        return Promise.resolve(); // Continue call flow on failure
    }
}

// --- FEATURE 2: RINGBACK TONE (Web Audio API) ---

function startRingbackTone() {
    // If already running, do nothing
    if (ringbackInterval) return;

    if (!audioContextRing) {
        audioContextRing = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume context if suspended (needed for some mobile browsers)
    if (audioContextRing.state === 'suspended') {
        audioContextRing.resume().catch(e => console.error("Failed to resume audio context:", e));
    }

    // Create components
    ringbackOscillator1 = audioContextRing.createOscillator();
    ringbackOscillator2 = audioContextRing.createOscillator();
    ringbackGainNode = audioContextRing.createGain();

    // Standard Ringback Frequencies (440Hz and 480Hz for a common tone)
    ringbackOscillator1.frequency.setValueAtTime(440, audioContextRing.currentTime);
    ringbackOscillator2.frequency.setValueAtTime(480, audioContextRing.currentTime);
    ringbackOscillator1.type = 'sine';
    ringbackOscillator2.type = 'sine';

    // Connect nodes: Oscillators -> Gain -> Destination
    ringbackOscillator1.connect(ringbackGainNode);
    ringbackOscillator2.connect(ringbackGainNode);
    ringbackGainNode.connect(audioContextRing.destination);

    // Initial gain (mute)
    ringbackGainNode.gain.setValueAtTime(0, audioContextRing.currentTime);

    // Start oscillators (they run continuously, we just modulate the gain)
    ringbackOscillator1.start();
    ringbackOscillator2.start();

    // Ring pattern (1 second ON, 2 seconds OFF)
    const ringDuration = 1; // seconds (the "Duuut...")
    const silenceDuration = 2; // seconds
    const intervalTime = (ringDuration + silenceDuration) * 1000; // ms

    function ringCycle() {
        const now = audioContextRing.currentTime;
        // Ring ON (Set gain to 0.5 for audibility)
        ringbackGainNode.gain.setValueAtTime(0.5, now);
        // Ring OFF (Set gain to 0 after ringDuration)
        ringbackGainNode.gain.setValueAtTime(0, now + ringDuration);
    }

    // Start first cycle immediately
    ringCycle();
    // Set interval for subsequent cycles
    ringbackInterval = setInterval(ringCycle, intervalTime);

    console.log("Ringback tone started.");
}

function stopRingbackTone() {
    if (ringbackInterval) {
        clearInterval(ringbackInterval);
        ringbackInterval = null;
    }
    
    // Stop oscillators smoothly
    if (ringbackOscillator1 && ringbackGainNode) {
        try {
            // Smoothly ramp down the volume
            ringbackGainNode.gain.setValueAtTime(ringbackGainNode.gain.value, audioContextRing.currentTime);
            ringbackGainNode.gain.linearRampToValueAtTime(0.001, audioContextRing.currentTime + 0.1);
            
            // Stop oscillators after the fade
            setTimeout(() => {
                try {
                    ringbackOscillator1.stop();
                    ringbackOscillator2.stop();
                } catch (e) { /* already stopped */ }
            }, 150); 
        } catch(e) { /* Ignore if context is closed */ }
    }
    ringbackOscillator1 = null;
    ringbackOscillator2 = null;
    ringbackGainNode = null;

    // Also stop announcement audio if it was still playing
    if (announcementAudio) {
        announcementAudio.pause();
        announcementAudio = null;
    }

    console.log("Ringback tone stopped.");
}
// --- END AUDIO FUNCTIONS ---


// --- LOADER FUNCTIONS ---
const loader = document.getElementById('loader');
function showLoader() { loader.classList.add('show'); }
function hideLoader() {
    setTimeout(() => {
        loader.classList.remove('show');
    }, 300);
}

// --- Theme Toggle Function ---
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark-theme', isDarkTheme);
    const themeIcon = document.querySelector('#themeToggleButton i');
    themeIcon.classList.toggle('fa-sun', !isDarkTheme);
    themeIcon.classList.toggle('fa-moon', isDarkTheme);
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

// --- On Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    showLoader();
    document.title = "SmartCall - Your Connection to the World";
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        toggleTheme();
    }
    
    // Initialize Firebase once the DOM is ready
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
    if (Object.keys(firebaseConfig).length > 0) {
        window.app = firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        
        setupAuthListener();
    } else {
        console.error("Firebase config is missing or invalid.");
        hideLoader();
    }

    // Initialize custom dialogs
    initializeCustomDialogs();

    // Check if we need to navigate to the call page based on contact link
    const params = new URLSearchParams(window.location.search);
    const contactNumber = params.get('call');
    if (contactNumber) {
        document.getElementById('dialInput').value = contactNumber;
        navigate('dialpadPage', false);
        // Call will be manually started by user
    } else {
        navigate('welcomePage', false);
    }
    
    hideLoader();

    // Set initial active tab for main pages
    setActiveTab('contacts'); 
});

// --- NAVIGATION & UI HELPERS ---

function navigate(pageId, recordHistory = true) {
    // Hide all main containers
    document.querySelectorAll('.container').forEach(container => {
        container.classList.add('hidden');
        container.classList.remove('active-page');
    });

    // Show the target container
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active-page');

        // Update the URL hash to allow for basic history navigation (Back button support)
        if (recordHistory) {
            window.location.hash = pageId;
        }
    } else {
        console.error("Attempted to navigate to unknown page:", pageId);
    }
    
    // Close any open overlays when navigating
    closeAllOverlays();
}

function setActiveTab(tabId) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

    document.getElementById(`${tabId}TabBtn`).classList.add('active');
    document.getElementById(`${tabId}Content`).classList.remove('hidden');

    if (tabId === 'history') {
        renderRecentCalls();
    }
}


function closeAllOverlays() {
    document.querySelectorAll('.overlay').forEach(overlay => overlay.classList.add('hidden'));
}

// --- AUTHENTICATION ---

function setupAuthListener() {
    auth.onAuthStateChanged(async (user) => {
        hideLoader();
        if (user) {
            loggedInUser = user;
            console.log("User logged in:", user.uid);
            await setupUserAndDataListeners(user.uid);
            navigate('mainPage', false);
        } else {
            loggedInUser = null;
            stopUserListener();
            stopCallHistoryListener();
            navigate('welcomePage', false);
        }
    });

    if (typeof __initial_auth_token !== 'undefined') {
        auth.signInWithCustomToken(__initial_auth_token).catch(error => {
            console.error("Error signing in with custom token:", error);
            auth.signInAnonymously();
        });
    } else {
        auth.signInAnonymously();
    }
}

function handleAuthInput() {
    const countryCode = document.getElementById('countryCode').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const fullNumber = countryCode + phoneNumber.replace(/\s/g, '');

    if (!fullNumber || !/^\+?\d{10,15}$/.test(fullNumber)) {
        showAlert("Please enter a valid phone number including country code.");
        return;
    }

    showConfirm(`Is this number correct? ${fullNumber}`, () => {
        showLoader();
        
        // This is a placeholder for Firebase phone authentication setup
        // For a full implementation, the reCAPTCHA verifier would be attached here
        const appVerifier = window.recaptchaVerifier; 
        
        /* auth.signInWithPhoneNumber(fullNumber, appVerifier)
            .then((confirmationResult) => {
                window.confirmationResult = confirmationResult;
                document.getElementById('verificationNumber').textContent = fullNumber;
                navigate('verificationPage');
            }).catch((error) => {
                hideLoader();
                showAlert("Authentication failed. Please check the number and try again. Error: " + error.message);
                console.error("Phone auth error:", error);
            });
        */

        // SIMULATION: Navigate directly to verification page in a real environment without reCAPTCHA setup
        window.confirmationResult = { code: '123456' }; // Mock confirmation result
        document.getElementById('verificationNumber').textContent = fullNumber;
        hideLoader();
        navigate('verificationPage');
    });
}

function verifyCode() {
    const code = document.getElementById('verificationCode').value;
    if (!code || code.length < 6) {
        showAlert("Please enter the 6-digit verification code.");
        return;
    }

    showLoader();

    /* window.confirmationResult.confirm(code).then((result) => {
        // User signed in successfully.
        // The onAuthStateChanged listener will handle navigation and setup.
    }).catch((error) => {
        hideLoader();
        showAlert("Invalid code. Please try again. Error: " + error.message);
    });
    */

    // SIMULATION: In a real app, this would be handled by the onAuthStateChanged listener after confirm().
    // For this simulation, we'll just log success and navigate.
    if (code === window.confirmationResult.code) {
        hideLoader();
        showAlert("Verification successful!");
        navigate('mainPage');
    } else {
        hideLoader();
        showAlert("Invalid code. Please try again.");
    }
}

function logout() {
    auth.signOut().then(() => {
        showAlert("You have been signed out.");
        navigate('welcomePage');
    }).catch((error) => {
        console.error("Logout error:", error);
        showAlert("Logout failed: " + error.message);
    });
}


// --- FIRESTORE LISTENERS ---

async function setupUserAndDataListeners(uid) {
    // Stop previous listeners if any
    stopUserListener();
    stopCallHistoryListener();

    // 1. User Profile Listener
    const userDocRef = db.collection('users').doc(uid);
    stopUserListener = userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            const displayName = userData.displayName || 'Guest User';
            const credit = userData.credit || 0;
            
            window.userCredit = credit;

            // Update UI elements
            document.getElementById('mainPageGreeting').textContent = `Hello, ${displayName}`;
            document.getElementById('profileDisplayName').textContent = displayName;
            document.getElementById('profilePhoneNumber').textContent = loggedInUser.phoneNumber || 'N/A';
            document.getElementById('profileCredit').textContent = `Credit: ₦${credit.toFixed(2)}`;
            document.getElementById('balanceDisplay').textContent = `₦${credit.toFixed(2)}`;

            // Referral Link Generation (Mocked for now)
            document.getElementById('referralLink').value = `https://smartcall.app/r/${uid.substring(0, 8)}`;
            
        } else {
            // Create initial profile if it doesn't exist (First time login)
            userDocRef.set({
                displayName: `SmartCaller-${uid.substring(0, 4)}`,
                credit: 50, // Initial free credit
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).then(() => console.log("Initial profile created.")).catch(e => console.error("Error creating profile:", e));
        }
    }, error => {
        console.error("User profile snapshot error:", error);
    });

    // 2. Call History Listener
    const callHistoryRef = userDocRef.collection('callHistory').orderBy('timestamp', 'desc').limit(20);
    stopCallHistoryListener = callHistoryRef.onSnapshot(snapshot => {
        const history = [];
        snapshot.forEach(doc => {
            history.push({ id: doc.id, ...doc.data() });
        });
        window.callHistory = history;
        renderRecentCalls(); // Re-render history whenever data changes
    }, error => {
        console.error("Call history snapshot error:", error);
    });
}

function addCallToHistory(number, durationMinutes, cost, status) {
    if (!loggedInUser) return;

    const callHistoryRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory');

    callHistoryRef.add({
        number: number,
        duration: durationMinutes,
        cost: cost,
        status: status,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(error => {
        console.error("Error writing call history:", error);
    });
}

function renderRecentCalls() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (!window.callHistory || window.callHistory.length === 0) {
        historyList.innerHTML = '<p class="text-center mt-4 text-gray-500">No calls yet. Make your first call!</p>';
        return;
    }

    historyList.innerHTML = window.callHistory.map(call => {
        const durationText = call.duration > 0 ? `${call.duration.toFixed(1)} mins` : '—';
        const costText = `₦${call.cost.toFixed(2)}`;
        const time = call.timestamp ? new Date(call.timestamp.toDate()).toLocaleString() : 'Just now';
        
        let statusClass = 'text-green-500';
        let statusIcon = '<i class="fas fa-check-circle"></i>';
        if (call.status === 'Failed') {
            statusClass = 'text-red-500';
            statusIcon = '<i class="fas fa-times-circle"></i>';
        } else if (call.status === 'Missed') {
            statusClass = 'text-yellow-500';
            statusIcon = '<i class="fas fa-exclamation-circle"></i>';
        }

        return `
            <div class="history-item">
                <div class="call-info">
                    <span class="call-number">${call.number}</span>
                    <span class="call-time">${time}</span>
                </div>
                <div class="call-details">
                    <span class="call-status ${statusClass}">${statusIcon} ${call.status}</span>
                    <span>Duration: ${durationText}</span>
                    <span class="call-cost">Cost: ${costText}</span>
                </div>
                <button class="call-again-btn" onclick="dialInput('${call.number}')" aria-label="Call ${call.number} again"><i class="fas fa-phone-alt"></i></button>
            </div>
        `;
    }).join('');
}


// --- CONTACTS ---

function openNewContactOverlay() {
    document.getElementById('newContactOverlay').classList.remove('hidden');
    document.getElementById('contactName').value = '';
    document.getElementById('contactNumber').value = '';
}

function saveContact() {
    const name = document.getElementById('contactName').value.trim();
    const number = document.getElementById('contactNumber').value.trim().replace(/\s/g, '');

    if (!name || !number) {
        showAlert("Please enter both name and number.");
        return;
    }

    if (!/^\+?\d{10,15}$/.test(number)) {
        showAlert("Please enter a valid phone number.");
        return;
    }

    showLoader();
    if (!loggedInUser) {
        showAlert("You must be logged in to save contacts.");
        hideLoader();
        return;
    }

    const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
    contactsRef.add({
        name: name,
        number: number,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        hideLoader();
        showAlert('Contact saved successfully!');
        closeAllOverlays();
        renderContacts(); // Assuming we need to re-render contacts list
    }).catch(error => {
        console.error("Error saving contact: ", error);
        hideLoader();
        showAlert('Error saving contact: ' + error.message);
    });
}

function renderContacts() {
    const contactsList = document.getElementById('contactsList');
    if (!contactsList) return;

    if (!loggedInUser) {
        contactsList.innerHTML = '<p class="text-center mt-4 text-gray-500">Please log in to see your contacts.</p>';
        return;
    }

    const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
    
    // Simple fetch (no real-time listener for simplicity, can be updated later)
    contactsRef.get().then(snapshot => {
        allContacts = [];
        snapshot.forEach(doc => {
            allContacts.push({ id: doc.id, ...doc.data() });
        });

        if (allContacts.length === 0) {
            contactsList.innerHTML = '<p class="text-center mt-4 text-gray-500">No contacts yet. Add one!</p>';
            return;
        }

        contactsList.innerHTML = allContacts.map(contact => `
            <div class="contact-item" onclick="dialInput('${contact.number}', '${contact.name}')">
                <div class="contact-info">
                    <span class="contact-name">${contact.name}</span>
                    <span class="contact-number">${contact.number}</span>
                </div>
                <button class="call-btn"><i class="fas fa-phone-alt"></i></button>
            </div>
        `).join('');

    }).catch(error => {
        console.error("Error fetching contacts:", error);
        contactsList.innerHTML = `<p class="text-center mt-4 text-red-500">Error loading contacts.</p>`;
    });
}

// Initial render attempt when switching to main page
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#mainPage') {
        renderContacts();
    }
});


// --- DIALPAD & CALLING LOGIC ---

function dialInput(value, contactName = null) {
    const dialInputEl = document.getElementById('dialInput');
    
    // If a number/name is passed, set the input and navigate to the dialpad
    if (typeof value === 'string' && value.startsWith('+')) {
        dialInputEl.value = value;
        if (contactName) {
            document.getElementById('targetNameDisplay').textContent = contactName;
        } else {
            document.getElementById('targetNameDisplay').textContent = 'Unknown';
        }
        navigate('dialpadPage');
        return;
    }

    // Handle keypad input
    if (value === 'delete') {
        dialInputEl.value = dialInputEl.value.slice(0, -1);
    } else if (value === 'keypad') {
        // Show keypad overlay if needed
        return;
    } else {
        dialInputEl.value += value;
    }
    
    // Clear any temporary name display
    document.getElementById('targetNameDisplay').textContent = '';
}

let callStartTime = null;
let callDurationInterval = null;

function updateCallUI(target, status) {
    document.getElementById('callerDisplayNumber').textContent = target;
    document.getElementById('callStatus').textContent = status;
    document.getElementById('callTimer').textContent = '00:00:00';
    // Reset timer
    if (callDurationInterval) clearInterval(callDurationInterval);
}

function startCallTimer() {
    callStartTime = Date.now();
    callDurationInterval = setInterval(() => {
        const elapsed = Date.now() - callStartTime;
        const totalSeconds = Math.floor(elapsed / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const format = (val) => val.toString().padStart(2, '0');
        document.getElementById('callTimer').textContent = `${format(hours)}:${format(minutes)}:${format(seconds)}`;
        
        // Update live cost (e.g., every 60 seconds)
        if (totalSeconds > 0 && totalSeconds % 60 === 0) {
            updateLiveCost(Math.ceil(totalSeconds / 60));
        }
    }, 1000);
}

function updateLiveCost(minutes) {
    if (!loggedInUser) return;
    const cost = minutes * callCostPerMinute;
    const newCredit = window.userCredit - (cost - window.lastCallCost || 0);
    window.lastCallCost = cost;

    // Simulate credit update in Firestore (optional: actual deduction would happen post-call)
    // For now, just update the displayed credit (which is tied to the listener)
    // This is more of a visual deduction, the actual deduction should be backend-controlled.
}

async function startCallSimulation(targetNumber, contactName = null) {
    if (!targetNumber || !/^\+?\d{10,15}$/.test(targetNumber)) {
        showAlert("Please enter a valid phone number to call.");
        return;
    }

    if (!loggedInUser) {
        showAlert("You must be logged in to make a call.");
        return;
    }

    // Check balance before proceeding
    if (window.userCredit < callCostPerMinute) {
        showAlert(`Insufficient credit. Minimum required credit for a call is ₦${callCostPerMinute}. Please top up.`);
        return;
    }

    showLoader();
    navigate('callPage', false);
    const targetDisplay = contactName || targetNumber;
    updateCallUI(targetDisplay, 'Connecting...');
    
    // Reset last cost for this call
    window.lastCallCost = 0;

    try {
        // 1. FEATURE 1: Play Call Announcement
        const announcementText = "Please wait while we connect your call, thank you for using SmartCall.";
        updateCallUI(targetDisplay, 'Announcement...');
        await playCallAnnouncement(announcementText); // WAIT for announcement to finish

        // 2. Start API Call to backend
        updateCallUI(targetDisplay, 'Calling...');
        
        // The real API call to your backend index.js running on port 3000
        const apiResponse = await fetch('http://localhost:3000/api/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to: targetNumber }),
        });

        const response = await apiResponse.json();

        hideLoader();

        if (response.success) {
            // 3. FEATURE 2: Start Ringback Tone
            startRingbackTone();
            updateCallUI(targetDisplay, 'Ringing...'); // Update UI to Ringing
            
            // --- SIMULATION OF ANSWERING ---
            // In a real app, Africa's Talking webhook would notify the client when the call is ANSWERED.
            setTimeout(() => {
                stopRingbackTone(); // Stop ringback when call is "answered"
                updateCallUI(targetDisplay, 'Connected');
                startCallTimer();
                showAlert(`Call with ${targetDisplay} connected!`);
            }, 8000); // Wait 8 seconds for the simulated "ring"

        } else {
            // Call API failed
            updateCallUI(targetDisplay, 'Failed');
            addCallToHistory(targetNumber, 0, 0, 'Failed');
            showAlert('Call failed to initiate: ' + (response.error || 'Server error.'));
            setTimeout(() => endCallSimulation(false), 3000);
        }

    } catch (error) {
        hideLoader();
        updateCallUI(targetDisplay, 'Error');
        addCallToHistory(targetNumber, 0, 0, 'Failed');
        showAlert('Network error or server unreachable: ' + error.message);
        setTimeout(() => endCallSimulation(false), 3000);
    }
}

function toggleMute() {
    const muteBtn = document.getElementById('muteBtn');
    muteBtn.classList.toggle('active');
    const isMuted = muteBtn.classList.contains('active');
    muteBtn.querySelector('i').classList.toggle('fa-microphone', !isMuted);
    muteBtn.querySelector('i').classList.toggle('fa-microphone-slash', isMuted);
    // Real implementation: Control client-side media stream mute
    console.log(`Mic is now ${isMuted ? 'muted' : 'unmuted'}`);
}

function toggleSpeaker() {
    const speakerBtn = document.getElementById('speakerBtn');
    speakerBtn.classList.toggle('active');
    const isActive = speakerBtn.classList.contains('active');
    speakerBtn.querySelector('i').classList.toggle('fa-volume-up', !isActive);
    speakerBtn.querySelector('i').classList.toggle('fa-volume-mute', isActive);
    // Real implementation: Control audio output device (e.g., if using WebRTC)
    console.log(`Speaker is now ${isActive ? 'active' : 'inactive'}`);
}

function endCallSimulation(isSuccessfulCall = true) {
    showLoader();
    
    // Stop any tones or announcement audio
    stopRingbackTone();

    // 1. Calculate duration and cost
    if (callDurationInterval) clearInterval(callDurationInterval);
    
    let durationMinutes = 0;
    let cost = 0;
    let status = 'Ended';

    if (callStartTime) {
        const totalSeconds = Math.floor((Date.now() - callStartTime) / 1000);
        if (totalSeconds > 0) {
            durationMinutes = totalSeconds / 60;
            cost = Math.ceil(durationMinutes) * callCostPerMinute;
        } else if (isSuccessfulCall) {
            // A quick connection that didn't last a second
            status = 'Connected'; 
        } else {
            // Call failed or was hung up before connecting/ringing started
            status = document.getElementById('callStatus').textContent === 'Ringing...' ? 'Missed' : 'Failed';
        }
    } else {
        // If call never started timer, it was likely failed or cancelled early
        status = 'Failed';
    }

    const targetNumber = document.getElementById('callerDisplayNumber').textContent;

    // 2. Add to history
    addCallToHistory(targetNumber, durationMinutes, cost, status);

    // 3. Backend Hangup (for real call)
    fetch('http://localhost:3000/api/end', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    }).then(res => res.json()).then(data => {
        console.log("Backend hangup result:", data);
        // Note: The real deduction happens here on the backend via the AT callback
    }).catch(error => {
        console.error("Backend hangup failed:", error);
    });

    // 4. Update UI
    setTimeout(() => {
        hideLoader();
        // Go back to the dialpad or main page
        navigate('dialpadPage'); 
        showAlert(`Call ${status}! Duration: ${durationMinutes.toFixed(1)} mins, Cost: ₦${cost.toFixed(2)}.`);
    }, 500);
}

// --- TOP-UP / PAYMENT LOGIC ---

function openTopUpOverlay() {
    document.getElementById('topUpAmount').value = 100; // Default to 100
    document.getElementById('topUpOverlay').classList.remove('hidden');
}

function processTopUp() {
    const amount = parseFloat(document.getElementById('topUpAmount').value);
    const email = loggedInUser?.email || 'guest@smartcall.app'; // Fallback email
    const uid = loggedInUser?.uid || 'guest';

    if (isNaN(amount) || amount <= 0) {
        showAlert("Please enter a valid amount.");
        return;
    }

    showLoader();

    try {
        // Initialize Paystack checkout
        const handler = PaystackPop.setup({
            key: paystackPublicKey, 
            email: email,
            amount: amount * 100, // Paystack uses Kobo (cents)
            ref: 'SC-' + uid + '-' + Date.now(),
            callback: function(response) {
                // Payment successful - verify and update Firestore
                verifyPayment(response.reference, amount, uid);
            },
            onClose: function() {
                // User closed the payment modal
                hideLoader();
                showAlert('Transaction cancelled by user.');
            },
        });
        handler.openIframe();
    } catch (error) {
        hideLoader();
        showAlert('Failed to start payment process. Is Paystack script loaded?');
        console.error("Paystack error:", error);
    }
}

function verifyPayment(reference, amount, uid) {
    // In a real application, this verification MUST happen on the backend
    // to prevent fraud. For this client-side simulation, we will assume success.
    
    // SIMULATION: Update credit directly on successful *mock* payment
    const userDocRef = db.collection('users').doc(uid);
    userDocRef.update({
        credit: firebase.firestore.FieldValue.increment(amount)
    }).then(() => {
        hideLoader();
        closeAllOverlays();
        showAlert(`Top-up successful! ₦${amount.toFixed(2)} added to your credit.`);
    }).catch(error => {
        hideLoader();
        showAlert('Payment successful but failed to update credit: ' + error.message);
        console.error("Credit update error:", error);
    });
}

// --- Custom Dialogs (Replace alert() and confirm()) ---

function initializeCustomDialogs() {
    window.customAlertDialog = document.getElementById('customAlertDialog');
    window.customAlertMessage = document.getElementById('customAlertMessage');

    window.customConfirmDialog = document.getElementById('customConfirmDialog');
    window.customConfirmMessage = document.getElementById('customConfirmMessage');
    window.confirmOkBtn = document.getElementById('confirmOkBtn');
    window.confirmCancelBtn = document.getElementById('confirmCancelBtn');
}

function showAlert(message) {
    if (!window.customAlertDialog) return alert(message);
    window.customAlertMessage.textContent = message;
    window.customAlertDialog.classList.remove('hidden');
}

function hideCustomAlert() {
    window.customAlertDialog.classList.add('hidden');
}

function showConfirm(message, onConfirm) {
    if (!window.customConfirmDialog) return confirm(message) ? onConfirm() : null;

    window.customConfirmMessage.textContent = message;
    
    // Clone and replace buttons to remove previous listeners
    const okBtn = window.confirmOkBtn.cloneNode(true);
    window.confirmOkBtn.parentNode.replaceChild(okBtn, window.confirmOkBtn);
    window.confirmOkBtn = okBtn;

    const cancelBtn = window.confirmCancelBtn.cloneNode(true);
    window.confirmCancelBtn.parentNode.replaceChild(cancelBtn, window.confirmCancelBtn);
    window.confirmCancelBtn = cancelBtn;

    // Set new listeners
    okBtn.onclick = () => {
        window.customConfirmDialog.classList.add('hidden');
        onConfirm();
    };
    cancelBtn.onclick = () => {
        window.customConfirmDialog.classList.add('hidden');
    };

    window.customConfirmDialog.classList.remove('hidden');
}

// --- REFERRAL LOGIC ---

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); 
    document.execCommand('copy');
    showAlert('Referral link copied to clipboard!');
}

function shareReferralLink() {
    if (navigator.share) {
        navigator.share({
            title: 'SmartCall Referral',
            text: 'Join me on SmartCall and get free credit!',
            url: document.getElementById('referralLink').value,
        }).catch((error) => console.log('Error sharing', error));
    } else {
        showAlert("Web Share API is not supported in this browser. Please use the copy button.");
    }
}
// --- New Function to Clear All Call History ---
function clearRecentCalls() {
    showConfirm('Are you sure you want to clear your entire call history? This cannot be undone.', () => {
        showLoader();
        if (!loggedInUser) {
            showAlert("You must be logged in to clear history.");
            hideLoader();
            return;
        }

        const callHistoryRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory');
        callHistoryRef.get().then(snapshot => {
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            return batch.commit();
        }).then(() => {
            hideLoader();
            showAlert('Call history cleared successfully!');
        }).catch(error => {
            console.error("Error clearing call history: ", error);
            hideLoader();
            showAlert('Error clearing call history: ' + error.message);
        });
    });
}