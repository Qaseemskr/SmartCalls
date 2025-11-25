/* ============================
   SMARTCALL - CLEANED script.js
   Replace entire script.js with this file
   ============================ */

/* --- Global State & Config --- */
let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
window.confirmationResult = null;

// Paystack Public Key
let paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e";
const callCostPerMinute = 13; // ₦ per minute

/* --- Helper: get DOM safely --- */
function $(id) { return document.getElementById(id); }

/* --- LOADER FUNCTIONS --- */
const loader = $('loader');
function showLoader() { if (loader) loader.classList.add('show'); }
function hideLoader() { if (loader) setTimeout(() => loader.classList.remove('show'), 300); }

/* --- THEME --- */
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark-theme', isDarkTheme);
    const themeIcon = document.querySelector('#themeToggleButton i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-sun', !isDarkTheme);
        themeIcon.classList.toggle('fa-moon', isDarkTheme);
    }
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

/* --- UTILS --- */
function showAlert(message) {
    const alertDialog = $('customAlertDialog');
    const alertMessage = $('customAlertMessage');
    if (alertDialog && alertMessage) {
        alertMessage.textContent = message;
        alertDialog.classList.add('active');
    } else {
        alert(message);
    }
}
function hideCustomAlert() {
    const alertDialog = $('customAlertDialog');
    if (alertDialog) alertDialog.classList.remove('active');
}

/* --- On Page Load (single listener) --- */
document.addEventListener('DOMContentLoaded', () => {
    // Page title + loader
    showLoader();
    document.title = "SmartCall - Your Connection to the World";

    // Theme restore
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        isDarkTheme = true;
        document.body.classList.add('dark-theme');
        const ti = document.querySelector('#themeToggleButton i');
        if (ti) { ti.classList.add('fa-moon'); ti.classList.remove('fa-sun'); }
    } else {
        const ti = document.querySelector('#themeToggleButton i');
        if (ti) { ti.classList.add('fa-sun'); ti.classList.remove('fa-moon'); }
    }

    // Populate country-code selects (avoid duplicates by clearing first)
    const countryCodes = ['+234 (Nigeria)', '+229 (Benin)', '+225 (Côte d’Ivoire)', '+233 (Ghana)', '+250 (Rwanda)', '+254 (Kenya)', '+235 (Chad)', '+227 (Niger)', '+218 (Libya)', '+249 (Sudan)'];
    const countryCodeSelects = document.querySelectorAll('select[id$="CountryCode"]');
    countryCodeSelects.forEach(select => {
        select.innerHTML = ''; // clear duplicates
        countryCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = code.split(' ')[0];
            option.textContent = code;
            select.appendChild(option);
        });
    });

    // small safety: ensure custom UI references exist
    if ($('dialPadDisplay')) $('dialPadDisplay').value = '';

    // finish loading
    hideLoader();
});

/* --- Navigation & Page Helpers --- */
function navigate(pageId) {
    showLoader();
    history.pushState({ pageId }, '', `#${pageId}`);
    showPage(pageId);
}
function showPage(pageId) {
    document.querySelectorAll('.container').forEach(page => {
        page.classList.add('hidden');
        page.classList.remove('active-page');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
        page.classList.add('active-page');
    }
    hideLoader();
}
function openOverlayWithHistory(overlayId) {
    showLoader();
    history.pushState({ overlayId }, '', `#${overlayId}`);
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.add('active');
    // load content if required
    if (overlayId === 'contactsPage') loadContacts();
    else if (overlayId === 'profilePage') populateProfile();
    else if (overlayId === 'callHistoryPage') loadFullCallHistory();
    else if (overlayId === 'referralPage') { generateReferralLink(); hideLoader(); }
    else hideLoader();
}
function closeOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove('active');
}
// browser/back handling
window.onpopstate = (event) => {
    const pageId = event.state && event.state.pageId;
    const overlayId = event.state && event.state.overlayId;
    if (pageId) {
        showPage(pageId);
        document.querySelectorAll('.fullscreen-overlay').forEach(o => o.classList.remove('active'));
    } else if (overlayId) {
        const ov = document.getElementById(overlayId);
        if (ov) ov.classList.add('active');
    } else {
        showPage('welcomePage');
        document.querySelectorAll('.fullscreen-overlay').forEach(o => o.classList.remove('active'));
    }
};

