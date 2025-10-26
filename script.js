/* ===============================
   FIREBASE INITIALIZATION
   =============================== */
const firebaseConfig = {
  apiKey: "AIzaSyDF5ROHRjFjwnm5fzdXhOc8Xzq0LOUyw1M",
  authDomain: "smartcalls-d49f5.firebaseapp.com",
  projectId: "smartcalls-d49f5",
  storageBucket: "smartcalls-d49f5.appspot.com",
  messagingSenderId: "854255870421",
  appId: "1:854255870421:web:177c38dc6de653a86edd5c",
  measurementId: "G-JKKWJEJK0B"
};

// Make sure Firebase SDK scripts are loaded in index.html
// <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"></script>

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* --- Continue with your SmartCall backend and call logic below --- */


/* ===============================
   SMARTCALL FRONTEND SCRIPT.JS
   =============================== */

/* ---------- BASIC CONFIG ---------- */
const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com"; // your backend base URL
const CALLER_ID = "+2342017001172"; // your Africa's Talking virtual number
const PAYSTACK_PUBLIC_KEY = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e"; // replace with your real Paystack key

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
