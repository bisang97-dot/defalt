import nodemailer from "nodemailer";
import { config } from "../config";
import type { GroupAverageAlert } from "../types";

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

/**
 * 개인별 제한을 저장한 결과 그룹 평균 토큰 제한이 임계값(GROUP_AVG_LIMIT_ALERT_THRESHOLD_USD)을 초과할 때
 * 전체 관리자(ADMIN_NOTIFY_EMAILS)에게 그 그룹의 현황을 알리는 메일.
 *
 * [개발/테스트 전용 모드] 이 함수는 아직 어디서도 호출하지 않는다 — src/routes/members.ts 에서
 * 실제 발송 대신 같은 내용을 API 응답(adminNotification)에 담아 화면 알림창으로 보여준다.
 * 운영 전환 시 그 자리의 주석을 해제해서 이 함수를 호출하면 된다.
 */
export async function sendGroupAverageAlertEmail(alert: GroupAverageAlert): Promise<void> {
  if (alert.recipients.length === 0) return;

  const rows = alert.members
    .map(
      (m) =>
        `<tr><td style="padding:4px 12px;">${m.name ?? "-"}</td><td style="padding:4px 12px;">${m.email}</td><td style="padding:4px 12px;">${
          m.effectiveAmountMajorUnits === null ? "무제한" : `${m.effectiveAmountMajorUnits.toFixed(2)} ${alert.currency}`
        }</td></tr>`
    )
    .join("");

  await transporter.sendMail({
    from: config.smtp.from,
    to: alert.recipients.join(", "),
    subject: `[Claude Token Manager] "${alert.groupName}" 그룹 평균 토큰 제한 초과 알림`,
    text:
      `"${alert.groupName}" 그룹의 평균 토큰 제한이 ${alert.averageMajorUnits.toFixed(2)} ${alert.currency} 로 ` +
      `기준값 ${alert.thresholdMajorUnits.toFixed(2)} ${alert.currency} 을 초과했습니다.\n\n` +
      alert.members
        .map((m) => `- ${m.name ?? m.email} (${m.email}): ${m.effectiveAmountMajorUnits === null ? "무제한" : `${m.effectiveAmountMajorUnits.toFixed(2)} ${alert.currency}`}`)
        .join("\n"),
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; color: #1a1a1a;">
        <h2 style="margin: 0 0 16px;">"${alert.groupName}" 그룹 평균 토큰 제한 초과</h2>
        <p>평균 <strong>${alert.averageMajorUnits.toFixed(2)} ${alert.currency}</strong> — 기준값 ${alert.thresholdMajorUnits.toFixed(2)} ${alert.currency} 초과</p>
        <table style="border-collapse: collapse; margin-top: 12px;">
          <thead><tr><th style="text-align:left; padding:4px 12px;">이름</th><th style="text-align:left; padding:4px 12px;">이메일</th><th style="text-align:left; padding:4px 12px;">적용 제한</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `,
  });
}
