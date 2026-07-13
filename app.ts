// Firebase Compat SDK - loaded via CDN script tags in HTML
declare const firebase: any;

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

  if (page === "settings.html") {
    initSettings();
  }
});

/* ===== FIREBASE AUTH ===== */

function setPersistence(remember: boolean): void {
  if (remember) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } else {
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  }
}

async function handleSignup(username: string, email: string, password: string): Promise<void> {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  const user = cred.user;
  await user.updateProfile({ displayName: username });
  await db.collection("users").doc(user.uid).set({
    username,
    email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function handleLogin(email: string, password: string): Promise<void> {
  await auth.signInWithEmailAndPassword(email, password);
}

async function handleGoogleAuth(): Promise<void> {
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

function handleAuthError(error: any): string {
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

function generateRoomCode(): string {
  return Math.floor(10000000000 + Math.random() * 90000000000).toString();
}

async function createRoom(password?: string): Promise<string> {
  const code = generateRoomCode();
  const user = auth.currentUser;
  const data: any = {
    createdBy: user.uid,
    createdByName: user.displayName || "Unknown",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (password) {
    data.password = password;
  }
  await db.collection("rooms").doc(code).set(data);
  return code;
}

async function getRoom(code: string): Promise<any> {
  const doc = await db.collection("rooms").doc(code).get();
  return doc.exists ? { code: doc.id, ...doc.data() } : null;
}

async function roomExists(code: string): Promise<boolean> {
  const doc = await db.collection("rooms").doc(code).get();
  return doc.exists;
}

/* ===== MESSAGE FUNCTIONS ===== */

async function sendMessage(roomCode: string, text: string): Promise<void> {
  const user = auth.currentUser;
  if (!text.trim()) return;
  await db.collection("messages").add({
    roomCode,
    senderId: user.uid,
    senderName: user.displayName || "Anonymous",
    text: text.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function loadMessages(roomCode: string, callback: (messages: any[]) => void): () => void {
  return db.collection("messages")
    .where("roomCode", "==", roomCode)
    .onSnapshot((snapshot: any) => {
      const messages: any[] = [];
      snapshot.forEach((doc: any) => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      callback(messages);
    }, (error: any) => {
      console.error("Messages error:", error);
      const el = document.getElementById("chat-messages");
      if (el) el.innerHTML = `<div class="chat-error">Failed to load messages. Check console for details.</div>`;
    });
}

function loadUserRooms(callback: (rooms: any[]) => void): () => void {
  const user = auth.currentUser;
  if (!user) return () => {};
  return db.collection("rooms")
    .where("createdBy", "==", user.uid)
    .onSnapshot((snapshot: any) => {
      const rooms: any[] = [];
      snapshot.forEach((doc: any) => {
        rooms.push({ code: doc.id, ...doc.data() });
      });
      rooms.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(rooms);
    }, (error: any) => {
      console.error("Rooms error:", error);
    });
}

/* ===== PROFILE FUNCTIONS ===== */

async function loadProfile(uid: string): Promise<any> {
  const doc = await db.collection("users").doc(uid).get();
  return doc.data() || {};
}

async function saveProfile(uid: string, data: any): Promise<void> {
  await db.collection("users").doc(uid).update(data);
}

async function uploadAvatar(uid: string, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await db.collection("users").doc(uid).update({ photoURL: dataUrl });
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function removeAvatar(uid: string): Promise<void> {
  await db.collection("users").doc(uid).update({ photoURL: "" });
}

/* ===== SETTINGS ===== */

function initSettings(): void {
  const user = auth.currentUser;
  if (!user) return;

  const usernameInput = document.getElementById("settings-username") as HTMLInputElement | null;
  const bioInput = document.getElementById("settings-bio") as HTMLTextAreaElement | null;
  const emailInput = document.getElementById("settings-email") as HTMLInputElement | null;
  const saveBtn = document.getElementById("save-settings-btn");
  const uploadBtn = document.getElementById("upload-avatar-btn");
  const removeBtn = document.getElementById("remove-avatar-btn");
  const fileInput = document.getElementById("avatar-input") as HTMLInputElement | null;
  const avatarImg = document.getElementById("avatar-img") as HTMLImageElement | null;
  const avatarPlaceholder = document.getElementById("avatar-placeholder");

  if (emailInput) emailInput.value = user.email || "";

  loadProfile(user.uid).then((profile) => {
    if (usernameInput) usernameInput.value = profile.username || user.displayName || "";
    if (bioInput) bioInput.value = profile.bio || "";
    if (profile.photoURL) {
      if (avatarImg) { avatarImg.src = profile.photoURL; avatarImg.style.display = "block"; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = "none";
      if (removeBtn) removeBtn.style.display = "";
    }
  });

  uploadBtn?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showAuthError("Image must be under 5MB");
      return;
    }
    uploadBtn!.textContent = "Uploading...";
    (uploadBtn as HTMLButtonElement).disabled = true;
    try {
      const url = await uploadAvatar(user.uid, file);
      if (avatarImg) { avatarImg.src = url; avatarImg.style.display = "block"; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = "none";
      if (removeBtn) removeBtn.style.display = "";
    } catch (error: any) {
      showAuthError("Upload failed: " + error.message);
    }
    uploadBtn!.textContent = "Upload Photo";
    (uploadBtn as HTMLButtonElement).disabled = false;
    fileInput.value = "";
  });

  removeBtn?.addEventListener("click", async () => {
    try {
      await removeAvatar(user.uid);
      if (avatarImg) { avatarImg.src = ""; avatarImg.style.display = "none"; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = "";
      removeBtn.style.display = "none";
    } catch (error: any) {
      showAuthError("Failed to remove photo");
    }
  });

  saveBtn?.addEventListener("click", async () => {
    const username = usernameInput?.value.trim() || user.displayName || "";
    const bio = bioInput?.value.trim() || "";

    if (username.length < 3 || username.length > 32) {
      showAuthError("Display name must be 3-32 characters");
      return;
    }

    saveBtn.textContent = "Saving...";
    (saveBtn as HTMLButtonElement).disabled = true;

    try {
      await user.updateProfile({ displayName: username });
      await saveProfile(user.uid, { username, bio });
      showAuthError("Profile saved!");
    } catch (error: any) {
      showAuthError("Save failed: " + error.message);
    }

    saveBtn.textContent = "Save Changes";
    (saveBtn as HTMLButtonElement).disabled = false;
  });
}

/* ===== DASHBOARD ===== */

let dashboardUnsub: (() => void) | null = null;

function initDashboard(): void {
  const createBtn = document.getElementById("create-room-btn");
  const joinBtn = document.getElementById("join-room-btn");
  const codeInput = document.getElementById("room-code-input") as HTMLInputElement | null;
  const roomList = document.getElementById("room-list");
  const passwordCheckbox = document.getElementById("enable-room-password") as HTMLInputElement | null;
  const passwordField = document.getElementById("room-password-field");
  const passwordInput = document.getElementById("room-password-input") as HTMLInputElement | null;

  passwordCheckbox?.addEventListener("change", () => {
    if (passwordField) {
      passwordField.classList.toggle("hidden", !passwordCheckbox.checked);
    }
    if (passwordCheckbox.checked && passwordInput) {
      passwordInput.focus();
    }
  });

  createBtn?.addEventListener("click", async () => {
    const hasPassword = passwordCheckbox?.checked;
    const roomPassword = hasPassword && passwordInput?.value.trim() ? passwordInput.value.trim() : undefined;
    createBtn.textContent = "Creating...";
    (createBtn as HTMLButtonElement).disabled = true;
    try {
      const code = await createRoom(roomPassword);
      if (roomPassword) sessionStorage.setItem("room_pass_" + code, roomPassword);
      window.location.href = `/chat.html?code=${code}`;
    } catch (error: any) {
      showAuthError(error.message || "Failed to create room");
      createBtn.textContent = "Create Room";
      (createBtn as HTMLButtonElement).disabled = false;
    }
  });

  joinBtn?.addEventListener("click", async () => {
    const code = codeInput?.value.trim();
    if (!code || code.length !== 11 || !/^\d{11}$/.test(code)) {
      showAuthError("Enter a valid 11-digit code");
      return;
    }
    try {
      const room = await getRoom(code);
      if (!room) {
        showAuthError("Room not found");
        return;
      }
      if (room.password) {
        promptRoomPassword(code, room.password);
      } else {
        window.location.href = `/chat.html?code=${code}`;
      }
    } catch (error: any) {
      showAuthError("Failed to check room: " + error.message);
    }
  });

  codeInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") joinBtn?.click();
  });

  codeInput?.addEventListener("input", () => {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 11);
  });

  dashboardUnsub = loadUserRooms((rooms) => {
    if (!roomList) return;
    if (rooms.length === 0) {
      roomList.innerHTML = '<p class="room-list-empty">No rooms yet. Create or join one!</p>';
    } else {
      roomList.innerHTML = rooms.map(r => `
        <a href="/chat.html?code=${r.code}" class="room-item">
          <span class="room-code">${escapeHtml(r.code)}</span>
          <span class="room-date">${r.createdAt?.toDate?.().toLocaleDateString() || ""}</span>
        </a>
      `).join("");
    }
  });

  const flash = sessionStorage.getItem("flash_error");
  if (flash) {
    sessionStorage.removeItem("flash_error");
    showAuthError(flash);
  }
}

function promptRoomPassword(code: string, correctPassword: string): void {
  const modal = document.getElementById("password-modal");
  const input = document.getElementById("password-prompt-input") as HTMLInputElement | null;
  const confirmBtn = document.getElementById("password-prompt-confirm");
  const cancelBtn = document.getElementById("password-prompt-cancel");
  const infoText = document.getElementById("password-prompt-info");

  if (!modal || !input || !confirmBtn || !cancelBtn) {
    showAuthError("Something went wrong");
    return;
  }

  if (infoText) infoText.textContent = "Room " + code + " is protected. Enter the password to continue.";
  input.value = "";
  input.focus();
  modal.classList.remove("hidden");

  const cleanup = () => {
    modal.classList.add("hidden");
    confirmBtn.removeEventListener("click", onConfirm);
    cancelBtn.removeEventListener("click", onCancel);
    input.removeEventListener("keypress", onKeypress);
  };

  const onConfirm = () => {
    const entered = input.value.trim();
    if (!entered) {
      showAuthError("Please enter a password");
      return;
    }
    if (entered === correctPassword) {
      sessionStorage.setItem("room_pass_" + code, entered);
      cleanup();
      window.location.href = `/chat.html?code=${code}`;
    } else {
      showAuthError("Incorrect password");
      input.value = "";
      input.focus();
    }
  };

  const onCancel = () => {
    cleanup();
  };

  const onKeypress = (e: KeyboardEvent) => {
    if (e.key === "Enter") onConfirm();
    if (e.key === "Escape") onCancel();
  };

  confirmBtn.addEventListener("click", onConfirm);
  cancelBtn.addEventListener("click", onCancel);
  input.addEventListener("keypress", onKeypress);
}

/* ===== CHAT ===== */

let chatUnsub: (() => void) | null = null;
let currentRoomCode: string | null = null;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function initChat(): void {
  const params = new URLSearchParams(window.location.search);
  const roomCode = params.get("code");

  if (!roomCode) {
    window.location.href = "/dashboard.html";
    return;
  }

  currentRoomCode = roomCode;
  const headerEl = document.getElementById("room-code-display");
  const messagesEl = document.getElementById("chat-messages");
  const inputEl = document.getElementById("message-input") as HTMLInputElement | null;
  const sendBtn = document.getElementById("send-btn");
  const leaveBtn = document.getElementById("leave-room-btn");

  if (headerEl) headerEl.textContent = roomCode;

  getRoom(roomCode).then((room) => {
    if (!room) {
      if (messagesEl) messagesEl.innerHTML = '<div class="chat-error">Room not found. <a href="/dashboard.html">Go back</a></div>';
      return;
    }
    if (room.password && sessionStorage.getItem("room_pass_" + roomCode) !== room.password) {
      sessionStorage.setItem("flash_error", "This room requires a password");
      window.location.href = "/dashboard.html";
      return;
    }

    chatUnsub = loadMessages(roomCode, (messages) => {
      if (!messagesEl) return;
      const wasEmpty = messagesEl.querySelector(".chat-empty, .chat-loading") !== null;
      if (messages.length === 0) {
        messagesEl.innerHTML = '<div class="chat-empty">No messages yet. Say hello!</div>';
      } else {
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
        if (isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  });

  const send = () => {
    if (!inputEl?.value.trim()) return;
    sendMessage(roomCode, inputEl.value).catch((err: any) => {
      showAuthError("Failed to send: " + err.message);
    });
    inputEl.value = "";
    inputEl.focus();
  };

  sendBtn?.addEventListener("click", send);
  inputEl?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") send();
  });

  leaveBtn?.addEventListener("click", () => {
    window.location.href = "/dashboard.html";
  });
}

/* ===== AUTH STATE LISTENER ===== */

function initAuthStateListener(currentPage: string): void {
  auth.onAuthStateChanged((user: any) => {
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

    if (user && (currentPage === "" || currentPage === "index.html")) {
      window.location.href = "/dashboard.html";
      return;
    }

    updateNavbar(user);
  });
}

function updateNavbar(user: any): void {
  const loginLinks = document.querySelectorAll('[href="login.html"], [href="signup.html"]');
  const navbarLinks = document.querySelector(".navbar-links");
  const heroButtons = document.querySelector(".hero-buttons");
  const ctaLink = document.querySelector('.cta-section a[href="signup.html"]');

  if (user) {
    loginLinks.forEach(el => {
      const btn = el as HTMLElement;
      btn.style.display = "none";
    });
    if (heroButtons) heroButtons.classList.add("hidden");
    if (ctaLink) (ctaLink as HTMLElement).style.display = "none";

    if (navbarLinks && !document.getElementById("user-menu")) {
      const menu = document.createElement("div");
      menu.id = "user-menu";
      menu.className = "user-menu";

      const avatar = document.createElement("img");
      avatar.className = "nav-avatar";
      avatar.alt = user.displayName || "User";
      avatar.onerror = () => { avatar.style.display = "none"; };
      loadProfile(user.uid).then(p => {
        if (p.photoURL) avatar.src = p.photoURL;
      });

      const nameSpan = document.createElement("span");
      nameSpan.className = "nav-username";
      nameSpan.textContent = user.displayName || user.email?.split("@")[0] || "User";

      const dropdown = document.createElement("div");
      dropdown.className = "user-dropdown";
      dropdown.innerHTML = `
        <a href="/dashboard.html">Dashboard</a>
        <a href="/settings.html">Settings</a>
        <hr />
        <button id="dropdown-logout">Logout</button>
      `;

      menu.appendChild(avatar);
      menu.appendChild(nameSpan);
      menu.appendChild(dropdown);
      navbarLinks.appendChild(menu);

      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("open");
      });

      document.addEventListener("click", () => dropdown.classList.remove("open"));

      document.getElementById("dropdown-logout")?.addEventListener("click", async () => {
        if (dashboardUnsub) dashboardUnsub();
        if (chatUnsub) chatUnsub();
        await auth.signOut();
        window.location.href = "/";
      });
    }
  } else {
    const menu = document.getElementById("user-menu");
    if (menu) menu.remove();
    if (heroButtons) heroButtons.classList.remove("hidden");
    if (ctaLink) (ctaLink as HTMLElement).style.display = "";
    loginLinks.forEach(el => {
      const btn = el as HTMLElement;
      btn.style.display = "";
    });
  }
}

/* ===== UI UTILITIES ===== */

function showAuthError(message: string): void {
  if (!message) return;
  const errorEl = document.createElement("div");
  errorEl.className = "auth-error";
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 5000);
}

/* ===== PASSWORD VISIBILITY TOGGLE ===== */

function initPasswordToggles(): void {
  const toggles = document.querySelectorAll<HTMLElement>(".password-toggle");
  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const wrapper = toggle.closest(".password-wrapper");
      if (!wrapper) return;
      const input = wrapper.querySelector<HTMLInputElement>("input");
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        toggle.textContent = "Hide";
      } else {
        input.type = "password";
        toggle.textContent = "Show";
      }
    });
  });
}

/* ===== FORM UTILITIES ===== */

function setError(input: HTMLInputElement, message: string): void {
  input.classList.add("error");
  input.classList.remove("valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
}

function setValid(input: HTMLInputElement): void {
  input.classList.remove("error");
  input.classList.add("valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.classList.remove("visible");
  }
}

function clearStatus(input: HTMLInputElement): void {
  input.classList.remove("error", "valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.classList.remove("visible");
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username: string): boolean {
  return username.length >= 3 && username.length <= 32;
}

function validatePassword(password: string): boolean {
  return password.length >= 6;
}

function passwordsMatch(a: string, b: string): boolean {
  return a === b;
}

/* ===== SIGNUP ===== */

function initSignupValidation(): void {
  const form = document.getElementById("signup-form") as HTMLFormElement | null;
  if (!form) return;

  const usernameInput = form.querySelector<HTMLInputElement>("#username");
  const emailInput = form.querySelector<HTMLInputElement>("#email");
  const passwordInput = form.querySelector<HTMLInputElement>("#password");
  const confirmInput = form.querySelector<HTMLInputElement>("#confirm-password");
  const googleBtn = document.getElementById("google-signup") as HTMLButtonElement | null;

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await handleGoogleAuth();
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = handleAuthError(error);
        if (msg) showAuthError(msg);
      }
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener("blur", () => {
      const val = usernameInput.value.trim();
      if (!val) {
        setError(usernameInput, "Username is required.");
      } else if (!validateUsername(val)) {
        setError(usernameInput, "Must be between 3 and 32 characters.");
      } else {
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
      } else if (!validateEmail(val)) {
        setError(emailInput, "Please enter a valid email address.");
      } else {
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
      } else if (!validatePassword(val)) {
        setError(passwordInput, "Must be at least 6 characters.");
      } else {
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
      } else if (!passwordsMatch(val, password)) {
        setError(confirmInput, "Passwords do not match.");
      } else {
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
      } else {
        setValid(usernameInput);
      }
    }

    if (emailInput) {
      const val = emailInput.value.trim();
      if (!val || !validateEmail(val)) {
        setError(emailInput, !val ? "Email is required." : "Please enter a valid email address.");
        valid = false;
      } else {
        setValid(emailInput);
      }
    }

    if (passwordInput) {
      const val = passwordInput.value;
      if (!val || !validatePassword(val)) {
        setError(passwordInput, !val ? "Password is required." : "Must be at least 6 characters.");
        valid = false;
      } else {
        setValid(passwordInput);
      }
    }

    if (confirmInput) {
      const val = confirmInput.value;
      const password = passwordInput?.value ?? "";
      if (!val || !passwordsMatch(val, password)) {
        setError(confirmInput, !val ? "Please confirm your password." : "Passwords do not match.");
        valid = false;
      } else {
        setValid(confirmInput);
      }
    }

    if (valid && usernameInput && emailInput && passwordInput) {
      try {
        const rememberCheckbox = form.querySelector<HTMLInputElement>('input[name="remember"]');
        setPersistence(rememberCheckbox?.checked ?? false);
        await handleSignup(
          usernameInput.value.trim(),
          emailInput.value.trim(),
          passwordInput.value
        );
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = handleAuthError(error);
        if (msg) showAuthError(msg);
      }
    }
  });
}

/* ===== LOGIN ===== */

function initLoginValidation(): void {
  const form = document.getElementById("login-form") as HTMLFormElement | null;
  if (!form) return;

  const emailInput = form.querySelector<HTMLInputElement>("#email");
  const passwordInput = form.querySelector<HTMLInputElement>("#password");
  const googleBtn = document.getElementById("google-login") as HTMLButtonElement | null;

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await handleGoogleAuth();
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = handleAuthError(error);
        if (msg) showAuthError(msg);
      }
    });
  }

  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      const val = emailInput.value.trim();
      if (!val) {
        setError(emailInput, "Email is required.");
      } else if (!validateEmail(val)) {
        setError(emailInput, "Please enter a valid email address.");
      } else {
        setValid(emailInput);
      }
    });
    emailInput.addEventListener("input", () => clearStatus(emailInput));
  }

  if (passwordInput) {
    passwordInput.addEventListener("blur", () => {
      if (!passwordInput.value) {
        setError(passwordInput, "Password is required.");
      } else {
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
      } else {
        setValid(emailInput);
      }
    }

    if (passwordInput) {
      if (!passwordInput.value) {
        setError(passwordInput, "Password is required.");
        valid = false;
      } else {
        setValid(passwordInput);
      }
    }

    if (valid && emailInput && passwordInput) {
      try {
        const rememberCheckbox = form.querySelector<HTMLInputElement>('input[name="remember"]');
        setPersistence(rememberCheckbox?.checked ?? false);
        await handleLogin(emailInput.value.trim(), passwordInput.value);
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = handleAuthError(error);
        if (msg) showAuthError(msg);
      }
    }
  });
}