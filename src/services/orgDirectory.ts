import { listOrgUsers, listRbacGroupMembers, listRbacGroups } from "./anthropicAdmin";
import type { OrgUser, RbacGroup } from "../types";

/**
 * 조직 구성원/그룹 정보는 자주 바뀌지 않으므로 짧은 TTL 캐시를 둬서
 * 대시보드 새로고침이나 로그인 시도마다 Admin API를 과도하게 호출하지 않도록 한다.
 */
const CACHE_TTL_MS = 30_000;

let usersCache: { data: OrgUser[]; expiresAt: number } | null = null;
let groupsCache: { data: RbacGroup[]; expiresAt: number } | null = null;
let groupMembersCache: { data: Map<string, string[]>; expiresAt: number } | null = null;

export async function getOrgUsers(forceRefresh = false): Promise<OrgUser[]> {
  if (!forceRefresh && usersCache && usersCache.expiresAt > Date.now()) {
    return usersCache.data;
  }
  const data = await listOrgUsers();
  usersCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export async function getOrgGroups(forceRefresh = false): Promise<RbacGroup[]> {
  if (!forceRefresh && groupsCache && groupsCache.expiresAt > Date.now()) {
    return groupsCache.data;
  }
  const data = await listRbacGroups();
  groupsCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

/** groupId -> userId[] */
export async function getGroupMembership(forceRefresh = false): Promise<Map<string, string[]>> {
  if (!forceRefresh && groupMembersCache && groupMembersCache.expiresAt > Date.now()) {
    return groupMembersCache.data;
  }
  const groups = await getOrgGroups(forceRefresh);
  const map = new Map<string, string[]>();
  for (const group of groups) {
    const members = await listRbacGroupMembers(group.id);
    map.set(group.id, members.map((m) => m.userId));
  }
  groupMembersCache = { data: map, expiresAt: Date.now() + CACHE_TTL_MS };
  return map;
}

export async function findOrgUserByEmail(email: string): Promise<OrgUser | undefined> {
  const users = await getOrgUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === normalized);
}

export function invalidateOrgCache(): void {
  usersCache = null;
  groupsCache = null;
  groupMembersCache = null;
}
