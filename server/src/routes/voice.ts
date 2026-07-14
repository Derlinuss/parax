import { Router, Response } from "express";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth";
import "../config/firebase";

const router = Router();

router.post("/create-room", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.DAILY_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "DAILY_API_KEY not configured on server" });
    return;
  }

  try {
    const body = JSON.stringify({
      properties: {
        enable_prejoin_ui: false,
        enable_chat: true,
        enable_screenshare: true,
        exp: Math.round(Date.now() / 1000) + 7200,
        eject_at_room_exp: true,
        max_participants: 10,
      },
    });

    const dailyRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const data = await dailyRes.json();

    if (!dailyRes.ok) {
      res.status(500).json({ error: data.info || "Failed to create Daily.co room" });
      return;
    }

    res.json({ url: data.url, name: data.name });
  } catch (error) {
    res.status(500).json({ error: "Failed to create voice room" });
  }
});

export default router;
