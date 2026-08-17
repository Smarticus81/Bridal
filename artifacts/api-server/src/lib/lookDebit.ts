/**
 * The per-look credit-debit decision (spec §6.6, invariant 7). One look costs
 * exactly one credit — inclusive of every generation attempt and fallback — and
 * the charge is bounded twice: by the lookbook's own credit cap and by the
 * organization's shared balance (the shop pays). This is the pure decision the
 * route's DB transaction applies with a guarded compare-and-set, so the debit is
 * idempotent under generation retry.
 */

/** One look = one credit, regardless of attempts or model fallbacks. */
export const LOOK_CREDIT_COST = 1;

export interface LookDebitInput {
  creditCap: number;
  creditsUsed: number;
  orgCreditsBalance: number;
}

export type LookDebitDecision =
  | { ok: true; cost: number; nextCreditsUsed: number; nextOrgBalance: number }
  | { ok: false; reason: "lookbook_exhausted" | "insufficient_org_credits" };

/**
 * Decide whether a look may be charged and what the resulting balances are.
 * Lookbook cap is checked first (it's the bride-facing limit), then the org
 * balance (the commercial limit). Never returns negative balances.
 */
export function decideLookDebit(input: LookDebitInput): LookDebitDecision {
  const remaining = input.creditCap - input.creditsUsed;
  if (remaining < LOOK_CREDIT_COST) {
    return { ok: false, reason: "lookbook_exhausted" };
  }
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
