/* ===============================
   SmartCall - Cleaned script.js
   Paste/replace entire existing script.js with this file
   =============================== */

/* --- Global State & Config --- */
let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
window.confirmationResult = null;

const paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e";
const callCostPerMinute = 13;

// Backend endpoints (match your deployed index.js)
const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com/api/call";
const END_CALL_URL = "https://smartcall-backend-7cm9.onrender.com/api/end";

/* --- DOM helpers --- */
const loader = document.getElementById('loader');
function showLoader(){ if(loader) loader.classList.add('show'); }
function hideLoader(){ if(loader) setTimeout(()=>loader.classList.remove('show'), 300); }

/* --- Theme Toggle --- */
function toggleTheme(){
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle('dark-theme', isDarkTheme);
  const themeIcon = document.querySelector('#themeToggleButton i');
  if(themeIcon){
    themeIcon.classList.toggle('fa-sun', !isDarkTheme);
    themeIcon.classList.toggle('fa-moon', isDarkTheme);
  }
  localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
}

/* --- Audio (single definitions) --- */
/* "Please wait" spoken / hold message - short */
const connectAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5f05e4c3da.mp3?filename=please-hold-the-line-115132.mp3");
connectAudio.volume = 1.0;
connectAudio.preload = 'auto';

/* Ringing tone (loop) - played after the short message */
const ringAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_12f6943d15.mp3?filename=phone-ring-classic-24963.mp3");
ringAudio.loop = true;
ringAudio.volume = 0.6;
ringAudio.preload = 'auto';

/* --- Init on DOM load --- */
document.addEventListener('DOMContentLoaded', () => {
  // small loader display while initialising
  showLoader();
  document.title = "SmartCall - Your Connection to the World";

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkTheme = true;
    document.body.classList.add('dark-theme');
    const t = document.querySelector('#themeToggleButton i');
    if(t){ t.classList.add('fa-moon'); t.classList.remove('fa-sun'); }
  } else {
    const t = document.querySelector('#themeToggleButton i');
    if(t){ t.classList.add('fa-sun'); t.classList.remove('fa-moon'); }
  }

  // populate country code selects (update list as you like)
  const countryCodeSelects = document.querySelectorAll('select[id$="CountryCode"]');
  const countryCodes = ['+234 (Nigeria)', '+233 (Ghana)', '+229 (Benin)', '+227 (Niger)', '+235 (Chad)', '+216 (Tunisia)', '+218 (Libya)', '+249 (Sudan)'];
  countryCodeSelects.forEach(select => {
    countryCodes.forEach(code => {
      const option = document.createElement('option');
      option.value = code.split(' ')[0];
      option.textContent = code;
      select.appendChild(option);
    });
  });

  hideLoader();
});

/* --- Navigation & overlays --- */
/* ========================
   CLEAN + FIXED NAVIGATION
   ======================== */

// Go to a normal page (Home, Dialpad, Profile, etc.)
function navigate(pageId) {
    showLoader();

    // Register the page change in browser history
    history.pushState({ type: "page", id: pageId }, "", `#${pageId}`);

    showPage(pageId);
}

// Show a page (hide others)
function showPage(pageId) {
    document.querySelectorAll('.container').forEach(page => {
        page.classList.add("hidden");
        page.classList.remove("active-page");
    });

    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove("hidden");
        page.classList.add("active-page");
    }

    hideLoader();
}

// Open an overlay (Contacts, History, Profile)
function openOverlayWithHistory(overlayId) {
    showLoader();

    // Push state so back button closes overlay
    history.pushState({ type: "overlay", id: overlayId }, "", `#${overlayId}`);

    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.add("active");

    if (overlayId === "contactsPage") loadContacts();
    else if (overlayId === "profilePage") populateProfile();
    else if (overlayId === "callHistoryPage") loadFullCallHistory();

    hideLoader();
}

// Close overlay (when user presses back or closes manually)
function closeOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove("active");
}

// Back button handler (MOST IMPORTANT PART)
window.onpopstate = (event) => {
    if (!event.state) {
        // Default: go to welcome screen
        showPage("welcomePage");
        return;
    }

    if (event.state.type === "page") {
        showPage(event.state.id);
        return;
    }

    if (event.state.type === "overlay") {
        closeOverlay(event.state.id);
        return;
    }
};

