import { Router } from "express";
import rateLimit from "express-rate-limit";
import { issueOtp, verifyOtp } from "../services/otpStore";
import { sendOtpEmail } from "../services/mailer";
import { findOrgUserByEmail } from "../services/orgDirectory";
import { requireAuth, setSessionCookie, signSession, clearSessionCookie } from "../middleware/auth";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
});

const GENERIC_SENT_MESSAGE =
  "입력하신 이메일이 소속 조직의 구성원으로 확인되면 인증코드를 발송합니다. 메일함을 확인해주세요.";

/**
 * 이메일을 입력받아, 그 이메일이 이 서비스가 관리하는 Claude Enterprise 조직의
 * 구성원인 경우에만 실제로 6자리 인증코드를 발송한다.
 * 조직 미소속 이메일 여부를 외부에 노출하지 않기 위해 응답 메시지는 항상 동일하게 유지한다.
 */
authRouter.post("/request-code", requestCodeLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "올바른 이메일 형식이 아닙니다." });
    return;
  }

  try {
    const orgUser = await findOrgUserByEmail(email);
    if (orgUser) {
      const issued = issueOtp(email);
      if (issued) {
        await sendOtpEmail(email, issued.code);
      }
      // 쿨다운 중이어도(issued === null) 외부에는 동일한 성공 메시지를 반환한다.
    }
    res.json({ message: GENERIC_SENT_MESSAGE });
  } catch (err) {
    console.error("[auth] request-code failed", err);
    res.status(502).json({ error: "조직 정보를 확인하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
  }
});

authRouter.post("/verify-code", verifyCodeLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

  if (!EMAIL_RE.test(email) || !code) {
    res.status(400).json({ error: "이메일과 인증코드를 입력해주세요." });
    return;
  }

  const result = verifyOtp(email, code);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_found: "발급된 인증코드가 없습니다. 인증코드를 다시 요청해주세요.",
      expired: "인증코드가 만료되었습니다. 다시 요청해주세요.",
      invalid_code: "인증코드가 일치하지 않습니다.",
      too_many_attempts: "인증 시도 횟수를 초과했습니다. 인증코드를 다시 요청해주세요.",
    };
    res.status(400).json({ error: messages[result.reason] ?? "인증에 실패했습니다." });
    return;
  }

  try {
    // OTP 발급 시점 이후 조직에서 제외되었을 가능성에 대비해 재확인한다.
    const orgUser = await findOrgUserByEmail(email);
    if (!orgUser) {
      res.status(403).json({ error: "더 이상 조직 구성원이 아닙니다." });
      return;
    }

    const token = signSession({ sub: orgUser.id, email: orgUser.email, name: orgUser.name, role: orgUser.role });
    setSessionCookie(res, token);
    res.json({ user: { id: orgUser.id, email: orgUser.email, name: orgUser.name, role: orgUser.role } });
  } catch (err) {
    console.error("[auth] verify-code failed", err);
    res.status(502).json({ error: "조직 정보를 확인하는 중 오류가 발생했습니다." });
  }
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
