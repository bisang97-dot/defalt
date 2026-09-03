import crypto from "node:crypto";
import { config } from "../config";

interface OtpEntry {
  codeHash: string;
  expiresAt: number;
  attemptsLeft: number;
  lastSentAt: number;
}

/**
 * 단일 프로세스 내부 메모리 저장소.
 * 프로세스가 재시작되면 발급된 인증코드는 모두 무효화된다 (내부 소규모 관리 도구 용도로는 허용 가능한 트레이드오프).
 * 여러 인스턴스로 스케일 아웃할 경우 Redis 등 공유 저장소로 교체해야 한다.
 */
const store = new Map<string, OtpEntry>();

function hashCode(email: string, code: string): string {
  return crypto.createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

function generateCode(length: number): string {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, "0");
}

export interface IssueResult {
  code: string;
  cooldownSecondsRemaining: number;
}

/** 재전송 쿨다운 안에 있으면 null 을 반환한다 (호출측에서 429 처리). */
export function issueOtp(email: string): IssueResult | null {
  const key = email.toLowerCase();
  const existing = store.get(key);
  const now = Date.now();

  if (existing) {
    const cooldownMs = config.otp.resendCooldownSeconds * 1000;
    const remaining = existing.lastSentAt + cooldownMs - now;
    if (remaining > 0) {
      return null;
    }
  }

  const code = generateCode(config.otp.length);
  store.set(key, {
    codeHash: hashCode(key, code),
    expiresAt: now + config.otp.expiryMinutes * 60 * 1000,
    attemptsLeft: config.otp.maxAttempts,
    lastSentAt: now,
  });

  return { code, cooldownSecondsRemaining: config.otp.resendCooldownSeconds };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "invalid_code" | "too_many_attempts" };

export function verifyOtp(email: string, code: string): VerifyResult {
  const key = email.toLowerCase();
  const entry = store.get(key);

  if (!entry) return { ok: false, reason: "not_found" };

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { ok: false, reason: "expired" };
  }

  if (entry.attemptsLeft <= 0) {
    store.delete(key);
    return { ok: false, reason: "too_many_attempts" };
  }

  if (hashCode(key, code) !== entry.codeHash) {
    entry.attemptsLeft -= 1;
    if (entry.attemptsLeft <= 0) {
      store.delete(key);
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: false, reason: "invalid_code" };
  }

  store.delete(key);
  return { ok: true };
}
