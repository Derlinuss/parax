import { Router, Request, Response } from "express";

const router = Router();

router.post("/", (req: Request, res: Response) => {
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
