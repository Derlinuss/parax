import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const ts = new Date().toISOString();
  
  console.error(`[Para:${ts}] Backend Error | ${err.message || "(no message)"}`);
  if (err.stack) {
    console.error(`[Para:${ts}] Stack:\n${err.stack.slice(0, 2000)}`);
  }
  
  res.status(500).json({ 
    error: "Internal Server Error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};
