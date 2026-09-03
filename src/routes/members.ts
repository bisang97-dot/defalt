import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdminApiKey } from "../middleware/adminKey";
import { getOrgGroups, getGroupMembership, getOrgUsers } from "../services/orgDirectory";
import { deleteSpendLimit, listEffectiveSpendLimits, setUserSpendLimit } from "../services/anthropicAdmin";
import type { EffectiveSpendLimitRow, MemberView, SpendLimitSource } from "../types";

export const membersRouter = Router();
membersRouter.use(requireAuth);
membersRouter.use(requireAdminApiKey);

function resolveSourceGroupId(source: SpendLimitSource, singleGroupFallback: string | null): string | null {
  if (typeof source.rbac_group_id === "string") return source.rbac_group_id;
  if (typeof source.group_id === "string") return source.group_id;
  return singleGroupFallback;
}

async function buildMemberViews(
  apiKey: string
): Promise<{ members: MemberView[]; groups: { id: string; name: string }[] }> {
  const [users, groups, groupMembership, effectiveRows] = await Promise.all([
    getOrgUsers(apiKey),
    getOrgGroups(apiKey),
    getGroupMembership(apiKey),
    listEffectiveSpendLimits(apiKey),
  ]);

  const groupNameById = new Map(groups.map((g) => [g.id, g.name] as const));

  const userGroups = new Map<string, string[]>();
  for (const [groupId, userIds] of groupMembership.entries()) {
    for (const userId of userIds) {
      const list = userGroups.get(userId) ?? [];
      list.push(groupId);
      userGroups.set(userId, list);
    }
  }

  const rowByUserId = new Map<string, EffectiveSpendLimitRow>();
  for (const row of effectiveRows) {
    rowByUserId.set(row.actor.user_id, row);
  }

  // 그룹 기준(baseline) 제한액 추정: 해당 그룹을 source 로 상속받고 있는 멤버의 effective amount 를 사용한다.
  // 그룹의 모든 멤버가 개인별 override 를 갖고 있으면 baseline 을 알아낼 방법이 없다 (API 한계).
  const groupBaseline = new Map<string, { amount: string | null; currency: string }>();
  for (const row of effectiveRows) {
    if (row.source.type !== "rbac_group") continue;
    const singleGroupFallback =
      (userGroups.get(row.actor.user_id) ?? []).length === 1
        ? (userGroups.get(row.actor.user_id) as string[])[0]
        : null;
    const groupId = resolveSourceGroupId(row.source, singleGroupFallback);
    if (groupId && !groupBaseline.has(groupId)) {
      groupBaseline.set(groupId, { amount: row.amount, currency: row.currency });
    }
  }

  const members: MemberView[] = users.map((user) => {
    const row = rowByUserId.get(user.id);
    const groupIds = userGroups.get(user.id) ?? [];
    const groupNames = groupIds.map((id) => groupNameById.get(id) ?? id);

    const sourceType = row?.source.type ?? "unknown";
    const singleGroupFallback = groupIds.length === 1 ? groupIds[0] : null;
    const sourceGroupId =
      row && sourceType === "rbac_group" ? resolveSourceGroupId(row.source, singleGroupFallback) : null;

    let groupBaselineAmount: string | null = null;
    let groupBaselineKnown = false;
    if (sourceType === "rbac_group" && row) {
      groupBaselineAmount = row.amount;
      groupBaselineKnown = true;
    } else if (groupIds.length === 1 && groupBaseline.has(groupIds[0])) {
      const baseline = groupBaseline.get(groupIds[0])!;
      groupBaselineAmount = baseline.amount;
      groupBaselineKnown = true;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      groupIds,
      groupNames,
      effectiveAmount: row?.amount ?? null,
      currency: row?.currency ?? "USD",
      period: row?.period ?? "monthly",
      sourceType,
      sourceGroupId,
      sourceGroupName: sourceGroupId ? groupNameById.get(sourceGroupId) ?? sourceGroupId : null,
      spendLimitId: row?.spend_limit_id ?? "",
      periodToDateSpend: row?.period_to_date_spend ?? "0",
      hasIndividualOverride: sourceType === "user",
      groupBaselineAmount,
      groupBaselineKnown,
    };
  });

  return { members, groups: groups.map((g) => ({ id: g.id, name: g.name })) };
}

membersRouter.get("/", async (req, res) => {
  try {
    const result = await buildMemberViews(req.adminApiKey!);
    res.json(result);
  } catch (err) {
    console.error("[members] list failed", err);
    res.status(502).json({ error: "구성원 정보를 불러오는 중 오류가 발생했습니다." });
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
    const result = await setUserSpendLimit(req.adminApiKey!, userId, amountMinorUnits);
    res.json({ ok: true, spendLimit: result });
  } catch (err) {
    console.error("[members] set limit failed", err);
    res.status(502).json({ error: "개인별 토큰 제한 설정에 실패했습니다." });
  }
});

membersRouter.delete("/:userId/limit", async (req, res) => {
  const spendLimitId = typeof req.body?.spendLimitId === "string" ? req.body.spendLimitId : "";
  if (!spendLimitId.startsWith("spl_")) {
    res.status(400).json({ error: "유효하지 않은 spendLimitId 입니다." });
    return;
  }

  try {
    await deleteSpendLimit(req.adminApiKey!, spendLimitId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[members] delete limit override failed", err);
    res.status(502).json({ error: "개인별 토큰 제한 해제에 실패했습니다." });
  }
});
