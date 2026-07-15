const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { shell } = require("electron");

const CLIENT_ID = "277836472816-j9f5hcmpdtogqpsk2k0ap5bss7mco9qf.apps.googleusercontent.com";

function createAuthPage(port) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Parax - Sign in</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1e1f22; color: #f2f3f5; }
    .card { background: #2b2d31; padding: 40px; border-radius: 12px; text-align: center; max-width: 360px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    button { background: #5865f2; color: #fff; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 16px; }
    button:hover { background: #4752c4; }
    p { color: #949ba4; margin-top: 12px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Parax</h2>
    <button id="google-btn">Sign in with Google</button>
    <p id="status">Click the button above to sign in.</p>
  </div>
  <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/11.0.1/firebase-auth-compat.js"></script>
  <script>
    firebase.initializeApp({
      apiKey: "AIzaSyBi6UCjNt6RxB-RrKmDSHuC3Ax9khqzcbg",
      authDomain: "webappparax.firebaseapp.com",
      projectId: "webappparax",
      storageBucket: "webappparax.firebasestorage.app",
      messagingSenderId: "277836472816",
      appId: "1:277836472816:web:e5daae78179110f4527d35"
    });
    const auth = firebase.auth();
    document.getElementById("google-btn").onclick = async () => {
      document.getElementById("status").textContent = "Signing in...";
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await auth.signInWithPopup(provider);
        const oauthCred = result.credential;
        await fetch("http://127.0.0.1:${port}/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: oauthCred.idToken, accessToken: oauthCred.accessToken })
        });
        document.getElementById("status").textContent = "Signed in! You can close this tab.";
      } catch (err) {
        document.getElementById("status").textContent = "Error: " + (err.message || "Sign-in failed");
      }
    };
  </script>
</body>
</html>`;
}

ipcMain.handle("sign-in-google", async () => {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");

      if (url.pathname === "/auth") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(createAuthPage(server.address().port));
        return;
      }

      if (url.pathname === "/token" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            server.close();
            resolve(data);
          } catch (e) {
            res.writeHead(400);
            res.end("bad request");
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("not found");
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      shell.openExternal(`http://127.0.0.1:${port}/auth`);
    });

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Sign-in timed out"));
    }, 300000);

    server.on("close", () => clearTimeout(timeout));
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

  // D?? link'leri sistem taray?c?s?nda a?
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (e, url) => {
    const allowed = ["parax-vqqb.onrender.com", "127.0.0.1", "localhost"];
    const host = new URL(url).hostname;
    if (!allowed.some((a) => host === a || host.endsWith("." + a))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
