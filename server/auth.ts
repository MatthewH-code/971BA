import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

const PASSWORD = process.env.APP_PASSWORD || "Eclipse500";
const SESSION_SECRET = process.env.SESSION_SECRET || "eclipse500-dev-secret";
const COOKIE_NAME = "n971ba.sid";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

interface TokenPayload {
  exp: number;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

function readAuthToken(req: Request): string | null {
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === COOKIE_NAME) {
      return rest.join("=");
    }
  }
  return null;
}

function isAuthenticated(req: Request): boolean {
  const token = readAuthToken(req);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenPayload;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return false;
  } catch {
    return false;
  }
  return true;
}

function setAuthCookie(res: Response): void {
  const exp = Date.now() + MAX_AGE_MS;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_MS,
  });
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}

const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (isAuthenticated(req)) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
};

export { verify, isAuthenticated, setAuthCookie, clearAuthCookie, requireAuth };
