import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";

setGlobalOptions({ maxInstances: 10 });

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);

export const api = onRequest(app);