/* --- FIREBASE INIT (unchanged) --- */
const firebaseConfig = {
    apiKey: "AIzaSyDF5ROHRjFjwnm5fzdXhOc8Xzq0LOUyw1M",
    authDomain: "smartcalls-d49f5.firebaseapp.com",
    projectId: "smartcalls-d49f5",
    storageBucket: "smartcalls-d49f5.appspot.com",
    messagingSenderId: "854255870421",
    appId: "1:854255870421:web:177c38dc6de653a86edd5c",
    measurementId: "G-JKKWJEJK0B"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* --- Recaptcha handling: always recreate when needed --- */
function setupRecaptcha() {
    // Destroy existing verifier if present
    if (window.recaptchaVerifier) {
        try {
            window.recaptchaVerifier.clear();
        } catch (e) { /* ignore */ }
        window.recaptchaVerifier = null;
        window.recaptchaWidgetId = null;
    }
    // create new one
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible'
    });
    window.recaptchaVerifier.render().then(widgetId => {
        window.recaptchaWidgetId = widgetId;
    }).catch(e => {
        console.warn("recaptcha render failed", e);
    });
}

/* --- Auth functions (sendOtp/verify) --- */
function showRegisterForm(type) {
    const phoneSection = $('phoneAuthSection');
    const emailSection = $('emailAuthSection');
    const showPhoneBtn = $('showPhoneBtn');
    const showEmailBtn = $('showEmailBtn');
    const msg = $('registerAuthMessage');
    if (msg) msg.textContent = '';
    if (type === 'phone') {
        if (phoneSection) phoneSection.classList.remove('hidden');
        if (emailSection) emailSection.classList.add('hidden');
        if (showPhoneBtn) showPhoneBtn.classList.add('active');
        if (showEmailBtn) showEmailBtn.classList.remove('active');
    } else {
        if (phoneSection) phoneSection.classList.add('hidden');
        if (emailSection) emailSection.classList.remove('hidden');
        if (showPhoneBtn) showPhoneBtn.classList.remove('active');
        if (showEmailBtn) showEmailBtn.classList.add('active');
    }
}
function sendOtp() {
    showLoader();
    const countryCode = $('registerCountryCode') ? $('registerCountryCode').value : '+234';
    const phoneNumberInput = $('registerPhoneNumber') ? $('registerPhoneNumber').value.trim() : '';
    const authMessage = $('registerAuthMessage');
    if (authMessage) authMessage.textContent = '';
    if (!phoneNumberInput) {
        if (authMessage) authMessage.textContent = 'Please enter a phone number.';
        hideLoader(); return;
    }

    // (re)create recaptcha each attempt
    try {
        if (window.recaptchaWidgetId) grecaptcha.reset(window.recaptchaWidgetId);
    } catch (e) { /* ignore if grecaptcha missing */ }
    setupRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    const fullPhoneNumber = `${countryCode}${phoneNumberInput.startsWith('0') ? phoneNumberInput.substring(1) : phoneNumberInput}`;

    auth.signInWithPhoneNumber(fullPhoneNumber, appVerifier)
        .then(confirmationResult => {
            window.confirmationResult = confirmationResult;
            hideLoader();
            showAlert('Verification code has been sent!');
            const otpSection = $('otpSection');
            if (otpSection) otpSection.classList.remove('hidden');
        })
        .catch(error => {
            hideLoader();
            console.error("Firebase Auth Error:", error.code, error.message);
            if (authMessage) authMessage.textContent = "Error: Could not send code. Please check the number or try again later.";
            try { if (window.recaptchaWidgetId) grecaptcha.reset(window.recaptchaWidgetId); } catch(e){}
        });
}
function verifyOtp() {
    showLoader();
    const otp = $('otpInput') ? $('otpInput').value.trim() : '';
    const fullName = $('registerFullNamePhone') ? $('registerFullNamePhone').value.trim() : '';
    const authMessage = $('registerAuthMessage');
    if (authMessage) authMessage.textContent = '';
    if (!otp || otp.length !== 6) { if (authMessage) authMessage.textContent = 'Please enter a valid 6-digit code.'; hideLoader(); return; }
    if (!fullName) { if (authMessage) authMessage.textContent = 'Please enter your full name.'; hideLoader(); return; }

    window.confirmationResult.confirm(otp).then(result => {
        const user = result.user;
        const userRef = db.collection('users').doc(user.uid);
        return userRef.get().then(doc => {
            if (!doc.exists) {
                return userRef.set({ fullName, phoneNumber: user.phoneNumber, memberSince: new Date(), balance: 0 });
            }
        });
    }).then(() => {
        hideLoader();
        showAlert("Registration complete!");
    }).catch(error => {
        hideLoader();
        if (authMessage) authMessage.textContent = "Invalid code. Please try again.";
    });
}

