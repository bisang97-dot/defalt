import { config } from "../config";
import type { EffectiveSpendLimitRow, OrgUser, RbacGroup, RbacGroupMember } from "../types";

const BASE_URL = "https://api.anthropic.com";

export class AnthropicAdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "AnthropicAdminApiError";
  }
}

/**
 * [개발/테스트 전용 모드]
 * 운영 환경에서는 Admin API 키를 서버 환경변수(config.anthropicAdminApiKey)로만 관리해야 한다.
 * 지금은 API 키를 .env/서버에 저장하지 않고, 매 요청마다 화면 입력창에서 받은 값을
 * 호출부(라우트)가 apiKey 파라미터로 그대로 전달해서 쓰는 방식으로 임시 전환했다.
 * 운영 전환 시: 아래 모든 함수의 apiKey 파라미터를 제거하고 config.anthropicAdminApiKey를 사용하도록 되돌린다.
 */
async function adminRequest<T>(
  apiKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { query?: Record<string, string | string[] | undefined>; body?: unknown } = {}
): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(`${key}[]`, v);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": config.anthropicVersion,
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "error" in json
        ? (json as { error?: { message?: string } }).error?.message
        : undefined) ?? `Anthropic Admin API request failed (${res.status})`;
    throw new AnthropicAdminApiError(res.status, json, message);
  }

  return json as T;
}

/**
 * 이 프로젝트가 다루는 Admin API 목록 엔드포인트는 두 가지 페이지네이션 방식을 쓴다:
 *  - opaque cursor: 응답의 `next_page` 를 다음 요청의 `page` 파라미터로 그대로 전달 (Spend Limits API)
 *  - id 기반 cursor: 응답의 `has_more`/`last_id` 를 보고 다음 요청에 `after_id` 로 전달 (Users/Invites 등 표준 Admin API 목록)
 * 두 방식을 모두 지원하도록 방어적으로 처리한다.
 */
async function paginateAll<TRow>(
  apiKey: string,
  path: string,
  baseQuery: Record<string, string | string[] | undefined>,
  dataKey = "data"
): Promise<TRow[]> {
  const rows: TRow[] = [];
  let page: string | undefined;
  let afterId: string | undefined;

  // 무한 루프 방지용 안전 장치
  for (let i = 0; i < 500; i++) {
    const query: Record<string, string | string[] | undefined> = {
      ...baseQuery,
      ...(page ? { page } : {}),
      ...(afterId ? { after_id: afterId } : {}),
    };

    const response = await adminRequest<Record<string, unknown>>(apiKey, "GET", path, { query });
    const data = (response[dataKey] as TRow[] | undefined) ?? [];
    rows.push(...data);

    const nextPage = response["next_page"];
    const hasMore = response["has_more"];
    const lastId = response["last_id"];

    if (typeof nextPage === "string" && nextPage.length > 0) {
      page = nextPage;
      afterId = undefined;
      continue;
    }
    if (hasMore === true && typeof lastId === "string" && data.length > 0) {
      afterId = lastId;
      page = undefined;
      continue;
    }
    break;
  }

  return rows;
}

interface RawOrgUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

export async function listOrgUsers(apiKey: string): Promise<OrgUser[]> {
  const raw = await paginateAll<RawOrgUser>(apiKey, "/v1/organizations/users", { limit: "100" });
  return raw.map((u) => ({ id: u.id, email: u.email, name: u.name ?? null, role: u.role }));
}

interface RawRbacGroup {
  id: string;
  name: string;
}

export async function listRbacGroups(apiKey: string): Promise<RbacGroup[]> {
  const raw = await paginateAll<RawRbacGroup>(apiKey, "/v1/organizations/rbac_groups", { limit: "100" });
  return raw.map((g) => ({ id: g.id, name: g.name }));
}

interface RawRbacGroupMember {
  user_id: string;
  email: string;
  group_id: string;
}

export async function listRbacGroupMembers(apiKey: string, groupId: string): Promise<RbacGroupMember[]> {
  const raw = await paginateAll<RawRbacGroupMember>(
    apiKey,
    `/v1/organizations/rbac_groups/${encodeURIComponent(groupId)}/members`,
    { limit: "100" }
  );
  return raw.map((m) => ({ userId: m.user_id, email: m.email, groupId: m.group_id ?? groupId }));
}

export async function listEffectiveSpendLimits(apiKey: string): Promise<EffectiveSpendLimitRow[]> {
  return paginateAll<EffectiveSpendLimitRow>(apiKey, "/v1/organizations/spend_limits/effective", {
    limit: "100",
  });
}

interface RawUserCostRow {
  actor: { user_id: string; email: string; [key: string]: unknown };
  amount: string;
}

export interface UserCostRow {
  userId: string;
  email: string;
  /** 해당 기간 동안의 지출, 조직 결제 통화의 최소 단위(minor unit, 예: 센트) 문자열. */
  amountMinorUnits: string;
}

/**
 * 사용자별 기간 지출 리포트 (Analytics API). Admin API 키에 `read:analytics` 스코프가 필요하다.
 * startingAt/endingAt 은 ISO 8601 (UTC) 문자열이며, endingAt 은 배타적(exclusive) 상한이다.
 * bucket_width 를 지정하지 않으면 그 기간 전체를 사용자별로 합산한 한 행씩만 돌아온다.
 */
export async function getUserCostReport(
  apiKey: string,
  startingAt: string,
  endingAt: string
): Promise<UserCostRow[]> {
  const raw = await paginateAll<RawUserCostRow>(apiKey, "/v1/organizations/analytics/user_cost_report", {
    starting_at: startingAt,
    ending_at: endingAt,
    limit: "1000",
  });
  return raw.map((row) => ({ userId: row.actor.user_id, email: row.actor.email, amountMinorUnits: row.amount }));
}

/**
 * 개인별(override) 토큰 사용 한도를 설정한다. amount 는 조직 결제 통화의 최소 단위(minor unit, 예: 센트) 문자열이어야 한다.
 */
export async function setUserSpendLimit(
  apiKey: string,
  userId: string,
  amountMinorUnits: string,
  period: "monthly" = "monthly"
): Promise<{ id: string; amount: string | null; period: string }> {
  return adminRequest(apiKey, "POST", "/v1/organizations/spend_limits", {
    body: {
      scope: { type: "user", user_id: userId },
      amount: amountMinorUnits,
      period,
    },
  });
}

export async function deleteSpendLimit(apiKey: string, spendLimitId: string): Promise<void> {
  await adminRequest<unknown>(
    apiKey,
    "DELETE",
    `/v1/organizations/spend_limits/${encodeURIComponent(spendLimitId)}`
  );
}
