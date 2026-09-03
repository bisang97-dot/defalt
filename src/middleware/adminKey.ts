import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminApiKey?: string;
    }
  }
}

/**
 * [개발/테스트 전용 모드]
 * Admin API 키를 .env/서버에 저장하지 않고, 화면 입력창에서 받은 값을
 * 매 요청마다 `x-admin-api-key` 헤더로 전달받아 그 요청에만 사용한다.
 * 서버는 이 값을 로그로 남기거나 디스크/DB에 저장하지 않는다.
 *
 * 운영 전환 시: 이 미들웨어 사용을 제거하고, config.anthropicAdminApiKey(.env)를
 * 서비스 전역에서 사용하도록 되돌린다.
 */
export function requireAdminApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("x-admin-api-key");
  if (!key || !key.trim()) {
    res.status(400).json({ error: "Admin API 키를 입력해주세요." });
    return;
  }
  req.adminApiKey = key.trim();
  next();
}
