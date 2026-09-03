import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export async function sendOtpEmail(toEmail: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: config.smtp.from,
    to: toEmail,
    subject: "[Claude Token Manager] 로그인 인증코드",
    text: `인증코드: ${code}\n\n이 코드는 ${config.otp.expiryMinutes}분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.`,
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">로그인 인증코드</h2>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 0 0 16px;">${code}</p>
        <p style="color: #555;">이 코드는 <strong>${config.otp.expiryMinutes}분간</strong> 유효합니다.</p>
        <p style="color: #999; font-size: 13px;">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
      </div>
    `,
  });
}
