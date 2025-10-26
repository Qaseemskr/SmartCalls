// --- Firebase Configuration ---
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

// --- Global Config ---
let loggedInUser = null;
let allContacts = [];
let currentNumber = "";
let isDarkTheme = false;

const BACKEND_URL = "https://smartcall-backend-7cm9.onrender.com/api/call";
const callCostPerMinute = 13;
const paystackPublicKey = "pk_live_1ed27cc7f362095117cd138dc098958dfb03101e";

// --- Loader ---
const loader = document.getElementById("loader");
function showLoader() { loader.classList.add("show"); }
function hideLoader() { setTimeout(() => loader.classList.remove("show"), 300); }

// --- Theme ---
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.body.classList.toggle("dark-theme", isDarkTheme);
  const icon = document.querySelector("#themeToggleButton i");
  icon.classList.toggle("fa-sun", !isDarkTheme);
  icon.classList.toggle("fa-moon", isDarkTheme);
  localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
}

// --- Page Navigation ---
function navigate(pageId) {
  showLoader();
  document.querySelectorAll(".container").forEach(c => c.classList.add("hidden"));
  document.getElementById(pageId).classList.remove("hidden");
  hideLoader();
}

function openOverlayWithHistory(id) {
  document.getElementById(id).classList.add("active");
  if (id === "contactsPage") loadContacts();
}

// --- Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyDF5ROHRjFjwnm5fzdXhOc8Xzq0LOUyw1M",
  authDomain: "smartcalls-d49f5.firebaseapp.com",
  projectId: "smartcalls-d49f5",
  storageBucket: "smartcalls-d49f5.appspot.com",
  messagingSenderId: "854255870421",
  appId: "1:854255870421:web:177c38dc6de653a86edd5c",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

document.addEventListener("DOMContentLoaded", () => {
   // your main startup code here
});

// --- Auth Logic ---
function handleEmailLogin() {
  showLoader();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const authMessage = document.getElementById("authMessage");
  if (!email || !password) { authMessage.textContent = "Enter both fields"; hideLoader(); return; }

  auth.signInWithEmailAndPassword(email, password)
    .then(() => navigate("homePage"))
    .catch(err => { authMessage.textContent = err.message; hideLoader(); });
}

function handleEmailRegister() {
  showLoader();
  const name = document.getElementById("registerFullNameEmail").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  const msg = document.getElementById("registerAuthMessage");

  if (!name || !email || !password) { msg.textContent = "All fields required."; hideLoader(); return; }

  auth.createUserWithEmailAndPassword(email, password)
    .then(userCredential => {
      const user = userCredential.user;
      db.collection("users").doc(user.uid).set({
        fullName: name,
        email,
        memberSince: new Date(),
        balance: 0
      });
      navigate("authPage");
      hideLoader();
    })
    .catch(e => { msg.textContent = e.message; hideLoader(); });
}

auth.onAuthStateChanged(user => {
  if (user) {
    loggedInUser = user;
    navigate("homePage");
    listenToUserData();
  } else {
    loggedInUser = null;
    navigate("welcomePage");
  }
});

// --- Firestore Listeners ---
function listenToUserData() {
  if (!loggedInUser) return;
  const userRef = db.collection("users").doc(loggedInUser.uid);
  userRef.onSnapshot(doc => {
    if (doc.exists) {
      const data = doc.data();
      document.getElementById("welcomeUserName").textContent = data.fullName;
      updateWalletBalance(data.balance || 0);
    }
  });
}

// --- Wallet / Paystack ---
function updateWalletBalance(balance) {
  const balText = document.getElementById("walletBalance");
  const minutes = Math.floor(balance / callCostPerMinute);
  balText.innerHTML = `Your Wallet Balance: <strong>₦${balance.toFixed(2)}</strong><br><span><i>(Approx. ${minutes} Minutes)</i></span>`;
}

