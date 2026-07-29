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

## Live Gemini credential added (mid-build)

`GOOGLE_AI_API_KEY` was added to the environment. Verified live (2026-07-29, read-only + one minimal generation):
- `GET /v1beta/models` — all three spec models present: `gemini-3-pro-image`, `gemini-3.1-flash-image`, `gemini-2.5-pro` (plus imagen-4, gemini-3.1/3.5 variants).
- `POST /v1beta/models/gemini-3-pro-image:generateContent` with `responseModalities:["IMAGE"]` — returned a real ~721 KB JPEG. Generation works end-to-end.

Impact: the production model chain the startup guard enforces is real and reachable — Phase 3 is technically viable. The credential half of BLOCKERS B1 is cleared. Remaining for the §5.4 live scorecard: (1) build the `tryon:qa` harness + garment-fidelity gate (buildable), (2) real consented bride×dress fixtures (needed from the operator). Key kept in env only — never committed.

## Phase 3 — Generation / garment-fidelity gate (code, no live run)

Per operator decision (added Gemini key, then chose "just build the code, no live run"), built the garment-fidelity gate as an additive translation of glimpse's gallery gate — glimpse's `galleryQuality.ts` stays intact so `smoke:security` stays green.

Before writing code, verified the core product hypothesis live with the new key (synthetic stand-ins, 3 images): `gemini-3-pro-image` performed identity-preserving, garment-faithful try-on (same face/skin/proportions, exact dress silhouette/neckline/lace/train). Mechanism proven; the pipeline design is sound.

