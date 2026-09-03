import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

export const SESSION_COOKIE_NAME = "session";

export interface SessionPayload {
  sub: string; // org user id
  email: string;
  name: string | null;
  role: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, config.sessionSecret, {
    expiresIn: `${config.sessionTtlHours}h`,
  });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  try {
    const payload = jwt.verify(token, config.sessionSecret) as SessionPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요." });
  }
}
