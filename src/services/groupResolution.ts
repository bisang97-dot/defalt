import { getOrgUsers, getOrgGroups, getGroupMembership } from "./orgDirectory";
import { getAllGroupAssignments } from "./groupMaster";
import { errorDetail } from "../utils/errorDetail";
import type { OrgUser, SpendLimitSource } from "../types";

/**
 * 소속 그룹은 두 곳을 함께 본다:
 *  1) env/group_master.env 의 "이메일 -> 그룹명" 매핑 (수동 관리, 이메일 기준)
 *  2) Claude Enterprise 에 실제 등록된 RBAC 그룹 (Admin API, 계정 기준)
 * group_master.env 매핑이 있으면 그걸 우선하고, 없으면 Anthropic 쪽 그룹명을 그대로 쓴다.
 * Anthropic 그룹 조회가 이 Admin API 키의 권한/스코프 문제로 실패해도 전체 요청을 막지 않고,
 * env/group_master.env 매핑만으로 동작하도록 낮춘다(대신 그 사실을 경고로 알린다).
 *
 * 이 모듈은 개인별 제한 화면(routes/members.ts)과 기간별 조회 화면(routes/usage.ts)에서 함께 쓴다.
 */

export function resolveSourceGroupId(source: SpendLimitSource): string | null {
  if (typeof source.rbac_group_id === "string") return source.rbac_group_id;
  if (typeof source.group_id === "string") return source.group_id;
  return null;
}

interface AnthropicGroupData {
  groupNameById: Map<string, string>;
  groupNameByUserId: Map<string, string>;
}

async function loadAnthropicGroupData(apiKey: string): Promise<AnthropicGroupData> {
  const groups = await getOrgGroups(apiKey);
  const membership = await getGroupMembership(apiKey); // groupId -> userId[]

  const groupNameById = new Map(groups.map((g) => [g.id, g.name] as const));
  const groupNameByUserId = new Map<string, string>();
  for (const [groupId, userIds] of membership.entries()) {
    const name = groupNameById.get(groupId);
    if (!name) continue;
    for (const userId of userIds) groupNameByUserId.set(userId, name);
  }

  return { groupNameById, groupNameByUserId };
}

export interface GroupContext {
  fileGroupByEmail: Map<string, string>;
  anthropicGroups: AnthropicGroupData;
  anthropicGroupsWarning?: string;
}

export async function loadGroupContext(apiKey: string): Promise<GroupContext> {
  const fileGroupByEmail = getAllGroupAssignments();
  try {
    const anthropicGroups = await loadAnthropicGroupData(apiKey);
    return { fileGroupByEmail, anthropicGroups };
  } catch (err) {
    console.error("[groupResolution] Anthropic RBAC 그룹 조회 실패, env/group_master.env 매핑만 사용", err);
    return {
      fileGroupByEmail,
      anthropicGroups: { groupNameById: new Map(), groupNameByUserId: new Map() },
      anthropicGroupsWarning: `Claude Enterprise 그룹 정보를 가져오지 못했습니다 (${
        errorDetail(err) ?? "알 수 없는 오류"
      }). env/group_master.env 에 등록된 매핑만 적용됩니다.`,
    };
  }
}

export function resolveGroup(ctx: GroupContext, userId: string, email: string): string | null {
  return ctx.fileGroupByEmail.get(email.toLowerCase()) ?? ctx.anthropicGroups.groupNameByUserId.get(userId) ?? null;
}

export interface GroupScope {
  ctx: GroupContext;
  allUsers: OrgUser[];
  /** 로그인한 사람의 소속 그룹명. 어느 쪽에서도 찾지 못하면 null. */
  myGroup: string | null;
  /** myGroup 과 같은 그룹으로 판정된 조직 구성원 (로그인한 사람 본인 포함). myGroup 이 null 이면 빈 배열. */
  groupMembers: OrgUser[];
}

/** 로그인한 사람(viewerEmail)의 소속 그룹과, 그 그룹에 속한 조직 구성원 목록을 함께 계산한다. */
export async function getGroupScope(apiKey: string, viewerEmail: string): Promise<GroupScope> {
  const [allUsers, ctx] = await Promise.all([getOrgUsers(apiKey), loadGroupContext(apiKey)]);

  const viewer = allUsers.find((u) => u.email.toLowerCase() === viewerEmail.toLowerCase());
  const myGroup = viewer
    ? resolveGroup(ctx, viewer.id, viewer.email)
    : ctx.fileGroupByEmail.get(viewerEmail.toLowerCase()) ?? null;

  const groupMembers = myGroup ? allUsers.filter((u) => resolveGroup(ctx, u.id, u.email) === myGroup) : [];

  return { ctx, allUsers, myGroup, groupMembers };
}

export function groupNotFoundWarning(viewerEmail: string, ctx: GroupContext): string {
  const reason = ctx.anthropicGroupsWarning ? ` (${ctx.anthropicGroupsWarning})` : "";
  return `본인 계정(${viewerEmail})의 소속 그룹을 확인할 수 없어 조회할 수 있는 구성원이 없습니다. env/group_master.env 에 등록하거나, Claude Enterprise 에서 그룹을 배정해주세요.${reason}`;
}
