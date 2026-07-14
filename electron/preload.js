const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  signInWithGoogle: () => ipcRenderer.invoke("sign-in-google"),
});
