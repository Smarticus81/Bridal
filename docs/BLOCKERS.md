# Blockers

Recorded per §1.3. These are environment/credential/asset blockers, not code defects — they stop specific phases from *fully completing* in this build environment, but do not stop other workstreams (per §1.3 the run continues on independent work).

## B1 — Phase 3 live fidelity loop: credential PROVIDED; still needs the ported harness + real bride×dress fixtures

- **Update (key added):** `GOOGLE_AI_API_KEY` is now set in the environment. Verified live 2026-07-29: the key lists models and **generates** images. The full spec chain is reachable — `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-2.5-pro` all present — and a live `gemini-3-pro-image:generateContent` returned a real JPEG. The production model chain is real, not aspirational. The credential half of this blocker is cleared.
- **Command that still cannot pass here:** `pnpm run tryon:qa -- --fixtures ./samples/eval --no-fallback` (the live scorecard, §1.2 Phase 3 / §5.4).
- **Why it still can't run:** two gaps remain — (1) the `tryon:qa` harness + garment-fidelity quality gate are **not yet written** (only glimpse's `gallery:qa` exists); this is buildable code. (2) The loop scores generated images of **real** brides in **real** dresses against a 20×5 matrix; no consented real fixtures exist in this environment. Synthetic stand-ins can prove the *mechanism* but cannot produce a meaningful garment-fidelity scorecard, and §1.5/§5.4 require consented real references.
- **Key is a secret:** stored in env only (no `.env` file present); never written to a tracked file or commit.
- **Not violable:** faking the scorecard, lowering the 0.88 garment-fidelity threshold, or hiding a weak primary behind fallbacks are all forbidden (§1.4). Writing `manual-acceptance.json` unsigned is forbidden (§1.5).
- **What proceeds regardless:** all Phase 3 *code* — the garment-fidelity quality-gate rewrite, `tryon:qa` harness (incl. the new `--no-fallback` / `--fixtures` flags that don't exist in glimpse, PORT-MAP §6.2), thresholds, the production startup guard, and the disclaimer string — is buildable and verified by `smoke:security` / `typecheck` / `build` and `verify:production --skip-qa` (the plumbing path §1.5 sanctions). Only the live scorecard waits on the credential+assets.
- **Best hypothesis for unblock:** provision a new Google AI Studio key and a consented fixture set, then run the loop on real infrastructure.

## B2 — Phase 6 live `verify:production` needs new Supabase/Clerk/Stripe projects

- **Command that cannot fully pass here:** `pnpm run verify:production` against real production env (§1.2 Phase 6, §2.1).
- **Why:** §2.1 requires *new* Supabase, Clerk, and Stripe projects (never glimpse's). `checkDatabaseSchema` needs a live `DATABASE_URL`; `checkRemoteReadiness` needs a deployed `/api/readyz`; the production env guard needs live `sk_live_`/Clerk/Supabase values. These are deploy-time credentials, not code.
- **Measured state (2026-07-29) — `verify:production --skip-qa --skip-db`:** the code-side checks all PASS —
  - ✅ `build artifacts` (both bundles exist)
  - ✅ `security smoke` (source-contract suite passes)
  - ✅ `ffmpeg` (Dockerfile installs it; live `--url` re-checks post-deploy)
  - The only FAIL is `production env`, and every line is a **missing credential** (PORT, DATABASE_URL, UPLOAD_TOKEN_SECRET, SESSION_SECRET, the five `STRIPE_*`, RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, Supabase/GCS storage). No code defect.
- **Deliberately NOT faked:** supplying synthetic `sk_live_…`/Supabase values to force a green would be writing fake credentials into a readiness gate (§1.4 / invariant 2-3). The verifier is meant to fail without real ones. Provisioning the new projects + running with their env is the deploy step.
- **What proceeds regardless:** the schema contract is enforced statically by `smoke:security` + `databaseReadiness`; the build/smoke/ffmpeg checks are green now. The live run is a deployment step gated on credentials + the §1.5 human acceptance.

## B3 — `manual-acceptance.json` is intentionally unwritable by the agent

- Per §1.5 this is a named human attesting they reviewed generated images of real brides in real dresses. It is deliberately left for a reviewer; the build assembles everything up to it (`READY-FOR-REVIEW.md`, `review.html`) and stops there. Not a defect — the designed launch gate.

---

None of these halts the build (§1.3): the port continues on the code workstreams — schema (done), the venue→shop/couple→bride rename, generation-gate code, bride flows, and inventory — all of which are verifiable with the local gates.