/* --- Auth state listener --- */
auth.onAuthStateChanged(user => {
    if (stopUserListener) stopUserListener();
    if (stopCallHistoryListener) stopCallHistoryListener();
    if (user) {
        if (user.providerData[0].providerId === 'password' && !user.emailVerified) { hideLoader(); return; }
        loggedInUser = user;
        listenToUserData();
        listenToCallHistory();
        navigate('homePage');
    } else {
        loggedInUser = null;
        navigate('welcomePage');
    }
});

/* --- Real-time listeners with robust timestamp handling --- */
function listenToUserData() {
    if (!loggedInUser) return;
    const userRef = db.collection('users').doc(loggedInUser.uid);
    stopUserListener = userRef.onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            const wn = $('welcomeUserName'); if (wn) wn.textContent = userData.fullName || '';
            updateWalletBalance((userData.balance !== undefined) ? Number(userData.balance) : 0);
        }
    }, err => console.error("Error listening to user data:", err));
}

function listenToCallHistory(limit=5, targetElementId='recentCallsList') {
    if (!loggedInUser) return;
    let historyRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory').orderBy('timestamp', 'desc');
    if (limit) historyRef = historyRef.limit(limit);
    const historyListDiv = document.getElementById(targetElementId);
    stopCallHistoryListener = historyRef.onSnapshot(snapshot => {
        if (!historyListDiv) return;
        if (snapshot.empty) { historyListDiv.innerHTML = '<p class="placeholder-text">No recent calls.</p>'; return; }
        historyListDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const call = doc.data();
            let callDate = new Date();
            if (call.timestamp && typeof call.timestamp.toDate === 'function') callDate = call.timestamp.toDate();
            else if (call.timestamp && call.timestamp.seconds) callDate = new Date(call.timestamp.seconds * 1000);
            const formattedDate = callDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric'}) + ' ' + callDate.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
            const callItem = document.createElement('div');
            callItem.classList.add('history-item');
            callItem.innerHTML = `
                <div>
                    <div class="call-number">${call.contactName}</div>
                    <div class="call-time">${formattedDate} (${call.duration || '00:00'})</div>
                </div>
                <button class="call-again-btn" onclick="openCallScreen('${call.contactName}', '${call.contactPhone || call.contactName}')">Call Again</button>
            `;
            historyListDiv.appendChild(callItem);
        });
    }, err => console.error("Error logging call:", err));
}
function loadFullCallHistory() { showLoader(); listenToCallHistory(null, 'fullCallHistoryList'); }

/* --- Country code helper: gets selected code from dial or register select --- */
function getUserCountryCode() {
    const dialSelect = document.querySelector('select[id$="CountryCode"]');
    if (dialSelect && dialSelect.value) return dialSelect.value;
    const regSelect = $('registerCountryCode');
    if (regSelect && regSelect.value) return regSelect.value;
    return '+234';
}

/* --- DIAL PAD --- */
let currentNumber = '';
const dialPadDisplay = $('dialPadDisplay');
function dialInput(value) {
    if (value === 'backspace' && currentNumber.length > 0) currentNumber = currentNumber.slice(0, -1);
    else if (value !== 'backspace') currentNumber += value;
    if (dialPadDisplay) dialPadDisplay.value = currentNumber;
}
function clearDialPad() { currentNumber = ''; if (dialPadDisplay) dialPadDisplay.value = ''; }

/* --- AUDIO: connect & ring --- */
const connectAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5f05e4c3da.mp3?filename=please-hold-the-line-115132.mp3");
connectAudio.volume = 1.0;
connectAudio.preload = 'auto';

const ringAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_12f6943d15.mp3?filename=phone-ring-classic-24963.mp3");
ringAudio.loop = true;
ringAudio.volume = 0.6;
ringAudio.preload = 'auto';

/* --- CALL UI refs --- */
const callScreen = $('callScreen');
const callingContactName = $('callingContactName');
const callStatus = $('callStatus');
const callTimer = $('callTimer');

