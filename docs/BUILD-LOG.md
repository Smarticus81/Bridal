# Build Log — veil (bridal try-on port)

Codename `veil` is a placeholder pending Phase 1 rename decision.

## Phase 0 — Seed & baseline

- **Seeded** target repo `Smarticus81/Bridal` from source `Smarticus81/Venue-Vision-Weaver` (glimpse) at SHA `cf5e634f854f63b581e88f82e819951c3d165430` (shallow clone via session git proxy).
- Copied the full source tree minus `.git`. Confirmed **no `.env`** came across; `.env.example` retained.
- **Runtime identity must be severed:** Supabase, Clerk, and Stripe for `veil` must be *new* projects/accounts, never glimpse's. Reusing glimpse's Clerk orgs would mix bridal shops into venue billing. This is a deployment-time obligation recorded here per §2.1.
- `glimpse` remote intentionally *not* added to the working repo (source lives at `/workspace/venue-vision-weaver` for reference); origin remains `Smarticus81/Bridal` only. Never push to glimpse.

### Baseline verification (unmodified tree)

| Command | Result |
|---|---|
| `pnpm install` | ✅ pass (engine warning only: node v22 vs wanted >=24 — non-fatal) |
| `pnpm run typecheck` | ✅ pass |
| `pnpm run build` | ✅ pass |
| `pnpm run smoke:security` | ✅ pass (exit 0; Gemini calls use in-test fake models, no live credential needed) |

**Environment note:** node v22.22.2 is the newest available in this environment (no node 24). The `engines` field wants `>=24`; pnpm emits an unsupported-engine WARN but installs and all gates pass. Not treated as a blocker. If a later gate needs node 24 semantics, revisit.

Baseline is green — every later failure is something the port introduced.

## Phase 1 — Recon

Produced `docs/PORT-MAP.md` — grounded in the actual seeded tree (three deep reads: the `smoke:security` source-contract, the routes/auth map, the generation pipeline). Every claim cites a file that was read.

Key findings driving the port:
- `smoke:security` is a **source-contract test** — ~40 `readFileSync` + `assert.match` blocks against schema/SQL/routes/docs/UI. The venue→shop rename must update *every* assertion in the same commit (invariant 1). This makes the rename a coordinated sweep, not a local edit.
- `verify:production` re-runs the smoke suite + `checkDatabaseSchema` (via `databaseReadiness.ts`) + built-artifact + ffmpeg + gallery-QA-evidence checks. `--skip-qa` short-circuits only the QA-evidence check.
- Production startup guard (`envValidation.ts`) enforces the Gemini-3 model chain, thresholds, attempts≥4, min-edge≥1024, v1beta base URL — keep and strengthen (§5.1).
- owner-auth tables are **dormant** (Clerk supersedes) but **load-bearing for gates** — keep them; no flows to remove.
- The "4 stills + 1 reel = 5 assets" completeness invariant is asserted in 6 places; dropping the reel (§11) touches all of them + the smoke test together.

Spec corrections recorded (§6 of PORT-MAP): repo uses `GEMINI_*`/`GALLERY_*` env names (not `TRYON_*`); `--no-fallback`/`--fixtures` don't exist yet (port must add); harness writes `quality-report.json` (human writes `manual-acceptance.json`); fixture matrix is 20×5, not a single pair.

**Verification (Phase 1 gate):** `docs/PORT-MAP.md` exists; every claim grounded in a read file. ✅
