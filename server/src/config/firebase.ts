import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";

if (!getApps().length) {
  const keyPath = path.join(__dirname, "../../serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    initializeApp({ credential: cert(require(keyPath)) });
  } else {
    initializeApp();
  }
}

export const auth = getAuth();