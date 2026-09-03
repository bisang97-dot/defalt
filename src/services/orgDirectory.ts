import { listOrgUsers, listRbacGroupMembers, listRbacGroups } from "./anthropicAdmin";
import type { OrgUser, RbacGroup } from "../types";

/**
 * 조직 구성원/그룹 정보는 자주 바뀌지 않으므로 짧은 TTL 캐시를 둬서
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
const groupsCache = new Map<string, CacheEntry<RbacGroup[]>>();
const groupMembersCache = new Map<string, CacheEntry<Map<string, string[]>>>();

export async function getOrgUsers(apiKey: string, forceRefresh = false): Promise<OrgUser[]> {
  const cached = usersCache.get(apiKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await listOrgUsers(apiKey);
  usersCache.set(apiKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/**
 * Claude Enterprise 에 실제 등록된 RBAC 그룹 목록. 이 Admin API 키에 해당 권한/스코프가 없으면 실패할 수 있다 -
 * 호출부(routes/members.ts)에서 실패를 잡아 env/group_master.env 매핑만으로 동작하도록 되돌린다.
 */
export async function getOrgGroups(apiKey: string, forceRefresh = false): Promise<RbacGroup[]> {
  const cached = groupsCache.get(apiKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await listRbacGroups(apiKey);
  groupsCache.set(apiKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/** groupId -> userId[] */
export async function getGroupMembership(apiKey: string, forceRefresh = false): Promise<Map<string, string[]>> {
  const cached = groupMembersCache.get(apiKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const groups = await getOrgGroups(apiKey, forceRefresh);
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const members = await listRbacGroupMembers(apiKey, group.id);
    map.set(group.id, members.map((m) => m.userId));
  }
  groupMembersCache.set(apiKey, { data: map, expiresAt: Date.now() + CACHE_TTL_MS });
  return map;
}

export async function findOrgUserByEmail(apiKey: string, email: string): Promise<OrgUser | undefined> {
  const users = await getOrgUsers(apiKey);
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === normalized);
}

export function invalidateOrgCache(): void {
  usersCache.clear();
  groupsCache.clear();
  groupMembersCache.clear();
}
