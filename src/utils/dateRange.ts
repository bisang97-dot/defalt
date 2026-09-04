export interface MonthRange {
  /** ISO 8601 UTC, 포함(inclusive) 시작. */
  startingAt: string;
  /** ISO 8601 UTC, 배타적(exclusive) 상한 — 종료 월 다음 달 1일. */
  endingAt: string;
  /** 시작~종료(둘 다 포함) 개월 수. */
  months: number;
}

/** 년/월 값이 사람이 실제로 고를 수 있는 범위인지 확인한다. */
export function isValidYearMonth(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

/**
 * 시작 년/월 ~ 종료 년/월(둘 다 포함)을, Anthropic Analytics API 가 요구하는
 * `starting_at`(포함) / `ending_at`(배타적 상한) ISO 문자열과 개월 수로 변환한다.
 */
export function computeMonthRange(startYear: number, startMonth: number, endYear: number, endMonth: number): MonthRange {
  const startIndex = startYear * 12 + (startMonth - 1);
  const endIndex = endYear * 12 + (endMonth - 1);
  if (endIndex < startIndex) {
    throw new Error("종료 년월이 시작 년월보다 이전일 수 없습니다.");
  }

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startingAt = `${startYear}-${pad2(startMonth)}-01T00:00:00Z`;

  const endExclusiveIndex = endIndex + 1;
  const endExclusiveYear = Math.floor(endExclusiveIndex / 12);
  const endExclusiveMonth = (endExclusiveIndex % 12) + 1;
  const endingAt = `${endExclusiveYear}-${pad2(endExclusiveMonth)}-01T00:00:00Z`;

  return { startingAt, endingAt, months: endIndex - startIndex + 1 };
}
