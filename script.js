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
        isDarkTheme = true;
        document.body.classList.add('dark-theme');
        document.querySelector('#themeToggleButton i').classList.add('fa-moon');
        document.querySelector('#themeToggleButton i').classList.remove('fa-sun');
    } else {
        document.querySelector('#themeToggleButton i').classList.add('fa-sun');
        document.querySelector('#themeToggleButton i').classList.remove('fa-moon');
    }

    const countryCodeSelects = document.querySelectorAll('select[id$="CountryCode"]');
    const countryCodes = ['+234 (Nigeria)', '+1 (USA)', '+44 (UK)', '+27 (South Africa)'];
    countryCodeSelects.forEach(select => {
        countryCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = code.split(' ')[0];
            option.textContent = code;
            select.appendChild(option);
        });
    });
});

// --- Utility Functions ---
function navigate(pageId) {
    showLoader();
    history.pushState({ pageId: pageId }, '', `#${pageId}`);
    showPage(pageId);
}

function showPage(pageId) {
    document.querySelectorAll('.container').forEach(page => {
        page.classList.add('hidden');
        page.classList.remove('active-page');
    });
    const page = document.getElementById(pageId)
    page.classList.remove('hidden');
    page.classList.add('active-page');
    hideLoader();
}
function openOverlayWithHistory(overlayId) {
    showLoader();
    history.pushState({ overlayId: overlayId }, '', `#${overlayId}`);
    const overlay = document.getElementById(overlayId);
    overlay.classList.add('active');
    if (overlayId === 'contactsPage') {
        loadContacts();
    } else if (overlayId === 'profilePage') {
        populateProfile();
    } else if (overlayId === 'callHistoryPage') {
        loadFullCallHistory();
    } else if (overlayId === 'referralPage') {
        generateReferralLink();
        hideLoader();
    } else {
        hideLoader();
    }
}
function closeOverlay(overlayId) {
    document.getElementById(overlayId).classList.remove('active');
}
window.onpopstate = (event) => {
    const pageId = event.state && event.state.pageId;
    const overlayId = event.state && event.state.overlayId;
    if (pageId) {
        showPage(pageId);
        document.querySelectorAll('.fullscreen-overlay').forEach(overlay => {
            overlay.classList.remove('active');
        });
    } else if (overlayId) {
        document.getElementById(overlayId).classList.add('active');
    } else {
        showPage('welcomePage');
        document.querySelectorAll('.fullscreen-overlay').forEach(overlay => {
            overlay.classList.remove('active');
        });
    }
};

// --- Firebase Configuration and Initialization (to be moved) ---
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

