"use strict";
const firebaseConfig = {
    apiKey: "AIzaSyBi6UCjNt6RxB-RrKmDSHuC3Ax9khqzcbg",
    authDomain: "webappparax.firebaseapp.com",
    projectId: "webappparax",
    storageBucket: "webappparax.firebasestorage.app",
    messagingSenderId: "277836472816",
    appId: "1:277836472816:web:e5daae78179110f4527d35",
    measurementId: "G-8GXYHNJ0HK"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
db.settings({ merge: true });
document.addEventListener("DOMContentLoaded", () => {
    const page = window.location.pathname.split("/").pop() || "";
    initPasswordToggles();
    if (page === "signup.html" || page.startsWith("signup")) {
        initSignupValidation();
    }
    if (page === "login.html" || page.startsWith("login")) {
        initLoginValidation();
    }
    initAuthStateListener(page);
    if (page === "dashboard.html") {
        initDashboard();
    }
    if (page === "chat.html") {
        initChat();
    }
});
/* ===== FIREBASE AUTH ===== */
function setPersistence(remember) {
    if (remember) {
        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    }
    else {
        auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    }
}
async function handleSignup(username, email, password) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    await user.updateProfile({ displayName: username });
    await db.collection("users").doc(user.uid).set({
        username,
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
async function handleLogin(email, password) {
    await auth.signInWithEmailAndPassword(email, password);
}
async function handleGoogleAuth() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    if (cred.additionalUserInfo?.isNewUser) {
        const user = cred.user;
        await db.collection("users").doc(user.uid).set({
            username: user.displayName || "User",
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    }
}
function handleAuthError(error) {
    const code = error.code;
    if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        return "Invalid email or password.";
    }
    if (code === "auth/email-already-in-use") {
        return "An account with this email already exists.";
    }
    if (code === "auth/weak-password") {
        return "Password must be at least 6 characters.";
    }
    if (code === "auth/popup-closed-by-user") {
        return "";
    }
    return error.message || "Something went wrong.";
}
/* ===== ROOM FUNCTIONS ===== */
function generateRoomCode() {
    return Math.floor(10000000000 + Math.random() * 90000000000).toString();
}
async function createRoom() {
    const code = generateRoomCode();
    const user = auth.currentUser;
    await db.collection("rooms").doc(code).set({
        createdBy: user.uid,
        createdByName: user.displayName || "Unknown",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return code;
}
async function roomExists(code) {
    const doc = await db.collection("rooms").doc(code).get();
    return doc.exists;
}
/* ===== MESSAGE FUNCTIONS ===== */
async function sendMessage(roomCode, text) {
    const user = auth.currentUser;
    if (!text.trim())
        return;
    await db.collection("messages").add({
        roomCode,
        senderId: user.uid,
        senderName: user.displayName || "Anonymous",
        text: text.trim(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
function loadMessages(roomCode, callback) {
    return db.collection("messages")
        .where("roomCode", "==", roomCode)
        .onSnapshot((snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        callback(messages);
    }, (error) => {
        console.error("Messages error:", error);
        const el = document.getElementById("chat-messages");
        if (el)
            el.innerHTML = `<div class="chat-error">Failed to load messages. Check console for details.</div>`;
    });
}
function loadUserRooms(callback) {
    const user = auth.currentUser;
    if (!user)
        return () => { };
    return db.collection("rooms")
        .where("createdBy", "==", user.uid)
        .onSnapshot((snapshot) => {
        const rooms = [];
        snapshot.forEach((doc) => {
            rooms.push({ code: doc.id, ...doc.data() });
        });
        rooms.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        callback(rooms);
    }, (error) => {
        console.error("Rooms error:", error);
    });
}
/* ===== DASHBOARD ===== */
let dashboardUnsub = null;
function initDashboard() {
    const createBtn = document.getElementById("create-room-btn");
    const joinBtn = document.getElementById("join-room-btn");
    const codeInput = document.getElementById("room-code-input");
    const roomList = document.getElementById("room-list");
    createBtn?.addEventListener("click", async () => {
        createBtn.textContent = "Creating...";
        createBtn.disabled = true;
        try {
            const code = await createRoom();
            window.location.href = `/chat.html?code=${code}`;
        }
        catch (error) {
            showAuthError(error.message || "Failed to create room");
            createBtn.textContent = "Create Room";
            createBtn.disabled = false;
        }
    });
    joinBtn?.addEventListener("click", () => {
        const code = codeInput?.value.trim();
        if (code && code.length === 11 && /^\d{11}$/.test(code)) {
            window.location.href = `/chat.html?code=${code}`;
        }
        else {
            showAuthError("Enter a valid 11-digit code");
        }
    });
    codeInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            joinBtn?.click();
    });
    codeInput?.addEventListener("input", () => {
        codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 11);
    });
    dashboardUnsub = loadUserRooms((rooms) => {
        if (!roomList)
            return;
        if (rooms.length === 0) {
            roomList.innerHTML = '<p class="room-list-empty">No rooms yet. Create or join one!</p>';
        }
        else {
            roomList.innerHTML = rooms.map(r => `
        <a href="/chat.html?code=${r.code}" class="room-item">
          <span class="room-code">${r.code}</span>
          <span class="room-date">${r.createdAt?.toDate?.().toLocaleDateString() || ""}</span>
        </a>
      `).join("");
        }
    });
}
/* ===== CHAT ===== */
let chatUnsub = null;
let currentRoomCode = null;
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
function initChat() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("code");
    if (!roomCode) {
        window.location.href = "/dashboard.html";
        return;
    }
    currentRoomCode = roomCode;
    const headerEl = document.getElementById("room-code-display");
    const messagesEl = document.getElementById("chat-messages");
    const inputEl = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const leaveBtn = document.getElementById("leave-room-btn");
    if (headerEl)
        headerEl.textContent = roomCode;
    roomExists(roomCode).then((exists) => {
        if (!exists) {
            if (messagesEl)
                messagesEl.innerHTML = '<div class="chat-error">Room not found. <a href="/dashboard.html">Go back</a></div>';
        }
    });
    chatUnsub = loadMessages(roomCode, (messages) => {
        if (!messagesEl)
            return;
        const wasEmpty = messagesEl.querySelector(".chat-empty, .chat-loading") !== null;
        if (messages.length === 0) {
            messagesEl.innerHTML = '<div class="chat-empty">No messages yet. Say hello!</div>';
        }
        else {
            const isAtBottom = wasEmpty || messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
            messagesEl.innerHTML = messages.map(m => {
                const time = m.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "";
                return `
          <div class="message ${m.senderId === auth.currentUser?.uid ? "message-own" : ""}">
            <div class="message-header">
              <span class="message-sender">${escapeHtml(m.senderName)}</span>
              <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${escapeHtml(m.text)}</div>
          </div>
        `;
            }).join("");
            if (isAtBottom)
                messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    });
    const send = () => {
        if (!inputEl?.value.trim())
            return;
        sendMessage(roomCode, inputEl.value).catch((err) => {
            showAuthError("Failed to send: " + err.message);
        });
        inputEl.value = "";
        inputEl.focus();
    };
    sendBtn?.addEventListener("click", send);
    inputEl?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            send();
    });
    leaveBtn?.addEventListener("click", () => {
        window.location.href = "/dashboard.html";
    });
}
/* ===== AUTH STATE LISTENER ===== */
function initAuthStateListener(currentPage) {
    auth.onAuthStateChanged((user) => {
        if (!user) {
            if (currentPage === "dashboard.html" || currentPage === "chat.html") {
                window.location.href = "/login.html";
                return;
            }
        }
        if (user && (currentPage === "login.html" || currentPage === "signup.html")) {
            window.location.href = "/dashboard.html";
            return;
        }
        updateNavbar(user);
    });
}
function updateNavbar(user) {
    const loginLinks = document.querySelectorAll('[href="login.html"], [href="signup.html"]');
    const navbarLinks = document.querySelector(".navbar-links");
    const heroButtons = document.querySelector(".hero-buttons");
    const ctaLink = document.querySelector('.cta-section a[href="signup.html"]');
    if (user) {
        loginLinks.forEach(el => {
            const btn = el;
            btn.style.display = "none";
        });
        if (heroButtons)
            heroButtons.classList.add("hidden");
        if (ctaLink)
            ctaLink.style.display = "none";
        if (navbarLinks && !document.getElementById("logout-btn")) {
            const dashBtn = document.createElement("a");
            dashBtn.href = "/dashboard.html";
            dashBtn.textContent = "Dashboard";
            dashBtn.className = "btn btn-primary";
            dashBtn.style.fontSize = "0.9rem";
            dashBtn.style.padding = "6px 12px";
            navbarLinks.appendChild(dashBtn);
            const logoutBtn = document.createElement("button");
            logoutBtn.id = "logout-btn";
            logoutBtn.textContent = "Logout";
            logoutBtn.className = "btn btn-secondary";
            logoutBtn.style.fontSize = "0.9rem";
            logoutBtn.style.padding = "6px 12px";
            logoutBtn.addEventListener("click", async () => {
                if (dashboardUnsub)
                    dashboardUnsub();
                if (chatUnsub)
                    chatUnsub();
                await auth.signOut();
                window.location.href = "/";
            });
            navbarLinks.appendChild(logoutBtn);
        }
    }
    else {
        if (heroButtons)
            heroButtons.classList.remove("hidden");
        if (ctaLink)
            ctaLink.style.display = "";
        loginLinks.forEach(el => {
            const btn = el;
            btn.style.display = "";
        });
    }
}
/* ===== UI UTILITIES ===== */
function showAuthError(message) {
    if (!message)
        return;
    const errorEl = document.createElement("div");
    errorEl.className = "auth-error";
    errorEl.textContent = message;
    document.body.appendChild(errorEl);
    setTimeout(() => errorEl.remove(), 5000);
}
/* ===== PASSWORD VISIBILITY TOGGLE ===== */
function initPasswordToggles() {
    const toggles = document.querySelectorAll(".password-toggle");
    toggles.forEach((toggle) => {
        toggle.addEventListener("click", () => {
            const wrapper = toggle.closest(".password-wrapper");
            if (!wrapper)
                return;
            const input = wrapper.querySelector("input");
            if (!input)
                return;
            if (input.type === "password") {
                input.type = "text";
                toggle.textContent = "Hide";
            }
            else {
                input.type = "password";
                toggle.textContent = "Show";
            }
        });
    });
}
/* ===== FORM UTILITIES ===== */
function setError(input, message) {
    input.classList.add("error");
    input.classList.remove("valid");
    const errorEl = input.closest(".form-group")?.querySelector(".error-message");
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add("visible");
    }
}
function setValid(input) {
    input.classList.remove("error");
    input.classList.add("valid");
    const errorEl = input.closest(".form-group")?.querySelector(".error-message");
    if (errorEl) {
        errorEl.classList.remove("visible");
    }
}
function clearStatus(input) {
    input.classList.remove("error", "valid");
    const errorEl = input.closest(".form-group")?.querySelector(".error-message");
    if (errorEl) {
        errorEl.classList.remove("visible");
    }
}
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validateUsername(username) {
    return username.length >= 3 && username.length <= 32;
}
function validatePassword(password) {
    return password.length >= 6;
}
function passwordsMatch(a, b) {
    return a === b;
}
/* ===== SIGNUP ===== */
function initSignupValidation() {
    const form = document.getElementById("signup-form");
    if (!form)
        return;
    const usernameInput = form.querySelector("#username");
    const emailInput = form.querySelector("#email");
    const passwordInput = form.querySelector("#password");
    const confirmInput = form.querySelector("#confirm-password");
    const googleBtn = document.getElementById("google-signup");
    if (googleBtn) {
        googleBtn.addEventListener("click", async () => {
            try {
                await handleGoogleAuth();
                window.location.href = "/dashboard.html";
            }
            catch (error) {
                const msg = handleAuthError(error);
                if (msg)
                    showAuthError(msg);
            }
        });
    }
    if (usernameInput) {
        usernameInput.addEventListener("blur", () => {
            const val = usernameInput.value.trim();
            if (!val) {
                setError(usernameInput, "Username is required.");
            }
            else if (!validateUsername(val)) {
                setError(usernameInput, "Must be between 3 and 32 characters.");
            }
            else {
                setValid(usernameInput);
            }
        });
        usernameInput.addEventListener("input", () => clearStatus(usernameInput));
    }
    if (emailInput) {
        emailInput.addEventListener("blur", () => {
            const val = emailInput.value.trim();
            if (!val) {
                setError(emailInput, "Email is required.");
            }
            else if (!validateEmail(val)) {
                setError(emailInput, "Please enter a valid email address.");
            }
            else {
                setValid(emailInput);
            }
        });
        emailInput.addEventListener("input", () => clearStatus(emailInput));
    }
    if (passwordInput) {
        passwordInput.addEventListener("blur", () => {
            const val = passwordInput.value;
            if (!val) {
                setError(passwordInput, "Password is required.");
            }
            else if (!validatePassword(val)) {
                setError(passwordInput, "Must be at least 6 characters.");
            }
            else {
                setValid(passwordInput);
            }
        });
        passwordInput.addEventListener("input", () => clearStatus(passwordInput));
    }
    if (confirmInput) {
        confirmInput.addEventListener("blur", () => {
            const val = confirmInput.value;
            const password = passwordInput?.value ?? "";
            if (!val) {
                setError(confirmInput, "Please confirm your password.");
            }
            else if (!passwordsMatch(val, password)) {
                setError(confirmInput, "Passwords do not match.");
            }
            else {
                setValid(confirmInput);
            }
        });
        confirmInput.addEventListener("input", () => clearStatus(confirmInput));
    }
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        let valid = true;
        if (usernameInput) {
            const val = usernameInput.value.trim();
            if (!val || !validateUsername(val)) {
                setError(usernameInput, !val ? "Username is required." : "Must be between 3 and 32 characters.");
                valid = false;
            }
            else {
                setValid(usernameInput);
            }
        }
        if (emailInput) {
            const val = emailInput.value.trim();
            if (!val || !validateEmail(val)) {
                setError(emailInput, !val ? "Email is required." : "Please enter a valid email address.");
                valid = false;
            }
            else {
                setValid(emailInput);
            }
        }
        if (passwordInput) {
            const val = passwordInput.value;
            if (!val || !validatePassword(val)) {
                setError(passwordInput, !val ? "Password is required." : "Must be at least 6 characters.");
                valid = false;
            }
            else {
                setValid(passwordInput);
            }
        }
        if (confirmInput) {
            const val = confirmInput.value;
            const password = passwordInput?.value ?? "";
            if (!val || !passwordsMatch(val, password)) {
                setError(confirmInput, !val ? "Please confirm your password." : "Passwords do not match.");
                valid = false;
            }
            else {
                setValid(confirmInput);
            }
        }
        if (valid && usernameInput && emailInput && passwordInput) {
            try {
                const rememberCheckbox = form.querySelector('input[name="remember"]');
                setPersistence(rememberCheckbox?.checked ?? false);
                await handleSignup(usernameInput.value.trim(), emailInput.value.trim(), passwordInput.value);
                window.location.href = "/dashboard.html";
            }
            catch (error) {
                const msg = handleAuthError(error);
                if (msg)
                    showAuthError(msg);
            }
        }
    });
}
/* ===== LOGIN ===== */
function initLoginValidation() {
    const form = document.getElementById("login-form");
    if (!form)
        return;
    const emailInput = form.querySelector("#email");
    const passwordInput = form.querySelector("#password");
    const googleBtn = document.getElementById("google-login");
    if (googleBtn) {
        googleBtn.addEventListener("click", async () => {
            try {
                await handleGoogleAuth();
                window.location.href = "/dashboard.html";
            }
            catch (error) {
                const msg = handleAuthError(error);
                if (msg)
                    showAuthError(msg);
            }
        });
    }
    if (emailInput) {
        emailInput.addEventListener("blur", () => {
            const val = emailInput.value.trim();
            if (!val) {
                setError(emailInput, "Email is required.");
            }
            else if (!validateEmail(val)) {
                setError(emailInput, "Please enter a valid email address.");
            }
            else {
                setValid(emailInput);
            }
        });
        emailInput.addEventListener("input", () => clearStatus(emailInput));
    }
    if (passwordInput) {
        passwordInput.addEventListener("blur", () => {
            if (!passwordInput.value) {
                setError(passwordInput, "Password is required.");
            }
            else {
                setValid(passwordInput);
            }
        });
        passwordInput.addEventListener("input", () => clearStatus(passwordInput));
    }
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        let valid = true;
        if (emailInput) {
            const val = emailInput.value.trim();
            if (!val || !validateEmail(val)) {
                setError(emailInput, !val ? "Email is required." : "Please enter a valid email address.");
                valid = false;
            }
            else {
                setValid(emailInput);
            }
        }
        if (passwordInput) {
            if (!passwordInput.value) {
                setError(passwordInput, "Password is required.");
                valid = false;
            }
            else {
                setValid(passwordInput);
            }
        }
        if (valid && emailInput && passwordInput) {
            try {
                const rememberCheckbox = form.querySelector('input[name="remember"]');
                setPersistence(rememberCheckbox?.checked ?? false);
                await handleLogin(emailInput.value.trim(), passwordInput.value);
                window.location.href = "/dashboard.html";
            }
            catch (error) {
                const msg = handleAuthError(error);
                if (msg)
                    showAuthError(msg);
            }
        }
    });
}
