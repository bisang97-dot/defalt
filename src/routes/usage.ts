import { Router } from "express";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";
import { requireAdminApiKey } from "../middleware/adminKey";
import { getUserCostReport } from "../services/anthropicAdmin";
import { getGroupScope, groupNotFoundWarning } from "../services/groupResolution";
import { computeMonthRange, isValidYearMonth } from "../utils/dateRange";
import { errorDetail } from "../utils/errorDetail";

export const usageRouter = Router();
usageRouter.use(requireAuth);
usageRouter.use(requireAdminApiKey);

function parseIntParam(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

usageRouter.get("/", async (req, res) => {
  const startYear = parseIntParam(req.query.startYear);
  const startMonth = parseIntParam(req.query.startMonth);
  const endYear = parseIntParam(req.query.endYear);
  const endMonth = parseIntParam(req.query.endMonth);

  if (
    startYear === null ||
    startMonth === null ||
    endYear === null ||
    endMonth === null ||
    !isValidYearMonth(startYear, startMonth) ||
    !isValidYearMonth(endYear, endMonth)
  ) {
    res.status(400).json({ error: "시작/종료 년월을 올바르게 선택해주세요." });
    return;
  }

  let range;
  try {
    range = computeMonthRange(startYear, startMonth, endYear, endMonth);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "기간이 올바르지 않습니다." });
    return;
  }

  try {
    const { ctx, myGroup, groupMembers } = await getGroupScope(req.adminApiKey!, req.user!.email);
    if (!myGroup) {
      res.json({
        groupName: null,
        months: range.months,
        memberCount: 0,
        currency: "USD",
        members: [],
        totalUsageMajorUnits: 0,
        budgetMajorUnits: 0,
        availableMajorUnits: 0,
        groupsWarning: groupNotFoundWarning(req.user!.email, ctx),
      });
      return;
    }

    const costRows = await getUserCostReport(req.adminApiKey!, range.startingAt, range.endingAt);
    const usageMinorUnitsByUserId = new Map(costRows.map((row) => [row.userId, row.amountMinorUnits] as const));

    const members = groupMembers.map((user) => {
      const minorUnits = usageMinorUnitsByUserId.get(user.id);
      const usageMajorUnits = minorUnits !== undefined ? Number(minorUnits) / 100 : 0;
      return { userId: user.id, email: user.email, name: user.name, usageMajorUnits };
    });

    const totalUsageMajorUnits = members.reduce((sum, m) => sum + m.usageMajorUnits, 0);
    // 인당 월 예산은 그룹 평균 초과 확인(GROUP_AVG_LIMIT_ALERT_THRESHOLD_USD)과 같은 "인당 월 $100" 값을 그대로 쓴다.
    const budgetMajorUnits = groupMembers.length * config.groupAvgLimitAlertThresholdUsd * range.months;
    const availableMajorUnits = budgetMajorUnits - totalUsageMajorUnits;

    res.json({
      groupName: myGroup,
      months: range.months,
      memberCount: groupMembers.length,
      currency: "USD",
      members,
      totalUsageMajorUnits,
      budgetMajorUnits,
      availableMajorUnits,
      groupsWarning: ctx.anthropicGroupsWarning,
    });
  } catch (err) {
    console.error("[usage] report failed", err);
    res.status(502).json({
      error:
        "기간별 사용량을 불러오는 중 오류가 발생했습니다. Admin API 키에 read:analytics 스코프가 있는지 확인해주세요.",
      detail: errorDetail(err),
    });
  }
});
