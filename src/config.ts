import dotenv from "dotenv";
import { DOTENV_PATH } from "./envPaths";

// .env 파일은 프로젝트 루트가 아니라 env/ 폴더 아래에 둔다 (직접 접근을 막기 위해 그 폴더만 권한을 잠글 수 있게).
dotenv.config({ path: DOTENV_PATH });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `환경변수 ${name} 가 설정되지 않았습니다. ${DOTENV_PATH} 파일을 확인하세요 (env/.env.example 참고).`
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

  // [개발/테스트 전용 모드] Admin API 키는 더 이상 .env에서 읽지 않고 화면 입력창(요청 헤더)에서 받는다.
  // 운영 전환 시: required("CLAUDE_ADMIN_API_KEY") 로 되돌리고 서비스 전역에서 이 값을 사용한다.
  anthropicVersion: process.env.ANTHROPIC_VERSION ?? "2023-06-01",

  otp: {
    length: optionalInt("OTP_LENGTH", 6),
    expiryMinutes: optionalInt("OTP_EXPIRY_MINUTES", 5),
    maxAttempts: optionalInt("OTP_MAX_ATTEMPTS", 5),
    resendCooldownSeconds: optionalInt("OTP_RESEND_COOLDOWN_SECONDS", 30),
  },

  // [개발/테스트 전용 모드] 이메일 발송을 사용하지 않으므로 SMTP 설정은 필수가 아니다.
  // 운영 전환 시: host/user/pass 를 다시 required(...) 로 되돌린다.
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: optionalInt("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Claude Token Manager <noreply@example.com>",
  },
};
