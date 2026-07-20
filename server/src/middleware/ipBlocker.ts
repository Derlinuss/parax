import { Request, Response, NextFunction } from "express";
import { db } from "../config/firebase";

// In-memory cache for fast lookups
let blockedIPs = new Set<string>();

// Refresh blacklist from Firestore periodically
async function refreshBlacklist() {
    try {
        const snapshot = await db.collection("firewall").get();
        const newBlockedIPs = new Set<string>();
        snapshot.forEach(doc => {
            newBlockedIPs.add(doc.id);
        });
        blockedIPs = newBlockedIPs;
        console.log(`[Security] Firewall blacklist updated. ${blockedIPs.size} IPs blocked.`);
    } catch (error) {
        console.error("[Security] Failed to refresh blacklist:", error);
    }
}

// Refresh every 5 minutes
setInterval(refreshBlacklist, 5 * 60 * 1000);
refreshBlacklist();

export const ipBlocker = (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for'] as string || "unknown";
    
    if (blockedIPs.has(ip)) {
        return res.status(403).json({ error: "Access denied" });
    }
    next();
};

export const blockIP = async (ip: string, reason: string) => {
    if (!ip || ip === "unknown") return;
    
    try {
        await db.collection("firewall").doc(ip).set({
            blockedAt: new Date().toISOString(),
            reason: reason
        });
        blockedIPs.add(ip);
        console.warn(`[Security] IP ${ip} blocked. Reason: ${reason}`);
    } catch (error) {
        console.error(`[Security] Failed to block IP ${ip}:`, error);
    }
};
