const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const crypto = require("crypto");

const CLIENT_ID = "277836472816-j9f5hcmpdtogqpsk2k0ap5bss7mco9qf.apps.googleusercontent.com";
const REDIRECT_URI = "https://webappparax.firebaseapp.com/__/auth/handler";

function base64URLEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE() {
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function exchangeCode(code, verifier) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!data.id_token) throw new Error(data.error_description || "Failed to get Google ID token");
  return { idToken: data.id_token, accessToken: data.access_token };
}

ipcMain.handle("sign-in-google", async () => {
  const pkce = await generatePKCE();
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid profile email",
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    });

  const authWindow = new BrowserWindow({
    width: 500,
    height: 650,
    show: true,
    title: "Sign in with Google - Parax",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  authWindow.loadURL(authUrl);

  return new Promise((resolve, reject) => {
    let done = false;

    authWindow.on("closed", () => {
      if (!done) reject(new Error("Sign-in window was closed"));
    });

    authWindow.webContents.on("did-navigate", (event, url) => {
      if (done) return;
      if (!url.startsWith(REDIRECT_URI)) return;
      const parsed = new URL(url);
      const error = parsed.searchParams.get("error");
      if (error) {
        done = true;
        authWindow.close();
        reject(new Error("Google sign-in error: " + error));
        return;
      }
      const code = parsed.searchParams.get("code");
      if (!code) return;
      done = true;
      authWindow.close();
      exchangeCode(code, pkce.verifier).then(resolve).catch(reject);
    });
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    title: "Parax",
    icon: path.join(__dirname, "Parax.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("https://parax-vqqb.onrender.com");
  win.on("page-title-updated", (e) => e.preventDefault());
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
