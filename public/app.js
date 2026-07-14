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
    if (page === "settings.html") {
        initSettings();
    }
});
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
function generateRoomCode() {
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    const num = arr.reduce((n, b) => n * 256 + b, 0);
    return (10000000000 + (num % 90000000000)).toString();
}
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
        data.passwordHash = await hashPassword(password);
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
const PARAX_OFFICIAL_CODE = "00000000001";
function generateServerCode() {
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    const num = arr.reduce((n, b) => n * 256 + b, 0);
    return (10000000000 + (num % 90000000000)).toString();
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
            ownerId: "",
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
        if (typeof Para !== "undefined")
            Para.capture(e, { type: "manual", context: "ensureParaxOfficial" });
        return false;
    }
}
async function createServer(name, joinType = "open") {
    const code = generateServerCode();
    const user = auth.currentUser;
    await db.collection("servers").doc(code).set({
        name,
        ownerId: user.uid,
        ownerName: user.displayName || "Unknown",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        joinType,
    });
    await db.collection("servers").doc(code).collection("channels").add({
        name: "general",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("serverMembers").doc(memberDocId(user.uid, code)).set({
        userId: user.uid,
        serverCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        roles: ["admin"],
    });
    await createDefaultRoles(code);
    return code;
}
const DEFAULT_PERMISSIONS = {
    administrator: false,
    manage_roles: false,
    manage_channels: false,
    manage_server: false,
    kick_members: false,
    send_messages: true,
    connect: true,
    speak: true,
};
const ADMIN_PERMISSIONS = {
    administrator: true,
    manage_roles: true,
    manage_channels: true,
    manage_server: true,
    kick_members: true,
    send_messages: true,
    connect: true,
    speak: true,
};
async function createDefaultRoles(serverCode) {
    const rolesRef = db.collection("servers").doc(serverCode).collection("roles");
    await rolesRef.add({
        name: "@everyone",
        color: "#949ba4",
        priority: 0,
        permissions: DEFAULT_PERMISSIONS,
        isDefault: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await rolesRef.add({
        name: "admin",
        color: "#ed4245",
        priority: 100,
        permissions: ADMIN_PERMISSIONS,
        isDefault: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}
async function getServerOwner(serverCode) {
    const doc = await db.collection("servers").doc(serverCode).get();
    return doc.exists ? doc.data()?.ownerId || null : null;
}
async function userHasPermission(serverCode, permission) {
    const user = auth.currentUser;
    if (!user)
        return false;
    const ownerId = await getServerOwner(serverCode);
    if (ownerId === user.uid)
        return true;
    const memberDoc = await db.collection("serverMembers").doc(memberDocId(user.uid, serverCode)).get();
    if (!memberDoc.exists)
        return false;
    const memberData = memberDoc.data() || {};
    const userRoleIds = memberData.roles || [];
    const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
    const roles = rolesSnapshot.docs.map((d) => d.data());
    for (const role of roles) {
        if (!userRoleIds.includes(role.name) && role.name !== "@everyone")
            continue;
        if (role.name === "@everyone" || userRoleIds.includes(role.name)) {
            if (role.permissions?.administrator)
                return true;
            if (role.permissions?.[permission])
                return true;
        }
    }
    return false;
}
async function getUserRoles(serverCode) {
    const user = auth.currentUser;
    if (!user)
        return [];
    const memberDoc = await db.collection("serverMembers").doc(memberDocId(user.uid, serverCode)).get();
    if (!memberDoc.exists)
        return [];
    const memberData = memberDoc.data() || {};
    const userRoleNames = memberData.roles || [];
    const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
    const roles = rolesSnapshot.docs
        .map((d) => d.data())
        .filter((r) => r.name === "@everyone" || userRoleNames.includes(r.name))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return roles.map((r) => ({ name: r.name, color: r.color || "#949ba4" }));
}
async function getTopRoleColor(serverCode) {
    const roles = await getUserRoles(serverCode);
    return roles.length > 0 ? roles[0].color : null;
}
function loadServerRoles(serverCode, callback) {
    return db.collection("servers").doc(serverCode).collection("roles")
        .orderBy("priority", "desc")
        .onSnapshot((snapshot) => {
        const roles = [];
        snapshot.forEach((doc) => {
            roles.push({ id: doc.id, ...doc.data() });
        });
        callback(roles);
    }, (error) => {
        console.error("Roles error:", error);
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadServerRoles" });
    });
}
function loadServerMembers(serverCode, callback) {
    return db.collection("serverMembers")
        .where("serverCode", "==", serverCode)
        .onSnapshot(async (snapshot) => {
        const memberEntries = [];
        snapshot.forEach((doc) => {
            memberEntries.push({ id: doc.id, ...doc.data() });
        });
        const profiles = await Promise.all(memberEntries.map(async (m) => {
            try {
                const profDoc = await db.collection("users").doc(m.userId).get();
                const prof = profDoc.data() || {};
                return {
                    userId: m.userId,
                    username: prof.username || "Unknown",
                    photoURL: prof.photoURL || "",
                    roles: m.roles || [],
                    joinedAt: m.joinedAt,
                };
            }
            catch {
                return { userId: m.userId, username: "Unknown", photoURL: "", roles: [], joinedAt: null };
            }
        }));
        const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
        const allRoles = rolesSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        profiles.sort((a, b) => {
            const aRole = allRoles.find((r) => a.roles.includes(r.name));
            const bRole = allRoles.find((r) => b.roles.includes(r.name));
            const aPrio = aRole ? aRole.priority || 0 : 0;
            const bPrio = bRole ? bRole.priority || 0 : 0;
            if (bPrio !== aPrio)
                return bPrio - aPrio;
            return (a.username || "").localeCompare(b.username || "");
        });
        const enriched = profiles.map((p) => {
            const role = allRoles.find((r) => p.roles.includes(r.name));
            return { ...p, roleColor: role?.color || "", roleName: role?.name || "" };
        });
        callback(enriched);
    }, (error) => {
        console.error("Members error:", error);
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadServerMembers" });
    });
}
async function getServer(code) {
    const doc = await db.collection("servers").doc(code).get();
    return doc.exists ? { code: doc.id, ...doc.data() } : null;
}
async function serverExists(code) {
    const doc = await db.collection("servers").doc(code).get();
    return doc.exists;
}
async function joinServer(code, inviteCode) {
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
    const serverDoc = await db.collection("servers").doc(code).get();
    const serverData = serverDoc.data();
    const joinType = serverData?.joinType || "open";
    if (joinType === "invite") {
        if (!inviteCode)
            return false;
        const inviteDoc = await db.collection("servers").doc(code).collection("serverInvites").doc(inviteCode).get();
        if (!inviteDoc.exists)
            return false;
    }
    await db.collection("serverMembers").doc(docId).set({
        userId: user.uid,
        serverCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(inviteCode ? { inviteCode } : {}),
    });
    return true;
}
async function generateInviteCode(serverCode) {
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    const inviteCode = Array.from(arr).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
    await db.collection("servers").doc(serverCode).collection("serverInvites").doc(inviteCode).set({
        createdBy: auth.currentUser?.uid || "unknown",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return inviteCode;
}
function loadServerInvites(serverCode, callback) {
    return db.collection("servers").doc(serverCode).collection("serverInvites")
        .orderBy("createdAt", "desc")
        .onSnapshot((snapshot) => {
        const invites = [];
        snapshot.forEach((doc) => {
            invites.push({ code: doc.id, ...doc.data() });
        });
        callback(invites);
    }, () => {
        callback([]);
    });
}
function renderInvitesList() {
    if (!currentServerCode)
        return;
    const container = document.getElementById("invites-list");
    if (!container)
        return;
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">Loading invites...</div>';
    loadServerInvites(currentServerCode, (invites) => {
        if (invites.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">No invites yet. Generate one above.</div>';
            return;
        }
        container.innerHTML = invites.map((inv) => `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-tertiary);padding:8px 12px;border-radius:var(--radius);">
        <code style="font-size:0.9rem;color:var(--brand);font-weight:600;">${escapeHtml(inv.code)}</code>
        <button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${escapeHtml(inv.code)}');showAuthError('Copied!','success')">Copy</button>
      </div>`).join("");
    });
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
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadUserServers" });
        callback([]);
    });
    return () => membershipQuery();
}
async function createChannel(serverCode, name, type) {
    const data = {
        name: name.toLowerCase().replace(/\s+/g, "-"),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (type)
        data.type = type;
    const ref = await db.collection("servers").doc(serverCode).collection("channels").add(data);
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
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadServerChannels" });
    });
}
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
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadChannelMessages" });
        const el = document.getElementById("server-messages");
        if (el)
            el.innerHTML = `<div class="chat-error">Failed to load messages.</div>`;
    });
}
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
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadMessages" });
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
        if (typeof Para !== "undefined")
            Para.capture(error, { type: "firestore", context: "loadUserRooms" });
    });
}
async function loadProfile(uid) {
    const doc = await db.collection("users").doc(uid).get();
    return doc.data() || {};
}
async function saveProfile(uid, data) {
    await db.collection("users").doc(uid).update(data);
}
async function uploadAvatar(uid, file) {
    const ref = firebase.storage().ref("profiles/" + uid + "/avatar.jpg");
    const snapshot = await ref.put(file);
    const downloadUrl = await snapshot.ref.getDownloadURL();
    await db.collection("users").doc(uid).update({ photoURL: downloadUrl });
    return downloadUrl;
}
async function removeAvatar(uid) {
    try {
        const ref = firebase.storage().ref("profiles/" + uid + "/avatar.jpg");
        await ref.delete();
    }
    catch (_) { }
    await db.collection("users").doc(uid).update({ photoURL: "" });
}
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
let dashboardUnsub = null;
let serverChannelsUnsub = null;
let channelMessagesUnsub = null;
let currentServerCode = null;
let currentChannelId = null;
let userServersCache = [];
let memberListUnsub = null;
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
        if (user.email === "meric.yesiltas2014@gmail.com") {
            db.collection("servers").doc(PARAX_OFFICIAL_CODE).update({
                ownerId: user.uid,
                ownerName: user.displayName || "meric.yesiltas2014",
            }).catch(() => { });
        }
    }
    logoutBtn?.addEventListener("click", async () => {
        cleanupSubs();
        await auth.signOut();
        window.location.href = "/";
    });
    settingsBtn?.addEventListener("click", () => {
        window.location.href = "/settings.html";
    });
    dashboardUnsub = loadUserServers((servers) => {
        userServersCache = servers;
        renderServerList(servers);
        if (currentServerCode && !servers.find((s) => s.code === currentServerCode)) {
            selectServer(null);
        }
    });
    document.getElementById("home-btn")?.addEventListener("click", () => {
        selectServer(null);
    });
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
    document.getElementById("add-server-btn")?.addEventListener("click", () => {
        showModal("create-server-modal");
        document.getElementById("server-name-input")?.focus();
    });
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
    document.getElementById("join-server-btn")?.addEventListener("click", () => {
        showModal("join-server-modal");
        document.getElementById("join-server-input")?.focus();
    });
    document.getElementById("join-server-cancel")?.addEventListener("click", () => {
        hideModal("join-server-modal");
        document.getElementById("join-invite-group").style.display = "none";
    });
    document.getElementById("join-server-confirm")?.addEventListener("click", async () => {
        const input = document.getElementById("join-server-input");
        const code = input?.value.trim();
        if (!code || code.length !== 11 || !/^\d{11}$/.test(code)) {
            showAuthError("Enter a valid 11-digit server code");
            return;
        }
        const inviteInput = document.getElementById("join-invite-input");
        const inviteCode = inviteInput?.value.trim() || undefined;
        try {
            const joined = await joinServer(code, inviteCode);
            if (!joined) {
                showAuthError("Server not found or invalid invite code");
                return;
            }
            hideModal("join-server-modal");
            document.getElementById("join-invite-group").style.display = "none";
            input.value = "";
            if (inviteInput)
                inviteInput.value = "";
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
    document.getElementById("join-server-input")?.addEventListener("input", async (e) => {
        const el = e.target;
        el.value = el.value.replace(/\D/g, "").slice(0, 11);
        const code = el.value.trim();
        const inviteGroup = document.getElementById("join-invite-group");
        if (code.length === 11) {
            try {
                const serverDoc = await db.collection("servers").doc(code).get();
                const joinType = serverDoc.data()?.joinType || "open";
                inviteGroup.style.display = joinType === "invite" ? "block" : "none";
            }
            catch {
                inviteGroup.style.display = "none";
            }
        }
        else {
            inviteGroup.style.display = "none";
        }
    });
    document.getElementById("add-channel-btn")?.addEventListener("click", async () => {
        if (currentServerCode) {
            const allowed = await userHasPermission(currentServerCode, "manage_channels");
            if (!allowed) {
                showAuthError("You don't have permission to create channels");
                return;
            }
        }
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
        const typeEl = document.querySelector('input[name="channel-type"]:checked');
        const type = typeEl?.value || "text";
        try {
            hideModal("create-channel-modal");
            input.value = "";
            await createChannel(currentServerCode, name, type);
        }
        catch (err) {
            showAuthError("Failed to create channel: " + err.message);
        }
    });
    document.getElementById("channel-name-input")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter")
            document.getElementById("create-channel-confirm")?.click();
    });
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
    const send = () => {
        const text = inputEl?.value.trim();
        const cid = currentChannelId;
        const sc = currentServerCode;
        if (!text || !cid)
            return;
        if (sc) {
            userHasPermission(sc, "send_messages").then((allowed) => {
                if (!allowed) {
                    showAuthError("You don't have permission to send messages");
                    return;
                }
                sendChannelMessage(cid, text).catch((err) => {
                    showAuthError("Failed to send: " + err.message);
                });
                if (inputEl) {
                    inputEl.value = "";
                    inputEl.focus();
                }
            });
            return;
        }
        sendChannelMessage(cid, text).catch((err) => {
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
    const serverHeader = document.getElementById("channel-header");
    const serverDropdown = document.getElementById("server-dropdown");
    serverHeader?.addEventListener("click", (e) => {
        e.stopPropagation();
        serverDropdown?.classList.toggle("open");
    });
    document.addEventListener("click", () => {
        serverDropdown?.classList.remove("open");
    });
    document.getElementById("server-roles-btn")?.addEventListener("click", () => {
        serverDropdown?.classList.remove("open");
        showModal("roles-modal");
        renderRolesModal();
    });
    document.getElementById("server-members-btn")?.addEventListener("click", () => {
        serverDropdown?.classList.remove("open");
        const memberList = document.getElementById("member-list-sidebar");
        if (memberList) {
            memberList.classList.toggle("hidden");
        }
    });
    document.getElementById("server-invites-btn")?.addEventListener("click", () => {
        serverDropdown?.classList.remove("open");
        showModal("invites-modal");
        renderInvitesList();
    });
    document.getElementById("roles-modal-close")?.addEventListener("click", () => {
        hideModal("roles-modal");
    });
    document.getElementById("create-role-btn")?.addEventListener("click", () => {
        hideModal("roles-modal");
        showModal("create-role-modal");
        document.getElementById("role-name-input")?.focus();
    });
    document.getElementById("create-role-cancel")?.addEventListener("click", () => {
        hideModal("create-role-modal");
    });
    document.getElementById("create-role-confirm")?.addEventListener("click", async () => {
        const input = document.getElementById("role-name-input");
        const name = input?.value.trim();
        if (!name || !currentServerCode)
            return;
        try {
            const rolesRef = db.collection("servers").doc(currentServerCode).collection("roles");
            await rolesRef.add({
                name,
                color: "#5865f2",
                priority: 50,
                permissions: {
                    administrator: false,
                    manage_roles: false,
                    manage_channels: false,
                    manage_server: false,
                    kick_members: false,
                    send_messages: true,
                    connect: true,
                    speak: true,
                },
                isDefault: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            hideModal("create-role-modal");
            input.value = "";
            showModal("roles-modal");
            renderRolesModal();
        }
        catch (err) {
            showAuthError("Failed to create role");
        }
    });
    document.getElementById("invites-modal-close")?.addEventListener("click", () => {
        hideModal("invites-modal");
    });
    document.getElementById("generate-invite-btn")?.addEventListener("click", async () => {
        if (!currentServerCode)
            return;
        try {
            const inviteCode = await generateInviteCode(currentServerCode);
            renderInvitesList();
            showAuthError("Invite created: " + inviteCode, "success");
        }
        catch (err) {
            showAuthError("Failed to create invite");
        }
    });
    const flash = sessionStorage.getItem("flash_error");
    if (flash) {
        sessionStorage.removeItem("flash_error");
        showAuthError(flash);
    }
}
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
function selectServer(code) {
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
    const homeBtn = document.getElementById("home-btn");
    if (homeBtn)
        homeBtn.classList.toggle("active", !code);
    document.querySelectorAll(".server-item[data-code]").forEach((el) => {
        el.classList.toggle("active", el.dataset.code === code);
    });
    const officialBtn = document.getElementById("official-server-btn");
    if (officialBtn) {
        officialBtn.classList.toggle("active", code === PARAX_OFFICIAL_CODE);
    }
    if (memberListUnsub) {
        memberListUnsub();
        memberListUnsub = null;
    }
    document.getElementById("member-list").innerHTML = "";
    const memberListSidebar = document.getElementById("member-list-sidebar");
    if (memberListSidebar)
        memberListSidebar.classList.add("hidden");
    if (!code) {
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
    serverChannelsUnsub = loadServerChannels(code, (channels) => {
        renderChannelList(channels, code);
        if (channels.length > 0 && !currentChannelId) {
            selectChannel(channels[0].id, channels[0].name, code);
        }
    });
    updateAddChannelButtonVisibility(code);
    memberListUnsub = loadServerMembers(code, (members) => {
        renderMemberList(members, code);
    });
}
function renderMemberList(members, serverCode) {
    if (serverCode !== currentServerCode)
        return;
    const container = document.getElementById("member-list");
    if (!container)
        return;
    const memberListSidebar = document.getElementById("member-list-sidebar");
    if (memberListSidebar)
        memberListSidebar.classList.remove("hidden");
    const count = document.getElementById("member-count");
    if (count)
        count.textContent = members.length + " member" + (members.length !== 1 ? "s" : "");
    container.innerHTML = members.map((m) => {
        const initial = (m.username || "U")[0].toUpperCase();
        const avatarHtml = m.photoURL
            ? `<img src="${escapeHtml(m.photoURL)}" alt="" class="member-avatar-img" />`
            : `<span class="member-avatar-initials">${initial}</span>`;
        const roleDot = m.roleColor
            ? `<span class="member-role-dot" style="background:${m.roleColor}"></span>`
            : "";
        return `
      <div class="member-item" title="${escapeHtml(m.username)}">
        <div class="member-avatar">${avatarHtml}</div>
        <div class="member-info">
          <span class="member-name">${escapeHtml(m.username)}</span>
          <div class="member-role-row">${roleDot}${m.roleName ? `<span class="member-role-label">${escapeHtml(m.roleName)}</span>` : ""}</div>
        </div>
      </div>
    `;
    }).join("");
}
async function updateAddChannelButtonVisibility(serverCode) {
    const btn = document.getElementById("add-channel-btn");
    if (!btn)
        return;
    const allowed = await userHasPermission(serverCode, "manage_channels");
    btn.style.display = allowed ? "" : "none";
}
function renderRolesModal() {
    if (!currentServerCode)
        return;
    const container = document.getElementById("roles-list");
    if (!container)
        return;
    loadServerRoles(currentServerCode, (roles) => {
        container.innerHTML = roles.map((r) => {
            const perms = r.permissions || {};
            return `
        <div class="role-card" data-role-id="${r.id}">
          <div class="role-card-header">
            <span class="role-name" style="color:${r.color || "#949ba4"}">${escapeHtml(r.name)}</span>
            <span class="role-badge" style="background:${r.color || "#949ba4"}"></span>
          </div>
          <div class="role-permissions">
            ${Object.keys(perms).map((p) => `
              <label class="role-perm-item">
                <input type="checkbox" ${perms[p] ? "checked" : ""} data-perm="${p}" data-role-id="${r.id}" ${r.isDefault ? "disabled" : ""} />
                <span>${escapeHtml(p.replace(/_/g, " "))}</span>
              </label>
            `).join("")}
          </div>
          ${!r.isDefault ? `<button class="btn btn-sm btn-secondary role-delete-btn" data-role-id="${r.id}">Delete</button>` : ""}
        </div>
      `;
        }).join("");
        container.querySelectorAll('input[type="checkbox"][data-role-id]').forEach((el) => {
            el.addEventListener("change", async (e) => {
                const cb = e.target;
                const roleId = cb.dataset.roleId;
                const perm = cb.dataset.perm;
                if (!roleId || !perm || !currentServerCode)
                    return;
                try {
                    const roleRef = db.collection("servers").doc(currentServerCode).collection("roles").doc(roleId);
                    await roleRef.update({ ["permissions." + perm]: cb.checked });
                }
                catch (err) {
                    showAuthError("Failed to update permission");
                }
            });
        });
        container.querySelectorAll(".role-delete-btn").forEach((el) => {
            el.addEventListener("click", async () => {
                const roleId = el.dataset.roleId;
                if (!roleId || !currentServerCode)
                    return;
                if (!confirm("Delete this role?"))
                    return;
                try {
                    await db.collection("servers").doc(currentServerCode).collection("roles").doc(roleId).delete();
                    renderRolesModal();
                }
                catch (err) {
                    showAuthError("Failed to delete role");
                }
            });
        });
    });
}
function renderChannelList(channels, serverCode) {
    if (serverCode !== currentServerCode)
        return;
    const textChannels = channels.filter((ch) => ch.type !== "voice");
    const voiceChannels = channels.filter((ch) => ch.type === "voice");
    const textList = document.getElementById("channel-list");
    const voiceList = document.getElementById("voice-channel-list");
    if (textList) {
        if (textChannels.length === 0) {
            textList.innerHTML = '<div class="channel-empty">No channels yet</div>';
        }
        else {
            textList.innerHTML = textChannels.map((ch) => {
                const isActive = ch.id === currentChannelId;
                return `
          <div class="channel-item ${isActive ? "active" : ""}" data-channel-id="${ch.id}" data-channel-name="${escapeHtml(ch.name)}" data-channel-type="text">
            <span class="channel-hash">#</span>
            <span class="channel-name">${escapeHtml(ch.name)}</span>
          </div>
        `;
            }).join("");
            textList.querySelectorAll(".channel-item").forEach((el) => {
                el.addEventListener("click", () => {
                    const id = el.dataset.channelId;
                    const name = el.dataset.channelName;
                    if (id && name)
                        selectChannel(id, name, serverCode);
                });
            });
        }
    }
    if (voiceList) {
        if (voiceChannels.length === 0) {
            voiceList.innerHTML = '<div class="channel-empty">No voice channels yet</div>';
        }
        else {
            voiceList.innerHTML = voiceChannels.map((ch) => {
                const isVoiceActive = typeof ParaVoice !== "undefined" && ParaVoice.isActive() && ParaVoice.getActiveChannelId() === ch.id;
                return `
          <div class="channel-item channel-voice ${isVoiceActive ? "active" : ""}" data-channel-id="${ch.id}" data-channel-name="${escapeHtml(ch.name)}" data-channel-type="voice">
            <span class="channel-hash">🔊</span>
            <span class="channel-name">${escapeHtml(ch.name)}</span>
          </div>
        `;
            }).join("");
            voiceList.querySelectorAll(".channel-item").forEach((el) => {
                el.addEventListener("click", () => {
                    const id = el.dataset.channelId;
                    const name = el.dataset.channelName;
                    if (id && name) {
                        if (typeof ParaVoice !== "undefined") {
                            ParaVoice.join(id, name);
                        }
                    }
                });
            });
        }
    }
}
function selectChannel(channelId, channelName, serverCode) {
    if (serverCode !== currentServerCode)
        return;
    if (channelMessagesUnsub) {
        channelMessagesUnsub();
        channelMessagesUnsub = null;
    }
    currentChannelId = channelId;
    const chEl = document.querySelector(`.channel-item[data-channel-id="${channelId}"]`);
    const isVoice = chEl?.getAttribute("data-channel-type") === "voice";
    document.querySelectorAll(".channel-item").forEach((el) => {
        el.classList.toggle("active", el.dataset.channelId === channelId);
    });
    const chatArea = document.getElementById("chat-area");
    const welcomeState = document.getElementById("welcome-state");
    const channelNameEl = document.getElementById("channel-name");
    const channelHash = document.getElementById("channel-hash");
    const messagesEl = document.getElementById("server-messages");
    const inputEl = document.getElementById("server-message-input");
    const inputBar = document.querySelector(".chat-input-bar");
    const voiceContainer = document.getElementById("voice-container");
    welcomeState?.classList.add("hidden");
    chatArea?.classList.remove("hidden");
    if (isVoice) {
        if (channelHash)
            channelHash.textContent = "🔊";
        if (channelNameEl)
            channelNameEl.textContent = channelName;
        if (inputBar)
            inputBar.style.display = "none";
        if (messagesEl)
            messagesEl.style.display = "none";
        if (voiceContainer)
            voiceContainer.classList.remove("hidden");
    }
    else {
        if (channelHash)
            channelHash.textContent = "#";
        if (inputBar)
            inputBar.style.display = "";
        if (messagesEl)
            messagesEl.style.display = "";
        if (voiceContainer)
            voiceContainer.classList.add("hidden");
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
}
const inputEl = document.getElementById("server-message-input");
let homeRoomsUnsub = null;
function renderHomeRooms() {
    const container = document.getElementById("home-rooms");
    if (!container)
        return;
    if (homeRoomsUnsub) {
        homeRoomsUnsub();
        homeRoomsUnsub = null;
    }
    homeRoomsUnsub = loadUserRooms((rooms) => {
        if (rooms.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">You\'re not in any servers yet. Create one or join with a code!</p>';
        }
        else {
            container.innerHTML = rooms.map((r) => `
        <div class="home-room-item">
          <span class="home-room-code">${escapeHtml(r.code)}</span>
          <span style="color:var(--text-muted);font-size:0.8rem">${r.createdAt?.toDate?.()?.toLocaleDateString() || ""}</span>
          <span style="color:var(--text-muted);font-size:0.75rem;margin-left:auto">(legacy room)</span>
        </div>
      `).join("");
        }
    });
}
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
    if (homeRoomsUnsub) {
        homeRoomsUnsub();
        homeRoomsUnsub = null;
    }
    if (memberListUnsub) {
        memberListUnsub();
        memberListUnsub = null;
    }
}
function promptRoomPassword(code, correctPassword) { }
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
function initAuthStateListener(currentPage) {
    auth.onAuthStateChanged((user) => {
        if (!user) {
            if (currentPage === "dashboard.html") {
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
                cleanupSubs();
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
function showAuthError(message, type) {
    if (!message)
        return;
    if (typeof Para !== "undefined")
        Para.capture(message, { type: "ui", context: "showAuthError" });
    const errorEl = document.createElement("div");
    errorEl.className = "auth-error" + (type === "success" ? " auth-success" : "");
    errorEl.textContent = message;
    document.body.appendChild(errorEl);
    setTimeout(() => errorEl.remove(), 5000);
}
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
    return password.length >= 8
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /[0-9]/.test(password)
        && /[^A-Za-z0-9]/.test(password);
}
function passwordsMatch(a, b) {
    return a === b;
}
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
                setError(passwordInput, "Must be at least 8 characters with uppercase, lowercase, number, and special character.");
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
                setError(passwordInput, !val ? "Password is required." : "Must be at least 8 characters with uppercase, lowercase, number, and special character.");
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
