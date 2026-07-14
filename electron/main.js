const { app, BrowserWindow } = require("electron");
const path = require("path");

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
      nativeWindowOpen: true,
    },
  });

  win.loadURL("https://parax-vqqb.onrender.com");
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));

  win.on("page-title-updated", (e) => e.preventDefault());
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
