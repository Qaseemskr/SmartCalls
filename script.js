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

// --- Global State & Config ---
let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let userCredit = 0;
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
let stopContactsListener = () => {};
window.confirmationResult = null;

// Paystack Public Key (Placeholder - this should be a real key for live payments)
let paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e";
// Cost per minute in local currency units
const callCostPerMinute = 13;
const BACKEND_URL = '/api/call'; // Endpoint on the Node.js backend

// --- CALL STATE MANAGEMENT ---
let callTimerInterval = null;
let callStartTime = null;
let currentCallNumber = null;

// --- FIREBASE INITIALIZATION ---
// Mandatory globals for Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase services using the compat library
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
firebase.firestore.setLogLevel('debug'); // Enable Firestore logging
auth.onAuthStateChanged(user => {
  if (user) {
    // user logged in, go to home page
    openOverlayWithHistory("homePage");
  } else {
    // stay on auth page
    openOverlayWithHistory("authPage");
  }
});

// --- LOADER & ALERT FUNCTIONS ---
const loader = document.getElementById('loader');
function showLoader() { loader.classList.add('show'); }
function hideLoader() {
    setTimeout(() => {
        loader.classList.remove('show');
    }, 300);
}

const customAlertDialog = document.getElementById('customAlertDialog');
const customAlertMessage = document.getElementById('customAlertMessage');
function showAlert(message) {
    customAlertMessage.textContent = message;
    customAlertDialog.classList.add('show');
}
function hideCustomAlert() {
    customAlertDialog.classList.remove('show');
}

const customConfirmDialog = document.getElementById('customConfirmDialog');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
let confirmCallback = null;

function showConfirm(message, onConfirm) {
    document.getElementById('customConfirmMessage').textContent = message;
    confirmCallback = onConfirm;
    customConfirmDialog.classList.add('show');
}

confirmOkBtn.onclick = () => {
    customConfirmDialog.classList.remove('show');
    if (confirmCallback) {
        confirmCallback();
    }
};

confirmCancelBtn.onclick = () => {
    customConfirmDialog.classList.remove('show');
    confirmCallback = null;
};

// --- Theme Toggle Function ---
function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    document.body.classList.toggle('dark-theme', isDarkTheme);
    const themeIcon = document.querySelector('#themeToggleButton i');
    themeIcon.classList.toggle('fa-sun', !isDarkTheme);
    themeIcon.classList.toggle('fa-moon', isDarkTheme);
    localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

// --- Navigation ---
function navigate(pageId) {
    document.querySelectorAll('.container').forEach(page => {
        page.classList.remove('active-page');
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
    document.getElementById(pageId).classList.add('active-page');
    // Ensure dial pad is visible when navigating back to main page
    if (pageId === 'mainPage') {
        showTab('dialPadTab');
    }
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabId).classList.remove('hidden');
    document.querySelector(`.tab-btn[onclick*="${tabId}"]`).classList.add('active');
}

// --- AUTHENTICATION ---
let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').textContent = isRegisterMode ? 'Register' : 'Sign In';
    document.getElementById('authButtonText').textContent = isRegisterMode ? 'Register' : 'Sign In';
    document.getElementById('toggleAuthBtn').textContent = isRegisterMode ? 'Already have an account? Sign In' : 'Need an account? Register';
}

async function authenticateUser() {
    showLoader();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAlert('Please enter both email and password.');
        hideLoader();
        return;
    }

    try {
        if (isRegisterMode) {
            await auth.createUserWithEmailAndPassword(email, password);
            showAlert('Registration successful! You are now signed in.');
        } else {
            await auth.signInWithEmailAndPassword(email, password);
        }
        // Auth state change listener handles navigation
    } catch (error) {
        console.error("Authentication Error: ", error);
        showAlert(error.message);
    } finally {
        hideLoader();
    }
}

async function sendPasswordReset() {
    showLoader();
    const email = document.getElementById('resetEmail').value;
    try {
        await auth.sendPasswordResetEmail(email);
        showAlert('Password reset link sent to your email.');
        navigate('authPage');
    } catch (error) {
        console.error("Password Reset Error: ", error);
        showAlert(error.message);
    } finally {
        hideLoader();
    }
}

// --- DATA LISTENERS ---

