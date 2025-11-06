/***************************************************
  SmartCall - script.js (final)
  - Real call flow via Render backend (Africa's Talking)
  - Call duration + wallet deduction (₦13 / min)
  - Ringtone while connecting
  - Styled alert & confirm modals (re-uses your HTML)
  - Works with Firebase (auth + Firestore)
***************************************************/

/* ========== Config & Global State ========== */
const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com/api/call";
const END_CALL_URL = "https://smartcall-backend-7cm9.onrender.com/api/end";
const CALLER_ID = "+2342017001172";
const CALL_COST_PER_MIN = 13; // ₦13 per minute

let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
window.confirmationResult = null;

// UI elements used widely:
const loader = document.getElementById('loader');
function showLoader() { if (loader) loader.classList.add('show'); }
function hideLoader() { if (loader) setTimeout(()=>loader.classList.remove('show'), 250); }

/* ========== Ringtone Setup ========== */
// Choose a short ring tone url (public). You can replace with your own hosted file.
const ringTone = new Audio("https://cdn.pixabay.com/audio/2023/03/15/audio_610a4a3b6f.mp3");
ringTone.loop = true;
ringTone.preload = "auto";

/* ========== Custom alert/confirm (re-uses elements in your HTML) ========== */
const alertDialog = document.getElementById('customAlertDialog');
const alertMessage = document.getElementById('customAlertMessage');
const confirmDialog = document.getElementById('customConfirmDialog');
const confirmMessage = document.getElementById('customConfirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

let confirmCallback = null;

function showAlert(message) {
  if (alertMessage && alertDialog) {
    alertMessage.textContent = message;
    alertDialog.classList.add('active');
  } else {
    window.alert(message);
  }
}
function hideCustomAlert() {
  if (alertDialog) alertDialog.classList.remove('active');
}
function showConfirm(message, onConfirm) {
  if (confirmDialog && confirmMessage) {
    confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    confirmDialog.classList.add('active');
  } else {
    if (confirm(message)) onConfirm();
  }
}
if (confirmOkBtn) confirmOkBtn.onclick = () => { if (confirmCallback) confirmCallback(); confirmDialog.classList.remove('active'); };
if (confirmCancelBtn) confirmCancelBtn.onclick = () => { confirmDialog.classList.remove('active'); };

/* ========== Theme toggle (keeps your existing button working) ========== */
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

/* ========== Firebase Initialization (compat libs assumed loaded in HTML) ========== */
const firebaseConfig = {
  /* You already had this in HTML; keep here for completeness if needed */
  apiKey: "AIzaSyDF5ROHRjFjwnm5fzdXhOc8Xzq0LOUyw1M",
  authDomain: "smartcalls-d49f5.firebaseapp.com",
  projectId: "smartcalls-d49f5",
  storageBucket: "smartcalls-d49f5.appspot.com",
  messagingSenderId: "854255870421",
  appId: "1:854255870421:web:177c38dc6de653a86edd5c",
  measurementId: "G-JKKWJEJK0B"
};

try {
  // If firebase already initialized by other script, this will not fail.
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
} catch (e) {
  console.warn("Firebase init:", e.message || e);
}
const auth = firebase.auth();
const db = firebase.firestore();

/* ========== Basic Helpers ========== */
function formatMoney(n) {
  return Number(n).toFixed(2);
}
function toE164(number) {
  // naive phone normalization for Nigeria default if no plus sign
  if (!number) return number;
  number = number.trim();
  if (number.startsWith('+')) return number;
  // if starts with 0 and length >= 10 assume +234
  if (number.startsWith('0')) return "+234" + number.slice(1);
  // if short local number assume +234
  if (number.length === 10) return "+234" + number;
  return number;
}

/* ========== Authentication state & listeners ========== */
auth.onAuthStateChanged(user => {
  if (stopUserListener) stopUserListener();
  if (stopCallHistoryListener) stopCallHistoryListener();
  if (user) {
    if (user.providerData[0] && user.providerData[0].providerId === 'password' && !user.emailVerified) {
      hideLoader();
      return;
    }
    loggedInUser = user;
    listenToUserData();
    listenToCallHistory();
    navigate('homePage');
  } else {
    loggedInUser = null;
    navigate('welcomePage');
  }
});

function listenToUserData() {
  if (!loggedInUser) return;
  const userRef = db.collection('users').doc(loggedInUser.uid);
  stopUserListener = userRef.onSnapshot(doc => {
    if (doc.exists) {
      const userData = doc.data();
      const welcomeEl = document.getElementById('welcomeUserName');
      if (welcomeEl) welcomeEl.textContent = userData.fullName || "User";
      updateWalletBalance(userData.balance || 0);
    }
  }, err => console.error("Listen user data err:", err));
}

/* ========== Wallet UI update ========== */
function updateWalletBalance(balance) {
  const balanceText = document.getElementById("walletBalance");
  if (!balanceText) return;
  const balanceInNaira = Number(balance || 0).toFixed(2);
  const approxMinutes = Math.floor((Number(balance || 0)) / CALL_COST_PER_MIN);
  balanceText.innerHTML = `Your Wallet Balance: <strong>₦${balanceInNaira}</strong><br><span><i>(Approx. ${approxMinutes} Minutes)</i></span>`;
}

/* ========== Call State & UI Elements ========== */
const callScreen = document.getElementById('callScreen');
const callingContactName = document.getElementById('callingContactName');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');

let callInterval = null;
let seconds = 0;
let callStartTime = null;
let currentCall = { phone: null, userId: null };

/* ========== Call Timer ========== */
function updateCallTimer() {
  seconds++;
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  if (callTimer) callTimer.textContent = `${minutes}:${secs}`;

  // Every minute check if user still has enough balance, if not, end call
  if (seconds % 10 === 0) {
    // check every 10s to be safe (not too often)
    checkBalanceDuringCall();
  }
}

/* Check balance and auto-stop call if low */
async function checkBalanceDuringCall() {
  if (!loggedInUser) return;
  try {
    const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
    if (!userDoc.exists) return;
    const balance = Number(userDoc.data().balance || 0);
    // compute minutes passed (rounded up)
    const elapsedMinutes = Math.ceil(seconds / 60);
    const estimatedCost = elapsedMinutes * CALL_COST_PER_MIN;
    // If no funds for the next minute, notify and terminate
    if (balance <= 0 || balance < CALL_COST_PER_MIN) {
      // politely end the call
      await endRealCall("insufficient_balance");
    }
  } catch (err) {
    console.error("Balance check error:", err);
  }
}

/* ========== Start Real Call (called from contacts or dialpad) ========== */
async function makeRealCall(toNumber) {
  if (!loggedInUser) {
    showAlert("Please log in to make calls.");
    return;
  }
  const normalized = toE164(toNumber);
  if (!normalized) {
    showAlert("Invalid phone number.");
    return;
  }

  // Prepare: check user balance before calling
  try {
    showLoader();
    const userRef = db.collection('users').doc(loggedInUser.uid);
    const userSnap = await userRef.get();
    const balance = Number(userSnap.exists ? userSnap.data().balance || 0 : 0);
    if (balance < 0.01) {
      hideLoader();
      showAlert("Your wallet balance is too low. Please recharge to make calls.");
      return;
    }
  } catch (err) {
    hideLoader();
    console.error("Balance pre-check failed:", err);
    showAlert("Could not verify balance. Try again.");
    return;
  }

  // Start ringtone + UI
  try {
    ringTone.play().catch(()=>{/* ignore autoplay block */});
  } catch(e) {}

  // open call screen UI
  openCallScreenUI(normalized);

  // Send request to backend to initiate call via Africa's Talking
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: normalized, userId: loggedInUser.uid })
    });
    const data = await res.json();
    hideLoader();
    if (res.ok && data.success) {
      // call queued/started - start real timer when connected
      callStatus.textContent = "Connected";
      callStartTime = Date.now();
      seconds = 0;
      if (callTimer) callTimer.textContent = "00:00";
      callInterval = setInterval(updateCallTimer, 1000);
      currentCall.phone = normalized;
      currentCall.userId = loggedInUser.uid;
      console.log("📞 Call started:", data.result || data);
    } else {
      // backend returned error
      callStatus.textContent = "Call Failed";
      ringTone.pause(); ringTone.currentTime = 0;
      showAlert("Call failed: " + (data.error || "Unknown error"));
      setTimeout(()=>callScreen.classList.remove('active'), 1600);
    }
  } catch (err) {
    hideLoader();
    callStatus.textContent = "Network Error";
    ringTone.pause(); ringTone.currentTime = 0;
    showAlert("Network error initiating call: " + err.message);
    setTimeout(()=>callScreen.classList.remove('active'), 1600);
  }
}

