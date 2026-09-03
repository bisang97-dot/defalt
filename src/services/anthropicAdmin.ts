import { config } from "../config";
import type {
  EffectiveSpendLimitRow,
  OrgUser,
  RbacGroup,
  RbacGroupMember,
} from "../types";

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

async function adminRequest<T>(
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
      "x-api-key": config.anthropicAdminApiKey,
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

    const response = await adminRequest<Record<string, unknown>>("GET", path, { query });
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

export async function listOrgUsers(): Promise<OrgUser[]> {
  const raw = await paginateAll<RawOrgUser>("/v1/organizations/users", { limit: "100" });
  return raw.map((u) => ({ id: u.id, email: u.email, name: u.name ?? null, role: u.role }));
}

interface RawRbacGroup {
  id: string;
  name: string;
}

export async function listRbacGroups(): Promise<RbacGroup[]> {
  const raw = await paginateAll<RawRbacGroup>("/v1/organizations/rbac_groups", { limit: "100" });
  return raw.map((g) => ({ id: g.id, name: g.name }));
}

interface RawRbacGroupMember {
  user_id: string;
  email: string;
  group_id: string;
}

export async function listRbacGroupMembers(groupId: string): Promise<RbacGroupMember[]> {
  const raw = await paginateAll<RawRbacGroupMember>(
    `/v1/organizations/rbac_groups/${encodeURIComponent(groupId)}/members`,
    { limit: "100" }
  );
  return raw.map((m) => ({ userId: m.user_id, email: m.email, groupId: m.group_id ?? groupId }));
}

export async function listEffectiveSpendLimits(): Promise<EffectiveSpendLimitRow[]> {
  return paginateAll<EffectiveSpendLimitRow>("/v1/organizations/spend_limits/effective", {
    limit: "100",
  });
}

/**
 * 개인별(override) 토큰 사용 한도를 설정한다. amount 는 조직 결제 통화의 최소 단위(minor unit, 예: 센트) 문자열이어야 한다.
 */
export async function setUserSpendLimit(
  userId: string,
  amountMinorUnits: string,
  period: "monthly" = "monthly"
): Promise<{ id: string; amount: string | null; period: string }> {
  return adminRequest("POST", "/v1/organizations/spend_limits", {
    body: {
      scope: { type: "user", user_id: userId },
      amount: amountMinorUnits,
      period,
    },
  });
}

export async function deleteSpendLimit(spendLimitId: string): Promise<void> {
  await adminRequest<unknown>("DELETE", `/v1/organizations/spend_limits/${encodeURIComponent(spendLimitId)}`);
}