// Listener for user profile and credit
function setupUserListener(userId) {
    stopUserListener(); // Stop previous listener
    const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(userId);

    stopUserListener = userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            userCredit = data.credit || 0;
            document.getElementById('currentBalance').textContent = userCredit.toFixed(2);
            // Optionally update profile page elements here
        } else {
            // Create initial user profile if it doesn't exist
            userDocRef.set({
                credit: 50.00, // Initial free credit
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).then(() => {
                userCredit = 50.00;
                document.getElementById('currentBalance').textContent = userCredit.toFixed(2);
            }).catch(console.error);
        }
    }, error => {
        console.error("Error listening to user data: ", error);
    });
}

// Listener for contacts
function setupContactsListener(userId) {
    stopContactsListener();
    const contactsCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(userId).collection('contacts');
    const contactsQuery = contactsCollectionRef.orderBy('name');

    stopContactsListener = contactsQuery.onSnapshot(snapshot => {
        allContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderContacts();
    }, error => {
        console.error("Error listening to contacts: ", error);
    });
}

// Listener for call history
function setupCallHistoryListener(userId) {
    stopCallHistoryListener();
    const historyCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(userId).collection('callHistory');
    const historyQuery = historyCollectionRef.orderBy('timestamp', 'desc');

    stopCallHistoryListener = historyQuery.onSnapshot(snapshot => {
        const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCallHistory(history);
    }, error => {
        console.error("Error listening to call history: ", error);
    });
}

// --- Auth State Change Handler ---
auth.onAuthStateChanged(user => {
    hideLoader();
    if (user) {
        loggedInUser = user;
        setupUserListener(user.uid);
        setupContactsListener(user.uid);
        setupCallHistoryListener(user.uid);
        navigate('mainPage');
    } else {
        loggedInUser = null;
        stopUserListener();
        stopContactsListener();
        stopCallHistoryListener();
        navigate('welcomePage');
    }
});

// Initial sign-in with custom token
window.onload = async () => {
    // Apply saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        isDarkTheme = true;
        document.body.classList.add('dark-theme');
        document.querySelector('#themeToggleButton i').classList.remove('fa-sun');
        document.querySelector('#themeToggleButton i').classList.add('fa-moon');
    }

    if (initialAuthToken) {
        try {
            await auth.signInWithCustomToken(initialAuthToken);
        } catch (error) {
            console.error("Error signing in with custom token:", error);
            // Fallback to anonymous sign-in if custom token fails
            try {
                await auth.signInAnonymously();
            } catch (anonError) {
                console.error("Error signing in anonymously:", anonError);
                hideLoader();
                showAlert("Authentication failed. Please try again.");
            }
        }
    } else {
        // If no token, sign in anonymously for Firebase functionality
        try {
            await auth.signInAnonymously();
        } catch (anonError) {
            console.error("Error signing in anonymously:", anonError);
            hideLoader();
            showAlert("Authentication failed. Please try again.");
        }
    }
};

// --- DIAL PAD LOGIC ---
const dialPadInput = document.getElementById('dialPadInput');

function dialInput(value) {
    if (value === 'delete') {
        dialPadInput.value = dialPadInput.value.slice(0, -1);
    } else if (value.length === 1) {
        dialPadInput.value += value;
    }
    // Simple look-up and display name if matching
    const contact = allContacts.find(c => c.number === dialPadInput.value);
    if (contact) {
        dialPadInput.placeholder = contact.name;
    } else {
        dialPadInput.placeholder = "Enter number or contact";
    }
}

// --- CALL FUNCTIONALITY ---

// Function to start the call
async function startCall() {
    if (!loggedInUser) {
        showAlert("Please sign in to make a call.");
        navigate('authPage');
        return;
    }
    
    currentCallNumber = dialPadInput.value.trim();
    if (!currentCallNumber) {
        showAlert("Please enter a number to call.");
        return;
    }

    // A basic check for enough credit for at least 1 minute
    if (userCredit < callCostPerMinute) {
        showAlert(`Insufficient credit! You need at least ${callCostPerMinute} units to start a call.`);
        return;
    }

    showLoader();
    navigate('callPage');
    
    // Find contact name for UI
    const contact = allContacts.find(c => c.number === currentCallNumber);
    const displayName = contact ? contact.name : currentCallNumber;
    
    document.getElementById('callContactName').textContent = displayName;
    document.getElementById('callStatus').textContent = 'Dialing...';
    document.getElementById('callTimer').textContent = '00:00:00';
    
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: currentCallNumber })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Call initiated successfully:', data.result);
            document.getElementById('callStatus').textContent = 'In Call';
            
            // Start the call timer after a simulated connection delay
            setTimeout(() => {
                callStartTime = Date.now();
                callTimerInterval = setInterval(updateCallTimer, 1000);
            }, 5000); // 5 second simulated connect time

        } else {
            throw new Error(data.error || 'Failed to initiate call via API.');
        }
    } catch (error) {
        console.error('Call Error:', error);
        showAlert('Call failed: ' + error.message);
        endCall(true); // End the call immediately on failure
    } finally {
        hideLoader();
    }
}

