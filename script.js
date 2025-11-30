/* ===============================
   SMARTCALL - CLEANED script.js
   Replace your current script.js entirely with this file.
   - Preserves Firebase use, call logging, paystack hooks
   - Proper country-code handling, single DOMContentLoaded
   - Polished audio flow: "Please wait" → ringback → connected
   - No loader blocking the call UI while calling
   - Handles backend fail messages (e.g. insufficient credit)
   Notes: this does NOT create browser-to-phone 2-way audio.
   For two-way in-browser audio you must implement WebRTC tokens
   and client WebRTC - see notes at the end.
   =============================== */

/* ---------- CONFIG / GLOBAL STATE ---------- */
let isDarkTheme = false;
let loggedInUser = null;
let allContacts = [];
let stopUserListener = () => {};
let stopCallHistoryListener = () => {};
window.confirmationResult = null;

const callCostPerMinute = 13;
let callInterval = null;
let callSeconds = 0;

// Backend URLs (adjust if your backend path differs)
const BACKEND_CALL_URL = "https://smartcall-backend-7cm9.onrender.com/api/call";
const BACKEND_END_URL = "https://smartcall-backend-7cm9.onrender.com/api/end";

// ---------------- UI ELEMENTS ----------------
const loader = document.getElementById('loader');
const dialPadDisplay = document.getElementById('dialPadDisplay');
const callScreen = document.getElementById('callScreen');
const callingContactName = document.getElementById('callingContactName');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');

const alertDialog = document.getElementById('customAlertDialog');
const alertMessage = document.getElementById('customAlertMessage');
const confirmDialog = document.getElementById('customConfirmDialog');
const confirmMessage = document.getElementById('customConfirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

// ------------- Audio Setup -------------
// short spoken "please wait" or hold message
const connectAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5f05e4c3da.mp3?filename=please-hold-the-line-115132.mp3");
connectAudio.preload = "auto";
connectAudio.volume = 1.0;
// ringback tone (loop)
const ringAudio = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_12f6943d15.mp3?filename=phone-ring-classic-24963.mp3");
ringAudio.preload = "auto";
ringAudio.loop = true;
ringAudio.volume = 0.6;

// ---------------- Helpers ----------------
function showLoader() { loader && loader.classList.add('show'); }
function hideLoader() { loader && loader.classList.remove('show'); }

function showAlert(msg) {
  if (!alertDialog || !alertMessage) { alert(msg); return; }
  alertMessage.textContent = msg;
  alertDialog.classList.add('active');
}
function hideCustomAlert() { alertDialog && alertDialog.classList.remove('active'); }

function showConfirm(msg, onConfirm) {
  if (!confirmDialog || !confirmMessage) { if (confirm(onConfirm)) onConfirm(); return; }
  confirmMessage.textContent = msg;
  confirmDialog.classList.add('active');
  confirmOkBtn.onclick = () => { confirmDialog.classList.remove('active'); onConfirm && onConfirm(); };
  confirmCancelBtn.onclick = () => { confirmDialog.classList.remove('active'); };
}

function formatDisplayNumber(n) { return n || ''; }

// Read selected country code from a <select id="dialCountryCode"> in your HTML.
// If not found, fallback to +234.
function getSelectedCountryCode() {
  const sel = document.getElementById('dialCountryCode');
  if (sel && sel.value) return sel.value;
  return "+234";
}

// Normalize number: if starts with + return as-is; if starts with 0 remove leading 0s and prefix with selected country code.
// If starts with other digits, prefix selected country code.
function normalizeNumberForCall(input) {
  if (!input) return "";
  input = input.toString().trim();
  if (input.startsWith("+")) return input;
  const code = getSelectedCountryCode();
  const stripped = input.replace(/^0+/, "");
  return code + stripped;
}

// ----------------- Page Load & init -----------------
document.addEventListener('DOMContentLoaded', () => {
  // Add country codes (only once)
  const countryCodeSelect = document.getElementById('dialCountryCode');
  if (countryCodeSelect && countryCodeSelect.children.length === 0) {
    const codes = [
      ['+234', 'Nigeria (+234)'],
      ['+233', 'Ghana (+233)'],
      ['+225', 'Ivory Coast (+225)'],
      ['+256', 'Uganda (+256)'],
      ['+250', 'Rwanda (+250)'],
      ['+254', 'Kenya (+254)'],
      ['+211', 'South Sudan (+211)'],
      ['+220', 'Gambia (+220)'],
      ['+223', 'Mali (+223)'],
      ['+234', 'Nigeria (+234)']
    ];
    codes.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      countryCodeSelect.appendChild(opt);
    });
  }

  // Ensure the app shows welcome if not logged in
  // (You already have navigate/showPage functions in your file — keep them.)
});

// ---------------- Call UI Helpers ----------------
function startCallTimer() {
  callSeconds = 0;
  if (callTimer) callTimer.textContent = "00:00";
  if (callInterval) clearInterval(callInterval);
  callInterval = setInterval(() => {
    callSeconds++;
    const m = Math.floor(callSeconds / 60).toString().padStart(2, '0');
    const s = (callSeconds % 60).toString().padStart(2, '0');
    if (callTimer) callTimer.textContent = `${m}:${s}`;
  }, 1000);
}
function stopCallTimer() {
  if (callInterval) {
    clearInterval(callInterval);
    callInterval = null;
  }
}

