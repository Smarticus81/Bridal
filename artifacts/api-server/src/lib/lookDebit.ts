/** One look = one credit, regardless of attempts or model fallbacks. */
export const LOOK_CREDIT_COST = 1;

export interface LookDebitInput {
  creditsUsed: number;
  orgCreditsBalance: number;
}

export type LookDebitDecision =
  | { ok: true; cost: number; nextCreditsUsed: number; nextOrgBalance: number }
  | { ok: false; reason: "insufficient_org_credits" };

export function decideLookDebit(input: LookDebitInput): LookDebitDecision {
  if (input.orgCreditsBalance < LOOK_CREDIT_COST) {
    return { ok: false, reason: "insufficient_org_credits" };
  }
  return {
    ok: true,
    cost: LOOK_CREDIT_COST,
    nextCreditsUsed: input.creditsUsed + LOOK_CREDIT_COST,
    nextOrgBalance: input.orgCreditsBalance - LOOK_CREDIT_COST,
  };
}