function payWithPaystack() {
  showLoader();
  const amount = document.getElementById("rechargeAmount").value;
  if (!amount || amount < 100) { showAlert("Enter at least ₦100"); hideLoader(); return; }

  const handler = PaystackPop.setup({
    key: paystackPublicKey,
    email: loggedInUser.email || "user@smartcall.app",
    amount: amount * 100,
    currency: "NGN",
    ref: "SC_" + Math.floor(Math.random() * 1000000),
    callback: function() {
      db.collection("users").doc(loggedInUser.uid).update({
        balance: firebase.firestore.FieldValue.increment(parseFloat(amount))
      });
      hideLoader();
      showAlert("Recharge successful!");
    },
    onClose: function() { hideLoader(); }
  });
  handler.openIframe();
}

// --- Countries ---
const COUNTRY_CODES = {
  Nigeria: "+234",
  Ghana: "+233",
  Uganda: "+256",
  Kenya: "+254",
  Niger: "+227"
};
function getCountryCodeFromPhone(phone) {
  const clean = phone.replace(/\D/g, "");
  if (clean.startsWith("233")) return "+233"; // Ghana
  if (clean.startsWith("256")) return "+256"; // Uganda
  if (clean.startsWith("254")) return "+254"; // Kenya
  if (clean.startsWith("227")) return "+227"; // Niger
  return "+234"; // Default Nigeria
}


// --- Dial Pad ---
document.addEventListener("DOMContentLoaded", () => {
  const selectElements = document.querySelectorAll('select[id$="CountryCode"]');
  Object.entries(COUNTRY_CODES).forEach(([country, code]) => {
    selectElements.forEach(select => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${code} (${country})`;
      select.appendChild(opt);
    });
  });
});

function dialInput(val) {
  if (val === "backspace") currentNumber = currentNumber.slice(0, -1);
  else currentNumber += val;
  document.getElementById("dialPadDisplay").value = currentNumber;
}

function clearDialPad() { currentNumber = ""; document.getElementById("dialPadDisplay").value = ""; }

async function startCallFromDialpad() {
  const number = currentNumber.trim();
  const code = document.getElementById("dialPadCountryCode").value;
  if (!number) return showAlert("Enter a number to call.");

  const fullNumber = formatPhoneNumber(code, number);
  makeRealCall(fullNumber);
}

function formatPhoneNumber(code, number) {
  let clean = number.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = clean.substring(1);
  return code + clean;
}

// --- Make Real Call ---
async function makeRealCall(toNumber) {
  showLoader();

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "+2342017001172", // ✅ your verified Africa's Talking virtual number
        to: toNumber
      })
    });

    const data = await response.json();
    hideLoader();

    if (response.ok) {
      showAlert(`📞 Calling ${toNumber}...`);
    } else {
      showAlert(`❌ Call failed: ${data.error || "Unknown error"}`);
    }
  } catch (err) {
    hideLoader();
    showAlert("⚠️ Network error: " + err.message);
  }
}

// --- Contacts ---
function loadContacts() {
  if (!loggedInUser) return;

  const div = document.getElementById("contactsList");
  div.innerHTML = "<p>Loading contacts...</p>";

  db.collection("users").doc(loggedInUser.uid).collection("contacts").get()
    .then(snapshot => {
      div.innerHTML = "";
      snapshot.forEach(doc => {
        const c = doc.data();
        const item = document.createElement("div");
        item.classList.add("contact-item");

        item.innerHTML = `
          <div class="contact-info">
            <strong>${c.name}</strong><br>
            <small>${c.phone}</small>
          </div>
          <button class="icon-btn" onclick="makeRealCall(formatPhoneNumber(getCountryCodeFromPhone('${c.phone}'), '${c.phone}'))">
            <i class="fas fa-phone"></i>
          </button>
        `;
        div.appendChild(item);
      });
    })
    .catch(err => {
      div.innerHTML = `<p class="error-message">Error loading contacts: ${err.message}</p>`;
    });
}

