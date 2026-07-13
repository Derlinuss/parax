import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const serviceAccount = require("../../serviceAccountKey.json");

const app = initializeApp({
  credential: cert(serviceAccount),
});

export const auth = getAuth(app);
export default app;