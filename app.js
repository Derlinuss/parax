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
document.addEventListener("DOMContentLoaded", () => {
    initPasswordToggles();
    initSignupValidation();
    initLoginValidation();
    initAuthStateListener();
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
function signupWithEmail(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
}
function loginWithEmail(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider);
}
async function handleAuthSuccess() {
    window.location.href = "/";
}
function showAuthError(message) {
    const errorEl = document.createElement("div");
    errorEl.className = "auth-error";
    errorEl.style.cssText = "position: fixed; top: 20px; right: 20px; background: #ed4245; color: white; padding: 12px 20px; border-radius: 8px; font-size: 0.9rem; z-index: 1000;";
    errorEl.textContent = message;
    document.body.appendChild(errorEl);
    setTimeout(() => errorEl.remove(), 5000);
}
function initAuthStateListener() {
    const currentPage = window.location.pathname.split("/").pop() || "";
    auth.onAuthStateChanged((user) => {
        const loginLinks = document.querySelectorAll('[href="login.html"], [href="signup.html"]');
        const navbarLinks = document.querySelector(".navbar-links");
        if (user) {
            if (currentPage === "login.html" || currentPage === "signup.html") {
                window.location.href = "/";
                return;
            }
            loginLinks.forEach(el => {
                const button = el;
                button.style.display = "none";
            });
            if (navbarLinks && !document.getElementById("logout-btn")) {
                const logoutBtn = document.createElement("button");
                logoutBtn.id = "logout-btn";
                logoutBtn.textContent = "Logout";
                logoutBtn.className = "btn btn-secondary";
                logoutBtn.addEventListener("click", async () => {
                    await auth.signOut();
                    window.location.href = "/";
                });
                navbarLinks.appendChild(logoutBtn);
            }
        }
    });
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
    const errorEl = input
        .closest(".form-group")
        ?.querySelector(".error-message");
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add("visible");
    }
}
function setValid(input) {
    input.classList.remove("error");
    input.classList.add("valid");
    const errorEl = input
        .closest(".form-group")
        ?.querySelector(".error-message");
    if (errorEl) {
        errorEl.classList.remove("visible");
    }
}
function clearStatus(input) {
    input.classList.remove("error", "valid");
    const errorEl = input
        .closest(".form-group")
        ?.querySelector(".error-message");
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
        googleBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                await signInWithGoogle();
                await handleAuthSuccess();
            }
            catch (error) {
                showAuthError(error.message || "Google sign-up failed");
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
        if (valid && emailInput && passwordInput) {
            try {
                const rememberCheckbox = form.querySelector('input[name="remember"]');
                setPersistence(rememberCheckbox?.checked ?? false);
                await signupWithEmail(emailInput.value.trim(), passwordInput.value);
                await handleAuthSuccess();
            }
            catch (error) {
                showAuthError(error.message || "Sign up failed");
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
        googleBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                await signInWithGoogle();
                await handleAuthSuccess();
            }
            catch (error) {
                showAuthError(error.message || "Google login failed");
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
                await loginWithEmail(emailInput.value.trim(), passwordInput.value);
                await handleAuthSuccess();
            }
            catch (error) {
                showAuthError(error.message || "Login failed");
            }
        }
    });
}
