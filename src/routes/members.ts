import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdminApiKey } from "../middleware/adminKey";
import { getOrgUsers, getOrgGroups, getGroupMembership } from "../services/orgDirectory";
import { deleteSpendLimit, listEffectiveSpendLimits, setUserSpendLimit } from "../services/anthropicAdmin";
import { getAllGroupAssignments } from "../services/groupMaster";
import { errorDetail } from "../utils/errorDetail";
import type { EffectiveSpendLimitRow, MemberView, SpendLimitSource } from "../types";

export const membersRouter = Router();
membersRouter.use(requireAuth);
membersRouter.use(requireAdminApiKey);

function resolveSourceGroupId(source: SpendLimitSource): string | null {
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

interface GroupContext {
  fileGroupByEmail: Map<string, string>;
  anthropicGroups: AnthropicGroupData;
  anthropicGroupsWarning?: string;
}

/**
 * 소속 그룹은 두 곳을 함께 본다:
 *  1) env/group_master.env 의 "이메일 -> 그룹명" 매핑 (수동 관리, 이메일 기준)
 *  2) Claude Enterprise 에 실제 등록된 RBAC 그룹 (Admin API, 계정 기준)
 * group_master.env 매핑이 있으면 그걸 우선하고, 없으면 Anthropic 쪽 그룹명을 그대로 쓴다.
 * Anthropic 그룹 조회가 이 Admin API 키의 권한/스코프 문제로 실패해도 전체 요청을 막지 않고,
 * env/group_master.env 매핑만으로 동작하도록 낮춘다(대신 그 사실을 경고로 알린다).
 */
async function loadGroupContext(apiKey: string): Promise<GroupContext> {
  const fileGroupByEmail = getAllGroupAssignments();
  try {
    const anthropicGroups = await loadAnthropicGroupData(apiKey);
    return { fileGroupByEmail, anthropicGroups };
  } catch (err) {
    console.error("[members] Anthropic RBAC 그룹 조회 실패, env/group_master.env 매핑만 사용", err);
    return {
      fileGroupByEmail,
      anthropicGroups: { groupNameById: new Map(), groupNameByUserId: new Map() },
      anthropicGroupsWarning: `Claude Enterprise 그룹 정보를 가져오지 못했습니다 (${
        errorDetail(err) ?? "알 수 없는 오류"
      }). env/group_master.env 에 등록된 매핑만 적용됩니다.`,
    };
  }
}

function resolveGroup(ctx: GroupContext, userId: string, email: string): string | null {
  return ctx.fileGroupByEmail.get(email.toLowerCase()) ?? ctx.anthropicGroups.groupNameByUserId.get(userId) ?? null;
}

async function buildMemberViews(
  apiKey: string,
  viewerEmail: string
): Promise<{
  members: MemberView[];
  groups: { id: string; name: string }[];
  groupsWarning?: string;
}> {
  const [allUsers, effectiveRows, ctx] = await Promise.all([
    getOrgUsers(apiKey),
    listEffectiveSpendLimits(apiKey),
    loadGroupContext(apiKey),
  ]);

  const viewer = allUsers.find((u) => u.email.toLowerCase() === viewerEmail.toLowerCase());
  const myGroup = viewer
    ? resolveGroup(ctx, viewer.id, viewer.email)
    : ctx.fileGroupByEmail.get(viewerEmail.toLowerCase()) ?? null;

  if (!myGroup) {
    const reason = ctx.anthropicGroupsWarning ? ` (${ctx.anthropicGroupsWarning})` : "";
    return {
      members: [],
      groups: [],
      groupsWarning: `본인 계정(${viewerEmail})의 소속 그룹을 확인할 수 없어 조회할 수 있는 구성원이 없습니다. env/group_master.env 에 등록하거나, Claude Enterprise 에서 그룹을 배정해주세요.${reason}`,
    };
  }

  const users = allUsers.filter((user) => resolveGroup(ctx, user.id, user.email) === myGroup);

  const rowByUserId = new Map<string, EffectiveSpendLimitRow>();
  for (const row of effectiveRows) {
    rowByUserId.set(row.actor.user_id, row);
  }

  // 그룹 기준(baseline) 제한액: 이 그룹을 실제로 Anthropic RBAC 그룹을 통해 상속받고 있는 사람의 effective 값을 사용한다.
  // 그 사람의 그룹을 알 수 없으면(그룹 목록 조회 실패 등) 본인의 소속 그룹 판정 결과로 대체한다.
  const groupBaseline = new Map<string, { amount: string | null; currency: string }>();
  for (const row of effectiveRows) {
    if (row.source.type !== "rbac_group") continue;
    const groupId = resolveSourceGroupId(row.source);
    const groupName =
      (groupId && ctx.anthropicGroups.groupNameById.get(groupId)) ??
      resolveGroup(ctx, row.actor.user_id, row.actor.email_address);
    if (groupName && !groupBaseline.has(groupName)) {
      groupBaseline.set(groupName, { amount: row.amount, currency: row.currency });
    }
  }

  const members: MemberView[] = users.map((user) => {
    const row = rowByUserId.get(user.id);
    const groupName = resolveGroup(ctx, user.id, user.email);
    const groupNames = groupName ? [groupName] : [];

    const sourceType = row?.source.type ?? "unknown";

    let groupBaselineAmount: string | null = null;
    let groupBaselineKnown = false;
    if (sourceType === "rbac_group" && row) {
      groupBaselineAmount = row.amount;
      groupBaselineKnown = true;
    } else if (groupName && groupBaseline.has(groupName)) {
      const baseline = groupBaseline.get(groupName)!;
      groupBaselineAmount = baseline.amount;
      groupBaselineKnown = true;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      groupIds: groupNames,
      groupNames,
      effectiveAmount: row?.amount ?? null,
      currency: row?.currency ?? "USD",
      period: row?.period ?? "monthly",
      sourceType,
      sourceGroupId: sourceType === "rbac_group" ? groupName : null,
      sourceGroupName: sourceType === "rbac_group" ? groupName : null,
      spendLimitId: row?.spend_limit_id ?? "",
      periodToDateSpend: row?.period_to_date_spend ?? "0",
      hasIndividualOverride: sourceType === "user",
      groupBaselineAmount,
      groupBaselineKnown,
    };
  });

  // 진단: env/group_master.env 에 이 그룹으로 등록돼 있지만, 조직 구성원 목록에서 찾지 못한 이메일.
  const foundEmails = new Set(allUsers.map((u) => u.email.toLowerCase()));
  const configuredEmailsForMyGroup = [...ctx.fileGroupByEmail.entries()]
    .filter(([, group]) => group === myGroup)
    .map(([email]) => email);
  const unmatchedGroupEmails = configuredEmailsForMyGroup.filter((email) => !foundEmails.has(email));

  const warnings: string[] = [];
  if (ctx.anthropicGroupsWarning) warnings.push(ctx.anthropicGroupsWarning);
  if (unmatchedGroupEmails.length > 0) {
    warnings.push(
      `env/group_master.env 에는 "${myGroup}" 그룹으로 등록되어 있지만, 조직 구성원 목록에서 찾지 못한 이메일: ${unmatchedGroupEmails.join(", ")}`
    );
  }

  return {
    members,
    groups: [{ id: myGroup, name: myGroup }],
    groupsWarning: warnings.length > 0 ? warnings.join(" / ") : undefined,
  };
}

/**
 * 목록 조회뿐 아니라 실제 제한 변경도 "로그인한 사용자와 같은 그룹" 대상으로만 허용해야
 * 그룹 제한이 실질적인 접근 제어가 된다 (그냥 목록만 가려주는 건 우회가 쉽다).
 */
async function isTargetInViewersGroup(apiKey: string, viewerEmail: string, targetUserId: string): Promise<boolean> {
  const [allUsers, ctx] = await Promise.all([getOrgUsers(apiKey), loadGroupContext(apiKey)]);

  const viewer = allUsers.find((u) => u.email.toLowerCase() === viewerEmail.toLowerCase());
  const myGroup = viewer
    ? resolveGroup(ctx, viewer.id, viewer.email)
    : ctx.fileGroupByEmail.get(viewerEmail.toLowerCase()) ?? null;
  if (!myGroup) return false;

  const target = allUsers.find((u) => u.id === targetUserId);
  if (!target) return false;

  return resolveGroup(ctx, target.id, target.email) === myGroup;
}

membersRouter.get("/", async (req, res) => {
  try {
    const result = await buildMemberViews(req.adminApiKey!, req.user!.email);
    res.json(result);
  } catch (err) {
    console.error("[members] list failed", err);
    res.status(502).json({
      error: "구성원 정보를 불러오는 중 오류가 발생했습니다.",
      detail: errorDetail(err),
    });
  }
});

membersRouter.put("/:userId/limit", async (req, res) => {
  const { userId } = req.params;
  const amount = req.body?.amountMajorUnits;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: "올바른 금액을 입력해주세요 (0 이상의 숫자)." });
    return;
  }

  const amountMinorUnits = Math.round(amount * 100).toString();

  try {
    if (!(await isTargetInViewersGroup(req.adminApiKey!, req.user!.email, userId))) {
      res.status(403).json({ error: "같은 그룹의 구성원만 관리할 수 있습니다." });
      return;
    }
    const result = await setUserSpendLimit(req.adminApiKey!, userId, amountMinorUnits);
    res.json({ ok: true, spendLimit: result });
  } catch (err) {
    console.error("[members] set limit failed", err);
    res.status(502).json({ error: "개인별 토큰 제한 설정에 실패했습니다.", detail: errorDetail(err) });
  }
});

membersRouter.delete("/:userId/limit", async (req, res) => {
  const { userId } = req.params;
  const spendLimitId = typeof req.body?.spendLimitId === "string" ? req.body.spendLimitId : "";
  if (!spendLimitId.startsWith("spl_")) {
    res.status(400).json({ error: "유효하지 않은 spendLimitId 입니다." });
    return;
  }

  try {
    if (!(await isTargetInViewersGroup(req.adminApiKey!, req.user!.email, userId))) {
      res.status(403).json({ error: "같은 그룹의 구성원만 관리할 수 있습니다." });
      return;
    }
    await deleteSpendLimit(req.adminApiKey!, spendLimitId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[members] delete limit override failed", err);
    res.status(502).json({ error: "개인별 토큰 제한 해제에 실패했습니다.", detail: errorDetail(err) });
  }
});
