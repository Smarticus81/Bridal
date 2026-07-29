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

## Phase 2 — Scaffold + schema (part 1: bridal data model)

Landed the entire **new bridal data model** as a clean additive layer, kept every `smoke:security`-asserted string intact (all assertions check *presence*, so additive schema does not break them). This is the foundation every novel subsystem (catalog, lookbooks, votes, leads, consent) builds on.

New Drizzle tables (`lib/db/src/schema/`):
- `dresses` + `dress_media` (`dresses.ts`) — catalog replacing glimpse's 5 static profile slots. Coverage slots `front`(required)/`back`/`detail`/`fabric`/`on_model` mirror venue coverage; `front` gates try-on readiness. `shop_ids int[]` links a dress to multiple storefronts. Unique `(organization_id, sku)`.
- `lookbooks` + `lookbook_dresses` (`lookbooks.ts`) — remote `/try/:lookbookToken` sets. `credit_cap` and `expires_at` are NOT NULL by design → a link can never be uncapped or unexpiring (§6.1). Unique `token`, unique `(lookbook_id, dress_id)`.
- `reactions` + `leads` (`engagement.ts`) — share-to-party votes (unique `(generated_asset_id, voter_token)` = one reaction per viewer per look) and post-render lead capture.
- `consent_records` (`consent.ts`) — explicit, bride-affirmed, timestamped, SHA-256 fingerprinted, with a `retention_expires_at` TTL horizon (default 90d) for the hard-delete purge job.

Strictness extended everywhere the readiness contract lives (invariant 2, §4 last bullet):
- `supabase/bootstrap.sql` — all 7 tables + their unique indexes.
- `supabase/production-v1-preflight.sql` — 12 new read-only checks (missing sku/style/status, duplicate SKUs, invalid/duplicate dress coverage, in-stock dresses missing a `front` image, uncapped/unexpiring/token-less lookbooks, duplicate votes, consent missing subject).
- `artifacts/api-server/src/lib/databaseReadiness.ts` — `REQUIRED_DATABASE_TABLES` / `COLUMNS` / `NOT_NULL_COLUMNS` / `INDEXES` all extended, so `/readyz` and `verify:production`'s `checkDatabaseSchema` enforce the new tables, non-null columns, and unique indexes at runtime.

**Verification (Phase 2 gate):** `pnpm run smoke:security` ✅ (exit 0, "security smoke passed") · `pnpm run typecheck` ✅ · `pnpm run build` ✅. Re-ran Phase 0/1 gates — still green.

**Remaining Phase 2 work (tracked, not yet done):** the mechanical `venue`→`shop` and `couple`→`bride` identifier rename across ~64 files, and replacing the `venue_media` routes/pipeline with the `dresses`/`dress_media` catalog subsystem. Per PORT-MAP §2 this is a coordinated sweep that must rewrite every `smoke:security` assertion in the same commit — it is the largest single mechanical unit in the port and is sequenced next. The new tables above intentionally reference the current `venues`/`couple_sessions` tables (documented as "shop = venues row, pre-rename") so they land green now and get renamed with everything else.

## Phase 2 — Scaffold + schema (part 2: lookbook/consent policy + tests)

Added `artifacts/api-server/src/lib/lookbookPolicy.ts` — pure, side-effect-free business rules the remote flow and purge job will call:
- `lookbookUsability` / `nextLookbookStatus` / `lookbookRemainingCredits` — enforce "never uncapped, never unexpiring" (§6.1): a revoked/expired/exhausted link cannot generate another look (reason ordered revoked → expired → exhausted).
- `retentionExpiryFor` (default 90d, per-shop override, invalid TTL falls back to default) and `isConsentPurgeable` (purge on revocation or past horizon; **never** on a missing horizon — a missing TTL must not silently drop a bride's data) (§6.3, invariant 8).

Unit test `lookbookPolicy.test.ts` (node:test via tsx), wired as `pnpm run test:lookbook-policy`. Imports from `@workspace/db/schema` (the deep export) rather than the db index, so the pure module and its test never instantiate the Postgres pool.

**Verification:** `test:lookbook-policy` 7/7 pass · `typecheck` ✅ · `build` ✅ · `smoke:security` ✅.

### Phase 2 status

Part 1 (bridal data model) and part 2 (policy + tests) are green and committed. The remaining Phase 2 unit — the mechanical `venue`→`shop` / `couple`→`bride` identifier rename plus swapping the `venue_media` routes/pipeline for the `dresses`/`dress_media` catalog — is a single coordinated sweep that must rewrite every `smoke:security` source-contract assertion in lockstep (PORT-MAP §2). It is sequenced as the next unit of work. See `docs/BLOCKERS.md` for the Phase 3-live / Phase 6-live credential+asset constraints that bound what is completable in this environment.

## Phase 2 — Scaffold + schema (part 3: dress coverage + try-on readiness)

Added `artifacts/api-server/src/lib/dressCoverage.ts` (bridal analogue of `venueMediaCoverage.ts`) with a unit test (`pnpm run test:dress-coverage`, 6/6):
- `dressCoverageStatus` — a dress is **try-on ready** the moment it has a validated `front` image (not full coverage, the way venue needed all five). Still reports missing slots for the console nudge, and names the `blockingGap` (`front`) when not ready. Feeds Phase 5's readiness state.
- `orderDressMediaForGeneration` / `DRESS_REFERENCE_PRIORITY` — deterministic reference ordering (front → detail → fabric → back → on_model), garment-fidelity detail ranked high, unknown-coverage rows stable-sorted last. Feeds Phase 3's reference-payload assembly.

Imports coverage constants from `@workspace/db/schema` (deep export, no pool).

**Verification:** `test:dress-coverage` 6/6 · `test:lookbook-policy` 7/7 · `typecheck` ✅ · `build` ✅ · `smoke:security` ✅.