/* --- Firebase init (keep as you had it) --- */
const firebaseConfig = {
  apiKey: "AIzaSyDF5ROHRjFjwnm5fzdXhOc8Xzq0LOUyw1M",
  authDomain: "smartcalls-d49f5.firebaseapp.com",
  projectId: "smartcalls-d49f5",
  storageBucket: "smartcall s-d49f5.appspot.com",
  messagingSenderId: "854255870421",
  appId: "1:854255870421:web:177c38dc6de653a86edd5c",
  measurementId: "G-JKKWJEJK0B"
};
if (typeof firebase !== 'undefined' && !firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

/* --- Auth + user listeners --- */
auth.onAuthStateChanged(user => {
  if (stopUserListener) stopUserListener();
  if (stopCallHistoryListener) stopCallHistoryListener();
  if (user) {
    if (user.providerData[0].providerId === 'password' && !user.emailVerified) { return; }
    loggedInUser = user;
    listenToUserData();
    listenToCallHistory();
    navigate('homePage');
  } else {
    loggedInUser = null;
    navigate('welcomePage');
  }
});

function listenToUserData(){
  if(!loggedInUser) return;
  const userRef = db.collection('users').doc(loggedInUser.uid);
  stopUserListener = userRef.onSnapshot(doc => {
    if(doc.exists){
      const data = doc.data();
      const nameEl = document.getElementById('welcomeUserName');
      if(nameEl) nameEl.textContent = data.fullName || 'User';
      updateWalletBalance(data.balance || 0);
    }
  }, err => console.error('User data listen error', err));
}

/* --- Call history listeners --- */
function listenToCallHistory(limit=5, targetElementId='recentCallsList'){
  if(!loggedInUser) return;
  let historyRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory').orderBy('timestamp','desc');
  if(limit) historyRef = historyRef.limit(limit);
  const targetDiv = document.getElementById(targetElementId);
  stopCallHistoryListener = historyRef.onSnapshot(snapshot => {
    if(!snapshot || snapshot.empty) {
      if(targetDiv) targetDiv.innerHTML = '<p class="placeholder-text">No recent calls.</p>';
      return;
    }
    if(targetDiv) targetDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const call = doc.data();
      const ts = (call.timestamp && typeof call.timestamp.toDate === 'function') ? call.timestamp.toDate() : new Date();
      const formatted = ts.toLocaleString();
      const item = document.createElement('div');
      item.classList.add('history-item');
      item.innerHTML = `<div><div class="call-number">${call.contactName}</div><div class="call-time">${formatted} (${call.duration})</div></div>
                        <button class="call-again-btn" onclick="openCallScreen('${call.contactName}', '${call.contactPhone}')">Call Again</button>`;
      targetDiv.appendChild(item);
    });
  }, err => console.error('Call history error', err));
}
function loadFullCallHistory(){ showLoader(); listenToCallHistory(null, 'fullCallHistoryList'); hideLoader(); }

/* --- Dialpad & contacts --- */
let currentNumber = '';
const dialPadDisplay = () => document.getElementById('dialPadDisplay');

function dialInput(value){
  if (!dialPadDisplay()) return;
  if(value === 'backspace') currentNumber = currentNumber.slice(0, -1);
  else currentNumber += value;
  dialPadDisplay().value = currentNumber;
}
function clearDialPad(){ currentNumber = ''; if(dialPadDisplay()) dialPadDisplay().value = ''; }
function openContactsFromDialpad(){ history.back(); openOverlayWithHistory('contactsPage'); }

