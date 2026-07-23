/**
 * Parax Fly.io Microservices Configuration
 * 
 * Update these URLs with your deployed Fly.io application domains.
 */
window.FLY_SERVICES = {
  // 24-Hour Message Cache Microservice
  MESSAGE_CACHE: window.location.hostname === "localhost" 
    ? "http://localhost:8080" 
    : "https://parax-message-cache.fly.dev",

  // Camera & Screen Sharing Signaling Microservice
  MEDIA_SERVER: window.location.hostname === "localhost"
    ? "ws://localhost:8081"
    : "wss://parax-media-server.fly.dev"
};

/**
 * Message Cache Helper
 */
window.ParaxFly = {
  // Post message to Fly.io 24-hour cache
  async cacheMessage(msgData) {
    try {
      const url = `${window.FLY_SERVICES.MESSAGE_CACHE}/api/messages`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msgData)
      });
    } catch (err) {
      console.warn("[Fly.io Cache Warning] Failed to send message to Fly cache:", err.message);
    }
  },

  // Fetch 24-hour cached messages from Fly.io
  async getCachedMessages(channelId) {
    try {
      const url = `${window.FLY_SERVICES.MESSAGE_CACHE}/api/messages/${channelId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (err) {
      console.warn("[Fly.io Cache Warning] Failed to fetch from Fly cache:", err.message);
    }
    return null;
  }
};