// --- Authentication Logic ---
function showRegisterForm(type) {
    const phoneSection = document.getElementById('phoneAuthSection');
    const emailSection = document.getElementById('emailAuthSection');
    const showPhoneBtn = document.getElementById('showPhoneBtn');
    const showEmailBtn = document.getElementById('showEmailBtn');
    document.getElementById('registerAuthMessage').textContent = '';
    if (type === 'phone') {
        phoneSection.classList.remove('hidden');
        emailSection.classList.add('hidden');
        showPhoneBtn.classList.add('active');
        showEmailBtn.classList.remove('active');
    } else {
        phoneSection.classList.add('hidden');
        emailSection.classList.remove('hidden');
        showPhoneBtn.classList.remove('active');
        showEmailBtn.classList.add('active');
    }
}
function setupRecaptcha() {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { 'size': 'invisible', 'callback': (response) => {} });
        window.recaptchaWidgetId = window.recaptchaVerifier.render();
    }
}
function sendOtp() {
    showLoader();
    const countryCode = document.getElementById('registerCountryCode').value;
    const phoneNumberInput = document.getElementById('registerPhoneNumber').value;
    const authMessage = document.getElementById('registerAuthMessage');
    authMessage.textContent = '';
    if (!phoneNumberInput) {
        authMessage.textContent = 'Please enter a phone number.';
        hideLoader(); return;
    }
    const fullPhoneNumber = `${countryCode}${phoneNumberInput.startsWith('0') ? phoneNumberInput.substring(1) : phoneNumberInput}`;
    if (window.recaptchaVerifier) { grecaptcha.reset(window.recaptchaWidgetId); }
    setupRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    auth.signInWithPhoneNumber(fullPhoneNumber, appVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            hideLoader(); showAlert('Verification code has been sent!');
            document.getElementById('otpSection').classList.remove('hidden');
        }).catch((error) => {
            hideLoader();
            console.error("Firebase Auth Error:", error.code, error.message);
            authMessage.textContent = "Error: Could not send code. Please check the number or try again later.";
            if (window.recaptchaWidgetId) { grecaptcha.reset(window.recaptchaWidgetId); }
        });
}
function verifyOtp() {
    showLoader();
    const otp = document.getElementById('otpInput').value;
    const fullName = document.getElementById('registerFullNamePhone').value;
    const authMessage = document.getElementById('registerAuthMessage');
    authMessage.textContent = '';
    if (!otp || otp.length !== 6) { authMessage.textContent = 'Please enter a valid 6-digit code.'; hideLoader(); return; }
    if (!fullName) { authMessage.textContent = 'Please enter your full name.'; hideLoader(); return; }
    window.confirmationResult.confirm(otp).then((result) => {
        const user = result.user;
        const userRef = db.collection('users').doc(user.uid);
        return userRef.get().then(doc => {
            if (!doc.exists) {
                return userRef.set({ fullName: fullName, phoneNumber: user.phoneNumber, memberSince: new Date(), balance: 0 });
            }
        });
    }).catch((error) => { hideLoader(); authMessage.textContent = "Invalid code. Please try again."; });
}
function handleEmailRegister() {
    showLoader();
    const fullName = document.getElementById('registerFullNameEmail').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const authMessage = document.getElementById('registerAuthMessage');
    authMessage.textContent = '';
    if (!fullName || !email || !password) { authMessage.textContent = 'All fields are required.'; hideLoader(); return; }
    if (password.length < 6) { authMessage.textContent = 'Password must be at least 6 characters.'; hideLoader(); return; }
    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            const user = userCredential.user;
            user.sendEmailVerification();
            return db.collection('users').doc(user.uid).set({ fullName: fullName, email: email, memberSince: new Date(), balance: 0, emailVerified: false });
        }).then(() => {
            hideLoader(); showAlert("Registration successful! Please check your email to verify your account before logging in.");
        }).catch(error => { hideLoader(); authMessage.textContent = error.message; });
}
function handleEmailLogin() {
    showLoader();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const authMessage = document.getElementById('authMessage');
    authMessage.textContent = '';
    if (!email || !password) { authMessage.textContent = 'Please enter email and password.'; hideLoader(); return; }
    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            if (userCredential.user.providerData[0].providerId === 'password' && !userCredential.user.emailVerified) {
                hideLoader(); showAlert("Your email is not verified. Please check your inbox for the verification link."); auth.signOut();
            }
        }).catch(error => { hideLoader(); authMessage.textContent = error.message; });
}
// *** NEW PASSWORD RESET FUNCTION ***
function sendPasswordResetEmail() {
    showLoader();
    const email = document.getElementById('passwordResetEmail').value;
    const messageDiv = document.getElementById('passwordResetMessage');
    messageDiv.textContent = '';
    if (!email) {
        messageDiv.textContent = 'Please enter your email address.';
        messageDiv.classList.remove('success-message');
        messageDiv.classList.add('error-message');
        hideLoader();
        return;
    }
    auth.sendPasswordResetEmail(email)
        .then(() => {
            messageDiv.textContent = 'Password reset link sent to your email!';
            messageDiv.classList.remove('error-message');
            messageDiv.classList.add('success-message');
            hideLoader();
        })
        .catch((error) => {
            messageDiv.textContent = error.message;
            messageDiv.classList.remove('success-message');
            messageDiv.classList.add('error-message');
            hideLoader();
        });
}
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
// --- Real-time listeners ---
function listenToUserData() {
    if (!loggedInUser) return;
    const userRef = db.collection('users').doc(loggedInUser.uid);
    stopUserListener = userRef.onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            document.getElementById('welcomeUserName').textContent = userData.fullName;
            updateWalletBalance(userData.balance);
        } else {
            console.log("User document doesn't exist yet, likely during registration.");
        }
    }, err => console.error("Error listening to user data:", err));
}
function listenToCallHistory(limit=5, targetElementId='recentCallsList') {
    if (!loggedInUser) return;
    let historyRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory').orderBy('timestamp', 'desc');
    if (limit) { historyRef = historyRef.limit(limit); }
    const historyListDiv = document.getElementById(targetElementId);
    stopCallHistoryListener = historyRef.onSnapshot(snapshot => {
        if (snapshot.empty) {
            historyListDiv.innerHTML = '<p class="placeholder-text">No recent calls.</p>';
            return;
        }
        historyListDiv.innerHTML = '';
        snapshot.forEach(doc => {
            const call = doc.data();
            const callDate = call.timestamp.toDate();
            const formattedDate = callDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric'}) + ' ' + callDate.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
            const callItem = document.createElement('div');
            callItem.classList.add('history-item');
            callItem.innerHTML = `
                <div>
                    <div class="call-number">${call.contactName}</div>
                    <div class="call-time">${formattedDate} (${call.duration})</div>
                </div>
                <button class="call-again-btn" onclick="openCallScreen('${call.contactName}', '${call.contactName}')">Call Again</button>
            `;
            historyListDiv.appendChild(callItem);
        });
    }, err => console.error("Error logging call:", err));
}
function loadFullCallHistory() { showLoader(); listenToCallHistory(null, 'fullCallHistoryList'); }
// --- Home Page ---
document.addEventListener('DOMContentLoaded', () => {
    const countryCodeSelects = document.querySelectorAll('select[id$="CountryCode"]');
    const countryCodes = ['+234 (Nigeria)', '+1 (USA)', '+44 (UK)', '+27 (South Africa)'];
    countryCodeSelects.forEach(select => {
        countryCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = code.split(' ')[0];
            option.textContent = code;
            select.appendChild(option);
        });
    });
});
// --- Dial Pad ---
let currentNumber = '';
const dialPadDisplay = document.getElementById('dialPadDisplay');
function dialInput(value) {
    if (value === 'backspace' && currentNumber.length > 0) { currentNumber = currentNumber.slice(0, -1); }
    else if (value !== 'backspace') { currentNumber += value; }
    dialPadDisplay.value = currentNumber;
}
function clearDialPad() { currentNumber = ''; dialPadDisplay.value = ''; }
function startCallFromDialpad() {
    const toNumber = currentNumber;
    if (!toNumber) return showAlert('Please enter a number to call.');

    showLoader();

    // ✅ your deployed backend link (from Render or Glitch)
    const backendURL = "https://smartcall-backend-7cm9.onrender.com/startCall";


    fetch(backendURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toNumber })
    })
        .then(res => res.json())
        .then(data => {
            hideLoader();
            if (data.success) {
                openCallScreen(toNumber, toNumber);
                callStatus.textContent = "Calling...";
            } else {
                showAlert("Call failed: " + data.error);
            }
        })
        .catch(err => {
            hideLoader();
            showAlert("Error: " + err.message);
        });
}

