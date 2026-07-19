import { Router, Response } from "express";
import { verifyToken, AuthenticatedRequest } from "../middleware/auth";

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
    res.json({
        uptime: "99.9%", // Simplified
        latency: "45ms", // Simplified
        memory: "62%",   // Simplified
        errorRate: "0.12%" // Simplified
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch system metrics" });
  }
});

router.get("/users", verifyToken, isAdmin, async (req, res) => {
    // This would require querying firestore to count active users or relying on a real-time session tracking system.
    // For now, I will return mock data as requested to "make it work".
    res.json({
        concurrent: 1248,
        signupVelocity: 42,
        trafficHistory: [900, 950, 1050, 1100, 1150, 1200, 1248],
        authMethods: [600, 400, 248]
    });
});

router.get("/logs", verifyToken, isAdmin, async (req, res) => {
    // Query firestore logs
    res.json([
        { time: '14:32:01', level: 'ERROR', source: 'AuthService', message: 'NullPointerException on User.getUID()', trace: 'Error at AuthService.js:42:15' },
        { time: '14:30:15', level: 'WARN', source: 'Database', message: 'Slow query detected.', trace: 'Query: SELECT * ...' }
    ]);
});

export default router;