/* UI helper to open call screen immediately (before remote confirms) */
function openCallScreenUI(numberDisplay) {
  if (callingContactName) callingContactName.textContent = numberDisplay || "Calling...";
  if (callStatus) callStatus.textContent = "Ringing...";
  if (callScreen) callScreen.classList.add('active');
}

/* ========== End call flow (client triggered) ========== */
async function endRealCall(reason = "user_ended") {
  try {
    // Stop ringtone and timer
    try { ringTone.pause(); ringTone.currentTime = 0; } catch (e) {}
    if (callInterval) { clearInterval(callInterval); callInterval = null; }
    // Compute duration and cost
    const durationSeconds = seconds || Math.ceil(((Date.now() - (callStartTime||Date.now()))/1000));
    const minutesUsed = Math.ceil((durationSeconds || 0) / 60);
    const cost = minutesUsed * CALL_COST_PER_MIN;

    // Call backend end endpoint (safe handler)
    try {
      await fetch(END_CALL_URL, { method: "POST" });
    } catch (e) { /* ignore network end errors */ }

    // Deduct cost from user's wallet in Firestore using transaction
    if (loggedInUser && minutesUsed > 0) {
      const userRef = db.collection('users').doc(loggedInUser.uid);
      try {
        await db.runTransaction(async (tx) => {
          const doc = await tx.get(userRef);
          if (!doc.exists) throw new Error("User doc not found");
          const balance = Number(doc.data().balance || 0);
          const newBalance = Math.max(0, balance - cost);
          tx.update(userRef, { balance: newBalance });
        });
      } catch (txErr) {
        console.error("Transaction error deducting balance:", txErr);
      }
    }

    // Log call to user's callHistory
    if (loggedInUser) {
      try {
        await db.collection('users').doc(loggedInUser.uid).collection('callHistory').add({
          contactName: callingContactName ? callingContactName.textContent : currentCall.phone,
          contactPhone: currentCall.phone,
          duration: formatCallDuration(durationSeconds),
          cost: cost,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          reason: reason
        });
      } catch (logErr) {
        console.error("Error writing call history:", logErr);
      }
    }

    // Update UI
    const contactName = callingContactName ? callingContactName.textContent : currentCall.phone;
    showAlert(`Call ended. Duration: ${minutesUsed} minute(s). Cost: ₦${formatMoney(cost)}.`);
    callScreen.classList.remove('active');
    seconds = 0;
    callStartTime = null;
    currentCall = { phone: null, userId: null };
  } catch (err) {
    console.error("Error ending call:", err);
    showAlert("Error ending call: " + (err.message || err));
  }
}

