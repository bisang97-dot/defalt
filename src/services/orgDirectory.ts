import { listOrgUsers } from "./anthropicAdmin";
import type { OrgUser } from "../types";

/**
 * 조직 구성원 정보는 자주 바뀌지 않으므로 짧은 TTL 캐시를 둬서
 * 대시보드 새로고침이나 로그인 시도마다 Admin API를 과도하게 호출하지 않도록 한다.
 *
 * [개발/테스트 전용 모드] API 키를 서버에 저장하지 않고 매 요청마다 화면에서 받으므로,
 * 캐시도 apiKey 별로 분리해서 보관한다 (다른 키로 테스트하면 별도 캐시가 쓰인다).
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const usersCache = new Map<string, CacheEntry<OrgUser[]>>();

export async function getOrgUsers(apiKey: string, forceRefresh = false): Promise<OrgUser[]> {
  const cached = usersCache.get(apiKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await listOrgUsers(apiKey);
  usersCache.set(apiKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function findOrgUserByEmail(apiKey: string, email: string): Promise<OrgUser | undefined> {
  const users = await getOrgUsers(apiKey);
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === normalized);
}

export function invalidateOrgCache(): void {
  usersCache.clear();
}