// Function to update the call timer display
function updateCallTimer() {
    const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000);
    const h = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(elapsedSeconds % 60).padStart(2, '0');
    document.getElementById('callTimer').textContent = `${h}:${m}:${s}`;
}

// Function to end the call (triggered by button or failure)
async function endCall(isFailed = false) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
    
    if (callStartTime) {
        const callDurationMs = Date.now() - callStartTime;
        const callDurationMinutes = callDurationMs / 1000 / 60;
        const totalCost = Math.ceil(callDurationMinutes) * callCostPerMinute;
        
        // Ensure call duration is at least 1 second for a valid record
        if (callDurationMs >= 1000 && !isFailed) {
            const finalDuration = Math.round(callDurationMinutes * 60); // Duration in seconds
            const finalCost = totalCost;

            // 1. Update User Credit (Deduct cost)
            const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid);
            
            try {
                // Use a transaction to ensure atomic update of credit
                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(userDocRef);
                    if (!doc.exists) throw "User document does not exist!";
                    
                    const newCredit = doc.data().credit - finalCost;
                    transaction.update(userDocRef, { credit: newCredit });
                });
                
                // 2. Log Call to History
                const contact = allContacts.find(c => c.number === currentCallNumber);
                const historyCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid).collection('callHistory');
                
                await historyCollectionRef.add({
                    number: currentCallNumber,
                    contactName: contact ? contact.name : 'Unknown',
                    durationSeconds: finalDuration,
                    cost: finalCost,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'Completed'
                });

            } catch (e) {
                console.error("Transaction failed or History logging failed: ", e);
                showAlert(`Call ended. Failed to deduct credit or log history: ${e.message}`);
            }
        }
    }
    
    // Reset state and navigate
    callStartTime = null;
    currentCallNumber = null;
    dialPadInput.value = '';
    navigate('mainPage');
}

// --- RENDERING & CRUD ---

