const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet());
app.use(cors({ origin: "*" })); // Allow access from Parax frontends
app.use(express.json({ limit: "1mb" }));

// In-memory 24-hour message cache
// Key: channelId, Value: Array of message objects
const messageCache = new Map();

// Helper: Prune messages older than 24 hours
function pruneOldMessages() {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  let totalPruned = 0;

  for (const [channelId, messages] of messageCache.entries()) {
    const validMessages = messages.filter((msg) => {
      const msgTime = new Date(msg.createdAt || msg.timestamp || Date.now()).getTime();
      return msgTime >= cutoff;
    });

    totalPruned += (messages.length - validMessages.length);

    if (validMessages.length > 0) {
      messageCache.set(channelId, validMessages);
    } else {
      messageCache.delete(channelId);
    }
  }

  if (totalPruned > 0) {
    console.log(`[Cache Cleanup] Pruned ${totalPruned} messages older than 24h.`);
  }
}

// Run cleanup every 15 minutes
setInterval(pruneOldMessages, 15 * 60 * 1000);

// Health check endpoint for Fly.io
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "parax-message-cache",
    cachedChannels: messageCache.size,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// GET 24h messages for a specific channel
app.get("/api/messages/:channelId", (req, res) => {
  const { channelId } = req.params;
  const messages = messageCache.get(channelId) || [];

  // Filter out any expired messages before returning
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const freshMessages = messages.filter((msg) => {
    const msgTime = new Date(msg.createdAt || msg.timestamp || Date.now()).getTime();
    return msgTime >= cutoff;
  });

  res.json({
    channelId,
    count: freshMessages.length,
    messages: freshMessages,
  });
});

// POST a new message into the 24h cache
app.post("/api/messages", (req, res) => {
  const { channelId, id, senderId, senderName, text, createdAt } = req.body;

  if (!channelId || !text) {
    return res.status(400).json({ error: "channelId and text are required" });
  }

  const newMsg = {
    id: id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    channelId,
    senderId: senderId || "anonymous",
    senderName: senderName || "Anonymous",
    text,
    createdAt: createdAt || new Date().toISOString(),
  };

  const channelMsgs = messageCache.get(channelId) || [];
  
  // Deduplicate by message ID if present
  const exists = channelMsgs.some((m) => m.id === newMsg.id);
  if (!exists) {
    channelMsgs.push(newMsg);
    // Sort chronologically
    channelMsgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    messageCache.set(channelId, channelMsgs);
  }

  res.status(201).json({ success: true, message: newMsg });
});

// POST bulk sync messages into cache (e.g. from Firestore warm-up)
app.post("/api/messages/bulk-sync", (req, res) => {
  const { channelId, messages } = req.body;

  if (!channelId || !Array.isArray(messages)) {
    return res.status(400).json({ error: "channelId and messages array are required" });
  }

  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const validMsgs = messages.filter((msg) => {
    const msgTime = new Date(msg.createdAt || msg.timestamp || Date.now()).getTime();
    return msgTime >= cutoff;
  });

  const existing = messageCache.get(channelId) || [];
  const map = new Map(existing.map((m) => [m.id, m]));

  for (const msg of validMsgs) {
    map.set(msg.id, msg);
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  messageCache.set(channelId, merged);

  res.json({ success: true, channelId, totalInCache: merged.length });
});

// DELETE a message from cache
app.delete("/api/messages/:channelId/:messageId", (req, res) => {
  const { channelId, messageId } = req.params;
  const channelMsgs = messageCache.get(channelId) || [];

  const updated = channelMsgs.filter((m) => m.id !== messageId);
  messageCache.set(channelId, updated);

  res.json({ success: true, removed: channelMsgs.length - updated.length });
});

app.listen(PORT, () => {
  console.log(`[Fly.io Message Cache] Running on port ${PORT}`);
});
