# Blockers

Recorded per §1.3. These are environment/credential/asset blockers, not code defects — they stop specific phases from *fully completing* in this build environment, but do not stop other workstreams (per §1.3 the run continues on independent work).

## B1 — Phase 3 live fidelity loop needs a Gemini key + real bride×dress fixtures

- **Command that cannot pass here:** `pnpm run tryon:qa -- --fixtures ./samples/eval --no-fallback` (the live scorecard, §1.2 Phase 3 / §5.4).
- **Why:** the loop generates images through live Gemini (`GOOGLE_AI_API_KEY`) against a 20-dress × 5-bride fixture matrix of **real** brides in **real** dresses. This environment has neither the API credential nor the consented reference images. §5.4 also requires running with fallbacks disabled against the live primary — there is nothing to run against.
- **Not violable:** faking the scorecard, lowering the 0.88 garment-fidelity threshold, or hiding a weak primary behind fallbacks are all forbidden (§1.4). Writing `manual-acceptance.json` unsigned is forbidden (§1.5).
- **What proceeds regardless:** all Phase 3 *code* — the garment-fidelity quality-gate rewrite, `tryon:qa` harness (incl. the new `--no-fallback` / `--fixtures` flags that don't exist in glimpse, PORT-MAP §6.2), thresholds, the production startup guard, and the disclaimer string — is buildable and verified by `smoke:security` / `typecheck` / `build` and `verify:production --skip-qa` (the plumbing path §1.5 sanctions). Only the live scorecard waits on the credential+assets.
- **Best hypothesis for unblock:** provision a new Google AI Studio key and a consented fixture set, then run the loop on real infrastructure.

## B2 — Phase 6 live `verify:production` needs new Supabase/Clerk/Stripe projects

- **Command that cannot fully pass here:** `pnpm run verify:production` against real production env (§1.2 Phase 6, §2.1).
- **Why:** §2.1 requires *new* Supabase, Clerk, and Stripe projects (never glimpse's). `checkDatabaseSchema` needs a live `DATABASE_URL`; `checkRemoteReadiness` needs a deployed `/api/readyz`; the production env guard needs live `sk_live_`/Clerk/Supabase values. These are deploy-time credentials, not code.
- **What proceeds regardless:** `verify:production --skip-qa --skip-db` exercises the built-artifact, security-smoke, and ffmpeg-config checks locally; the schema contract is enforced statically by `smoke:security` + `databaseReadiness`. The live run is a deployment step gated on credentials + the §1.5 human acceptance.

## B3 — `manual-acceptance.json` is intentionally unwritable by the agent

- Per §1.5 this is a named human attesting they reviewed generated images of real brides in real dresses. It is deliberately left for a reviewer; the build assembles everything up to it (`READY-FOR-REVIEW.md`, `review.html`) and stops there. Not a defect — the designed launch gate.

---

None of these halts the build (§1.3): the port continues on the code workstreams — schema (done), the venue→shop/couple→bride rename, generation-gate code, bride flows, and inventory — all of which are verifiable with the local gates.
