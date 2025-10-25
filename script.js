/* ===============================
   SMARTCALL FRONTEND SCRIPT.JS
   =============================== */

/* ---------- BASIC CONFIG ---------- */
const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com"; // your backend base URL
const CALLER_ID = "+2342017001172"; // your Africa's Talking virtual number
const PAYSTACK_PUBLIC_KEY = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e"; // replace with your real Paystack key

function openOverlayWithHistory(id) {
  document.querySelectorAll('.fullscreen-overlay').forEach(o => o.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  history.pushState({ page: id }, "", "");
}

/* ---------- HELPERS ---------- */
function showAlert(msg) {
  alert(msg);
}

function showLoader() {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "flex";
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "none";
}

// --- LOADER FUNCTIONS ---

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



/* ---------- DIAL PAD INPUT ---------- */
function dialInput(value) {
  const input = document.getElementById("dialPadDisplay");
  if (value === "backspace") {
    input.value = input.value.slice(0, -1);
  } else {
    input.value += value;
  }
}

function clearDialPad() {
  document.getElementById("dialPadDisplay").value = "";
}

/* ---------- START CALL ---------- */
async function startCallFromDialpad() {
  const numberInput = document.getElementById("dialPadDisplay").value.trim();
  const countryCode = document.getElementById("dialPadCountryCode").value;

  if (!numberInput) return showAlert("Please enter a phone number.");

  const fullNumber = `${countryCode}${numberInput}`;
  showAlert(`📞 Calling ${fullNumber}...`);

  try {
    const response = await fetch(`${BACKEND_URL}/api/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: fullNumber,
        from: CALLER_ID,
      }),
    });

    const result = await response.json();
    if (result.success) {
      showAlert("✅ Call started successfully!");
    } else {
      showAlert("❌ Call failed: " + (result.error || "Unknown error"));
    }
  } catch (err) {
    showAlert("Network error: " + err.message);
  }
}

/* ---------- END CALL ---------- */
async function endCurrentCall() {
  showLoader();
  try {
    const response = await fetch(`${BACKEND_URL}/endCall`, { method: "POST" });
    const data = await response.json();
    hideLoader();

    if (data.success) showAlert("Call ended successfully ✅");
    else showAlert("Hang-up failed: " + data.error);
  } catch (error) {
    hideLoader();
    showAlert("Error: " + error.message);
  }
}

/* ---------- CONTACTS CALL ---------- */
function startCallFromContact(phone) {
  document.getElementById("dialPadDisplay").value = phone;
  openOverlayWithHistory("dialPadPage");
  startCallFromDialpad();
}

/* ---------- COUNTRY CODES ---------- */
const countryCodes = [
  { name: "Nigeria", code: "+234" },
  { name: "Ghana", code: "+233" },
  { name: "Kenya", code: "+254" },
  { name: "Tanzania", code: "+255" },
  { name: "Niger", code: "+227" },
];

window.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("dialPadCountryCode");
  if (select) {
    select.innerHTML = countryCodes
      .map((c) => `<option value="${c.code}">${c.name} (${c.code})</option>`)
      .join("");
  }
});



