import { Router, Response } from "express";
import rateLimit from "express-rate-limit";
import { AccessToken } from "livekit-server-sdk";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth";
import "../config/firebase";

const router = Router();

const voiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many voice token requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/token", voiceLimiter, verifyToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const apiKey = process.env.LIVEKIT_API_KEY || "paraxkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "paraxsecret1234567890abcdef";
  const livekitUrl = process.env.LIVEKIT_URL || "wss://parax-livekit.fly.dev";

  const roomName = req.body.roomName || "parax-general-room";
  const participantName = req.user.displayName || req.user.email || "User";

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.user.uid,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.json({
      token,
      url: livekitUrl,
      roomName,
    });
  } catch (error: any) {
    console.error("[LiveKit Token Error]:", error);
    res.status(500).json({ error: "Failed to generate LiveKit token" });
  }
});

export default router;