/* --- Contacts --- */
function loadContacts(){
  showLoader();
  if(!loggedInUser){ hideLoader(); return; }
  const listDiv = document.getElementById('contactsList');
  if(listDiv) listDiv.innerHTML = '<p class="placeholder-text">Loading contacts...</p>';
  const contactsRef = db.collection('users').doc(loggedInUser.uid).collection('contacts');
  contactsRef.orderBy('name').get()
    .then(snapshot => {
      allContacts = [];
      if(listDiv) listDiv.innerHTML = '';
      snapshot.forEach(doc => {
        const c = doc.data();
        allContacts.push({ id: doc.id, ...c });
      });
      displayContacts(allContacts);
      hideLoader();
    })
    .catch(err => {
      console.error('Error loading contacts', err);
      if(listDiv) listDiv.innerHTML = '<p class="error-message">Could not load contacts.</p>';
      hideLoader();
    });
}

function displayContacts(list){
  const contactsListDiv = document.getElementById('contactsList');
  if(!contactsListDiv) return;
  contactsListDiv.innerHTML = '';
  if(!list || list.length === 0) {
    contactsListDiv.innerHTML = '<p class="placeholder-text">No contacts found. Add one!</p>';
    return;
  }
  list.forEach(contact => {
    const div = document.createElement('div');
    div.classList.add('contact-item');
    const initials = (contact.name || '').split(' ').map(p => p.charAt(0).toUpperCase()).join('');
    div.innerHTML = `
      <div class="contact-avatar">${initials}</div>
      <div class="contact-info">
        <div class="contact-name">${contact.name}</div>
        <div class="contact-phone">${contact.phone}</div>
      </div>
      <div class="contact-actions">
        <button class="icon-btn" onclick="openCallScreen('${escapeJS(contact.name)}','${escapeJS(contact.phone)}')" aria-label="Call ${contact.name}"><i class="fas fa-phone"></i></button>
        <button class="icon-btn" onclick="openNewMessagePageWithRecipient('${escapeJS(contact.name)}','${escapeJS(contact.phone)}')"><i class="fas fa-comment"></i></button>
        <button class="icon-btn" onclick="openEditContactPage('${contact.id}')"><i class="fas fa-edit"></i></button>
        <button class="icon-btn" onclick="deleteContact('${contact.id}')"><i class="fas fa-trash"></i></button>
      </div>`;
    contactsListDiv.appendChild(div);
  });
}

function escapeJS(s){
  if(!s) return '';
  return s.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/* --- Call Screen & Real call integration --- */
const callScreen = document.getElementById('callScreen');
const callingContactName = document.getElementById('callingContactName');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');

let callInterval = null;
let seconds = 0;
let startRingTimeout = null;

/* Open call screen and make a real backend call */
async function openCallScreen(name, number){
  // sanitize number and UI
  const displayName = name || number || 'Unknown';
  if(callingContactName) callingContactName.textContent = displayName;
  if(callScreen) callScreen.classList.add('active');
  if(callStatus) callStatus.textContent = "Please wait while we connect your call...";

  // user gesture already occurred (click) so audio play is allowed on most browsers
  try { connectAudio.currentTime = 0; connectAudio.play().catch(()=>{}); } catch(e){}

  // after short message start ringing tone
  startRingTimeout = setTimeout(() => {
    try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
    try { ringAudio.currentTime = 0; ringAudio.play().catch(()=>{}); } catch(e){}
    if(callStatus) callStatus.textContent = "Ringing...";
  }, 2400);

  // normalize number (add + if missing) - default to +234; adjust logic to detect other countries as needed
  let toNumber = number || '';
  if(!toNumber.startsWith('+')) toNumber = '+234' + toNumber.replace(/^0+/, '');

  showLoader();
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ to: toNumber })
    });
    const data = await res.json();
    hideLoader();

    // stop pre-call audio
    try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
    try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}
    if(startRingTimeout) clearTimeout(startRingTimeout);

    // handle responses
    if (!res.ok || (data && data.success === false)) {
      // Show backend error or insufficient balance message returned from backend
      const msg = (data && data.error) ? data.error : "Call failed to connect.";
      if(callStatus) callStatus.textContent = msg;
      showAlert(msg);
      setTimeout(()=>{ if(callScreen) callScreen.classList.remove('active'); }, 2000);
      return;
    }

    // At this point call was queued by Africa's Talking (result.status maybe 'Queued')
    // Start timer only when the backend indicates connected (here we treat queued as 'connected on UI')
    if(callStatus) callStatus.textContent = "Connected";
    seconds = 0;
    if(callTimer) callTimer.textContent = "00:00";
    callInterval = setInterval(updateCallTimer, 1000);

  } catch (err) {
    hideLoader();
    try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
    try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}
    if(startRingTimeout) clearTimeout(startRingTimeout);
    if(callStatus) callStatus.textContent = "Network Error. Please try again.";
    showAlert("Network Error: " + (err.message || err));
    setTimeout(()=>{ if(callScreen) callScreen.classList.remove('active'); }, 2000);
  }
}