function renderContacts() {
    const contactsList = document.getElementById('contactsList');
    contactsList.innerHTML = ''; // Clear existing list

    if (allContacts.length === 0) {
        contactsList.innerHTML = '<p class="placeholder-text">No contacts added yet. Tap "Add New Contact"!</p>';
        return;
    }

    allContacts.forEach(contact => {
        const contactDiv = document.createElement('div');
        contactDiv.className = 'contact-item';
        contactDiv.innerHTML = `
            <div class="contact-info">
                <div class="contact-name">${contact.name}</div>
                <div class="contact-number">${contact.number}</div>
            </div>
            <div class="contact-actions">
                <button class="icon-btn call-btn" onclick="preDialContact('${contact.number}')" aria-label="Call ${contact.name}">
                    <i class="fas fa-phone-alt"></i>
                </button>
                <button class="icon-btn edit-btn" onclick="navigate('editContactPage')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn delete-btn" onclick="deleteContact('${contact.id}', '${contact.name}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        contactsList.appendChild(contactDiv);
    });
}

function preDialContact(number) {
    dialPadInput.value = number;
    showTab('dialPadTab');
    navigate('mainPage');
}

async function deleteContact(contactId, name) {
    showConfirm(`Are you sure you want to delete ${name} from your contacts?`, async () => {
        showLoader();
        try {
            const contactDocRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid).collection('contacts').doc(contactId);
            await contactDocRef.delete();
            showAlert(`${name} deleted successfully.`);
        } catch (error) {
            console.error("Error deleting contact: ", error);
            showAlert('Error deleting contact: ' + error.message);
        } finally {
            hideLoader();
        }
    });
}

// Placeholder: Add New Contact Page
// You would add input fields and a button on the 'addContactPage' div, and implement this function:
async function addNewContact() {
    if (!loggedInUser) return;
    // Assuming you have inputs for newName and newNumber
    const newName = 'Test Contact'; // Replace with actual input value
    const newNumber = '+1234567890'; // Replace with actual input value

    if (!newName || !newNumber) {
        showAlert("Please fill in all contact details.");
        return;
    }
    
    showLoader();
    try {
        const contactsCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid).collection('contacts');
        await contactsCollectionRef.add({
            name: newName,
            number: newNumber,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showAlert(`${newName} added successfully.`);
        navigate('mainPage');
    } catch (error) {
        console.error("Error adding contact: ", error);
        showAlert('Error adding contact: ' + error.message);
    } finally {
        hideLoader();
    }
}

function renderCallHistory(history) {
    const historyList = document.getElementById('callHistoryList');
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<p class="placeholder-text">Your call history is empty.</p>';
        return;
    }

    history.forEach(call => {
        const date = call.timestamp ? call.timestamp.toDate().toLocaleDateString() : 'N/A';
        const time = call.timestamp ? call.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const durationDisplay = formatDuration(call.durationSeconds || 0);
        const costDisplay = call.cost !== undefined ? call.cost.toFixed(2) : 'N/A';
        const statusClass = call.status === 'Completed' ? 'status-completed' : 'status-failed';

        const callItem = document.createElement('div');
        callItem.className = 'history-item';
        callItem.innerHTML = `
            <div class="history-info">
                <div class="history-name">${call.contactName || call.number}</div>
                <div class="history-number">${call.number}</div>
                <div class="history-status ${statusClass}">${call.status}</div>
            </div>
            <div class="history-details">
                <div class="detail-item">Duration: ${durationDisplay}</div>
                <div class="detail-item">Cost: ${costDisplay}</div>
                <div class="detail-item">${date} ${time}</div>
            </div>
            <button class="icon-btn call-again-btn" onclick="preDialContact('${call.number}')" aria-label="Call Again">
                <i class="fas fa-redo-alt"></i>
            </button>
        `;
        historyList.appendChild(callItem);
    });
}

function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    let parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    parts.push(s + 's');
    
    return parts.join(' ');
}

// --- UTILITIES & MOCK FUNCTIONS (to be implemented fully later) ---

function toggleMute() {
    showAlert('Microphone toggled.');
    document.getElementById('muteBtn').classList.toggle('active');
}

function toggleSpeaker() {
    showAlert('Speaker toggled.');
    document.getElementById('speakerBtn').classList.toggle('active');
}

function copyReferralLink() {
    const link = document.getElementById('referralLink').value;
    navigator.clipboard.writeText(link).then(() => {
        showAlert('Referral link copied to clipboard!');
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showAlert('Failed to copy link.');
    });
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

// --- Function to Clear All Call History ---
function clearRecentCalls() {
    showConfirm('Are you sure you want to clear your entire call history? This cannot be undone.', () => {
        showLoader();
        if (!loggedInUser) {
            showAlert("You must be logged in to clear history.");
            hideLoader();
            return;
        }

        // Path to the user's call history collection
        const callHistoryRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid).collection('callHistory');
        
        // This is a complex operation as Firestore does not have a single "clear collection" command
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

// --- Function to Handle Credit Top-Up (Placeholder for Paystack Integration) ---
function topUpCredit() {
    const amountInput = document.getElementById('topUpAmount');
    const amount = parseFloat(amountInput.value);

    if (!loggedInUser) {
        showAlert("You must be signed in to top up credit.");
        return;
    }

    if (isNaN(amount) || amount <= 0) {
        showAlert("Please enter a valid amount.");
        return;
    }

    // MOCK: In a real app, this would initiate a Paystack transaction.
    // For this example, we'll simulate a successful top-up.
    showConfirm(`Confirm top-up of ${amount.toFixed(2)} units?`, async () => {
        showLoader();
        const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(loggedInUser.uid);
        
        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(userDocRef);
                if (!doc.exists) throw "User document does not exist!";
                
                const newCredit = (doc.data().credit || 0) + amount;
                transaction.update(userDocRef, { 
                    credit: newCredit,
                    lastTopUp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            
            showAlert(`Top-up successful! Your new balance is updated.`);
            amountInput.value = '';
            navigate('mainPage');

        } catch (e) {
            console.error("Top-up transaction failed: ", e);
            showAlert('Top-up failed: ' + e.message);
        } finally {
            hideLoader();
        }
    });
}


