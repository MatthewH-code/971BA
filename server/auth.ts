import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const PASSWORD = process.env.APP_PASSWORD || "Eclipse500";

function hash(password: string): string {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
}

const PASSWORD_HASH = hash(PASSWORD);

function verify(password: string): boolean {
  const [saltHex, hashHex] = PASSWORD_HASH.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return crypto.timingSafeEqual(expected, actual);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

export { verify, requireAuth };
