import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

const router = Router();

const logLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many log requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/", logLimiter, (req: Request, res: Response) => {
  const data = req.body;
  const ts = new Date().toISOString();

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
