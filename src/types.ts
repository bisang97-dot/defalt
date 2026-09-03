export interface OrgUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface RbacGroup {
  id: string;
  name: string;
}

export interface RbacGroupMember {
  userId: string;
  email: string;
  groupId: string;
}

/**
 * Anthropic Spend Limits API 의 "source" 필드는 open set 이므로
 * 알려진 필드 외 값은 방어적으로 처리한다.
 */
export interface SpendLimitSource {
  type: "user" | "seat_tier" | "rbac_group" | "organization" | string;
  seat_tier?: string;
  rbac_group_id?: string;
  group_id?: string;
  [key: string]: unknown;
}

export interface EffectiveSpendLimitRow {
  scope: { type: string; user_id?: string; [key: string]: unknown };
  actor: {
    type: string;
    user_id: string;
    name: string | null;
    email_address: string;
    deleted: boolean;
  };
  amount: string | null;
  currency: string;
  period: string;
  source: SpendLimitSource;
  spend_limit_id: string;
  period_to_date_spend: string;
}

export interface MemberView {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  groupIds: string[];
  groupNames: string[];
  effectiveAmount: string | null; // minor units, null = unlimited
  currency: string;
  period: string;
  sourceType: string;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  spendLimitId: string;
  periodToDateSpend: string;
  hasIndividualOverride: boolean;
  groupBaselineAmount: string | null;
  groupBaselineKnown: boolean;
}
