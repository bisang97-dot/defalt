import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdminApiKey } from "../middleware/adminKey";
import { getOrgUsers } from "../services/orgDirectory";
import { deleteSpendLimit, listEffectiveSpendLimits, setUserSpendLimit } from "../services/anthropicAdmin";
import { getAllGroupAssignments, getGroupForEmail } from "../services/groupMaster";
import { errorDetail } from "../utils/errorDetail";
import type { EffectiveSpendLimitRow, MemberView } from "../types";

export const membersRouter = Router();
membersRouter.use(requireAuth);
membersRouter.use(requireAdminApiKey);

async function buildMemberViews(
  apiKey: string,
  viewerEmail: string
): Promise<{
  members: MemberView[];
  groups: { id: string; name: string }[];
  groupsWarning?: string;
}> {
  // 소속 그룹은 Anthropic RBAC 그룹 API 대신 group_master.env 의 "이메일 -> 그룹명" 매핑으로 결정한다.
  // 로그인한 사용자 본인의 그룹을 이 파일에서 먼저 찾고, 같은 그룹명을 가진 사람만 조회 대상으로 삼는다.
  const myGroup = getGroupForEmail(viewerEmail);
  if (!myGroup) {
    return {
      members: [],
      groups: [],
      groupsWarning: `본인 이메일(${viewerEmail})이 env/group_master.env 에 그룹명과 함께 등록되어 있지 않아 조회할 수 있는 구성원이 없습니다.`,
    };
  }

  const [allUsers, effectiveRows] = await Promise.all([getOrgUsers(apiKey), listEffectiveSpendLimits(apiKey)]);

  const groupByEmail = getAllGroupAssignments();
  const users = allUsers.filter((user) => groupByEmail.get(user.email.toLowerCase()) === myGroup);

  const rowByUserId = new Map<string, EffectiveSpendLimitRow>();
  for (const row of effectiveRows) {
    rowByUserId.set(row.actor.user_id, row);
  }

  // 그룹 기준(baseline) 제한액: 같은(로컬) 그룹명을 가진 멤버 중, Anthropic 쪽에서 실제로 그룹(rbac_group)을
  // source 로 상속받고 있는 멤버의 effective amount 를 그 그룹의 기준액으로 삼는다.
  // group_master.env 의 그룹 구분은 Anthropic 의 실제 RBAC 그룹과는 별개의 로컬 분류이므로,
  // Anthropic 쪽에서 그룹 기반 상속이 전혀 쓰이지 않는 조직이라면 항상 "확인 불가"로 남는다.
  const groupBaseline = new Map<string, { amount: string | null; currency: string }>();
  for (const row of effectiveRows) {
    if (row.source.type !== "rbac_group") continue;
    const groupName = groupByEmail.get(row.actor.email_address.toLowerCase());
    if (groupName && !groupBaseline.has(groupName)) {
      groupBaseline.set(groupName, { amount: row.amount, currency: row.currency });
    }
  }

  const members: MemberView[] = users.map((user) => {
    const row = rowByUserId.get(user.id);
    const groupName = groupByEmail.get(user.email.toLowerCase()) ?? null;
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

  return { members, groups: [{ id: myGroup, name: myGroup }] };
}

/**
 * 목록 조회뿐 아니라 실제 제한 변경도 "로그인한 사용자와 같은 그룹" 대상으로만 허용해야
 * group_master.env 기반 그룹 제한이 실질적인 접근 제어가 된다 (그냥 목록만 가려주는 건 우회가 쉽다).
 */
async function isTargetInViewersGroup(apiKey: string, viewerEmail: string, targetUserId: string): Promise<boolean> {
  const myGroup = getGroupForEmail(viewerEmail);
  if (!myGroup) return false;

  const users = await getOrgUsers(apiKey);
  const target = users.find((u) => u.id === targetUserId);
  if (!target) return false;

  return getAllGroupAssignments().get(target.email.toLowerCase()) === myGroup;
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