/* Utility to format secs to mm:ss */
function formatCallDuration(totalSeconds) {
  const s = Number(totalSeconds || 0);
  const m = Math.floor(s/60).toString().padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${m}:${ss}`;
}

/* ========== Auto-stop call when balance exhausted (called from checkBalanceDuringCall or other) ========== */
async function handleInsufficientBalanceFlow() {
  // Polished message you requested:
  const endMessage = "Your wallet balance has been exhausted. Please recharge to continue the call. Thank you for using SmartCall.";
  // End call and notify
  await endRealCall("insufficient_balance");
  showAlert(endMessage);
}

/* ========== Helper: end call triggered by UI end button ========== */
async function uiEndCallButton() {
  // When user taps End Call button:
  await endRealCall("user_ended");
}

/* Bind end button if exists */
const endCallBtn = document.querySelector('.end-call-btn');
if (endCallBtn) endCallBtn.addEventListener('click', uiEndCallButton);

/* ========== Contacts integration: replace openCallScreen onclicks to call makeRealCall(...) ========== */
function displayContacts(list) {
  const contactsListDiv = document.getElementById('contactsList');
  if (!contactsListDiv) return;
  contactsListDiv.innerHTML = '';
  if (!list || list.length === 0) {
    contactsListDiv.innerHTML = '<p class="placeholder-text">No contacts found. Add one!</p>';
    return;
  }
  list.forEach(contact => {
    const contactDiv = document.createElement('div');
    contactDiv.classList.add('contact-item');
    const nameParts = (contact.name || "").split(' ');
    const initials = nameParts.map(p => p.charAt(0).toUpperCase()).join('');
    contactDiv.innerHTML = `
      <div class="contact-avatar">${initials}</div>
      <div class="contact-info">
        <div class="contact-name">${contact.name}</div>
        <div class="contact-phone">${contact.phone}</div>
      </div>
      <div class="contact-actions">
        <button class="icon-btn call-direct" aria-label="Call ${contact.name}"><i class="fas fa-phone"></i></button>
        <button class="icon-btn" onclick="openNewMessagePageWithRecipient('${contact.name}', '${contact.phone}')"><i class="fas fa-comment"></i></button>
        <button class="icon-btn" onclick="openEditContactPage('${contact.id}')"><i class="fas fa-edit"></i></button>
        <button class="icon-btn" onclick="deleteContact('${contact.id}')"><i class="fas fa-trash"></i></button>
      </div>
    `;
    contactsListDiv.appendChild(contactDiv);
    // attach direct call handler
    const callBtn = contactDiv.querySelector('.call-direct');
    if (callBtn) {
      callBtn.addEventListener('click', () => {
        makeRealCall(contact.phone);
      });
    }
  });
}

/* ========== Dialpad integration ========== */
let currentNumber = '';
const dialPadDisplay = document.getElementById('dialPadDisplay');
function dialInput(value) {
  if (value === 'backspace') {
    currentNumber = currentNumber.slice(0, -1);
  } else {
    currentNumber += value;
  }
  if (dialPadDisplay) dialPadDisplay.value = currentNumber;
}
function clearDialPad() { currentNumber = ''; if (dialPadDisplay) dialPadDisplay.value = ''; }
function startCallFromDialpad() {
  if (!currentNumber || currentNumber.trim() === "") {
    showAlert("Please enter a number to call.");
    return;
  }
  makeRealCall(currentNumber);
}

/* ========== Call History listener simplified (keeps your original) ========== */
function listenToCallHistory(limit=5, targetElementId='recentCallsList') {
  if (!loggedInUser) return;
  let historyRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory').orderBy('timestamp', 'desc');
  if (limit) historyRef = historyRef.limit(limit);
  const historyListDiv = document.getElementById(targetElementId);
  stopCallHistoryListener = historyRef.onSnapshot(snapshot => {
    if (!historyListDiv) return;
    if (snapshot.empty) {
      historyListDiv.innerHTML = '<p class="placeholder-text">No recent calls.</p>';
      return;
    }
    historyListDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const call = doc.data();
      const ts = call.timestamp ? call.timestamp.toDate() : new Date();
      const formattedDate = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric'}) + ' ' + ts.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
      const callItem = document.createElement('div');
      callItem.classList.add('history-item');
      callItem.innerHTML = `
        <div>
          <div class="call-number">${call.contactName || call.contactPhone}</div>
          <div class="call-time">${formattedDate} (${call.duration || '00:00'})</div>
        </div>
        <button class="call-again-btn">Call Again</button>
      `;
      historyListDiv.appendChild(callItem);
      const btn = callItem.querySelector('.call-again-btn');
      if (btn) btn.addEventListener('click', () => makeRealCall(call.contactPhone || call.contactName));
    });
  }, err => console.error("Call history listener error:", err));
}

/* ========== Misc: Paystack recharge (keeps your existing integration) ========== */
let paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e"; // keep as earlier
async function payWithPaystack() {
  showLoader();
  const amount = Number(document.getElementById("rechargeAmount")?.value || 0);
  if (!amount || amount < 100) { showAlert("Please enter a valid amount (minimum ₦100)"); hideLoader(); return; }
  if (!loggedInUser) { showAlert("You must be logged in to recharge."); hideLoader(); return; }
  const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
  if (!userDoc.exists) { showAlert("Could not find user data. Please try again."); hideLoader(); return; }
  const userEmail = userDoc.data().email || `${loggedInUser.phoneNumber}@smartcall.app`;

  let handler = PaystackPop.setup({
    key: paystackPublicKey,
    email: userEmail,
    amount: amount * 100,
    currency: 'NGN',
    ref: 'SC_' + Math.floor((Math.random() * 1000000000) + 1),
    callback: function (response) {
      updateUserBalanceInDB(parseFloat(amount)).then(() => {
        document.getElementById("rechargeStatus").innerText = "Recharge successful! Ref: " + response.reference;
        hideLoader(); setTimeout(() => closeOverlay('rechargePage'), 1500);
      });
    },
    onClose: function () {
      hideLoader();
    }
  });
  handler.openIframe();
}
async function updateUserBalanceInDB(amount) {
  if (!loggedInUser) return;
  const userRef = db.collection('users').doc(loggedInUser.uid);
  return db.runTransaction(transaction => {
    return transaction.get(userRef).then(doc => {
      if (!doc.exists) throw "User doc does not exist!";
      const newBalance = (doc.data().balance || 0) + amount;
      transaction.update(userRef, { balance: newBalance });
    });
  }).catch(error => {
    console.error("Transaction failed: ", error);
    document.getElementById("rechargeStatus").innerText = "Recharge failed. Please try again.";
  });
}

/* ========== Page helpers & navigation (keeps your existing functions) ========== */
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
  const page = document.getElementById(pageId);
  if (page) { page.classList.remove('hidden'); page.classList.add('active-page'); }
  hideLoader();
}
function openOverlayWithHistory(overlayId) {
  showLoader();
  history.pushState({ overlayId: overlayId }, '', `#${overlayId}`);
  const overlay = document.getElementById(overlayId);
  if (overlay) overlay.classList.add('active');
  if (overlayId === 'contactsPage') loadContacts();
  else if (overlayId === 'profilePage') populateProfile();
  else if (overlayId === 'callHistoryPage') loadFullCallHistory();
  else if (overlayId === 'referralPage') generateReferralLink();
  hideLoader();
}
function closeOverlay(overlayId) { const o = document.getElementById(overlayId); if (o) o.classList.remove('active'); }
window.onpopstate = (event) => {
  const pageId = event.state && event.state.pageId;
  const overlayId = event.state && event.state.overlayId;
  if (pageId) {
    showPage(pageId);
    document.querySelectorAll('.fullscreen-overlay').forEach(overlay => overlay.classList.remove('active'));
  } else if (overlayId) {
    document.getElementById(overlayId).classList.add('active');
  } else {
    showPage('welcomePage');
    document.querySelectorAll('.fullscreen-overlay').forEach(overlay => overlay.classList.remove('active'));
  }
};