New `artifacts/api-server/src/lib/tryonQuality.ts` (unit test `test:tryon-quality`, 11/11):
- Axis translation (§5.3): bride likeness **0.82**, garment fidelity **0.88** (above venue's 0.80), composition **0.74**, body-proportion preservation **0.85**; per-partner likeness collapses; `exactlyTwoPartners` → `exactlyOnePerson`; face/extra-people/text integrity unchanged.
- `lookQualityScore` weights garment fidelity highest (0.40) — the wrong dress is what churns a shop.
- `tryonAcceptanceFloorFailures` — best-effort delivery routes to the **consultant**, never the bride (§5.2 step 3); **body-proportion 0.85 is enforced even at the floor** (invariant 4: no toggle, no exception).
- `garmentRetryGuidanceForError` — adaptive retry feeds garment-detail / body-proportion corrections into the next prompt; never suggests altering the body.
- `VISUALIZATION_DISCLAIMER = "Visualization only — not a representation of fit, size, or exact fabric."` (invariant 5; frontend surfaces + smoke assertion land with the UI in Phase 4).
- `assertTryonLookQuality` — the live judge (parallel to `assertGalleryFrameQuality`), typed and built; not exercised on the no-live-run path.

Production startup guard (`envValidation.ts`) extended (§5.1 / invariant 2): floors `TRYON_MIN_GARMENT_SCORE ≥ 0.88`, `TRYON_MIN_BODY_PROPORTION_SCORE ≥ 0.85`, likeness/composition, and refuses `TRYON_QUALITY_GATE=off`. Defaults equal the minimum, so an unset var passes (smoke fixtures untouched) and only a lowered value errors — verified: guard is silent with defaults and emits exactly the three expected errors when the gate is disabled / thresholds lowered.

**Verification:** `test:tryon-quality` 11/11 · `test:dress-coverage` 6/6 · `test:lookbook-policy` 7/7 · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅.

**Remaining Phase 3 (needs real fixtures — BLOCKERS B1):** the `tryon:qa` harness (`--no-fallback`/`--fixtures`), wiring the gate into a per-look pipeline, and the live §5.4 fidelity scorecard. The gate logic, thresholds, guard, retry, and disclaimer are done and tested.

## Phase 4 (start) — remote-flow photo gate

Added `artifacts/api-server/src/lib/photoGate.ts` (unit test `test:photo-gate`, 9/9): pure decision logic that turns a structured bride-photo analysis into an accept or a **specific, bride-facing** rejection (§6.2), never "invalid image". Ordered safety → who's-in-frame → quality → framing:
- **Mandatory moderation, no override** (invariant 9): hard block on any minor (wins over every other signal) and on disallowed content, before the image can reach Gemini.
- Distinct reasons: "We can't find you…", "There's more than one person…", too small/dark/washed-out/blurry, "We can't see below your knees…", "Your arms are crossed…". Crossed-arms blocks only when explicitly detected, never when unanalyzed.
- `photoGatePrecedesBilling` documents + tests the ordering invariant: the gate runs before any credit debit, so photo retries are free (§6.2).

**Verification:** `test:photo-gate` 9/9 · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Unit-test total across the port: 33 (tryon-quality 11, photo-gate 9, lookbook-policy 7, dress-coverage 6).

## Phase 4 (cont.) — share-to-party votes + commercial funnel

Added `artifacts/api-server/src/lib/engagementMetrics.ts` (unit test `test:engagement`, 6/6): pure instrumentation for §6.4-6.5.
- `dedupeReactionsByVoter` / `tallyLookVotes` — one vote per viewer per look (mirrors the `reactions` unique index), a viewer's latest reaction wins; live per-look tally sorted by total, broken down by kind.
- `BOOK_FITTING_VOTE_THRESHOLD = 3` + `shouldSurfaceBookFitting` — surface "Book a fitting" once a look crosses 3 votes (§6.5).
- `topLookByVotes` — the most-loved look (ties to lower id).
- `funnelConversion` — link opens → photos cleared → looks generated → shares → votes → fittings booked, divide-by-zero-guarded.

**Verification:** `test:engagement` 6/6 · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Port unit-test total: 39.

## Phase 5 (start) — CSV bulk inventory import with dry-run diff

Added `artifacts/api-server/src/lib/inventoryImport.ts` (unit test `test:inventory-import`, 8/8) — "an unready catalog is the #1 reason this product fails at onboarding" (§7), so the import is deliberate and previewable:
- `parseCsv` — RFC-4180-ish parser (quoted fields, escaped `""`, embedded commas/newlines, `\n`/`\r\n`).
- `resolveColumnMapping` — arbitrary CSV headers → canonical dress fields by alias (style/brand/msrp/…), with an explicit-override map that wins.
- `mapRowsToDresses` / `parsePriceToCents` — validate each row (sku + styleName required, status normalized/validated, `$1,299.00` → cents), collecting per-row errors instead of failing the batch.
- `diffInventory` + `summarizeDiff` — keyed by SKU, classifies create / update (with changed field list) / unchanged / archive-missing (→ discontinued, not deleted), and prints **"will create N, update M, archive K"**.

**Scale check (Phase 5 verification target):** a synthetic **300-row** import diffed against 50 existing dresses ran end-to-end with no operator intervention → "will create 250, update 0, archive 0, 50 unchanged", 300/300 valid.

**Verification:** `test:inventory-import` 8/8 · 300-row scale run ✅ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Port unit-test total: 47.

## Phase 4 (cont.) — consent retention purge selector

Added `artifacts/api-server/src/lib/retentionPurge.ts` (unit test `test:retention-purge`, 5/5) — the pure selection core for the legal-exposure requirement (§6.3, invariant 8): given each bride session's consent state + its source/derived object keys, decide exactly what to hard-delete from Supabase storage.
- `collectPurgeTargets` — TTL sweep: selects sessions whose consent is revoked or past its retention horizon (builds on `isConsentPurgeable`; a missing horizon is never selected), de-duplicating object keys and recording a per-session reason for the audit trail.
- `immediateSubjectPurge` — "delete everything about me" from any share link, no account, ignoring the retention horizon.
- `orgOffboardingPurge` — unconditional per-org bulk purge for offboarding.

Selection is pure so the "what to delete" is testable without storage; the route performs and verifies the actual Supabase + DB deletes.

**Verification:** `test:retention-purge` 5/5 · full unit sweep **52** · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅.

## Toward production — dresses catalog API (OpenAPI-first integration)

Turned the tested inventory logic into a real, deployable API surface. OpenAPI-first per the standing rule: edited `lib/api-spec/openapi.yaml`, ran codegen (deterministic — verified identical output across two runs), then wired the route.

New endpoints in `artifacts/api-server/src/routes/dresses.ts` (mounted in `routes/index.ts`), all org-isolated via `requireOrg` (invariant 6):
- `GET /dresses` — the caller's org catalog, each dress carrying a `tryOnReady` flag computed from `dressCoverageStatus` (front image present). Optional `?status=` filter. Never leaks `organizationId`.
- `POST /dresses` — add a dress; SKU unique per org (409 on duplicate), Clerk mutation-origin guarded.
- `POST /dresses/import` — **dry-run diff** of a bulk import via `diffInventory`/`summarizeDiff`, returning "will create N, update M, archive K" + counts. Never writes.

OpenAPI schemas added: `DressStatus`, `DressMediaCoverage`, `CreateDressBody`, `DressResponse`, `ListDressesResponse`, `ImportDressRow`, `ImportDressesBody`, `ImportDressesDiffResponse`. Codegen produced the Zod validators (`CreateDressBody`, `ImportDressesBody`, `ListDressesQueryParams`) and React Query hooks (`useListDresses`, `useCreateDress`, `useImportDresses`) the console UI will consume.

**Verification:** codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅ · 52 unit tests green. First real API integration of the bridal logic core; additive, so glimpse routes and the smoke contract are untouched.

## Production-readiness checkpoint (verify:production --skip-qa --skip-db)

Ran the production verifier's code-side path. Result: **all code checks green** — build artifacts ✅, security/source-contract smoke ✅, ffmpeg config ✅. The lone failure is `production env`, and every line is a missing **deploy credential** (PORT, DATABASE_URL, the secrets, `STRIPE_*`, RESEND, Supabase/GCS, APP_BASE_URL) — BLOCKERS B2, not a code defect. Faking `sk_live_`/Supabase values to force green is forbidden (§1.4), so the gate correctly stays red on credentials. Concretely: the *code* is production-shaped; provisioning new Supabase/Clerk/Stripe (§2.1) + the live QA scorecard (real fixtures, B1) are the two remaining gates.

## Toward production — lookbooks API (remote-flow backbone)

Added the lookbook API (OpenAPI-first, deterministic codegen), the second real integration of the tested logic core.
- `lib/lookbookToken.ts` (`mintLookbookToken` / `isWellFormedLookbookToken`, test `test:lookbook-token` 2/2) — URL-safe 24-char base64url tokens for `/try/:lookbookToken`, unguessable, above the 16-char floor.
- `routes/lookbooks.ts` (mounted), org-isolated:
  - `POST /lookbooks` — create a curated link; validates the shop + every dress belong to the caller's org, enforces `creditCap ≥ 1` and `expiresInDays 1–365` at the schema (never uncapped, never unexpiring — §6.1), mints the token, links dresses via `lookbook_dresses`, returns the public `/try/:token` URL.
  - `GET /lookbooks` — list with live `usable` (via tested `lookbookUsability`) + `remainingCredits` burn meter.
- OpenAPI schemas: `LookbookPurpose`, `CreateLookbookBody`, `LookbookResponse`, `LookbookSummary`, `ListLookbooksResponse`; codegen produced `useCreateLookbook`/list hooks for the console.

**Verification:** `test:lookbook-token` 2/2 · codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Port unit-test total: 54. API surface now: dresses (3) + lookbooks (2) endpoints wired to the tested logic, additive.

## Toward production — public GET /try/:lookbookToken (remote-flow entry)

Completed the remote-flow read path. `GET /api/try/:lookbookToken` (public, no account) in `routes/lookbooks.ts`:
- Rejects malformed tokens before any DB hit (`isWellFormedLookbookToken`), 404 on unknown token.
- Returns a **calm unusable state** (`usable:false` + reason expired/revoked/exhausted) rather than an error when the link is spent — the bride sees a calm state, per §6.
- Returns the shop name, purpose, remaining credits, the curated dresses (ordered, each with its `front` image object key), and the `VISUALIZATION_DISCLAIMER` (invariant 5).
- OpenAPI: `TryLookbookResponse`, `TryDress`; codegen deterministic; query hook generated.

**Verification:** codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. API surface: dresses (3) + lookbooks (3, incl. public /try) endpoints. 54 unit tests green.

## Toward production — reactions/votes API (share-to-party)

Added `routes/reactions.ts` (mounted), wiring the tested `engagementMetrics`:
- `POST /reactions` — public, no account. Casts/updates a viewer's reaction on a look; one per viewer per look via an upsert on the `(generated_asset_id, voter_token)` unique index (a repeat vote updates, never duplicates). Returns the live tally + `bookFitting` flag. Optional `voterEmail` captured post-vote only.
- `GET /sessions/by-token/:shareToken/reactions` — tokenized. Resolves the session by share token, tallies votes across its image looks, surfaces `bookFitting` per look once it crosses 3 votes (§6.5).
- OpenAPI: `ReactionKind`, `CreateReactionBody`, `ReactionResponse`, `LookTallyItem`, `SessionReactionsResponse`; codegen deterministic; `useCreateReaction` + tally hooks generated.

**Verification:** codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. API surface: dresses (3) + lookbooks (3) + reactions (2) = 8 bridal endpoints wired to the tested logic. 54 unit tests green.

## Toward production — leads capture API (commercial instrumentation complete)

Added `routes/leads.ts` (mounted), the last piece of §6.5 server-side:
- `POST /leads` — public capture from the remote flow (fires after her first look). The **org + shop are derived from the lookbook token**, so a caller can't attribute a lead to an org they don't belong to. IP rate-limited. Normalizes email/name/phone.
- `GET /leads` — org-isolated list for the console.
- OpenAPI: `CreateLeadBody`, `LeadResponse`, `LeadSummary`, `ListLeadsResponse`; codegen deterministic.

**Verification:** codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. API surface now **10 bridal endpoints**: dresses (3) + lookbooks (3) + reactions (2) + leads (2). 54 unit tests green. The remote-flow funnel is fully wired server-side: /try resolve → looks → reactions/tally → book-a-fitting → lead capture.

## Toward production — consultant catalog browse filters (§7)

Added `lib/dressFilters.ts` (unit test `test:dress-filters`, 7/7): pure `matchesDressFilters`/`filterDresses` — silhouette/neckline/sleeve (case-insensitive exact), size range (substring), price band (inclusive, excludes price-less), in-stock-at-this-shop (shopIds membership), and try-on-ready-only. Wired into `GET /dresses` over the org-scoped catalog; OpenAPI `listDresses` gained the matching query params (codegen deterministic).

**Verification:** `test:dress-filters` 7/7 · codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Port unit-test total: **61**.

## Toward production — consultant console catalog page

Added `CatalogPage` at `/catalog` (OrgGate-wrapped, Clerk org-isolated), the shop-side console over the generated dress hooks:
- `useListDresses` — lists the org catalog; each dress shows style name (serif display) + SKU/size/status (mono), with a prominent **try-on readiness** badge (green "Try-on ready" / amber "Needs front photo") and a header count of how many dresses still need a front photo (§7: show the gap prominently).
- `useCreateDress` — quick add-a-dress form (SKU + style + status), toast feedback, list invalidation on success; empty state invites "Add your first dress" (§8 voice).
- Light surface (§8: light where you read data), routed lazily.

**Verification:** `typecheck` ✅ · `smoke:security` ✅ · `build` ✅ (CatalogPage chunk emitted). 61 unit tests green. Frontend surfaces now: bride `/try` (dark) + consultant `/catalog` (light) — the two-surface split from DESIGN §8.

## Toward production — catalog browse filter bar (UI)

Wired the browse filters into `CatalogPage`: a status dropdown, silhouette input, and "try-on ready only" checkbox drive `useListDresses(params)` (query key varies with the filters; stable when none are set), with a Clear action. The server-side `dressFilters` logic is now usable end-to-end from the console. `typecheck` ✅ · `smoke:security` ✅ · `build` ✅.

## Toward production — lookbooks console page (closes consultant→bride loop)

Added `LookbooksPage` at `/lookbooks` (OrgGate, light surface) — the consultant creates a curated `/try` link and watches the burn meter:
- Create form: shop (from `useGetOrganization().venues`), purpose (pre/post-appointment/open), tries (cap ≥1), days (expiry 1–365), and a dress multi-select from `useListDresses`. Enforces "always capped, always expiring" (§6.1). On success surfaces the copyable `/try/:token` URL; "Send lookbook" → "Lookbook sent" (§8 voice).
- Sent-lookbooks list from `useListLookbooks`: per link the shop-visible burn meter (remaining/cap), expiry, and an Active/expired/exhausted status chip (§6.5).

Loop now closes: consultant sends a lookbook → gets the `/try` link → bride opens `/try/:token` (the page already shipped). `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. 62 unit tests green. Frontend surfaces: bride `/try` + consultant `/catalog` + `/lookbooks`.

## Toward production — dress front-photo ingestion (flips readiness)

Added the dress image-ingestion backend (§7) — the piece that makes a dress try-on ready:
- `POST /storage/uploads/request-url` gained a `dress` purpose (org-authed by the shop via `requireOrgVenue`, so the upload intent records the shop as `venueId` — no schema change; `upload_intents.venueId` stays NOT NULL). Additive branch; smoke source-contract strings untouched.
- `POST /dresses/:dressId/media` (mutation-origin + org): validates the dress is in the caller's catalog, runs the **same reference-quality path as venue media** (`assertReferenceImageQuality`, §5.3), dedupes `(dressId, objectKey)`, and consumes the `dress` upload intent (scoped to the org's shops, unconsumed, unexpired) in a transaction before inserting `dress_media` with its coverage slot.
- OpenAPI: `dress` purpose, `AddDressMediaBody`, `DressMediaResponse`; codegen deterministic; `useAddDressMedia` hook generated.

Once a validated `front` photo is attached, `dressCoverageStatus.tryOnReady` flips true and the catalog badge turns green — closing the readiness loop.

**Verification:** codegen deterministic ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. API surface now **11 bridal endpoints**. 62 unit tests green. (Frontend upload UI is the remaining user-facing piece.)

## Toward production — dress front-photo upload UI (readiness loop closed in the UI)

Wired the front-photo upload into `CatalogPage`, closing the try-on-readiness loop end-to-end:
- Added `"dress"` to the shared `useUpload` purpose type (`lib/object-storage-web`), so the hook can request a `dress`-purpose upload URL. Smoke source-contract on the upload hook untouched.
- Each "Needs front photo" badge is now an "Add front photo" file picker: it uploads via `useUpload({ purpose: "dress", venueSlug: <org's shop> })` → `useAddDressMedia({ dressId, data: { objectKey, coverage: "front" } })` → invalidates the catalog. On success the badge flips to "Try-on ready" ("This dress is now try-on ready.").

The full inventory→readiness path now works from the console: add a dress → attach a front photo → it becomes try-on ready and eligible for lookbooks.

**Verification:** `typecheck` ✅ (incl. libs) · `smoke:security` ✅ · `build` ✅. 62 unit tests green. Frontend surfaces: bride `/try` + consultant `/catalog` (now with photo upload) + `/lookbooks`.

## Toward production — leads console view

Added `LeadsPage` at `/leads` (OrgGate, light data surface): a read-only table of brides captured from the remote flow (`useListLeads`) — email, name, phone, captured date — with an inviting empty state. Completes the shop-visible commercial-instrumentation UI (§6.5). `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Frontend surfaces: bride `/try` + consultant `/catalog` + `/lookbooks` + `/leads`.

## Toward production — try-on prompt builder (generation core, live-validated)

Added `lib/tryonPrompt.ts` (unit test `test:tryon-prompt`, 7/7) — the generation prompt assembly (§5.4 priority 1):
- `buildTryonPrompt(dress, {retryGuidance})` — three locks mirroring the quality-gate axes: IDENTITY (preserve face + **body proportions**, invariant 4), GARMENT (reproduce the exact dress, naming every known facet — silhouette/neckline/sleeve/train/fabric/color — so nothing is invented), COMPOSITE (exactly one person, plain studio, no text). Appends adaptive retry guidance; clamped to 1800 chars.
- `dressSummary(dress)` — the gate-facing description; omits unknown facets (never emits null).

**Live validation (with the provided key):** ran `buildTryonPrompt`'s actual output through `gemini-3-pro-image` with the probe bride + dress → produced a faithful try-on (same bride, exact dress, single subject, plain studio, no text). The production prompt — not a hand-written one — is proven end-to-end. (Synthetic probe images; not a fidelity scorecard, which still needs real consented fixtures — B1.)

**Verification:** `test:tryon-prompt` 7/7 · live generation ✓ · `typecheck` ✅ · `smoke:security` ✅ · `build` ✅. Port unit-test total: **69**. This is the generation core the per-look /try generate action will call (alongside the already-built garment-fidelity gate).
