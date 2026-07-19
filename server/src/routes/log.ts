import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../config/firebase";

const router = Router();

const logLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many log requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", logLimiter, async (req: Request, res: Response) => {
  const data = req.body;
  const ts = new Date().toISOString();

  try {
    await db.collection("errors").add({
      ...data,
      timestamp: ts,
    });
  } catch (e) {
    console.error("Failed to log error to firestore", e);
  }

  console.error(`[Para:${ts}] ${data.type || "manual"} | ${data.message || "(no message)"}`);
  if (data.stack) {
    console.error(`[Para:${ts}] Stack:\n${data.stack.slice(0, 2000)}`);
  }
  if (data.url) {
    console.error(`[Para:${ts}] URL: ${data.url}`);
  }

  res.status(200).json({ ok: true });
});

export default router;