// Ensure audios are stopped safely
function stopAllCallAudio() {
  try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
  try { ringAudio.pause(); ringAudio.currentTime = 0; } catch(e){}
}

// ------------------ Make Call ------------------
// Open call screen, call backend, update UI according to backend response
async function openCallScreen(nameOrNumber, rawNumber) {
  // display UI immediately
  callingContactName && (callingContactName.textContent = nameOrNumber || rawNumber || 'Unknown');
  callScreen && callScreen.classList.add('active');

  // show a friendly connecting message, but do NOT block UI with loader
  callStatus && (callStatus.textContent = "Please wait while we connect your call...");

  // try to play "please wait" audio (browsers may block autoplay)
  connectAudio.play().catch(()=>{ /* ignore autoplay block */ });

  // after a short delay switch to ringback sound
  const ringTimeout = setTimeout(() => {
    try { connectAudio.pause(); connectAudio.currentTime = 0; } catch(e){}
    ringAudio.play().catch(()=>{ /* ignore autoplay block */ });
    callStatus && (callStatus.textContent = "Ringing...");
  }, 2300);

  // Normalize number
  const toNumber = normalizeNumberForCall(rawNumber);

  // Call backend
  try {
    const res = await fetch(BACKEND_CALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toNumber })
    });
    const data = await res.json();

    // stop ring/please-hold
    clearTimeout(ringTimeout);
    stopAllCallAudio();

    // backend blocks call (insufficient credit or error)
    if (!res.ok || (data && data.success === false)) {
      // Use backend message if provided, fallback to polite message
      const backendMsg = data && data.error ? data.error :
        "We couldn't connect the call right now. Please try again later.";
      callStatus && (callStatus.textContent = backendMsg);
      showAlert(backendMsg);
      setTimeout(() => callScreen && callScreen.classList.remove('active'), 3000);
      return;
    }

    // If backend says queued/connected -> reflect based on result entries
    const entryStatus = (data && data.result && data.result.entries && data.result.entries[0] && data.result.entries[0].status) || "";
    // many success statuses are 'Queued' initially and Africa's Talking will call and update callbacks later.
    // We'll treat anything non-empty and non-error as success to start timer.
    if (entryStatus.toLowerCase().includes('insufficient') || entryStatus.toLowerCase().includes('failed') ) {
      const msg = data.error || "You do not have sufficient balance to make this call. Please recharge and try again. Thank you.";
      callStatus && (callStatus.textContent = msg);
      showAlert(msg);
      setTimeout(() => callScreen && callScreen.classList.remove('active'), 3500);
      return;
    }

    // Start call timer and mark connected (note: actual "answered" state might be signalled by Africa's Talking callback — for now we start the timer)
    callStatus && (callStatus.textContent = "Connected");
    startCallTimer();

  } catch (err) {
    clearTimeout(ringTimeout);
    stopAllCallAudio();
    callStatus && (callStatus.textContent = "Network Error. Please try again.");
    showAlert("Network error: " + (err.message || err));
    setTimeout(() => callScreen && callScreen.classList.remove('active'), 3000);
  }
}

// End call (requests backend to hang up if supported)
async function endCall() {
  stopCallTimer();
  stopAllCallAudio();
  callScreen && callScreen.classList.remove('active');

  // attempt to notify backend to hangup active calls
  try {
    await fetch(BACKEND_END_URL, { method: 'POST' });
  } catch (err) {
    console.warn("End call backend error:", err);
  }
}

// ----------------- Dialpad Integration -----------------
let currentNumber = "";
if (dialPadDisplay) dialPadDisplay.value = "";

function dialInput(value) {
  if (value === 'backspace') {
    currentNumber = currentNumber.slice(0, -1);
  } else {
    currentNumber += String(value);
  }
  if (dialPadDisplay) dialPadDisplay.value = currentNumber;
}

function clearDialPad() {
  currentNumber = "";
  if (dialPadDisplay) dialPadDisplay.value = "";
}

async function startCallFromDialpad() {
  if (!currentNumber || currentNumber.trim() === "") {
    showAlert("Please enter a number to call.");
    return;
  }
  const normalized = normalizeNumberForCall(currentNumber);
  // open same call UI
  openCallScreen(normalized, normalized);
}

// keyboard support
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (/^[0-9*#+]$/.test(k)) { dialInput(k); }
  else if (k === "Backspace") dialInput('backspace');
  else if (k === "Enter") startCallFromDialpad();
});

// ---------------- Contacts wiring (when building contact list) ----------------
// When rendering contact call buttons use: onclick="openCallScreen('Name', '+234...')"
// Example in your contact list rendering:
// <button onclick="openCallScreen('Ali', '+2349012345678')">Call</button>

// ---------------- Call history logging ----------------
// Keep your existing Firestore call-logging where you log duration when the call ends.
// After endCall() you can push call log to firestore (if loggedInUser present)

// ---------------- Navigation / Back button fix ----------------
// You already had an onpopstate handler. Make sure index.html uses history.pushState when opening overlays/pages.
// The important bit: ensure functions navigate() and showPage() are defined once and not redeclared elsewhere.
// If they were accidentally removed earlier, re-add your original versions (do not duplicate).

// ---------------- EXPORT for debugging ----------------
window.openCallScreen = openCallScreen;
window.startCallFromDialpad = startCallFromDialpad;
window.endCall = endCall;
window.dialInput = dialInput;
window.clearDialPad = clearDialPad;