function updateCallTimer(){
  seconds++;
  if(callTimer) {
    const mm = Math.floor(seconds/60).toString().padStart(2,'0');
    const ss = (seconds%60).toString().padStart(2,'0');
    callTimer.textContent = `${mm}:${ss}`;
  }
}

/* End call (requests backend to hangup) */
async function endCallSimulation(){
  showLoader();
  clearInterval(callInterval);
  callInterval = null;
  // stop audio
  try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}
  try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}

  // UI hide
  if(callScreen) callScreen.classList.remove('active');

  const duration = (callTimer && callTimer.textContent) ? callTimer.textContent : '00:00';
  const contactName = (callScreen && callScreen.getAttribute) ? callScreen.getAttribute('data-contact-name') : '';

  // request server to end call (if server supports it)
  try {
    await fetch(END_CALL_URL, { method: "POST" });
  } catch (err) {
    console.warn('End call request failed: ', err);
  }

  // log to Firestore
  if(loggedInUser && seconds > 0){
    db.collection('users').doc(loggedInUser.uid).collection('callHistory').add({
      contactName: contactName || 'Unknown',
      contactPhone: (callScreen && callScreen.getAttribute) ? callScreen.getAttribute('data-contact-phone') : '',
      duration,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('Failed to log call', err));
  }
  seconds = 0;
  hideLoader();
  showAlert(`Call with ${contactName || 'contact'} ended after ${duration}`);
}

/* --- Start call from Dial Pad (button) --- */
async function startCallFromDialpad(){
  if(!currentNumber || currentNumber.trim()===''){
    showAlert('Please enter a number to call.');
    return;
  }
  // Use dialpad number - add plus if missing using a user country code selector if you have it
  const numberToCall = currentNumber.startsWith('+') ? currentNumber : ('+234' + currentNumber.replace(/^0+/, ''));
  // Show call screen and trigger call
  openCallScreen(numberToCall, numberToCall);
}

/* --- keyboard dialpad support --- */
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if(/^[0-9*#+]$/.test(k)) { dialInput(k); }
  else if(k === 'Backspace') { dialInput('backspace'); }
  else if(k === 'Enter') { startCallFromDialpad(); }
});

/* --- Utility / Alert / Confirm UI (use your existing modals) --- */
const alertDialog = document.getElementById('customAlertDialog');
const alertMessage = document.getElementById('customAlertMessage');
function showAlert(msg){
  if(alertMessage && alertDialog){
    alertMessage.textContent = msg; alertDialog.classList.add('active');
  } else {
    window.alert(msg);
  }
}
function hideCustomAlert(){ if(alertDialog) alertDialog.classList.remove('active'); }

