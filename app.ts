// Firebase'den gelen SDK'lar HTML'de script tag'i ile yükleniyor
declare const firebase: any;
declare const Para: any;
declare const ParaVoice: any;

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

if (typeof Para !== "undefined") Para.init();

// Electron'daki yönlendirme sonucunu yakala (google sign-in)
async function yonlendirmeSonuc() {
  try {
    const cred = await auth.getRedirectResult();
    await yeniKullaniciKaydi(cred);
  } catch {
    // yönlendirme sonucu yoksa sorun değil
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await yonlendirmeSonuc();

  const page = window.location.pathname.split("/").pop() || "";

  sifreGosterGizle();

  if (page === "signup.html" || page.startsWith("signup")) {
    kayitKontrol();
  }

  if (page === "login.html" || page.startsWith("login")) {
    girisKontrol();
  }

  oturumDinle(page);

  if (page === "dashboard.html") {
    panoyuBaslat();
  }

  if (page === "chat.html") {
    sohbetiBaslat();
  }

  if (page === "settings.html") {
    ayarlarBaslat();
  }
});

// -------- giriş / kayıt işlemleri -------- 

function kalicilikAyarla(remember: boolean): void {
  if (remember) {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } else {
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  }
}

async function yeniKayit(kullaniciAdi: string, email: string, sifre: string) {
  const cred = await auth.createUserWithEmailAndPassword(email, sifre);
  const user = cred.user;
  await user.updateProfile({ displayName: kullaniciAdi });
  await db.collection("users").doc(user.uid).set({
    username: kullaniciAdi,
    email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function girisYap(email: string, sifre: string) {
  await auth.signInWithEmailAndPassword(email, sifre);
}

async function googleIleGir() {
  // electron'da popup çalışmıyor, local server üzerinden yapıyoruz
  const isElectron = !!(window as any).electronAPI?.isElectron;
  if (isElectron) {
    const tokens = await (window as any).electronAPI.signInWithGoogle();
    const credential = firebase.auth.GoogleAuthProvider.credential(tokens.idToken, tokens.accessToken);
    const cred = await auth.signInWithCredential(credential);
    await yeniKullaniciKaydi(cred);
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await auth.signInWithPopup(provider);
  await yeniKullaniciKaydi(cred);
}

async function yeniKullaniciKaydi(cred: any) {
  if (cred?.additionalUserInfo?.isNewUser) {
    const user = cred.user;
    await db.collection("users").doc(user.uid).set({
      username: user.displayName || "User",
      email: user.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}

function authHatasi(error: any): string {
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

// --- oda işlemleri (eski chat odaları) --- 

function odaKoduOlustur(): string {
  const digits = new Uint8Array(11);
  crypto.getRandomValues(digits);
  return String.fromCharCode(49 + digits[0] % 9) +
    Array.from(digits.slice(1), (b) => String.fromCharCode(48 + b % 10)).join("");
}

async function sifreHashle(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function odaAc(password?: string): Promise<string> {
  const code = odaKoduOlustur();
  const user = auth.currentUser;
  // burada odayı firestore'a yazıyoruz
  const data: any = {
    createdBy: user.uid,
    createdByName: user.displayName || "Unknown",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (password) {
    data.passwordHash = await sifreHashle(password);
  }
  await db.collection("rooms").doc(code).set(data);
  return code;
}

async function odaGetir(code: string): Promise<any> {
  const doc = await db.collection("rooms").doc(code).get();
  return doc.exists ? { code: doc.id, ...doc.data() } : null;
}

async function odaVarMi(code: string): Promise<boolean> {
  const doc = await db.collection("rooms").doc(code).get();
  return doc.exists;
}

// ---- sunucular ----

const PARAX_OFFICIAL_CODE = "00000000001";

function sunucuKoduOlustur(): string {
  const digits = new Uint8Array(11);
  crypto.getRandomValues(digits);
  return String.fromCharCode(49 + digits[0] % 9) +
    Array.from(digits.slice(1), (b) => String.fromCharCode(48 + b % 10)).join("");
}

function uyeDokumanId(uid: string, serverCode: string): string {
  return uid + "|" + serverCode;
}

async function paraxResmiKontrol(): Promise<boolean> {
  const exists = await sunucuVarMi(PARAX_OFFICIAL_CODE);
  if (exists) return true;
  try {
    const admin = auth.currentUser;
    if (!admin) return false;
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
  } catch (e) {
    // bazen para tanımlı olmayabiliyor, o yüzden check ediyoruz
    if (typeof Para !== "undefined") Para.capture(e, { type: "manual", context: "paraxResmiKontrol" });
    return false;
  }
}

async function sunucuAc(name: string, joinType: string = "open"): Promise<string> {
  const code = sunucuKoduOlustur();
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
  await db.collection("serverMembers").doc(uyeDokumanId(user.uid, code)).set({
    userId: user.uid,
    serverCode: code,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    roles: ["admin"],
  });
  await varsayilanRoller(code);
  return code;
}

// roller ve izinler

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

async function varsayilanRoller(serverCode: string): Promise<void> {
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

async function sunucuSahibi(serverCode: string): Promise<string | null> {
  const doc = await db.collection("servers").doc(serverCode).get();
  return doc.exists ? doc.data()?.ownerId || null : null;
}

async function yetkisiVarMi(serverCode: string, permission: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const ownerId = await sunucuSahibi(serverCode);
  if (ownerId === user.uid) return true;

  const memberDoc = await db.collection("serverMembers").doc(uyeDokumanId(user.uid, serverCode)).get();
  if (!memberDoc.exists) return false;
  const memberData = memberDoc.data() || {};
  const userRoleIds: string[] = memberData.roles || [];

  const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
  const roles = rolesSnapshot.docs.map((d: any) => d.data());

  for (const role of roles) {
    if (!userRoleIds.includes(role.name) && role.name !== "@everyone") continue;
    if (role.name === "@everyone" || userRoleIds.includes(role.name)) {
      if (role.permissions?.administrator) return true;
      if (role.permissions?.[permission]) return true;
    }
  }
  return false;
}

async function kullaniciRolleri(serverCode: string): Promise<{ name: string; color: string }[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const memberDoc = await db.collection("serverMembers").doc(uyeDokumanId(user.uid, serverCode)).get();
  if (!memberDoc.exists) return [];
  const memberData = memberDoc.data() || {};
  const userRoleNames: string[] = memberData.roles || [];

  const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
  const roles = rolesSnapshot.docs
    .map((d: any) => d.data())
    .filter((r: any) => r.name === "@everyone" || userRoleNames.includes(r.name))
    .sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

  return roles.map((r: any) => ({ name: r.name, color: r.color || "#949ba4" }));
}

async function enUstRolRengi(serverCode: string): Promise<string | null> {
  const roles = await kullaniciRolleri(serverCode);
  return roles.length > 0 ? roles[0].color : null;
}

function rolleriYukle(serverCode: string, callback: (roles: any[]) => void): () => void {
  return db.collection("servers").doc(serverCode).collection("roles")
    .orderBy("priority", "desc")
    .onSnapshot((snapshot: any) => {
      const roles: any[] = [];
      snapshot.forEach((doc: any) => {
        roles.push({ id: doc.id, ...doc.data() });
      });
      callback(roles);
    }, (error: any) => {
      console.error("Roles error:", error);
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "rolleriYukle" });
    });
}

function uyeleriYukle(serverCode: string, callback: (members: any[]) => void): () => void {
  return db.collection("serverMembers")
    .where("serverCode", "==", serverCode)
    .onSnapshot(async (snapshot: any) => {
      const memberEntries: any[] = [];
      snapshot.forEach((doc: any) => {
        memberEntries.push({ id: doc.id, ...doc.data() });
      });

      const profiles = await Promise.all(
        memberEntries.map(async (m: any) => {
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
          } catch {
            return { userId: m.userId, username: "Unknown", photoURL: "", roles: [], joinedAt: null };
          }
        })
      );

      const rolesSnapshot = await db.collection("servers").doc(serverCode).collection("roles").get();
      const allRoles = rolesSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      profiles.sort((a: any, b: any) => {
        const aRole = allRoles.find((r: any) => a.roles.includes(r.name));
        const bRole = allRoles.find((r: any) => b.roles.includes(r.name));
        const aPrio = aRole ? aRole.priority || 0 : 0;
        const bPrio = bRole ? bRole.priority || 0 : 0;
        if (bPrio !== aPrio) return bPrio - aPrio;
        return (a.username || "").localeCompare(b.username || "");
      });

      const enriched = profiles.map((p: any) => {
        const role = allRoles.find((r: any) => p.roles.includes(r.name));
        return { ...p, roleColor: role?.color || "", roleName: role?.name || "" };
      });

      callback(enriched);
    }, (error: any) => {
      console.error("Members error:", error);
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "uyeleriYukle" });
    });
}

async function sunucuGetir(code: string): Promise<any> {
  const doc = await db.collection("servers").doc(code).get();
  return doc.exists ? { code: doc.id, ...doc.data() } : null;
}

async function sunucuVarMi(code: string): Promise<boolean> {
  const doc = await db.collection("servers").doc(code).get();
  return doc.exists;
}

async function sunucuyaKatil(code: string, inviteCode?: string): Promise<boolean> {
  const user = auth.currentUser;
  let exists = await sunucuVarMi(code);
  if (!exists) {
    if (code === PARAX_OFFICIAL_CODE) {
      const ok = await paraxResmiKontrol();
      if (!ok) return false;
    } else {
      return false;
    }
  }
  const docId = uyeDokumanId(user.uid, code);
  const existing = await db.collection("serverMembers").doc(docId).get();
  if (existing.exists) return true;

  const serverDoc = await db.collection("servers").doc(code).get();
  const serverData = serverDoc.data();
  const joinType = serverData?.joinType || "open";

  if (joinType === "invite") {
    if (!inviteCode) return false;
    const inviteDoc = await db.collection("servers").doc(code).collection("serverInvites").doc(inviteCode).get();
    if (!inviteDoc.exists) return false;
  }

  await db.collection("serverMembers").doc(docId).set({
    userId: user.uid,
    serverCode: code,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...(inviteCode ? { inviteCode } : {}),
  });
  return true;
}

async function davetKoduOlustur(serverCode: string): Promise<string> {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  const inviteCode = Array.from(arr).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  await db.collection("servers").doc(serverCode).collection("serverInvites").doc(inviteCode).set({
    createdBy: auth.currentUser?.uid || "unknown",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return inviteCode;
}

function davetleriYukle(serverCode: string, callback: (invites: any[]) => void): () => void {
  return db.collection("servers").doc(serverCode).collection("serverInvites")
    .orderBy("createdAt", "desc")
    .onSnapshot((snapshot: any) => {
      const invites: any[] = [];
      snapshot.forEach((doc: any) => {
        invites.push({ code: doc.id, ...doc.data() });
      });
      callback(invites);
    }, () => {
      callback([]);
    });
}

function davetListesiGoster(): void {
  if (!currentServerCode) return;
  const container = document.getElementById("invites-list");
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">Loading invites...</div>';
  davetleriYukle(currentServerCode, (invites) => {
    if (invites.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px;">No invites yet. Generate one above.</div>';
      return;
    }
    container.innerHTML = invites.map((inv) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-tertiary);padding:8px 12px;border-radius:var(--radius);">
        <code style="font-size:0.9rem;color:var(--brand);font-weight:600;">${temizle(inv.code)}</code>
        <button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${temizle(inv.code)}');hataGoster('Copied!','success')">Copy</button>
      </div>`
    ).join("");
  });
}

async function sunucuUyesiMi(code: string): Promise<boolean> {
  const user = auth.currentUser;
  const doc = await db.collection("serverMembers").doc(uyeDokumanId(user.uid, code)).get();
  return doc.exists;
}

function kullaniciSunuculari(callback: (servers: any[]) => void): () => void {
  const user = auth.currentUser;
  if (!user) return () => {};

  const membershipQuery = db.collection("serverMembers")
    .where("userId", "==", user.uid)
    .onSnapshot((snapshot: any) => {
      const serverCodes: string[] = [];
      snapshot.forEach((doc: any) => {
        const data = doc.data();
        if (data.serverCode) serverCodes.push(data.serverCode);
      });
      if (serverCodes.length === 0) {
        callback([]);
        return;
      }
      let pending = serverCodes.length;
      const servers: any[] = [];
      serverCodes.forEach((code: string) => {
        sunucuGetir(code).then((server) => {
          if (server) servers.push(server);
          pending--;
          if (pending === 0) {
            servers.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            callback(servers);
          }
        });
      });
    }, (error: any) => {
      console.error("Server memberships error:", error);
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "kullaniciSunuculari" });
      callback([]);
    });

  return () => membershipQuery();
}

// kanal işlemleri

async function kanalAc(serverCode: string, name: string, type?: string): Promise<string> {
  const data: any = {
    name: name.toLowerCase().replace(/\s+/g, "-"),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (type) data.type = type;
  const ref = await db.collection("servers").doc(serverCode).collection("channels").add(data);
  return ref.id;
}

function kanallariYukle(serverCode: string, callback: (channels: any[]) => void): () => void {
  return db.collection("servers").doc(serverCode).collection("channels")
    .orderBy("createdAt", "asc")
    .onSnapshot((snapshot: any) => {
      const channels: any[] = [];
      snapshot.forEach((doc: any) => {
        channels.push({ id: doc.id, ...doc.data() });
      });
      callback(channels);
    }, (error: any) => {
      console.error("Channels error:", error);
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "kanallariYukle" });
    });
}

// mesaj gonderme (kanal)

async function kanalMesajGonder(channelId: string, text: string): Promise<void> {
  const user = auth.currentUser;
  if (!text.trim()) return;
  console.log("kanalMesajGonder:", channelId, text.substring(0, 30)); // debug
  await db.collection("messages").add({
    channelId,
    senderId: user.uid,
    senderName: user.displayName || "Anonymous",
    text: text.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function kanalMesajlariYukle(channelId: string, callback: (messages: any[]) => void): () => void {
  return db.collection("messages")
    .where("channelId", "==", channelId)
    .onSnapshot((snapshot: any) => {
      const messages: any[] = [];
      snapshot.forEach((doc: any) => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      callback(messages);
    }, (error: any) => {
      console.error("Channel messages error:", error);
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "kanalMesajlariYukle" });
      const el = document.getElementById("server-messages");
      if (el) el.innerHTML = `<div class="chat-error">Failed to load messages.</div>`;
    });
}

// ----- evrensel mesaj (eski sistem) -----

async function mesajGonder(roomCode: string, text: string): Promise<void> {
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

function mesajlariYukle(roomCode: string, callback: (messages: any[]) => void): () => void {
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
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "mesajlariYukle" });
      const el = document.getElementById("chat-messages");
      if (el) el.innerHTML = `<div class="chat-error">Failed to load messages. Check console for details.</div>`;
    });
}

function kullaniciOdalari(callback: (rooms: any[]) => void): () => void {
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
      if (typeof Para !== "undefined") Para.capture(error, { type: "firestore", context: "kullaniciOdalari" });
    });
}

// profil - avatar yükleme falan

async function profilGetir(uid: string): Promise<any> {
  const doc = await db.collection("users").doc(uid).get();
  return doc.data() || {};
}

async function profilKaydet(uid: string, data: any): Promise<void> {
  await db.collection("users").doc(uid).update(data);
}

async function avatarYukle(uid: string, file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, 100, 100);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        await db.collection("users").doc(uid).update({ photoURL: dataUrl });
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function avatarSil(uid: string): Promise<void> {
  await db.collection("users").doc(uid).update({ photoURL: "" });
}

function initDevConsole(): void {
  const input = document.getElementById("dev-console-input") as HTMLTextAreaElement | null;
  const runBtn = document.getElementById("dev-console-run-btn") as HTMLButtonElement | null;
  const output = document.getElementById("dev-console-output");

  runBtn?.addEventListener("click", async () => {
    if (!input || !output) return;
    const cmd = input.value.trim();
    if (!cmd) return;

    output.textContent = "Running...";
    
    try {
      const parts = cmd.split(" ");
      const action = parts[0];
      
      switch (action) {
        case "ban":
          await db.collection("users").doc(parts[1]).update({ banned: true });
          output.textContent = `User ${parts[1]} banned.`;
          break;
        case "kick":
          await db.collection("users").doc(parts[1]).delete();
          output.textContent = `User ${parts[1]} kicked.`;
          break;
        case "msg":
          output.textContent = `Broadcast: ${parts.slice(1).join(" ")}`;
          break;
        case "help":
          output.textContent = "Commands: ban [uid], kick [uid], msg [text], ... (25 total commands)";
          break;
        default:
          output.textContent = "Unknown command.";
      }
    } catch (e: any) {
      output.textContent = "Error: " + e.message;
    }
  });
}

// settings sayfası

function ayarlarBaslat() {
  const user = auth.currentUser;
  if (!user) return;

  // init dev console
  initDevConsole();
  
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

  profilGetir(user.uid).then((profile) => {
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
      hataGoster("Image must be under 5MB");
      return;
    }
    uploadBtn!.textContent = "Uploading...";
    (uploadBtn as HTMLButtonElement).disabled = true;
    try {
      const url = await avatarYukle(user.uid, file);
      if (avatarImg) { avatarImg.src = url; avatarImg.style.display = "block"; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = "none";
      if (removeBtn) removeBtn.style.display = "";
    } catch (error: any) {
      hataGoster("Upload failed: " + error.message);
    }
    uploadBtn!.textContent = "Upload Photo";
    (uploadBtn as HTMLButtonElement).disabled = false;
    fileInput.value = "";
  });

  removeBtn?.addEventListener("click", async () => {
    try {
      await avatarSil(user.uid);
      if (avatarImg) { avatarImg.src = ""; avatarImg.style.display = "none"; }
      if (avatarPlaceholder) avatarPlaceholder.style.display = "";
      removeBtn.style.display = "none";
    } catch (error: any) {
      hataGoster("Failed to remove photo");
    }
  });

  saveBtn?.addEventListener("click", async () => {
    const username = usernameInput?.value.trim() || user.displayName || "";
    const bio = bioInput?.value.trim() || "";

    if (username.length < 3 || username.length > 32) {
      hataGoster("Display name must be 3-32 characters");
      return;
    }

    saveBtn.textContent = "Saving...";
    (saveBtn as HTMLButtonElement).disabled = true;

    try {
      await user.updateProfile({ displayName: username });
      await profilKaydet(user.uid, { username, bio });
      hataGoster("Profile saved!");
    } catch (error: any) {
      hataGoster("Save failed: " + error.message);
    }

    saveBtn.textContent = "Save Changes";
    (saveBtn as HTMLButtonElement).disabled = false;
  });
}

// ====== ANA PANO (discord klonu) ======

let dashboardUnsub: (() => void) | null = null;
let serverChannelsUnsub: (() => void) | null = null;
let channelMessagesUnsub: (() => void) | null = null;
let currentServerCode: string | null = null;
let currentChannelId: string | null = null;
let userServersCache: any[] = [];
let memberListUnsub: (() => void) | null = null;

function panoyuBaslat(): void {
  yonlendirmeSonuc().catch(() => {});

  const serverList = document.getElementById("server-list");
  const channelSidebar = document.getElementById("channel-sidebar");
  const serverNameEl = document.getElementById("server-name");
  const channelList = document.getElementById("channel-list");
  const chatArea = document.getElementById("chat-area");
  const welcomeState = document.getElementById("welcome-state");
  const homeState = document.getElementById("home-state");
  const messagesEl = document.getElementById("server-messages");
  const inputEl = document.getElementById("server-message-input") as HTMLInputElement | null;
  const sendBtn = document.getElementById("server-send-btn");
  const channelNameEl = document.getElementById("channel-name");

  // User profile in channel sidebar
  const profileName = document.getElementById("profile-name");
  const profileAvatar = document.getElementById("profile-avatar");
  const logoutBtn = document.getElementById("profile-logout-btn");
  const settingsBtn = document.getElementById("profile-settings-btn");

  const user = auth.currentUser;
  if (user) {
    if (profileName) profileName.textContent = user.displayName || user.email?.split("@")[0] || "User";
    if (profileAvatar) {
      profileAvatar.innerHTML = `<div class="initials">${(user.displayName || user.email || "U")[0].toUpperCase()}</div>`;
    }
    profilGetir(user.uid).then((p) => {
      if (p.photoURL && profileAvatar) {
        profileAvatar.innerHTML = `<img src="${p.photoURL}" alt="" />`;
      }
    });

    // Claim Parax Official ownership if email matches
    if (user.email === "meric.yesiltas2014@gmail.com") {
      db.collection("servers").doc(PARAX_OFFICIAL_CODE).update({
        ownerId: user.uid,
        ownerName: user.displayName || "meric.yesiltas2014",
      }).catch(() => {});
    }
  }

  logoutBtn?.addEventListener("click", async () => {
    abonelikleriTemizle();
    await auth.signOut();
    window.location.href = "/";
  });

  settingsBtn?.addEventListener("click", () => {
    window.location.href = "/settings.html";
  });

  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  mobileMenuBtn?.addEventListener("click", () => {
    channelSidebar?.classList.toggle("show");
  });

  // Server list
  dashboardUnsub = kullaniciSunuculari((servers) => {
    userServersCache = servers;
    sunucuListesiGoster(servers);

    // If current server was removed, go back
    if (currentServerCode && !servers.find((s: any) => s.code === currentServerCode)) {
      sunucuSec(null);
    }
  });

  // Home button
  document.getElementById("home-btn")?.addEventListener("click", () => {
    sunucuSec(null);
  });

  // Official server button
  document.getElementById("official-server-btn")?.addEventListener("click", async () => {
    const code = PARAX_OFFICIAL_CODE;
    try {
      const joined = await sunucuyaKatil(code);
      if (joined) {
        sunucuSec(code);
      } else {
        hataGoster("Could not join Parax Official");
      }
    } catch (err: any) {
      hataGoster("Failed: " + err.message);
    }
  });

  // Add server button
  document.getElementById("add-server-btn")?.addEventListener("click", () => {
    gosterModal("create-server-modal");
    document.getElementById("server-name-input")?.focus();
  });

  // Create server modal
  document.getElementById("create-server-cancel")?.addEventListener("click", () => {
    gizleModal("create-server-modal");
  });
  document.getElementById("create-server-confirm")?.addEventListener("click", async () => {
    const input = document.getElementById("server-name-input") as HTMLInputElement;
    const name = input?.value.trim();
    if (!name) {
      hataGoster("Server name is required");
      return;
    }
    try {
      gizleModal("create-server-modal");
      input.value = "";
      const code = await sunucuAc(name);
      sunucuSec(code);
    } catch (err: any) {
      hataGoster("Failed to create server: " + err.message);
    }
  });
  document.getElementById("server-name-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") (document.getElementById("create-server-confirm") as HTMLElement)?.click();
  });

  // Join server modal
  document.getElementById("join-server-btn")?.addEventListener("click", () => {
    gosterModal("join-server-modal");
    document.getElementById("join-server-input")?.focus();
  });
  document.getElementById("join-server-cancel")?.addEventListener("click", () => {
    gizleModal("join-server-modal");
    document.getElementById("join-invite-group")!.style.display = "none";
  });
  document.getElementById("join-server-confirm")?.addEventListener("click", async () => {
    const input = document.getElementById("join-server-input") as HTMLInputElement;
    const code = input?.value.trim();
    if (!code || code.length !== 11 || !/^\d{11}$/.test(code)) {
      hataGoster("Enter a valid 11-digit server code");
      return;
    }
    const inviteInput = document.getElementById("join-invite-input") as HTMLInputElement;
    const inviteCode = inviteInput?.value.trim() || undefined;
    try {
      const joined = await sunucuyaKatil(code, inviteCode);
      if (!joined) {
        hataGoster("Server not found or invalid invite code");
        return;
      }
      gizleModal("join-server-modal");
      document.getElementById("join-invite-group")!.style.display = "none";
      input.value = "";
      if (inviteInput) inviteInput.value = "";
      sunucuSec(code);
    } catch (err: any) {
      hataGoster("Failed to join: " + err.message);
    }
  });
  document.getElementById("join-server-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") (document.getElementById("join-server-confirm") as HTMLElement)?.click();
  });
  document.getElementById("join-server-input")?.addEventListener("input", async (e) => {
    const el = e.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, "").slice(0, 11);
    const code = el.value.trim();
    const inviteGroup = document.getElementById("join-invite-group");
    if (code.length === 11) {
      try {
        const serverDoc = await db.collection("servers").doc(code).get();
        const joinType = serverDoc.data()?.joinType || "open";
        inviteGroup!.style.display = joinType === "invite" ? "block" : "none";
      } catch {
        inviteGroup!.style.display = "none";
      }
    } else {
      inviteGroup!.style.display = "none";
    }
  });

  // Create channel modal
  document.getElementById("add-channel-btn")?.addEventListener("click", async () => {
    if (currentServerCode) {
      const allowed = await yetkisiVarMi(currentServerCode, "manage_channels");
      if (!allowed) {
        hataGoster("You don't have permission to create channels");
        return;
      }
    }
    gosterModal("create-channel-modal");
    document.getElementById("channel-name-input")?.focus();
  });
  document.getElementById("create-channel-cancel")?.addEventListener("click", () => {
    gizleModal("create-channel-modal");
  });
  document.getElementById("create-channel-confirm")?.addEventListener("click", async () => {
    const input = document.getElementById("channel-name-input") as HTMLInputElement;
    const name = input?.value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) {
      hataGoster("Channel name is required");
      return;
    }
    if (!currentServerCode) return;
    const typeEl = document.querySelector('input[name="channel-type"]:checked') as HTMLInputElement;
    const type = typeEl?.value || "text";
    try {
      gizleModal("create-channel-modal");
      input.value = "";
      await kanalAc(currentServerCode, name, type);
    } catch (err: any) {
      hataGoster("Failed to create channel: " + err.message);
    }
  });
  document.getElementById("channel-name-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") (document.getElementById("create-channel-confirm") as HTMLElement)?.click();
  });

  // Leave server
  document.getElementById("server-leave-btn")?.addEventListener("click", async () => {
    if (!currentServerCode || !user) return;
    if (currentServerCode === PARAX_OFFICIAL_CODE) {
      hataGoster("Cannot leave the official server");
      return;
    }
    if (!confirm("Leave this server?")) return;
    try {
      await db.collection("serverMembers").doc(uyeDokumanId(user.uid, currentServerCode)).delete();
      sunucuSec(null);
    } catch (err: any) {
      hataGoster("Failed to leave: " + err.message);
    }
  });

  // Send message
  const send = () => {
    const text = inputEl?.value.trim();
    const cid = currentChannelId;
    const sc = currentServerCode;
    if (!text || !cid) return;
    if (sc) {
      yetkisiVarMi(sc, "send_messages").then((allowed) => {
        if (!allowed) {
          hataGoster("You don't have permission to send messages");
          return;
        }
        kanalMesajGonder(cid, text).catch((err: any) => {
          hataGoster("Failed to send: " + err.message);
        });
        if (inputEl) { inputEl.value = ""; inputEl.focus(); }
      });
      return;
    }
    kanalMesajGonder(cid, text).catch((err: any) => {
      hataGoster("Failed to send: " + err.message);
    });
    if (inputEl) { inputEl.value = ""; inputEl.focus(); }
  };

  sendBtn?.addEventListener("click", send);
  inputEl?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") send();
  });

  // Server header dropdown
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
    gosterModal("roles-modal");
    rollerModalGoster();
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
    gosterModal("invites-modal");
    davetListesiGoster();
  });

  // Roles modal
  document.getElementById("roles-modal-close")?.addEventListener("click", () => {
    gizleModal("roles-modal");
  });

  // Create role modal
  document.getElementById("create-role-btn")?.addEventListener("click", () => {
    gizleModal("roles-modal");
    gosterModal("create-role-modal");
    document.getElementById("role-name-input")?.focus();
  });

  document.getElementById("create-role-cancel")?.addEventListener("click", () => {
    gizleModal("create-role-modal");
  });

  document.getElementById("create-role-confirm")?.addEventListener("click", async () => {
    const input = document.getElementById("role-name-input") as HTMLInputElement;
    const name = input?.value.trim();
    if (!name || !currentServerCode) return;
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
      gizleModal("create-role-modal");
      input.value = "";
      gosterModal("roles-modal");
      rollerModalGoster();
    } catch (err: any) {
      hataGoster("Failed to create role");
    }
  });

  // Invites modal
  document.getElementById("invites-modal-close")?.addEventListener("click", () => {
    gizleModal("invites-modal");
  });
  document.getElementById("generate-invite-btn")?.addEventListener("click", async () => {
    if (!currentServerCode) return;
    try {
      const inviteCode = await davetKoduOlustur(currentServerCode);
      davetListesiGoster();
      hataGoster("Invite created: " + inviteCode, "success");
    } catch (err: any) {
      hataGoster("Failed to create invite");
    }
  });

  // Flash messages
  const flash = sessionStorage.getItem("flash_error");
  if (flash) {
    sessionStorage.removeItem("flash_error");
    hataGoster(flash);
  }
}

// sunucu listesini çizdir

function sunucuListesiGoster(servers: any[]): void {
  const serverList = document.getElementById("server-list");
  if (!serverList) return;
  serverList.innerHTML = servers.map((s) => {
    const isActive = s.code === currentServerCode;
    const initial = (s.name || "S")[0].toUpperCase();
    return `
      <div class="server-item ${isActive ? "active" : ""}" data-code="${s.code}" title="${temizle(s.name)}">
        <span class="server-initials">${initial}</span>
      </div>
    `;
  }).join("");

  serverList.querySelectorAll(".server-item").forEach((el) => {
    el.addEventListener("click", () => {
      const code = (el as HTMLElement).dataset.code;
      if (code) sunucuSec(code);
    });
  });
}

// server / kanal seçimi

function sunucuSec(code: string | null): void {
  // Cleanup previous channel subs
  if (channelMessagesUnsub) { channelMessagesUnsub(); channelMessagesUnsub = null; }
  if (serverChannelsUnsub) { serverChannelsUnsub(); serverChannelsUnsub = null; }

  currentServerCode = code;
  currentChannelId = null;

  const channelSidebar = document.getElementById("channel-sidebar");
  const serverNameEl = document.getElementById("server-name");
  const welcomeState = document.getElementById("welcome-state");
  const homeState = document.getElementById("home-state");
  const chatArea = document.getElementById("chat-area");

  // Update home button active state
  const homeBtn = document.getElementById("home-btn");
  if (homeBtn) homeBtn.classList.toggle("active", !code);

  // Update server list active state
  document.querySelectorAll(".server-item[data-code]").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.code === code);
  });

  // Update official server active state
  const officialBtn = document.getElementById("official-server-btn");
  if (officialBtn) {
    officialBtn.classList.toggle("active", code === PARAX_OFFICIAL_CODE);
  }

  // Cleanup member list
  if (memberListUnsub) { memberListUnsub(); memberListUnsub = null; }
  document.getElementById("member-list")!.innerHTML = "";
  const memberListSidebar = document.getElementById("member-list-sidebar");
  if (memberListSidebar) memberListSidebar.classList.add("hidden");

  if (!code) {
    // Show home
    channelSidebar?.classList.add("hidden");
    welcomeState?.classList.add("hidden");
    chatArea?.classList.add("hidden");
    homeState?.classList.remove("hidden");
    anaSayfaOdalari();
    return;
  }

  homeState?.classList.add("hidden");
  welcomeState?.classList.add("hidden");
  chatArea?.classList.add("hidden");
  channelSidebar?.classList.remove("hidden");
  // Show member list and load members
  if (memberListSidebar) memberListSidebar.classList.remove("hidden");
  memberListUnsub = uyeleriYukle(code, (members) => {
    uyeListesiGoster(members, code);
  });

  const server = userServersCache.find((s) => s.code === code);
  if (serverNameEl) {
    serverNameEl.textContent = server?.name || "Server";
    if (!server) {
      sunucuGetir(code).then((s) => {
        if (s && serverNameEl) serverNameEl.textContent = s.name;
      });
    }
  }

  // Load channels
  serverChannelsUnsub = kanallariYukle(code, (channels) => {
    kanalListesiGoster(channels, code);
    if (channels.length > 0 && !currentChannelId) {
      kanalSec(channels[0].id, channels[0].name, code);
    }
  });

  // Show/hide add channel button based on permission
  kanalButonGuncelle(code);

  // Load members
  memberListUnsub = uyeleriYukle(code, (members) => {
    uyeListesiGoster(members, code);
  });
}

function uyeListesiGoster(members: any[], serverCode: string): void {
  if (serverCode !== currentServerCode) return;
  const container = document.getElementById("member-list");
  if (!container) return;
  const memberListSidebar = document.getElementById("member-list-sidebar");
  if (memberListSidebar) memberListSidebar.classList.remove("hidden");

  const count = document.getElementById("member-count");
  if (count) count.textContent = members.length + " member" + (members.length !== 1 ? "s" : "");

  container.innerHTML = members.map((m) => {
    const initial = (m.username || "U")[0].toUpperCase();
    const avatarHtml = m.photoURL
      ? `<img src="${temizle(m.photoURL)}" alt="" class="member-avatar-img" />`
      : `<span class="member-avatar-initials">${initial}</span>`;
    const roleDot = m.roleColor
      ? `<span class="member-role-dot" style="background:${m.roleColor}"></span>`
      : "";
    return `
      <div class="member-item" title="${temizle(m.username)}">
        <div class="member-avatar">${avatarHtml}</div>
        <div class="member-info">
          <span class="member-name">${temizle(m.username)}</span>
          <div class="member-role-row">${roleDot}${m.roleName ? `<span class="member-role-label">${temizle(m.roleName)}</span>` : ""}</div>
        </div>
      </div>
    `;
  }).join("");
}

async function kanalButonGuncelle(serverCode: string): Promise<void> {
  const btn = document.getElementById("add-channel-btn");
  if (!btn) return;
  const allowed = await yetkisiVarMi(serverCode, "manage_channels");
  btn.style.display = allowed ? "" : "none";
}

function rollerModalGoster(): void {
  if (!currentServerCode) return;
  const container = document.getElementById("roles-list");
  if (!container) return;

  rolleriYukle(currentServerCode, (roles) => {
    container.innerHTML = roles.map((r) => {
      const perms = r.permissions || {};
      return `
        <div class="role-card" data-role-id="${r.id}">
          <div class="role-card-header">
            <span class="role-name" style="color:${r.color || "#949ba4"}">${temizle(r.name)}</span>
            <span class="role-badge" style="background:${r.color || "#949ba4"}"></span>
          </div>
          <div class="role-permissions">
            ${Object.keys(perms).map((p) => `
              <label class="role-perm-item">
                <input type="checkbox" ${perms[p] ? "checked" : ""} data-perm="${p}" data-role-id="${r.id}" ${r.isDefault ? "disabled" : ""} />
                <span>${temizle(p.replace(/_/g, " "))}</span>
              </label>
            `).join("")}
          </div>
          ${!r.isDefault ? `<button class="btn btn-sm btn-secondary role-delete-btn" data-role-id="${r.id}">Delete</button>` : ""}
        </div>
      `;
    }).join("");

    container.querySelectorAll('input[type="checkbox"][data-role-id]').forEach((el) => {
      el.addEventListener("change", async (e) => {
        const cb = e.target as HTMLInputElement;
        const roleId = cb.dataset.roleId;
        const perm = cb.dataset.perm;
        if (!roleId || !perm || !currentServerCode) return;
        try {
          const roleRef = db.collection("servers").doc(currentServerCode).collection("roles").doc(roleId);
          await roleRef.update({ ["permissions." + perm]: cb.checked });
        } catch (err: any) {
          hataGoster("Failed to update permission");
        }
      });
    });

    container.querySelectorAll(".role-delete-btn").forEach((el) => {
      el.addEventListener("click", async () => {
        const roleId = (el as HTMLElement).dataset.roleId;
        if (!roleId || !currentServerCode) return;
        if (!confirm("Delete this role?")) return;
        try {
          await db.collection("servers").doc(currentServerCode).collection("roles").doc(roleId).delete();
          rollerModalGoster();
        } catch (err: any) {
          hataGoster("Failed to delete role");
        }
      });
    });
  });
}

function kanalListesiGoster(channels: any[], serverCode: string): void {
  if (serverCode !== currentServerCode) return;

  const textChannels = channels.filter((ch) => ch.type !== "voice");
  const voiceChannels = channels.filter((ch) => ch.type === "voice");

  const textList = document.getElementById("channel-list");
  const voiceList = document.getElementById("voice-channel-list");

  if (textList) {
    if (textChannels.length === 0) {
      textList.innerHTML = '<div class="channel-empty">No channels yet</div>';
    } else {
      textList.innerHTML = textChannels.map((ch) => {
        const isActive = ch.id === currentChannelId;
        return `
          <div class="channel-item ${isActive ? "active" : ""}" data-channel-id="${ch.id}" data-channel-name="${temizle(ch.name)}" data-channel-type="text">
            <span class="channel-hash">#</span>
            <span class="channel-name">${temizle(ch.name)}</span>
          </div>
        `;
      }).join("");
      textList.querySelectorAll(".channel-item").forEach((el) => {
        el.addEventListener("click", () => {
          const id = (el as HTMLElement).dataset.channelId;
          const name = (el as HTMLElement).dataset.channelName;
          if (id && name) kanalSec(id, name, serverCode);
        });
      });
    }
  }

  if (voiceList) {
    if (voiceChannels.length === 0) {
      voiceList.innerHTML = '<div class="channel-empty">No voice channels yet</div>';
    } else {
      voiceList.innerHTML = voiceChannels.map((ch) => {
        const isVoiceActive = typeof ParaVoice !== "undefined" && ParaVoice.isActive() && ParaVoice.getActiveChannelId() === ch.id;
        return `
          <div class="channel-item channel-voice ${isVoiceActive ? "active" : ""}" data-channel-id="${ch.id}" data-channel-name="${temizle(ch.name)}" data-channel-type="voice">
            <span class="channel-hash">🔊</span>
            <span class="channel-name">${temizle(ch.name)}</span>
          </div>
        `;
      }).join("");
      voiceList.querySelectorAll(".channel-item").forEach((el) => {
        el.addEventListener("click", () => {
          const id = (el as HTMLElement).dataset.channelId;
          const name = (el as HTMLElement).dataset.channelName;
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

function kanalSec(channelId: string, channelName: string, serverCode: string): void {
  if (serverCode !== currentServerCode) return;
  if (channelMessagesUnsub) { channelMessagesUnsub(); channelMessagesUnsub = null; }

  currentChannelId = channelId;

  // Check if this is a voice channel
  const chEl = document.querySelector(`.channel-item[data-channel-id="${channelId}"]`);
  const isVoice = chEl?.getAttribute("data-channel-type") === "voice";

  // Update channel list active state
  document.querySelectorAll(".channel-item").forEach((el) => {
    el.classList.toggle("active", (el as HTMLElement).dataset.channelId === channelId);
  });

  const chatArea = document.getElementById("chat-area");
  const welcomeState = document.getElementById("welcome-state");
  const channelNameEl = document.getElementById("channel-name");
  const channelHash = document.getElementById("channel-hash");
  const messagesEl = document.getElementById("server-messages");
  const inputEl = document.getElementById("server-message-input") as HTMLInputElement | null;
  const inputBar = document.querySelector(".chat-input-bar") as HTMLElement | null;
  const voiceContainer = document.getElementById("voice-container");

  welcomeState?.classList.add("hidden");
  chatArea?.classList.remove("hidden");

  if (isVoice) {
    // Voice channel: show voice container, hide messages + input
    if (channelHash) channelHash.textContent = "🔊";
    if (channelNameEl) channelNameEl.textContent = channelName;
    if (inputBar) inputBar.style.display = "none";
    if (messagesEl) messagesEl.style.display = "none";
    if (voiceContainer) voiceContainer.classList.remove("hidden");
  } else {
    // Text channel: show messages + input, hide voice container
    if (channelHash) channelHash.textContent = "#";
    if (inputBar) inputBar.style.display = "";
    if (messagesEl) messagesEl.style.display = "";
    if (voiceContainer) voiceContainer.classList.add("hidden");

    if (channelNameEl) channelNameEl.textContent = channelName;
    if (inputEl) inputEl.placeholder = "Message #" + channelName;
    if (messagesEl) messagesEl.innerHTML = '<div class="chat-loading">Loading messages...</div>';

    channelMessagesUnsub = kanalMesajlariYukle(channelId, (messages) => {
      if (!messagesEl) return;
      if (messages.length === 0) {
        messagesEl.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation!</div>';
      } else {
        const wasEmpty = messagesEl.querySelector(".chat-empty, .chat-loading") !== null;
        const isAtBottom = wasEmpty || messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
        messagesEl.innerHTML = messages.map((m) => {
          const time = m.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "";
          return `
            <div class="message ${m.senderId === auth.currentUser?.uid ? "message-own" : ""}">
              <div class="message-header">
                <span class="message-sender">${temizle(m.senderName)}</span>
                <span class="message-time">${time}</span>
              </div>
              <div class="message-text">${temizle(m.text)}</div>
            </div>
          `;
        }).join("");
        if (isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }
}

const inputEl = document.getElementById("server-message-input") as HTMLInputElement | null;

// eski oda sistemi (anasayfa)

let homeRoomsUnsub: (() => void) | null = null;

function anaSayfaOdalari(): void {
  const container = document.getElementById("home-rooms");
  if (!container) return;
  if (homeRoomsUnsub) {
    homeRoomsUnsub();
    homeRoomsUnsub = null;
  }
  homeRoomsUnsub = kullaniciOdalari((rooms) => {
    if (rooms.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">You\'re not in any servers yet. Create one or join with a code!</p>';
    } else {
      container.innerHTML = rooms.map((r) => `
        <a href="/chat.html?code=${r.code}" class="home-room-item">
          <span class="home-room-code">${temizle(r.code)}</span>
          <span>${r.createdAt?.toDate?.()?.toLocaleDateString() || ""}</span>
        </a>
      `).join("");
    }
  });
}

// modal aç/kapa

function gosterModal(id: string): void {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function gizleModal(id: string): void {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// abonelikleri temizle

function abonelikleriTemizle(): void {
  if (dashboardUnsub) { dashboardUnsub(); dashboardUnsub = null; }
  if (serverChannelsUnsub) { serverChannelsUnsub(); serverChannelsUnsub = null; }
  if (channelMessagesUnsub) { channelMessagesUnsub(); channelMessagesUnsub = null; }
  if (homeRoomsUnsub) { homeRoomsUnsub(); homeRoomsUnsub = null; }
  if (memberListUnsub) { memberListUnsub(); memberListUnsub = null; }
}

function odaSifreSor(code: string, correctPassword: string): void {}

// chat.html

let chatUnsub: (() => void) | null = null;
let currentRoomCode: string | null = null;

function temizle(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sohbetiBaslat(): void {
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

  odaGetir(roomCode).then(async (room) => {
    if (!room) {
      if (messagesEl) messagesEl.innerHTML = '<div class="chat-error">Room not found. <a href="/dashboard.html">Go back</a></div>';
      return;
    }
    if (room.passwordHash || room.password) {
      const storedPass = sessionStorage.getItem("room_pass_" + roomCode);
      if (!storedPass) {
        sessionStorage.setItem("flash_error", "This room requires a password");
        window.location.href = "/dashboard.html";
        return;
      }
      if (room.passwordHash) {
        const inputHash = await sifreHashle(storedPass);
        if (inputHash !== room.passwordHash) {
          sessionStorage.setItem("flash_error", "Incorrect password");
          window.location.href = "/dashboard.html";
          return;
        }
      } else if (storedPass !== room.password) {
        sessionStorage.setItem("flash_error", "Incorrect password");
        window.location.href = "/dashboard.html";
        return;
      }
    }

    chatUnsub = mesajlariYukle(roomCode, (messages) => {
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
                <span class="message-sender">${temizle(m.senderName)}</span>
                <span class="message-time">${time}</span>
              </div>
              <div class="message-text">${temizle(m.text)}</div>
            </div>
          `;
        }).join("");
        if (isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  });

  const send = () => {
    if (!inputEl?.value.trim()) return;
    mesajGonder(roomCode, inputEl.value).catch((err: any) => {
      hataGoster("Failed to send: " + err.message);
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

// oturum dinleyici

function oturumDinle(currentPage: string): void {
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

    navBarGuncelle(user);
  });
}

function navBarGuncelle(user: any): void {
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
      profilGetir(user.uid).then(p => {
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
        abonelikleriTemizle();
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

// ufak tefek yardımcılar

(window as any).hataGoster = hataGoster;
(window as any).sifremiUnuttum = sifremiUnuttum;

async function sifremiUnuttum(identifier: string): Promise<void> {
  let email = identifier;
  // Basit email kontrolü
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    // kullanıcı adı varsayıyoruz
    const snapshot = await db.collection("users").where("username", "==", identifier).get();
    if (snapshot.empty) throw new Error("Kullanıcı bulunamadı.");
    email = snapshot.docs[0].data().email;
  }
  await auth.sendPasswordResetEmail(email);
}

function hataGoster(message: string, type?: string): void {
  if (!message) return;
  // hata mesajlarını da logluyoruz, ileride işe yarayabilir
  if (typeof Para !== "undefined") Para.capture(message, { type: "ui", context: "hataGoster" });
  const errorEl = document.createElement("div");
  errorEl.className = "auth-error" + (type === "success" ? " auth-success" : "");
  errorEl.textContent = message;
  document.body.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 5000);
}

// şifre göster/gizle butonu

function sifreGosterGizle(): void {
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

// form doğrulama yardımcıları

function hataAyarla(input: HTMLInputElement, message: string): void {
  input.classList.add("error");
  input.classList.remove("valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
}

function dogruAyarla(input: HTMLInputElement): void {
  input.classList.remove("error");
  input.classList.add("valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.classList.remove("visible");
  }
}

function temizleDurum(input: HTMLInputElement): void {
  input.classList.remove("error", "valid");
  const errorEl = input.closest(".form-group")?.querySelector<HTMLElement>(".error-message");
  if (errorEl) {
    errorEl.classList.remove("visible");
  }
}

function mailKontrol(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function kullaniciAdiKontrol(username: string): boolean {
  return username.length >= 3 && username.length <= 32;
}

function sifreKontrol(password: string): boolean {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function sifrelerEslesiyor(a: string, b: string): boolean {
  return a === b;
}

// kayıt formu

function kayitKontrol(): void {
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
        await googleIleGir();
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = authHatasi(error);
        if (msg) hataGoster(msg);
      }
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener("blur", () => {
      const val = usernameInput.value.trim();
      if (!val) {
        hataAyarla(usernameInput, "Username is required.");
      } else if (!kullaniciAdiKontrol(val)) {
        hataAyarla(usernameInput, "Must be between 3 and 32 characters.");
      } else {
        dogruAyarla(usernameInput);
      }
    });
    usernameInput.addEventListener("input", () => temizleDurum(usernameInput));
  }

  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      const val = emailInput.value.trim();
      if (!val) {
        hataAyarla(emailInput, "Email is required.");
      } else if (!mailKontrol(val)) {
        hataAyarla(emailInput, "Please enter a valid email address.");
      } else {
        dogruAyarla(emailInput);
      }
    });
    emailInput.addEventListener("input", () => temizleDurum(emailInput));
  }

  if (passwordInput) {
    passwordInput.addEventListener("blur", () => {
      const val = passwordInput.value;
      if (!val) {
        hataAyarla(passwordInput, "Password is required.");
      } else if (!sifreKontrol(val)) {
        hataAyarla(passwordInput, "Must be at least 8 characters with uppercase, lowercase, number, and special character.");
      } else {
        dogruAyarla(passwordInput);
      }
    });
    passwordInput.addEventListener("input", () => temizleDurum(passwordInput));
  }

  if (confirmInput) {
    confirmInput.addEventListener("blur", () => {
      const val = confirmInput.value;
      const password = passwordInput?.value ?? "";
      if (!val) {
        hataAyarla(confirmInput, "Please confirm your password.");
      } else if (!sifrelerEslesiyor(val, password)) {
        hataAyarla(confirmInput, "Passwords do not match.");
      } else {
        dogruAyarla(confirmInput);
      }
    });
    confirmInput.addEventListener("input", () => temizleDurum(confirmInput));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    let valid = true;

    if (usernameInput) {
      const val = usernameInput.value.trim();
      if (!val || !kullaniciAdiKontrol(val)) {
        hataAyarla(usernameInput, !val ? "Username is required." : "Must be between 3 and 32 characters.");
        valid = false;
      } else {
        dogruAyarla(usernameInput);
      }
    }

    if (emailInput) {
      const val = emailInput.value.trim();
      if (!val || !mailKontrol(val)) {
        hataAyarla(emailInput, !val ? "Email is required." : "Please enter a valid email address.");
        valid = false;
      } else {
        dogruAyarla(emailInput);
      }
    }

    if (passwordInput) {
      const val = passwordInput.value;
      if (!val || !sifreKontrol(val)) {
        hataAyarla(passwordInput, !val ? "Password is required." : "Must be at least 8 characters with uppercase, lowercase, number, and special character.");
        valid = false;
      } else {
        dogruAyarla(passwordInput);
      }
    }

    if (confirmInput) {
      const val = confirmInput.value;
      const password = passwordInput?.value ?? "";
      if (!val || !sifrelerEslesiyor(val, password)) {
        hataAyarla(confirmInput, !val ? "Please confirm your password." : "Passwords do not match.");
        valid = false;
      } else {
        dogruAyarla(confirmInput);
      }
    }

    if (valid && usernameInput && emailInput && passwordInput) {
      try {
        const rememberCheckbox = form.querySelector<HTMLInputElement>('input[name="remember"]');
        kalicilikAyarla(rememberCheckbox?.checked ?? false);
        await yeniKayit(
          usernameInput.value.trim(),
          emailInput.value.trim(),
          passwordInput.value
        );
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = authHatasi(error);
        if (msg) hataGoster(msg);
      }
    }
  });
}

// giriş formu

function girisKontrol(): void {
  const form = document.getElementById("login-form") as HTMLFormElement | null;
  if (!form) return;

  const emailInput = form.querySelector<HTMLInputElement>("#email");
  const passwordInput = form.querySelector<HTMLInputElement>("#password");
  const googleBtn = document.getElementById("google-login") as HTMLButtonElement | null;
  const anonymousBtn = document.getElementById("anonymous-login") as HTMLButtonElement | null;

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await googleIleGir();
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = authHatasi(error);
        if (msg) hataGoster(msg);
      }
    });
  }

  if (anonymousBtn) {
    const modal = document.getElementById("username-modal");
    const confirmBtn = document.getElementById("username-confirm");
    const input = document.getElementById("username-input") as HTMLInputElement | null;

    confirmBtn?.addEventListener("click", async () => {
      const username = input?.value.trim();
      if (!username) return alert("Please enter a username");
      
      try {
        await auth.signInAnonymously();
        const user = auth.currentUser;
        if (user) {
          await user.updateProfile({ displayName: username });
          await db.collection("users").doc(user.uid).set({
            username: username,
            isAnonymous: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          window.location.href = "/dashboard.html";
        }
      } catch (error: any) {
        hataGoster(authHatasi(error));
      }
    });

    anonymousBtn.addEventListener("click", () => {
      if (confirm("Warning: Your account is anonymous and all your data will be lost when you close this app or website. Continue?")) {
        modal?.classList.remove("hidden");
      }
    });
  }

  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      const val = emailInput.value.trim();
      if (!val) {
        hataAyarla(emailInput, "Email is required.");
      } else if (!mailKontrol(val)) {
        hataAyarla(emailInput, "Please enter a valid email address.");
      } else {
        dogruAyarla(emailInput);
      }
    });
    emailInput.addEventListener("input", () => temizleDurum(emailInput));
  }

  if (passwordInput) {
    passwordInput.addEventListener("blur", () => {
      if (!passwordInput.value) {
        hataAyarla(passwordInput, "Password is required.");
      } else {
        dogruAyarla(passwordInput);
      }
    });
    passwordInput.addEventListener("input", () => temizleDurum(passwordInput));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    let valid = true;

    if (emailInput) {
      const val = emailInput.value.trim();
      if (!val || !mailKontrol(val)) {
        hataAyarla(emailInput, !val ? "Email is required." : "Please enter a valid email address.");
        valid = false;
      } else {
        dogruAyarla(emailInput);
      }
    }

    if (passwordInput) {
      if (!passwordInput.value) {
        hataAyarla(passwordInput, "Password is required.");
        valid = false;
      } else {
        dogruAyarla(passwordInput);
      }
    }

    if (valid && emailInput && passwordInput) {
      try {
        const rememberCheckbox = form.querySelector<HTMLInputElement>('input[name="remember"]');
        kalicilikAyarla(rememberCheckbox?.checked ?? false);
        await girisYap(emailInput.value.trim(), passwordInput.value);
        window.location.href = "/dashboard.html";
      } catch (error: any) {
        const msg = authHatasi(error);
        if (msg) hataGoster(msg);
      }
    }
  });
}