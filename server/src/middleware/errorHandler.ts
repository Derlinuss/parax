import { Request, Response, NextFunction } from "express";
import { blockIP } from "./ipBlocker";

export const errorHandler = async (err: any, req: Request, res: Response, next: NextFunction) => {
  const ts = new Date().toISOString();
  const ip = req.ip || req.headers['x-forwarded-for'] as string || "unknown";
  
  console.error(`[Para:${ts}] Backend Error | ${err.message || "(no message)"}`);
  
  // Example: Block IP if it causes too many crashes (or specific attack signatures)
  if (err.message.includes("some_attack_signature")) {
      await blockIP(ip, "Attack signature detected");
  }

  if (err.stack) {
    console.error(`[Para:${ts}] Stack:\n${err.stack.slice(0, 2000)}`);
  }
  
  res.status(500).json({ 
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};
