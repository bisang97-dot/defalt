import { config } from "../config";
import { AnthropicAdminApiError } from "../services/anthropicAdmin";

/**
 * [개발/테스트 전용] 브라우저 화면에서 바로 원인을 확인할 수 있도록 에러 상세를 문자열로 뽑아낸다.
 * 운영 배포 시에는 NODE_ENV=production 이면 자동으로 상세를 숨긴다 (config.isProduction).
 */
export function errorDetail(err: unknown): string | undefined {
  if (config.isProduction) return undefined;

  if (err instanceof AnthropicAdminApiError) {
    const bodyMessage =
      err.body && typeof err.body === "object" && "error" in err.body
        ? (err.body as { error?: { type?: string; message?: string } }).error
        : undefined;
    const parts = [`HTTP ${err.status}`, bodyMessage?.type, bodyMessage?.message ?? err.message].filter(Boolean);
    return parts.join(" · ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