let callInterval;
let seconds = 0;
const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com/api/call";
const END_CALL_URL = "https://smartcall-backend-7cm9.onrender.com/api/end";

/* --- OPEN CALL SCREEN & START CALL (used by contacts) --- */
async function openCallScreen(name, number) {
    // UI setup
    if (callingContactName) callingContactName.textContent = name || number || 'Unknown';
    if (callScreen) {
        callScreen.setAttribute("data-contact-name", name || number || '');
        callScreen.setAttribute("data-contact-phone", number || '');
        callScreen.classList.add('active');
    }
    if (callStatus) callStatus.textContent = "Please wait while we connect your call...";

    // normalize by using selected country code if number doesn't start with +
    let toNumber = number || '';
    if (!toNumber.startsWith('+')) {
        const cc = getUserCountryCode();
        toNumber = cc + toNumber.replace(/^0+/, '');
    }

    // play connecting audio (may be blocked by autoplay policy, catch)
    try { connectAudio.currentTime = 0; connectAudio.play().catch(()=>{}); } catch(e){}

    // after a short pause, start ringback tone (only if call queued)
    const ringTimeout = setTimeout(() => {
        try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
        try { ringAudio.play().catch(()=>{}); } catch(e){}
        if (callStatus) callStatus.textContent = "Ringing...";
    }, 2500);

    showLoader();
    try {
        const res = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: toNumber })
        });
        const data = await res.json();
        hideLoader();

        // stop audios/timeouts
        clearTimeout(ringTimeout);
        try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
        try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}

        // check backend success / error
        if (res.ok && data && data.success) {
            // check AT returned status entry if it indicates insufficient credit or failure
            const status = (data.result && data.result.entries && data.result.entries[0] && data.result.entries[0].status) || '';
            const statusLower = String(status).toLowerCase();
            if (statusLower.includes('insufficient') || statusLower.includes('failed') || statusLower.includes('rejected') || statusLower.includes('error')) {
                const msg = "We are currently performing maintenance on our main wallet to improve call quality. Please try again shortly or recharge your personal wallet. Thank you for your patience.";
                if (callStatus) callStatus.textContent = msg;
                showAlert(msg);
                setTimeout(()=>{ if (callScreen) callScreen.classList.remove('active'); }, 3500);
                return;
            }

            // queued/connected
            if (callStatus) callStatus.textContent = "Connected";
            seconds = 0;
            if (callTimer) callTimer.textContent = "00:00";
            callInterval = setInterval(updateCallTimer, 1000);
        } else {
            const msg = (data && data.error) ? data.error : "Call failed to connect.";
            if (callStatus) callStatus.textContent = msg;
            showAlert(msg);
            setTimeout(()=>{ if (callScreen) callScreen.classList.remove('active'); }, 3000);
        }
    } catch (err) {
        hideLoader();
        clearTimeout(ringTimeout);
        try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
        try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}
        if (callStatus) callStatus.textContent = "Network Error. Please try again.";
        showAlert("Network error: " + (err.message || err));
        setTimeout(()=>{ if (callScreen) callScreen.classList.remove('active'); }, 3000);
    }
}

/* --- Start Call from Dialpad (real backend) --- */
async function startCallFromDialpad() {
    if (!currentNumber) { showAlert("Please enter a number to call."); return; }

    // normalize using selected country code
    let toNumber = currentNumber.startsWith('+') ? currentNumber : (getUserCountryCode() + currentNumber.replace(/^0+/, ''));

    // set UI then call backend flow using openCallScreen (reusing logic)
    openCallScreen(toNumber, toNumber);
}

/* --- Update Call Timer --- */
function updateCallTimer() {
    seconds++;
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    if (callTimer) callTimer.textContent = `${minutes}:${remainingSeconds}`;
}