const confirmDialog = document.getElementById('customConfirmDialog');
const confirmMessage = document.getElementById('customConfirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
let confirmCallback = null;
function showConfirm(msg, onConfirm){
  if(confirmMessage && confirmDialog){
    confirmMessage.textContent = msg; confirmCallback = onConfirm; confirmDialog.classList.add('active');
  } else {
    if(window.confirm(msg) && onConfirm) onConfirm();
  }
}
if(confirmOkBtn) confirmOkBtn.onclick = () => { if(confirmCallback) confirmCallback(); if(confirmDialog) confirmDialog.classList.remove('active'); };
if(confirmCancelBtn) confirmCancelBtn.onclick = () => { if(confirmDialog) confirmDialog.classList.remove('active'); };

/* --- Wallet & recharge --- */
async function payWithPaystack(){
  showLoader();
  let amount = document.getElementById("rechargeAmount").value;
  if(!amount || isNaN(amount) || amount < 100){ showAlert("Please enter a valid amount (minimum ₦100)"); hideLoader(); return; }
  if(!loggedInUser){ showAlert("You must be logged in to recharge."); hideLoader(); return; }
  const userDoc = await db.collection('users').doc(loggedInUser.uid).get();
  if(!userDoc.exists){ showAlert("Could not find user data. Try again."); hideLoader(); return; }
  const userEmail = userDoc.data().email || `${loggedInUser.phoneNumber}@smartcall.app`;
  let handler = PaystackPop.setup({
    key: paystackPublicKey, email: userEmail, amount: amount * 100, currency: 'NGN',
    ref: 'SC_' + Math.floor(Math.random()*1000000000 + 1),
    callback: function(response){
      showLoader(); document.getElementById("rechargeStatus").innerText = "Verifying payment...";
      updateUserBalanceInDB(parseFloat(amount)).then(() => {
        document.getElementById("rechargeStatus").innerText = "Recharge successful! Ref: " + response.reference;
        hideLoader(); setTimeout(()=>closeOverlay('rechargePage'), 1500);
      });
    },
    onClose: function(){ hideLoader(); }
  });
  handler.openIframe();
}

async function updateUserBalanceInDB(amount){
  if(!loggedInUser) return;
  const userRef = db.collection('users').doc(loggedInUser.uid);
  return db.runTransaction(transaction => {
    return transaction.get(userRef).then(doc => {
      if(!doc.exists) throw "Document does not exist!";
      const newBalance = (doc.data().balance || 0) + amount;
      transaction.update(userRef, { balance: newBalance });
    });
  }).catch(error => {
    console.error("Transaction failed: ", error);
    document.getElementById("rechargeStatus").innerText = "Recharge failed. Please try again.";
  });
}

function updateWalletBalance(balance){
  const el = document.getElementById("walletBalance");
  if(!el) return;
  const balanceInNaira = (balance || 0).toFixed(2);
  const approxMinutes = Math.floor((balance||0) / callCostPerMinute);
  el.innerHTML = `Your Wallet Balance: <strong>₦${balanceInNaira}</strong><br><span><i>(Approx. ${approxMinutes} Minutes)</i></span>`;
}

/* --- Referral link --- */
function generateReferralLink(){
  if(loggedInUser && loggedInUser.uid) document.getElementById('referralLink').value = `https://smartcall.app/refer/${loggedInUser.uid}`;
  else document.getElementById('referralLink').value = "Log in to get your referral link";
}
function copyReferralLink(){
  const input = document.getElementById('referralLink');
  if(!input) return;
  input.select(); input.setSelectionRange(0,99999);
  document.execCommand('copy'); showAlert('Referral link copied to clipboard!');
}
function shareReferralLink(){
  if(navigator.share) {
    navigator.share({ title:'SmartCall Referral', text:'Join me on SmartCall', url: document.getElementById('referralLink').value });
  } else showAlert("Web Share not supported - please copy the link.");
}

/* --- Clear call history --- */
function clearRecentCalls(){
  showConfirm('Are you sure you want to clear your entire call history? This cannot be undone.', () => {
    showLoader();
    if(!loggedInUser){ showAlert("You must be logged in to clear history."); hideLoader(); return; }
    const callHistoryRef = db.collection('users').doc(loggedInUser.uid).collection('callHistory');
    callHistoryRef.get().then(snapshot => {
      const batch = db.batch();
      snapshot.docs.forEach(d => batch.delete(d.ref));
      return batch.commit();
    }).then(()=>{ hideLoader(); showAlert('Call history cleared successfully!'); })
    .catch(err => { console.error(err); hideLoader(); showAlert('Error clearing call history: ' + err.message); });
  });
}

/* --- Small helpers --- */
function openNewMessagePage() { showAlert("Messaging under development."); }
function openNewMessagePageWithRecipient(name, phone) { showAlert("Messaging under development."); }
function searchMessages(){ showAlert("Messaging under development."); }

window.addEventListener('load', ()=> {
  // fade-in for your global copyright (if used)
  const copyElem = document.querySelector('.global-copyright');
  if(copyElem) copyElem.style.opacity = 1;
});


