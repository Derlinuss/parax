import { Router, Response } from "express";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth";
import { db } from "../config/firebase";
import { getMetrics } from "../utils/metrics";

const router = Router();

const ADMIN_EMAIL = "Parax@parax.com";

const isAdmin = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (req.user?.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  next();
};

router.get("/system", verifyToken, isAdmin, async (req, res) => {
  try {
    const response = await fetch(`https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}`, {
      headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` }
    });
    const data = await response.json();
    const metrics = getMetrics();
    
    res.json({
        uptime: data.service?.serviceStatus === "live" ? "Live" : "Down",
        latency: metrics.latency,
        memory: metrics.memory,
        errorRate: "0.00% (Last 24h)" // Placeholder based on logs
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch system metrics" });
  }
});

router.get("/users", verifyToken, isAdmin, async (req, res) => {
    try {
        const usersSnapshot = await db.collection("users").get();
        const totalUsers = usersSnapshot.size;
        
        // This is still an approximation based on total users as we lack real-time presence
        res.json({
            concurrent: totalUsers,
            signupVelocity: 0, // Would need "createdAt" query for real velocity
            trafficHistory: [totalUsers, totalUsers, totalUsers, totalUsers, totalUsers, totalUsers, totalUsers],
            authMethods: [totalUsers, 0, 0] // Need to store auth provider to fix
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user metrics" });
    }
});

router.get("/logs", verifyToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection("errors").orderBy("timestamp", "desc").limit(50).get();
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
        res.json(logs.map(log => ({
            time: log.timestamp || "N/A",
            level: 'ERROR',
            source: log.type || "Unknown",
            message: log.message || "No message",
            trace: log.stack || "No trace"
        })));
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch logs" });
    }
});

export default router;
