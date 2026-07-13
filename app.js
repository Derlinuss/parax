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
    if (page === "settings.html") {
        initSettings();
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
async function createRoom(password) {
    const code = generateRoomCode();
    const user = auth.currentUser;
    const data = {
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
async function getRoom(code) {
    const doc = await db.collection("rooms").doc(code).get();
    return doc.exists ? { code: doc.id, ...doc.data() } : null;
}
async function roomExists(code) {
    const doc = await db.collection("rooms").doc(code).get();
    return doc.exists;
}
/* ===== SERVER FUNCTIONS ===== */
const PARAX_OFFICIAL_CODE = "00000000001";
function generateServerCode() {
    return Math.floor(10000000000 + Math.random() * 90000000000).toString();
}
function memberDocId(uid, serverCode) {
    return uid + "|" + serverCode;
}
async function ensureParaxOfficial() {
    const exists = await serverExists(PARAX_OFFICIAL_CODE);
    if (exists)
        return true;
    try {
        const admin = auth.currentUser;
        if (!admin)
            return false;
        await db.collection("servers").doc(PARAX_OFFICIAL_CODE).set({
            name: "Parax Official",
            ownerId: admin.uid,
            ownerName: "Parax",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection("servers").doc(PARAX_OFFICIAL_CODE).collection("channels").add({
            name: "announcements",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection("servers").doc(PARAX_OFFICIAL_CODE).collection("channels").add({
            name: "general",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return true;
    }
    catch (e) {
        return false;
    }
}
async function createServer(name) {
    const code = generateServerCode();
    const user = auth.currentUser;
    await db.collection("servers").doc(code).set({
        name,
        ownerId: user.uid,
        ownerName: user.displayName || "Unknown",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("servers").doc(code).collection("channels").add({
        name: "general",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("serverMembers").doc(memberDocId(user.uid, code)).set({
        userId: user.uid,
        serverCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return code;
}
async function getServer(code) {
    const doc = await db.collection("servers").doc(code).get();
    return doc.exists ? { code: doc.id, ...doc.data() } : null;
}
async function serverExists(code) {
    const doc = await db.collection("servers").doc(code).get();
    return doc.exists;
}
async function joinServer(code) {
    const user = auth.currentUser;
    let exists = await serverExists(code);
    if (!exists) {
        if (code === PARAX_OFFICIAL_CODE) {
            const ok = await ensureParaxOfficial();
            if (!ok)
                return false;
        }
        else {
            return false;
        }
    }
    const docId = memberDocId(user.uid, code);
    const existing = await db.collection("serverMembers").doc(docId).get();
    if (existing.exists)
        return true;
    await db.collection("serverMembers").doc(docId).set({
        userId: user.uid,
        serverCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return true;
}
async function isServerMember(code) {
    const user = auth.currentUser;
    const doc = await db.collection("serverMembers").doc(memberDocId(user.uid, code)).get();
    return doc.exists;
}
function loadUserServers(callback) {
    const user = auth.currentUser;
    if (!user)
        return () => { };
    const membershipQuery = db.collection("serverMembers")
        .where("userId", "==", user.uid)
        .onSnapshot((snapshot) => {
        const serverCodes = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.serverCode)
                serverCodes.push(data.serverCode);
        });
        if (serverCodes.length === 0) {
            callback([]);
            return;
        }
        let pending = serverCodes.length;
        const servers = [];
        serverCodes.forEach((code) => {
            getServer(code).then((server) => {
                if (server)
                    servers.push(server);
                pending--;
                if (pending === 0) {
                    servers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                    callback(servers);
                }
            });
        });
    }, (error) => {
        console.error("Server memberships error:", error);
        callback([]);
    });
    return () => membershipQuery();
}
/* ===== CHANNEL FUNCTIONS ===== */
async function createChannel(serverCode, name) {
    const ref = await db.collection("servers").doc(serverCode).collection("channels").add({
        name: name.toLowerCase().replace(/\s+/g, "-"),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
}
function loadServerChannels(serverCode, callback) {
    return db.collection("servers").doc(serverCode).collection("channels")
        .orderBy("createdAt", "asc")
        .onSnapshot((snapshot) => {
        const channels = [];
        snapshot.forEach((doc) => {
            channels.push({ id: doc.id, ...doc.data() });
        });
        callback(channels);
    }, (error) => {
        console.error("Channels error:", error);
    });
}
/* ===== CHANNEL MESSAGE FUNCTIONS ===== */
async function sendChannelMessage(channelId, text) {
    const user = auth.currentUser;
    if (!text.trim())
        return;
    await db.collection("messages").add({
        channelId,
        senderId: user.uid,
        senderName: user.displayName || "Anonymous",
        text: text.trim(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
function loadChannelMessages(channelId, callback) {
    return db.collection("messages")
        .where("channelId", "==", channelId)
        .onSnapshot((snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        callback(messages);
    }, (error) => {
        console.error("Channel messages error:", error);
        const el = document.getElementById("server-messages");
        if (el)
            el.innerHTML = `<div class="chat-error">Failed to load messages.</div>`;
    });
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
/* ===== PROFILE FUNCTIONS ===== */
async function loadProfile(uid) {
    const doc = await db.collection("users").doc(uid).get();
    return doc.data() || {};
}
async function saveProfile(uid, data) {
    await db.collection("users").doc(uid).update(data);
}
async function uploadAvatar(uid, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result;
            try {
                await db.collection("users").doc(uid).update({ photoURL: dataUrl });
                resolve(dataUrl);
            }
            catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}
async function removeAvatar(uid) {
    await db.collection("users").doc(uid).update({ photoURL: "" });
}
/* ===== SETTINGS ===== */
function initSettings() {
    const user = auth.currentUser;
    if (!user)
        return;
    const usernameInput = document.getElementById("settings-username");
    const bioInput = document.getElementById("settings-bio");
    const emailInput = document.getElementById("settings-email");
    const saveBtn = document.getElementById("save-settings-btn");
    const uploadBtn = document.getElementById("upload-avatar-btn");
    const removeBtn = document.getElementById("remove-avatar-btn");
    const fileInput = document.getElementById("avatar-input");
    const avatarImg = document.getElementById("avatar-img");
    const avatarPlaceholder = document.getElementById("avatar-placeholder");
    if (emailInput)
        emailInput.value = user.email || "";
    loadProfile(user.uid).then((profile) => {
        if (usernameInput)
            usernameInput.value = profile.username || user.displayName || "";
        if (bioInput)
            bioInput.value = profile.bio || "";
        if (profile.photoURL) {
            if (avatarImg) {
                avatarImg.src = profile.photoURL;
                avatarImg.style.display = "block";
            }
            if (avatarPlaceholder)
                avatarPlaceholder.style.display = "none";
            if (removeBtn)
                removeBtn.style.display = "";
        }
    });
    uploadBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file)
            return;
        if (file.size > 5 * 1024 * 1024) {
            showAuthError("Image must be under 5MB");
            return;
        }
        uploadBtn.textContent = "Uploading...";
        uploadBtn.disabled = true;
        try {
            const url = await uploadAvatar(user.uid, file);
            if (avatarImg) {
                avatarImg.src = url;
                avatarImg.style.display = "block";
            }
            if (avatarPlaceholder)
                avatarPlaceholder.style.display = "none";
            if (removeBtn)
                removeBtn.style.display = "";
        }
        catch (error) {
            showAuthError("Upload failed: " + error.message);
        }
        uploadBtn.textContent = "Upload Photo";
        uploadBtn.disabled = false;
        fileInput.value = "";
    });
    removeBtn?.addEventListener("click", async () => {
        try {
            await removeAvatar(user.uid);
            if (avatarImg) {
                avatarImg.src = "";
                avatarImg.style.display = "none";
            }
            if (avatarPlaceholder)
                avatarPlaceholder.style.display = "";
            removeBtn.style.display = "none";
        }
        catch (error) {
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
        saveBtn.disabled = true;
        try {
            await user.updateProfile({ displayName: username });
            await saveProfile(user.uid, { username, bio });
            showAuthError("Profile saved!");
        }
        catch (error) {
            showAuthError("Save failed: " + error.message);
        }
        saveBtn.textContent = "Save Changes";
        saveBtn.disabled = false;
    });
}
/* ===== DASHBOARD (Discord-style) ===== */
let dashboardUnsub = null;
let serverChannelsUnsub = null;
let channelMessagesUnsub = null;
let currentServerCode = null;
let currentChannelId = null;
let userServersCache = [];
function initDashboard() {
    const serverList = document.getElementById("server-list");
    const channelSidebar = document.getElementById("channel-sidebar");
    const serverNameEl = document.getElementById("server-name");
    const channelList = document.getElementById("channel-list");
    const chatArea = document.getElementById("chat-area");
    const welcomeState = document.getElementById("welcome-state");
    const homeState = document.getElementById("home-state");
    const messagesEl = document.getElementById("server-messages");
    const inputEl = document.getElementById("server-message-input");
    const sendBtn = document.getElementById("server-send-btn");
    const channelNameEl = document.getElementById("channel-name");
    // User profile in channel sidebar
    const profileName = document.getElementById("profile-name");
    const profileAvatar = document.getElementById("profile-avatar");
    const logoutBtn = document.getElementById("profile-logout-btn");
    const settingsBtn = document.getElementById("profile-settings-btn");
    const user = auth.currentUser;
    if (user) {
        if (profileName)
            profileName.textContent = user.displayName || user.email?.split("@")[0] || "User";
        if (profileAvatar) {
            profileAvatar.innerHTML = `<div class="initials">${(user.displayName || user.email || "U")[0].toUpperCase()}</div>`;
        }
        loadProfile(user.uid).then((p) => {
            if (p.photoURL && profileAvatar) {
                profileAvatar.innerHTML = `<img src="${p.photoURL}" alt="" />`;
            }
        });
    }
    logoutBtn?.addEventListener("click", async () => {
        cleanupSubs();
        await auth.signOut();
        window.location.href = "/";
    });
    settingsBtn?.addEventListener("click", () => {
        window.location.href = "/settings.html";
    });
    // Server list
    dashboardUnsub = loadUserServers((servers) => {
        userServersCache = servers;
        renderServerList(servers);
        // If current server was removed, go back
        if (currentServerCode && !servers.find((s) => s.code === currentServerCode)) {
            selectServer(null);
        }
    });
    // Home button
    document.getElementById("home-btn")?.addEventListener("click", () => {
        selectServer(null);
    });
    // Official server button
    document.getElementById("official-server-btn")?.addEventListener("click", async () => {
        const code = PARAX_OFFICIAL_CODE;
        try {
            const joined = await joinServer(code);
            if (joined) {
                selectServer(code);
            }
            else {
                showAuthError("Could not join Parax Official");
            }
        }
        catch (err) {
            showAuthError("Failed: " + err.message);
        }
    });
    // Add server button
    document.getElementById("add-server-btn")?.addEventListener("click", () => {
        showModal("create-server-modal");
        document.getElementById("server-name-input")?.focus();
    });
    // Create server modal
    document.getElementById("create-server-cancel")?.addEventListener("click", () => {
        hideModal("create-server-modal");
    });
    document.getElementById("create-server-confirm")?.addEventListener("click", async () => {
        const input = document.getElementById("server-name-input");
        const name = input?.value.trim();
        if (!name) {
            showAuthError("Server name is required");
            return;
        }
        try {
            hideModal("create-server-modal");
            input.value = "";
            const code = await createServer(name);
            selectServer(code);
        }
        catch (err) {
            showAuthError("Failed to create server: " + err.message);
        }
    });
    document.getElementById("server-name-input")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            document.getElementById("create-server-confirm")?.click();
    });
    // Join server modal
    document.getElementById("join-server-btn")?.addEventListener("click", () => {
        showModal("join-server-modal");
        document.getElementById("join-server-input")?.focus();
    });
    document.getElementById("join-server-cancel")?.addEventListener("click", () => {
        hideModal("join-server-modal");
    });
    document.getElementById("join-server-confirm")?.addEventListener("click", async () => {
        const input = document.getElementById("join-server-input");
        const code = input?.value.trim();
        if (!code || code.length !== 11 || !/^\d{11}$/.test(code)) {
            showAuthError("Enter a valid 11-digit server code");
            return;
        }
        try {
            const joined = await joinServer(code);
            if (!joined) {
                showAuthError("Server not found");
                return;
            }
            hideModal("join-server-modal");
            input.value = "";
            selectServer(code);
        }
        catch (err) {
            showAuthError("Failed to join: " + err.message);
        }
    });
    document.getElementById("join-server-input")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            document.getElementById("join-server-confirm")?.click();
    });
    document.getElementById("join-server-input")?.addEventListener("input", (e) => {
        const el = e.target;
        el.value = el.value.replace(/\D/g, "").slice(0, 11);
    });
    // Create channel modal
    document.getElementById("add-channel-btn")?.addEventListener("click", () => {
        showModal("create-channel-modal");
        document.getElementById("channel-name-input")?.focus();
    });
    document.getElementById("create-channel-cancel")?.addEventListener("click", () => {
        hideModal("create-channel-modal");
    });
    document.getElementById("create-channel-confirm")?.addEventListener("click", async () => {
        const input = document.getElementById("channel-name-input");
        const name = input?.value.trim().toLowerCase().replace(/\s+/g, "-");
        if (!name) {
            showAuthError("Channel name is required");
            return;
        }
        if (!currentServerCode)
            return;
        try {
            hideModal("create-channel-modal");
            input.value = "";
            await createChannel(currentServerCode, name);
        }
        catch (err) {
            showAuthError("Failed to create channel: " + err.message);
        }
    });
    document.getElementById("channel-name-input")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            document.getElementById("create-channel-confirm")?.click();
    });
    // Leave server
    document.getElementById("server-leave-btn")?.addEventListener("click", async () => {
        if (!currentServerCode || !user)
            return;
        if (currentServerCode === PARAX_OFFICIAL_CODE) {
            showAuthError("Cannot leave the official server");
            return;
        }
        if (!confirm("Leave this server?"))
            return;
        try {
            await db.collection("serverMembers").doc(memberDocId(user.uid, currentServerCode)).delete();
            selectServer(null);
        }
        catch (err) {
            showAuthError("Failed to leave: " + err.message);
        }
    });
    // Send message
    const send = () => {
        const text = inputEl?.value.trim();
        if (!text || !currentChannelId)
            return;
        sendChannelMessage(currentChannelId, text).catch((err) => {
            showAuthError("Failed to send: " + err.message);
        });
        if (inputEl) {
            inputEl.value = "";
            inputEl.focus();
        }
    };
    sendBtn?.addEventListener("click", send);
    inputEl?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            send();
    });
    // Flash messages
    const flash = sessionStorage.getItem("flash_error");
    if (flash) {
        sessionStorage.removeItem("flash_error");
        showAuthError(flash);
    }
}
/* ===== SERVER RENDERING ===== */
function renderServerList(servers) {
    const serverList = document.getElementById("server-list");
    if (!serverList)
        return;
    serverList.innerHTML = servers.map((s) => {
        const isActive = s.code === currentServerCode;
        const initial = (s.name || "S")[0].toUpperCase();
        return `
      <div class="server-item ${isActive ? "active" : ""}" data-code="${s.code}" title="${escapeHtml(s.name)}">
        <span class="server-initials">${initial}</span>
      </div>
    `;
    }).join("");
    serverList.querySelectorAll(".server-item").forEach((el) => {
        el.addEventListener("click", () => {
            const code = el.dataset.code;
            if (code)
                selectServer(code);
        });
    });
}
/* ===== SERVER / CHANNEL SELECTION ===== */
function selectServer(code) {
    // Cleanup previous channel subs
    if (channelMessagesUnsub) {
        channelMessagesUnsub();
        channelMessagesUnsub = null;
    }
    if (serverChannelsUnsub) {
        serverChannelsUnsub();
        serverChannelsUnsub = null;
    }
    currentServerCode = code;
    currentChannelId = null;
    const channelSidebar = document.getElementById("channel-sidebar");
    const serverNameEl = document.getElementById("server-name");
    const welcomeState = document.getElementById("welcome-state");
    const homeState = document.getElementById("home-state");
    const chatArea = document.getElementById("chat-area");
    // Update home button active state
    const homeBtn = document.getElementById("home-btn");
    if (homeBtn)
        homeBtn.classList.toggle("active", !code);
    // Update server list active state
    document.querySelectorAll(".server-item[data-code]").forEach((el) => {
        el.classList.toggle("active", el.dataset.code === code);
    });
    // Update official server active state
    const officialBtn = document.getElementById("official-server-btn");
    if (officialBtn) {
        officialBtn.classList.toggle("active", code === PARAX_OFFICIAL_CODE);
    }
    if (!code) {
        // Show home
        channelSidebar?.classList.add("hidden");
        welcomeState?.classList.add("hidden");
        chatArea?.classList.add("hidden");
        homeState?.classList.remove("hidden");
        renderHomeRooms();
        return;
    }
    homeState?.classList.add("hidden");
    welcomeState?.classList.add("hidden");
    chatArea?.classList.add("hidden");
    channelSidebar?.classList.remove("hidden");
    const server = userServersCache.find((s) => s.code === code);
    if (serverNameEl) {
        serverNameEl.textContent = server?.name || "Server";
        if (!server) {
            getServer(code).then((s) => {
                if (s && serverNameEl)
                    serverNameEl.textContent = s.name;
            });
        }
    }
    // Load channels
    serverChannelsUnsub = loadServerChannels(code, (channels) => {
        renderChannelList(channels, code);
        if (channels.length > 0 && !currentChannelId) {
            selectChannel(channels[0].id, channels[0].name, code);
        }
    });
}
function renderChannelList(channels, serverCode) {
    const channelList = document.getElementById("channel-list");
    if (!channelList)
        return;
    channelList.innerHTML = channels.map((ch) => {
        const isActive = ch.id === currentChannelId;
        return `
      <div class="channel-item ${isActive ? "active" : ""}" data-channel-id="${ch.id}" data-channel-name="${escapeHtml(ch.name)}">
        <span class="channel-hash">#</span>
        <span class="channel-name">${escapeHtml(ch.name)}</span>
      </div>
    `;
    }).join("");
    channelList.querySelectorAll(".channel-item").forEach((el) => {
        el.addEventListener("click", () => {
            const id = el.dataset.channelId;
            const name = el.dataset.channelName;
            if (id && name)
                selectChannel(id, name, serverCode);
        });
    });
}
function selectChannel(channelId, channelName, serverCode) {
    if (channelMessagesUnsub) {
        channelMessagesUnsub();
        channelMessagesUnsub = null;
    }
    currentChannelId = channelId;
    // Update channel list active state
    document.querySelectorAll(".channel-item").forEach((el) => {
        el.classList.toggle("active", el.dataset.channelId === channelId);
    });
    const chatArea = document.getElementById("chat-area");
    const welcomeState = document.getElementById("welcome-state");
    const channelNameEl = document.getElementById("channel-name");
    const messagesEl = document.getElementById("server-messages");
    const inputEl = document.getElementById("server-message-input");
    welcomeState?.classList.add("hidden");
    chatArea?.classList.remove("hidden");
    if (channelNameEl)
        channelNameEl.textContent = channelName;
    if (inputEl)
        inputEl.placeholder = "Message #" + channelName;
    if (messagesEl)
        messagesEl.innerHTML = '<div class="chat-loading">Loading messages...</div>';
    channelMessagesUnsub = loadChannelMessages(channelId, (messages) => {
        if (!messagesEl)
            return;
        if (messages.length === 0) {
            messagesEl.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation!</div>';
        }
        else {
            const wasEmpty = messagesEl.querySelector(".chat-empty, .chat-loading") !== null;
            const isAtBottom = wasEmpty || messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
            messagesEl.innerHTML = messages.map((m) => {
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
}
/* ===== HOME ROOMS (old room system) ===== */
function renderHomeRooms() {
    const container = document.getElementById("home-rooms");
    if (!container)
        return;
    loadUserRooms((rooms) => {
        if (rooms.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No rooms yet. Use the + button to create a server!</p>';
        }
        else {
            container.innerHTML = rooms.map((r) => `
        <a href="/chat.html?code=${r.code}" class="home-room-item">
          <span class="home-room-code">${escapeHtml(r.code)}</span>
          <span>${r.createdAt?.toDate?.()?.toLocaleDateString() || ""}</span>
        </a>
      `).join("");
        }
    });
}
/* ===== MODAL HELPERS ===== */
function showModal(id) {
    const el = document.getElementById(id);
    if (el)
        el.classList.remove("hidden");
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (el)
        el.classList.add("hidden");
}
/* ===== CLEANUP ===== */
function cleanupSubs() {
    if (dashboardUnsub) {
        dashboardUnsub();
        dashboardUnsub = null;
    }
    if (serverChannelsUnsub) {
        serverChannelsUnsub();
        serverChannelsUnsub = null;
    }
    if (channelMessagesUnsub) {
        channelMessagesUnsub();
        channelMessagesUnsub = null;
    }
}
function promptRoomPassword(code, correctPassword) { }
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
    getRoom(roomCode).then((room) => {
        if (!room) {
            if (messagesEl)
                messagesEl.innerHTML = '<div class="chat-error">Room not found. <a href="/dashboard.html">Go back</a></div>';
            return;
        }
        if (room.password && sessionStorage.getItem("room_pass_" + roomCode) !== room.password) {
            sessionStorage.setItem("flash_error", "This room requires a password");
            window.location.href = "/dashboard.html";
            return;
        }
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
        if (user && (currentPage === "" || currentPage === "index.html")) {
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
        if (navbarLinks && !document.getElementById("user-menu")) {
            const menu = document.createElement("div");
            menu.id = "user-menu";
            menu.className = "user-menu";
            const avatar = document.createElement("img");
            avatar.className = "nav-avatar";
            avatar.alt = user.displayName || "User";
            avatar.onerror = () => { avatar.style.display = "none"; };
            loadProfile(user.uid).then(p => {
                if (p.photoURL)
                    avatar.src = p.photoURL;
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
                if (dashboardUnsub)
                    dashboardUnsub();
                if (chatUnsub)
                    chatUnsub();
                await auth.signOut();
                window.location.href = "/";
            });
        }
    }
    else {
        const menu = document.getElementById("user-menu");
        if (menu)
            menu.remove();
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
