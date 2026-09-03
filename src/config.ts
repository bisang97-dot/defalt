import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 가 설정되지 않았습니다. .env 파일을 확인하세요 (.env.example 참고).`
    );
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: optionalInt("PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",

  sessionSecret: required("SESSION_SECRET"),
  sessionTtlHours: optionalInt("SESSION_TTL_HOURS", 12),

  anthropicAdminApiKey: required("CLAUDE_ADMIN_API_KEY"),
  anthropicVersion: process.env.ANTHROPIC_VERSION ?? "2023-06-01",

  otp: {
    length: optionalInt("OTP_LENGTH", 6),
    expiryMinutes: optionalInt("OTP_EXPIRY_MINUTES", 5),
    maxAttempts: optionalInt("OTP_MAX_ATTEMPTS", 5),
    resendCooldownSeconds: optionalInt("OTP_RESEND_COOLDOWN_SECONDS", 30),
  },

  smtp: {
    host: required("SMTP_HOST"),
    port: optionalInt("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Claude Token Manager <noreply@example.com>",
  },
};