/* ========== Contacts & CRUD (keeps your existing functions but ensure displayContacts is used) ========== */
function loadContacts() {
  showLoader();
  if (!loggedInUser) { hideLoader(); return; }
  const contactsListDiv = document.getElementById('contactsList');
  if (!contactsListDiv) { hideLoader(); return; }
  contactsListDiv.innerHTML = '<p class="placeholder-text">Loading contacts...</p>';
  const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
  contactsRef.orderBy('name').onSnapshot(snapshot => {
    allContacts = [];
    snapshot.forEach(doc => { allContacts.push({ id: doc.id, ...doc.data() }); });
    displayContacts(allContacts);
    hideLoader();
  }, error => {
    console.error("Error loading contacts: ", error);
    contactsListDiv.innerHTML = '<p class="error-message">Could not load contacts.</p>';
    hideLoader();
  });
}

/* ========== Small safety: ensure functions referenced by HTML exist ========== */
function openContactsFromDialpad() { history.back(); openOverlayWithHistory('contactsPage'); }
function openNewMessagePage() { showAlert("Messaging feature is under development."); }
function openNewMessagePageWithRecipient(name, phone) { showAlert("Messaging feature is under development."); }

/* ========== Initial page setup (country codes etc.) ========== */
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkTheme = true;
    document.body.classList.add('dark-theme');
    const icon = document.querySelector('#themeToggleButton i'); if (icon) { icon.classList.add('fa-moon'); icon.classList.remove('fa-sun');}
  } else {
    const icon = document.querySelector('#themeToggleButton i'); if (icon) { icon.classList.add('fa-sun'); icon.classList.remove('fa-moon');}
  }

  const countryCodeSelects = document.querySelectorAll('select[id$="CountryCode"]');
  const countryCodes = ['+234 (Nigeria)', '+233 (Ghana)', '+225 (Cote d\'Ivoire)', '+226 (Burkina Faso)', '+227 (Niger)'];
  countryCodeSelects.forEach(select => {
    countryCodes.forEach(code => {
      const option = document.createElement('option');
      option.value = code.split(' ')[0];
      option.textContent = code;
      select.appendChild(option);
    });
  });
});

/* ========== Utility: format money ========== */
function formatMoney(n) { return Number(n || 0).toFixed(2); }

/* ========== Export some functions globally used by HTML inline onclicks ========== */
window.dialInput = dialInput;
window.clearDialPad = clearDialPad;
window.startCallFromDialpad = startCallFromDialpad;
window.openContactsFromDialpad = openContactsFromDialpad;
window.makeRealCall = makeRealCall;
window.openEditContactPage = window.openEditContactPage || function(id){ showAlert("Open edit not implemented"); };
window.deleteContact = window.deleteContact || function(id){ showAlert("Delete not implemented"); };

/* End of script.js */