function openContactsFromDialpad() { history.back(); openOverlayWithHistory('contactsPage'); }
// --- Contacts Page ---
function loadContacts() {
    showLoader();
    if (!loggedInUser) { hideLoader(); return; }
    const contactsListDiv = document.getElementById('contactsList');
    contactsListDiv.innerHTML = '<p class="placeholder-text">Loading contacts...</p>';
    const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
    contactsRef.orderBy('name').onSnapshot(snapshot => {
        allContacts = []; snapshot.forEach(doc => { allContacts.push({ id: doc.id, ...doc.data() }); });
        displayContacts(allContacts); hideLoader();
    }, error => {
        console.error("Error loading contacts: ", error);
        contactsListDiv.innerHTML = '<p class="error-message">Could not load contacts.</p>';
        hideLoader();
    });
}
function displayContacts(list) {
    const contactsListDiv = document.getElementById('contactsList');
    contactsListDiv.innerHTML = '';
    if (list.length === 0) {
        contactsListDiv.innerHTML = '<p class="placeholder-text">No contacts found. Add one!</p>';
        return;
    }
    list.forEach(contact => {
        const contactDiv = document.createElement('div');
        contactDiv.classList.add('contact-item');
        const nameParts = contact.name.split(' ');
        const initials = nameParts.map(part => part.charAt(0).toUpperCase()).join('');
        contactDiv.innerHTML = `
        <div class="contact-avatar">${initials}</div>
        <div class="contact-info">
            <div class="contact-name">${contact.name}</div>
            <div class="contact-phone">${contact.phone}</div>
        </div>
        <div class="contact-actions">
            <button class="icon-btn" onclick="openCallScreen('${contact.name}', '${contact.phone}')" aria-label="Call ${contact.name}"><i class="fas fa-phone"></i></button>
            <button class="icon-btn" onclick="openNewMessagePageWithRecipient('${contact.name}', '${contact.phone}')" aria-label="Message ${contact.name}"><i class="fas fa-comment"></i></button>
            <button class="icon-btn" onclick="openEditContactPage('${contact.id}')" aria-label="Edit ${contact.name}"><i class="fas fa-edit"></i></button>
            <button class="icon-btn" onclick="deleteContact('${contact.id}')" aria-label="Delete ${contact.name}"><i class="fas fa-trash"></i></button>
        </div>
        `;
        contactsListDiv.appendChild(contactDiv);
    });
}
function saveNewContact() {
    showLoader();
    const name = document.getElementById('newContactName').value;
    const phone = document.getElementById('newContactPhone').value;
    const email = document.getElementById('newContactEmail').value;
    if (name && phone && loggedInUser) {
        const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
        contactsRef.add({ name: name, phone: phone, email: email })
            .then(() => { hideLoader(); showAlert('Contact saved successfully!'); history.back(); })
            .catch(error => { hideLoader(); showAlert('Error saving contact: ' + error.message); });
    } else { hideLoader(); showAlert('Name and phone number are required.'); }
}
function openEditContactPage(contactId) {
    const contact = allContacts.find(c => c.id === contactId);
    if (!contact) { showAlert("Contact not found."); return; }
    document.getElementById('editContactId').value = contact.id;
    document.getElementById('editContactName').value = contact.name;
    document.getElementById('editContactPhone').value = contact.phone;
    document.getElementById('editContactEmail').value = contact.email;
    openOverlayWithHistory('editContactPage');
}
function saveEditedContact() {
    showLoader();
    const id = document.getElementById('editContactId').value;
    const name = document.getElementById('editContactName').value;
    const phone = document.getElementById('editContactPhone').value;
    const email = document.getElementById('editContactEmail').value;
    if (id && name && phone && loggedInUser) {
        const contactRef = db.collection('users').doc(loggedInUser.uid).collection('contacts').doc(id);
        contactRef.update({ name: name, phone: phone, email: email })
            .then(() => { hideLoader(); showAlert('Contact updated successfully!'); history.back(); })
            .catch(error => { hideLoader(); showAlert('Error updating contact: ' + error.message); });
    } else { hideLoader(); showAlert('Name and phone number are required.'); }
}
function deleteContact(contactId) {
    showConfirm('Are you sure you want to delete this contact?', () => {
        showLoader();
        db.collection('users').doc(loggedInUser.uid).collection('contacts').doc(contactId).delete()
            .then(() => { hideLoader(); showAlert('Contact deleted successfully!'); })
            .catch(error => { hideLoader(); showAlert('Error deleting contact: ' + error.message); });
    });
}
function searchContacts() {
    const searchTerm = document.getElementById('contactSearchInput').value.toLowerCase();
    const filteredContacts = allContacts.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm) || contact.phone.includes(searchTerm)
    );
    displayContacts(filteredContacts);
}
// --- Messages Page (Simplified) ---
function openNewMessagePage() { showAlert("Messaging feature is under development."); hideLoader(); }
function openNewMessagePageWithRecipient(name, phone) { showAlert("Messaging feature is under development."); hideLoader(); }
function searchMessages() { showAlert("Messaging feature is under development."); }
// --- Profile Page ---
async function populateProfile() {
    showLoader();
    if (!loggedInUser) { hideLoader(); return; }
    const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        document.getElementById('profileName').textContent = userData.fullName || 'N/A';
        document.getElementById('profileEmail').textContent = userData.email || 'N/A';
        document.getElementById('profilePhone').textContent = loggedInUser.phoneNumber || userData.phoneNumber || 'N/A';
        const memberSinceDate = userData.memberSince ? userData.memberSince.toDate() : new Date();
        document.getElementById('profileMemberSince').textContent = memberSinceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    hideLoader();
}
function openEditProfilePage() {
    const currentName = document.getElementById('profileName').textContent;
    document.getElementById('editProfileName').value = currentName;
    openOverlayWithHistory('editProfilePage');
}
function saveProfileChanges() {
    showLoader();
    const newName = document.getElementById('editProfileName').value;
    if (!newName || newName.length < 3) { showAlert('Please enter a valid name.'); hideLoader(); return; }
    db.collection('users').doc(loggedInUser.uid).update({ fullName: newName })
        .then(() => { hideLoader(); showAlert('Profile updated successfully!'); history.back(); })
        .catch(error => { hideLoader(); showAlert('Error updating profile: ' + error.message); });
}
function confirmLogout() {
    showConfirm('Are you sure you want to logout?', () => { showLoader(); auth.signOut(); });
}
// --- Call Screen (Simulation) & History Logging ---
const callScreen = document.getElementById('callScreen');
const callingContactName = document.getElementById('callingContactName');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');
let callInterval;
let seconds = 0;
function openCallScreen(name, number) {
    callingContactName.textContent = name || number;
    callScreen.setAttribute('data-contact-name', name || number);
    callScreen.setAttribute('data-contact-phone', number);
    callStatus.textContent = 'Calling...';
    callScreen.classList.add('active');
    seconds = 0;
    callTimer.textContent = '00:00';
    setTimeout(() => {
        callStatus.textContent = 'Connected'; callInterval = setInterval(updateCallTimer, 1000);
    }, 3000);
}
function updateCallTimer() {
    seconds++;
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
    callTimer.textContent = `${minutes}:${remainingSeconds}`;
}
function endCallSimulation() {
    showLoader(); clearInterval(callInterval); callScreen.classList.remove('active');
    const duration = callTimer.textContent;
    const contactName = callScreen.getAttribute('data-contact-name');
    const contactPhone = callScreen.getAttribute('data-contact-phone');
    showAlert(`Call with ${contactName} ended after ${duration}`);
    if (loggedInUser && seconds > 0) {
        db.collection('users').doc(loggedInUser.uid).collection('callHistory').add({
            contactName: contactName,
            contactPhone: contactPhone,
            duration: duration,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.error("Error logging call:", err));
    }
    hideLoader();
}
let isMuted = false;
let isSpeakerOn = false;
const muteBtn = document.getElementById('muteBtn');
const speakerBtn = document.getElementById('speakerBtn');
function toggleMute() {
    isMuted = !isMuted;
    muteBtn.classList.toggle('active', isMuted);
    showAlert(isMuted ? 'Muted' : 'Unmuted');
}
function toggleSpeaker() {
    isSpeakerOn = !isSpeakerOn;
    speakerBtn.classList.toggle('active', isSpeakerOn);
    showAlert(isSpeakerOn ? 'Speaker On' : 'Speaker Off');
}
// --- Custom Alert/Confirm Dialogs ---
const alertDialog = document.getElementById('customAlertDialog');
const alertMessage = document.getElementById('customAlertMessage');
function showAlert(message) { alertMessage.textContent = message; alertDialog.classList.add('active'); }
function hideCustomAlert() { alertDialog.classList.remove('active'); }
const confirmDialog = document.getElementById('customConfirmDialog');
const confirmMessage = document.getElementById('customConfirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
let confirmCallback;
function showConfirm(message, onConfirm) {
    confirmMessage.textContent = message; confirmCallback = onConfirm; confirmDialog.classList.add('active');
}
confirmOkBtn.onclick = () => { if (confirmCallback) { confirmCallback(); } confirmDialog.classList.remove('active'); };
confirmCancelBtn.onclick = () => { confirmDialog.classList.remove('active'); };
// --- Recharge and Wallet ---
async function payWithPaystack() {
    showLoader();
    let amount = document.getElementById("rechargeAmount").value;
    if (!amount || isNaN(amount) || amount < 100) { showAlert("Please enter a valid amount (minimum ₦100)"); hideLoader(); return; }
    if (!loggedInUser) { showAlert("You must be logged in to recharge."); hideLoader(); return; }
    const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
    if (!userDoc.exists) { showAlert("Could not find user data. Please try again."); hideLoader(); return; }
    const userEmail = userDoc.data().email || `${loggedInUser.phoneNumber}@smartcall.app`;
    let handler = PaystackPop.setup({
        key: paystackPublicKey, email: userEmail, amount: amount * 100, currency: 'NGN',
        ref: 'SC_' + Math.floor((Math.random() * 1000000000) + 1),
        callback: function (response) {
            showLoader(); document.getElementById("rechargeStatus").innerText = "Verifying payment...";
            updateUserBalanceInDB(parseFloat(amount)).then(() => {
                document.getElementById("rechargeStatus").innerText = "Recharge successful! Ref: " + response.reference;
                hideLoader(); setTimeout(() => closeOverlay('rechargePage'), 1500);
            });
        },
        onClose: function () { hideLoader(); }
    });
    handler.openIframe();
}
async function updateUserBalanceInDB(amount) {
    if (!loggedInUser) return;
    const userRef = db.collection('users').doc(loggedInUser.uid);
    return db.runTransaction(transaction => {
        return transaction.get(userRef).then(doc => {
            if (!doc.exists) { throw "Document does not exist!"; }
            const newBalance = (doc.data().balance || 0) + amount;
            transaction.update(userRef, { balance: newBalance });
        });
    }).catch(error => {
        console.error("Transaction failed: ", error);
        document.getElementById("rechargeStatus").innerText = "Recharge failed. Please try again.";
    });
}
function updateWalletBalance(balance) {
    const balanceText = document.getElementById("walletBalance");
    const balanceInNaira = balance.toFixed(2);
    const approxMinutes = Math.floor(balance / callCostPerMinute);
    balanceText.innerHTML = `Your Wallet Balance: <strong>₦${balanceInNaira}</strong><br><span><i>(Approx. ${approxMinutes} Minutes)</i></span>`;
}
// --- Referral Page Actions ---
function generateReferralLink() {
    if (loggedInUser && loggedInUser.uid) {
        document.getElementById('referralLink').value = `https://smartcall.app/refer/${loggedInUser.uid}`;
    } else {
        document.getElementById('referralLink').value = "Log in to get your referral link";
    }
}
function copyReferralLink() {
    const referralInput = document.getElementById('referralLink');
    referralInput.select();
    referralInput.setSelectionRange(0, 99999);
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