/* --- End Call & deduct balance --- */
async function endCallSimulation() {
    showLoader();
    // stop timer
    clearInterval(callInterval);
    callInterval = null;

    const duration = callTimer ? callTimer.textContent : '00:00';
    const contactName = callScreen ? callScreen.getAttribute('data-contact-name') : '';
    const contactPhone = callScreen ? callScreen.getAttribute('data-contact-phone') : '';

    // Stop audio if playing
    try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
    try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}

    // call backend to hang up (best-effort)
    try {
        await fetch(END_CALL_URL, { method: 'POST' });
    } catch (err) {
        console.warn("End call backend error:", err);
    }

    // Hide UI
    if (callScreen) callScreen.classList.remove('active');
    hideLoader();
    showAlert(`Call with ${contactName || contactPhone} ended after ${duration}`);

    // Deduct balance: convert timer to seconds -> minutes (rounded up)
    if (loggedInUser && seconds > 0) {
        const minutesUsed = Math.ceil(seconds / 60);
        const amountDeduct = minutesUsed * callCostPerMinute;
        // perform transaction update
        const userRef = db.collection('users').doc(loggedInUser.uid);
        try {
            await db.runTransaction(async (tx) => {
                const doc = await tx.get(userRef);
                if (!doc.exists) throw new Error("User document missing");
                const currentBal = (doc.data().balance || 0);
                const newBal = Math.max(0, currentBal - amountDeduct);
                tx.update(userRef, { balance: newBal });
            });
        } catch (err) {
            console.error("Balance deduction failed:", err);
        }

        // Log call history with timestamp and duration
        try {
            await db.collection('users').doc(loggedInUser.uid).collection('callHistory').add({
                contactName: contactName || contactPhone,
                contactPhone: contactPhone || contactName,
                duration,
                cost: amountDeduct,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (err) {
            console.error("Failed to log call history:", err);
        }
    }

    // reset seconds
    seconds = 0;
    if (callTimer) callTimer.textContent = '00:00';
}

/* --- Contacts CRUD (keep as before but robust) --- */
function loadContacts() {
    showLoader();
    if (!loggedInUser) { hideLoader(); return; }
    const contactsListDiv = $('contactsList');
    if (!contactsListDiv) { hideLoader(); return; }
    contactsListDiv.innerHTML = '<p class="placeholder-text">Loading contacts...</p>';
    const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts').orderBy('name');
    contactsRef.onSnapshot(snapshot => {
        allContacts = [];
        snapshot.forEach(doc => allContacts.push({ id: doc.id, ...doc.data() }));
        displayContacts(allContacts);
        hideLoader();
    }, error => {
        console.error("Error loading contacts:", error);
        contactsListDiv.innerHTML = '<p class="error-message">Could not load contacts.</p>';
        hideLoader();
    });
}
function displayContacts(list) {
    const contactsListDiv = $('contactsList');
    if (!contactsListDiv) return;
    contactsListDiv.innerHTML = '';
    if (!list || list.length === 0) {
        contactsListDiv.innerHTML = '<p class="placeholder-text">No contacts found. Add one!</p>';
        return;
    }
    list.forEach(contact => {
        const contactDiv = document.createElement('div');
        contactDiv.classList.add('contact-item');
        const nameParts = (contact.name || '').split(' ');
        const initials = nameParts.map(p => p.charAt(0).toUpperCase()).join('');
        contactDiv.innerHTML = `
            <div class="contact-avatar">${initials}</div>
            <div class="contact-info">
                <div class="contact-name">${contact.name}</div>
                <div class="contact-phone">${contact.phone}</div>
            </div>
            <div class="contact-actions">
                <button class="icon-btn" onclick="openCallScreen('${escapeHtml(contact.name)}', '${escapeHtml(contact.phone)}')" aria-label="Call ${escapeHtml(contact.name)}"><i class="fas fa-phone"></i></button>
                <button class="icon-btn" onclick="openNewMessagePageWithRecipient('${escapeHtml(contact.name)}', '${escapeHtml(contact.phone)}')" aria-label="Message ${escapeHtml(contact.name)}"><i class="fas fa-comment"></i></button>
                <button class="icon-btn" onclick="openEditContactPage('${contact.id}')" aria-label="Edit ${escapeHtml(contact.name)}"><i class="fas fa-edit"></i></button>
                <button class="icon-btn" onclick="deleteContact('${contact.id}')" aria-label="Delete ${escapeHtml(contact.name)}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        contactsListDiv.appendChild(contactDiv);
    });
}
function escapeHtml(s) { return String(s || '').replace(/'/g, "\\'").replace(/"/g, '\\"'); }

/* --- Contact save/edit/delete simplified (unchanged logic) --- */
function saveNewContact() {
    showLoader();
    const name = $('newContactName') ? $('newContactName').value.trim() : '';
    const phone = $('newContactPhone') ? $('newContactPhone').value.trim() : '';
    const email = $('newContactEmail') ? $('newContactEmail').value.trim() : '';
    if (name && phone && loggedInUser) {
        db.collection('users').doc(loggedInUser.uid).collection('contacts').add({ name, phone, email })
            .then(()=>{ hideLoader(); showAlert('Contact saved successfully!'); history.back(); })
            .catch(err=>{ hideLoader(); showAlert('Error saving contact: '+err.message); });
    } else { hideLoader(); showAlert('Name and phone number are required.'); }
}
function openEditContactPage(contactId) {
    const contact = allContacts.find(c => c.id === contactId);
    if (!contact) { showAlert("Contact not found."); return; }
    if ($('editContactId')) $('editContactId').value = contact.id;
    if ($('editContactName')) $('editContactName').value = contact.name;
    if ($('editContactPhone')) $('editContactPhone').value = contact.phone;
    if ($('editContactEmail')) $('editContactEmail').value = contact.email;
    openOverlayWithHistory('editContactPage');
}
function saveEditedContact() {
    showLoader();
    const id = $('editContactId') ? $('editContactId').value : '';
    const name = $('editContactName') ? $('editContactName').value.trim() : '';
    const phone = $('editContactPhone') ? $('editContactPhone').value.trim() : '';
    const email = $('editContactEmail') ? $('editContactEmail').value.trim() : '';
    if (id && name && phone && loggedInUser) {
        db.collection('users').doc(loggedInUser.uid).collection('contacts').doc(id).update({ name, phone, email })
            .then(()=>{ hideLoader(); showAlert('Contact updated successfully!'); history.back(); })
            .catch(err=>{ hideLoader(); showAlert('Error updating contact: '+err.message); });
    } else { hideLoader(); showAlert('Name and phone number are required.'); }
}
function deleteContact(contactId) {
    showConfirm('Are you sure you want to delete this contact?', ()=> {
        showLoader();
        db.collection('users').doc(loggedInUser.uid).collection('contacts').doc(contactId).delete()
            .then(()=>{ hideLoader(); showAlert('Contact deleted successfully!'); })
            .catch(err=>{ hideLoader(); showAlert('Error deleting contact: '+err.message); });
    });
}
function searchContacts() {
    const searchTerm = $('contactSearchInput') ? $('contactSearchInput').value.toLowerCase() : '';
    const filteredContacts = allContacts.filter(c => (c.name||'').toLowerCase().includes(searchTerm) || (c.phone||'').includes(searchTerm));
    displayContacts(filteredContacts);
}

/* --- Profile + other UI helpers (unchanged semantics) --- */
async function populateProfile() {
    showLoader();
    if (!loggedInUser) { hideLoader(); return; }
    const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        if ($('profileName')) $('profileName').textContent = userData.fullName || 'N/A';
        if ($('profileEmail')) $('profileEmail').textContent = userData.email || 'N/A';
        if ($('profilePhone')) $('profilePhone').textContent = loggedInUser.phoneNumber || userData.phoneNumber || 'N/A';
        const memberSinceDate = userData.memberSince ? userData.memberSince.toDate() : new Date();
        if ($('profileMemberSince')) $('profileMemberSince').textContent = memberSinceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    hideLoader();
}
function openEditProfilePage() {
    const currentName = $('profileName') ? $('profileName').textContent : '';
    if ($('editProfileName')) $('editProfileName').value = currentName;
    openOverlayWithHistory('editProfilePage');
}
function saveProfileChanges() {
    showLoader();
    const newName = $('editProfileName') ? $('editProfileName').value.trim() : '';
    if (!newName || newName.length < 3) { showAlert('Please enter a valid name.'); hideLoader(); return; }
    db.collection('users').doc(loggedInUser.uid).update({ fullName: newName })
        .then(()=>{ hideLoader(); showAlert('Profile updated successfully!'); history.back(); })
        .catch(err=>{ hideLoader(); showAlert('Error updating profile: '+err.message); });
}
function confirmLogout() { showConfirm('Are you sure you want to logout?', ()=>{ showLoader(); auth.signOut(); }); }

/* --- Recharge / Wallet --- */
async function payWithPaystack() {
    showLoader();
    let amount = $('rechargeAmount') ? $('rechargeAmount').value : '';
    amount = Number(amount);
    if (!amount || isNaN(amount) || amount < 100) { showAlert("Please enter a valid amount (minimum ₦100)"); hideLoader(); return; }
    if (!loggedInUser) { showAlert("You must be logged in to recharge."); hideLoader(); return; }
    const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
    if (!userDoc.exists) { showAlert("Could not find user data. Please try again."); hideLoader(); return; }
    const userEmail = userDoc.data().email || `${loggedInUser.phoneNumber}@smartcall.app`;
    let handler = PaystackPop.setup({
        key: paystackPublicKey, email: userEmail, amount: amount * 100, currency: 'NGN',
        ref: 'SC_' + Math.floor((Math.random() * 1000000000) + 1),
        callback: function (response) {
            showLoader(); if ($('rechargeStatus')) $('rechargeStatus').innerText = "Verifying payment...";
            updateUserBalanceInDB(parseFloat(amount)).then(() => {
                if ($('rechargeStatus')) $('rechargeStatus').innerText = "Recharge successful! Ref: " + response.reference;
                hideLoader(); setTimeout(()=>closeOverlay('rechargePage'), 1500);
            });
        },
        onClose: function () { hideLoader(); }
    });
    handler.openIframe();
}
async function updateUserBalanceInDB(amount) {
    if (!loggedInUser) return;
    const userRef = db.collection('users').doc(loggedInUser.uid);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userRef);
            if (!doc.exists) throw "Document does not exist!";
            const newBalance = (doc.data().balance || 0) + amount;
            transaction.update(userRef, { balance: newBalance });
        });
    } catch (error) {
        console.error("Transaction failed: ", error);
        if ($('rechargeStatus')) $('rechargeStatus').innerText = "Recharge failed. Please try again.";
    }
}
function updateWalletBalance(balance) {
    const balanceText = $('walletBalance');
    if (!balanceText) return;
    const balanceInNaira = (Number(balance) || 0).toFixed(2);
    const approxMinutes = Math.floor((Number(balance) || 0) / callCostPerMinute);
    balanceText.innerHTML = `Your Wallet Balance: <strong>₦${balanceInNaira}</strong><br><span><i>(Approx. ${approxMinutes} Minutes)</i></span>`;
}

/* --- Referral, sharing, history clear (unchanged semantics) --- */
function generateReferralLink() {
    if (loggedInUser && loggedInUser.uid) $('referralLink').value = `https://smartcall.app/refer/${loggedInUser.uid}`;
    else $('referralLink').value = "Log in to get your referral link";
}
function copyReferralLink() {
    const referralInput = $('referralLink');
    if (!referralInput) return;
    referralInput.select();
    referralInput.setSelectionRange(0, 99999);
    document.execCommand('copy');
    showAlert('Referral link copied to clipboard!');
}
function shareReferralLink() {
    if (navigator.share) {
        navigator.share({ title: 'SmartCall Referral', text: 'Join me on SmartCall and get free credit!', url: $('referralLink').value })
            .catch(err => console.log('Error sharing', err));
    } else {
        showAlert("Web Share API is not supported in this browser. Please use the copy button.");
    }
}
function clearRecentCalls() {
    showConfirm('Are you sure you want to clear your entire call history? This cannot be undone.', () => {
        showLoader();
        if (!loggedInUser) { showAlert("You must be logged in to clear history."); hideLoader(); return; }
        const callHistoryRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory');
        callHistoryRef.get().then(snapshot => {
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
        }).then(()=>{ hideLoader(); showAlert('Call history cleared successfully!'); })
        .catch(error=>{ hideLoader(); showAlert('Error clearing call history: '+error.message); });
    });
}

/* --- Custom confirm dialog handlers --- */
const confirmDialog = $('customConfirmDialog');
const confirmMessage = $('customConfirmMessage');
const confirmOkBtn = $('confirmOkBtn');
const confirmCancelBtn = $('confirmCancelBtn');
let confirmCallback = null;
function showConfirm(message, onConfirm) {
    if (confirmMessage) confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    if (confirmDialog) confirmDialog.classList.add('active');
}
if (confirmOkBtn) confirmOkBtn.onclick = () => { if (confirmCallback) confirmCallback(); if (confirmDialog) confirmDialog.classList.remove('active'); };
if (confirmCancelBtn) confirmCancelBtn.onclick = () => { if (confirmDialog) confirmDialog.classList.remove('active'); };

/* --- Keyboard support for dialpad --- */
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (/^[0-9*#+]$/.test(key)) dialInput(key);
    else if (key === "Backspace") dialInput('backspace');
    else if (key === "Enter") startCallFromDialpad();
});

/* --- Safe fallback to ensure no trailing unclosed braces --- */
/* End of script.js */
