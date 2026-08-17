# PORT-MAP — glimpse → veil (bridal try-on)

Recon of the seeded glimpse tree (source SHA `cf5e634`). Every claim below is grounded in a file that was read. Section 6 records where this spec is wrong about the code; **the repo wins** and the port follows the repo.

Domain rename axes the port applies:
- **venue → shop** (billing sub-tenant / storefront location)
- **venue_media (5 static slots) → dresses + dress_media** (catalog subsystem)
- **couple_session → bride_session**, **couple_media → bride_media**, **partner scoring collapses to single subject**
- **gallery (4 stills + reel) → looks (N, one per dress), reel dropped (§11)**
- **venue preservation score → garment fidelity score** (threshold 0.80 → 0.88)

---

## 1. Route + component inventory with auth posture

### API routes (Express 5, mounted under `/api` via `routes/index.ts`)

Auth primitives live in `artifacts/api-server/src/lib/orgAuth.ts`. There is **no global auth middleware**; routes call helpers inline that write their own error and return `null` on failure:
- `requireOrg(req,res)` — Clerk `userId` (401) + active `orgId` (403 `no_active_organization`); 503 if Clerk unconfigured. Provisions local org row, adopts legacy venues.
- `requireOrgVenue(req,res,slug)` — `requireOwnerMutationOrigin` → `requireOrg` → loads venue, 404 unless it belongs to caller's org. **This becomes `requireOrgShop`.**
- `requireOwnerMutationOrigin` — CSRF-style origin check on unsafe methods.
- `getCallerOrgDbId(req)` — non-throwing org id, used by storage ACL.

| Route | File:line | Auth | Bridal fate |
|---|---|---|---|
| `GET /healthz` | health.ts:13 | public | reuse |
| `GET /readyz` | health.ts:36 | public | extend (consent+retention state §6.3) |
| `GET /gallery-styles` | galleryStyles.ts:6 | public | rename → look styles (or retire) |
| `POST /venues` | venues.ts:204 | mutationOrigin+requireOrg | rename → `POST /shops` |
| `GET /venues` | venues.ts:313 | public (disabled 404) | rename |
| `GET /venues/:slug` | venues.ts:318 | public (mints couple uploadToken) | rename → shop profile |
| `PATCH /venues/:slug` | venues.ts:348 | requireOrgVenue | rename |
| `GET /venues/:slug/dashboard` | venues.ts:421 | requireOrgVenue | rename → shop console |
| `GET /venues/:slug/stats` | venues.ts:472 | requireOrgVenue | rename |
| `GET /venues/:slug/media` | venues.ts:526 | requireOrgVenue | **replace** → dress catalog / dress_media |
| `POST /venues/:slug/media` | venues.ts:546 | requireOrgVenue | **replace** → dress image ingestion |
| `DELETE /venues/:slug/media/:mediaId` | venues.ts:638 | requireOrgVenue | **replace** |
| `POST /venues/:slug/sessions` | sessions.ts:200 | **public** (IP-rate-limited, credit-gated, upload-intent-authorized) | rename → bride session; add lookbook-token variant §6 |
| `GET /sessions/:id` | sessions.ts:416 | requireOrgVenue (via session's venue) | rename; exposes PII (bride email) |
| `DELETE /sessions/:id` | sessions.ts:464 | requireOrgVenue | rename |
| `GET /sessions/by-token/:shareToken` | sessions.ts:521 | tokenized (≥16 ch), never returns PII | reuse for `/v/:shareToken` |
| `GET /venues/:slug/sessions` | sessions.ts:567 | requireOrgVenue | rename |
| `POST /sessions/recover` | sessions.ts:607 | public, IP+email rate-limited | reuse (emails share links) |
| `POST /sessions/:id/send-email` | sessions.ts:656 | requireOrgVenue | reuse |
| `POST /sessions/by-token/:shareToken/send-email` | sessions.ts:716 | tokenized | reuse |
| `POST /storage/uploads/request-url` | storage.ts:52 | mixed: venue→requireOrgVenue / couple→uploadToken | rename purposes venue→shop/dress; add bride+moderation §6.2 |
| `GET /storage/public-objects/*filePath` | storage.ts:136 | public | reuse |
| `GET /storage/objects/*path` | storage.ts:175 | ACL `canReadStoredObject` | reuse, extend for dress/bride |
| `GET /org` | billing.ts:38 | requireOrg | reuse |
| `GET /org/credit-history` | billing.ts:70 | requireOrg | reuse |
| `POST /org/billing/checkout` | billing.ts:114 | mutationOrigin+requireOrg | reuse |
| `POST /org/billing/portal` | billing.ts:170 | mutationOrigin+requireOrg | reuse |
| `POST /api/billing/webhook` | app.ts (raw body), `handleStripeWebhook` billing.ts:194 | Stripe sig | reuse (idempotent grants) |
| `POST /api/webhooks/clerk` | app.ts (raw body), `handleClerkWebhook` billing.ts:310 | svix sig | reuse (org name sync) |

App assembly (`app.ts`): trust-proxy → pino → `securityHeaders` (custom, not helmet; CSP allowlists Supabase+Clerk) → cors(credentials) → cookieParser → `clerkMiddleware()` on `/api` only → raw-body webhooks BEFORE `express.json` → `/api` router → `/api/*` JSON-404 catch-all → SPA (`GET /v/:shareToken` OG-meta injection; static `dist/public`; catch-all `serveIndexHtml` injects Clerk key meta). Rate limiting is in-memory token bucket (`lib/rateLimit.ts`), called ad hoc.

Process entry (`index.ts`): `assertProductionEnvironment()` (guard), requires `PORT`, boots cleanup jobs (`cleanupOrphanedSessions`, `cleanupExpiredUploadIntents`, `cleanupExpiredOwnerAuth`) + `startSessionWorker()`.

### Frontend (React 19 + Vite + wouter, Clerk provider in `main.tsx`)

| Path | Component | Access | Bridal fate |
|---|---|---|---|
| `/` | VenueLandingPage | public | rename → shop-facing marketing |
| `/couple` | LandingPage | public | rename → bride landing |
| `/login` | OwnerLoginPage (Clerk `<SignIn>`) | Clerk | reuse |
| `/find-my-gallery` | FindMyGalleryPage | public | reuse (bride gallery recovery) |
| `/create-venue` | CreateVenuePage (`<SignUp>`+`<OrgGate>`) | auth-gated | rename → create-shop |
| `/dashboard` | VenueOwnerPage (`<OrgGate>`) | auth-gated | rename → shop console + catalog |
| `/preview/:slug` | CouplePage | public | **in-store bride flow** (§6, consultant-driven) |
| `/v/:shareToken` | GallerySharePage | tokenized | reuse + votes (§6.4) |
| `/try/:lookbookToken` | — | — | **NEW remote flow** (§6) |
| `*` | not-found | public | reuse |

Clerk is end-to-end (§10 invariant 10 satisfied): `<SignIn>`/`<SignUp>`/`<CreateOrganization>` widgets only; `OrgGate` mirrors backend `requireOrg`; **no PIN/password/magic-link flows in the frontend**. The `owner_credentials`/`owner_login_tokens`/`owner_sessions` tables are **dormant** — no login/session route mounts them; only the boot cleanup job (`cleanupExpiredOwnerAuth`) and schema-presence checks reference them. They must stay in the schema because `databaseReadiness` + `verify:production` still require them (see §3).

---

## 2. The `smoke:security` build contract

`scripts/src/security-smoke.ts` (1854 lines) is one linear `try/finally` that ends `console.log("security smoke passed")`. It is a **source-contract test**: it `fs.readFileSync`s ~40 source/doc files and runs `assert.match` / `assert.ok(!/.../.test())` against their raw text. **Any rename must update every one of these assertions in the same commit** (invariant 1). Grouped by target file (must-match unless noted):

- **Schema/SQL** — `lib/db/src/schema/credits.ts` (`credit_transactions_stripe_event_id_unique … IS NOT NULL`); `supabase/bootstrap.sql` (org table `clerk_org_id TEXT NOT NULL UNIQUE`, `credits_balance … DEFAULT 5`, `organization_id … REFERENCES organizations(id)`; `generated_assets` unique indexes on `object_key` and `(session_id, asset_type, display_order)`; `upload_intents` `venue_id … REFERENCES venues(id)`; `venue_media` `coverage TEXT NOT NULL DEFAULT 'detail'`; `venues.owner_email … SET NOT NULL`; `couple_sessions.couple_email/share_token … SET NOT NULL/UNIQUE`); `supabase/production-v1-preflight.sql` (all 9 check names, incl. `venues_missing_owner_email`, `venue_media_missing_or_invalid_coverage`, `venues_missing_required_media_coverage`); `lib/db/src/schema/uploads.ts`.
- **databaseReadiness.ts** — asserts `REQUIRED_DATABASE_TABLES` includes `upload_intents`; columns incl. `generated_assets.quality_report`, `owner_login_tokens.token_hash`, `owner_sessions.session_hash`; `venue_media: ["id","venue_id","object_key","coverage","display_order","created_at"]`; NOT-NULL sets for `venues.owner_email`, `couple_sessions.couple_email/share_token`; index labels incl. `credit_transactions_stripe_event_id_unique … is not null`.
- **health.ts** — `checks.database` derived from `missingRequiredDatabaseSchema()`; `productionImageModelChainReady` requires `models[0] === "gemini-3-pro-image"` and `models.every(... gemini-3 ...)`.
- **verify-production.ts (self-assert)** — presence of `checkDatabaseSchema`, `checkSecuritySmoke` ("Gallery, auth, storage, billing, and source-contract smoke suite passed"), `checkGalleryQaEvidence` (`--skip-qa`, `--qa-report`, `manual-acceptance.json`, `summary?.automatedPass !== true`), `isSha256` `^[a-f0-9]{64}$`, `hasValidReferenceFingerprints(...,2,3)` couple / `(...,5)` venue.
- **Env docs/templates** — `.env.example`, `railway.env.template`, `docs/gallery-qa.md` all must contain `GALLERY_FRAME_ATTEMPTS=4`, `GALLERY_MIN_LIKENESS_SCORE=0.82`, `GALLERY_MIN_PARTNER_LIKENESS_SCORE=0.78`, `GALLERY_MIN_VENUE_SCORE=0.80`, `GALLERY_MIN_COMPOSITION_SCORE=0.74`, `GENERATED_IMAGE_MIN_CONTRAST=8`, `GENERATED_IMAGE_MIN_SHARPNESS=6`. `railway.env.template` also `SUPABASE_STORAGE_BUCKET=glimpse`, `SUPABASE_PUBLIC_BUCKET=glimpse-public`.
- **openapi.yaml** — `VenueMediaItem` `required: [id, venueId, objectKey, coverage, displayOrder, createdAt]`; `VenueMediaCoverage: enum [exterior, ceremony, reception, detail, natural_light]`; `AddVenueMediaBody required: [objectKey, coverage]`; `OwnerSessionDetailResponse` "Only returned from owner-session protected endpoints"; `/sessions/by-token/{shareToken}` "Never returns PII like coupleEmail".
- **Routes** — `orgAuth.ts` (`requireOrgVenue`, `eq(venuesTable.organizationId, ctx.org.id)`); `venues.ts` (`router.post("/venues"`, `insert(venueMediaTable)`, `assertVenueMediaDistinct`, and **must-NOT-match** `owners/(login|logout|password-login|login-link|recover)|OWNER_SESSION_COOKIE` and `createOwnerLoginLink|sendOwnerRecoveryEmail|sendOwnerLoginEmail`); `sessions.ts` (`db.transaction`, `gte(...creditsBalance, neededCredits)`, `insert(coupleSessionsTable)`, `creditsCharged: neededCredits`); `billing.ts` (checkout/portal/org routes, Stripe webhook idempotency via `stripeEventId`); `storage.ts`; `index.ts` cleanup jobs; `app.ts`; `rateLimit.ts`.
- **Frontend** — `App.tsx` routes; `VenueLandingPage.tsx` (`/create-venue`, `/login`); `VenueOwnerPage.tsx` (`COVERAGE_OPTIONS` = the 5 coverages, `OrgGate`, billing hooks); `CouplePage.tsx` (`COUPLE_REFERENCE_ROLES = ["Together","Partner A","Partner B"]`; **must-NOT-match** `out of credits|top up|billing|subscription|owner profile|dashboard|create-venue|/profile|/dashboard`); `GallerySharePage.tsx`+`CouplePage.tsx` **must-NOT-match** `film|approval|approve|veo|dialogue|extended`.
- **Live Gemini-3 fetch mock** (1585–1848) — asserts the assembled prompt contains `COUPLE IDENTITY MANIFEST`, `VENUE SCENE MANIFEST`, `VENUE COVERAGE ROLES`, `COMPOSITING HARD CONSTRAINT`, per-image coverage captions; Gemini-3 Pro stable path sends exactly **9 images = 3 couple + 6 venue**; legacy path max **14 = 3 couple + 11 venue** (`VENUE CONTEXT REFERENCE 12` must be absent); endpoint must be stable `:generateContent` on `/v1beta`, no `Api-Revision` header; `imageConfig.aspectRatio "1:1"`, `imageSize "2K"`.

Also non-file: `assert.rejects` on reference-quality (`too dark`, `washed out`, `blurry`), production token-secret guard (`UPLOAD_TOKEN_SECRET`), reset-stuck-session SQL (`total_assets = 5`, 4 stills + 1 reel).

**Consequence for the port:** the "5 assets = 4 stills + 1 reel" completeness invariant is wired into `reset-stuck-session.cjs`, `galleryGeneration.ts`, `app.ts`, `venues.ts`, `sessions.ts` and asserted. Dropping the reel (§11) and moving to N looks means re-deriving this completeness rule everywhere it is asserted — a coordinated change, not a local one.

---

## 3. Drizzle schema map + `verify:production` DB contract

`lib/db/src/schema/`:

| Table | Key columns | NOT NULL (verify:production) | Unique index (verify:production) |
|---|---|---|---|
| `organizations` | `clerk_org_id` uniq, `plan`, `credits_balance` def 5, stripe ids | id,name,slug… | `clerk_org_id` unique |
| `venues` → **shops** | `slug` uniq, `owner_email`, `organization_id` (nullable legacy), plan, credits, stripe | id,name,slug,owner_email,plan,credits_balance,created_at | `slug` unique |
| `venue_media` → **dress_media** | `venue_id` FK cascade, `object_key`, `coverage` def detail, `display_order` | id,venue_id,object_key,coverage,display_order,created_at | `(venue_id, object_key)` unique |
| `upload_intents` | `object_key`, `venue_id` FK, `purpose`, size/type, `expires_at`, `consumed_at` | id,object_key,venue_id,purpose,…,expires_at,created_at | `object_key` unique |
| `couple_sessions` → **bride_sessions** | `venue_id` FK, status, `couple_email`, `share_token` uniq, `credits_charged` | id,venue_id,status,couple_email,share_token,credits_charged,created_at | `share_token` unique |
| `couple_media` → **bride_media** | `session_id` FK, `object_key` | id,session_id,object_key,created_at | — |
| `generated_assets` | `session_id` FK, `object_key` uniq, `asset_type`, `display_order`, `generation_model`, `generation_attempts`, `venue_reference_indexes` jsonb, `quality_report` jsonb | id,session_id,object_key,asset_type,display_order,created_at | `object_key` unique; `(session_id, asset_type, display_order)` unique |
| `credit_transactions` | `organization_id`, `venue_id` FK, `delta`, `reason`, `session_id`, `stripe_event_id` | id,delta,reason,created_at | **partial** unique `stripe_event_id WHERE NOT NULL` |
| `owner_credentials` / `owner_login_tokens` / `owner_sessions` | dormant (Clerk supersedes) | required by readiness | `owner_email`/`token_hash`/`session_hash` unique |

`databaseReadiness.ts` enforces tables/columns/not-null/indexes at runtime (`/readyz` `checks.database`) and is re-asserted by `verify:production` `checkDatabaseSchema` and by `smoke:security`. **New bridal tables must be added to all four: the Drizzle schema, `bootstrap.sql`, `production-v1-preflight.sql`, and `databaseReadiness.ts` constants** — plus their new NOT-NULL columns and unique indexes, to keep the readiness check strict (invariant 2, spec §4 last bullet).

---

## 4. Generation pipeline trace

Worker (`sessionWorker.ts`, MAX_CONCURRENT 2, POLL 2s) → `processSession` (`gallerySessionPipeline.ts`) claims pending→processing, loads style + venue/couple media, downloads buffers (couple `slice(0,3)`).
1. **Reference validation** — `assertReferenceImagesValid` (`referenceImage.ts`): MIN_COUPLE 2, MIN_VENUE 5, min edge 256px, brightness/contrast/sharpness (`referenceImageQuality.ts`), near-dup dHash hamming ≤4.
2. **Per-frame loop** — `processGallerySession` (`galleryGeneration.ts`) over `planGalleryScenes` (4 scenes, `scenePlan.ts`) → `renderGalleryFrameWithQuality`.
3. **Reference selection** — `selectVenueMediaForGeneration` picks 1 per coverage (order: exterior, ceremony, reception, detail, natural_light) then fills to `MAX_VENUE_REFERENCES_FOR_GALLERY=11`; per-scene `selectVenueReferences` merges coverage-preferred + Gemini-ranked (`venueReferenceSelector.ts`) + static, capped 11 (14 total − 3 couple).
4. **Prompt assembly** — `buildSceneKontextPrompt` (IDENTITY/VENUE/COMPOSITING LOCK, ≤1800 ch); retry appends `retryGuidance`; deeper manifests in `buildReferencePayload` (`stillImageClient.ts`).
5. **Reference prep** — `prepareReferenceImage` (deterministic Lanczos → **1024px** min edge, normalize, mild sharpen, **no generative restoration**).
6. **Gemini call** — `generateCinematicStillWithMetadata` walks `configuredImageModels()`; `:generateContent` (or `/interactions` for Gemini-3 when `GEMINI_USE_INTERACTIONS_API`); model-specific ref caps (`gemini-3-pro-image` → {couple 3, venue 6}); output post-validated (`validateGeneratedStill`: resolution/aspect/brightness/contrast/sharpness).
7. **Quality judge** — `assertGalleryFrameQuality` (`galleryQuality.ts`) on `GEMINI_QUALITY_MODEL` (temp 0, JSON), ≤14 judge images.
8. **Adaptive retry** — over `GALLERY_FRAME_ATTEMPTS` (default 4, clamp 1–5); keeps best by `frameQualityScore` (weakest-partner 0.35 / likeness 0.25 / venue 0.25 / composition 0.15); `qualityRetryGuidanceForError` feeds next prompt; best-effort floor delivery still enforces hard integrity.
9. **Branded polish** — `polishGalleryFrame` (`galleryFrame.ts`): modulate + sharpen + vignette + mozjpeg q92.
10. **Storage** — `uploadBufferToStorage` → `insert generatedAssetsTable` (model, attempts, ref indexes, quality report).
11. **Motion reel** — `buildKenBurnsSlideshow` (**dropped in bridal, §11 — removes ffmpeg from deploy path**).
12. **Finalize** — `hasCompletePublicGalleryAssets` guard (4 stills + 1 reel) → status ready → notify owner. Failure path deletes partials, sets failed, `refundCreditsForSession` (idempotent compare-and-set).

**Credits:** `creditsForSession` = 1; charged atomically at session create in one `db.transaction` (guarded `gte(creditsBalance, needed)`); refund idempotent. Bridal: **1 look = 1 credit** — the debit unit moves from session to look; idempotency must hold per-look under generation retry (invariant 7).

**Production startup guard** (`envValidation.ts`, runs only `NODE_ENV=production`): refuses chain not starting `gemini-3-pro-image`; refuses non-`/^gemini-3(?:\.\d+)?-(?:pro|flash)-image$/` image models; refuses non-Pro judge (`/^gemini-(?:2\.5|3)-pro/`); forces quality gate on; floors every threshold; requires attempts ≥4, min-edge ≥1024, contrast/sharpness floors; rejects non-`v1beta` base URL; constrains image size ∈ {1K,2K,4K}. **Keep and strengthen (§5.1).**

---

## 5. Reuse verdict per module

| Module | Verdict |
|---|---|
| `organizations`, Clerk org auth (`orgAuth.ts`), `requireOrg` | **reuse as-is** |
| Stripe billing + webhook idempotency (`billing.ts`, `credits.ts`, `stripe.ts`) | **reuse as-is** (retune tier caps §6.6) |
| Storage, upload intents, object ACL, upload tokens | **reuse**, extend purposes (dress/bride) + moderation |
| Reference preprocessing (`referenceImagePreparation.ts`, `referenceImageQuality.ts`) | **reuse as-is** (§5.3: apply to dress refs too) |
| `stillImageClient.ts` (Gemini chain + guard) | **reuse**, rename venue→dress ref vocabulary; keep guard |
| `galleryQuality.ts` | **rewrite** axes: drop per-partner, add garment fidelity 0.88 + body-proportion 0.85; keep integrity checks |
| `galleryGeneration.ts` / `gallerySessionPipeline.ts` / `scenePlan.ts` | **rewrite** for N-looks-per-dress, dress reference selection, no reel |
| `venueReferenceSelector.ts` / `venueMediaCoverage.ts` | **rewrite** → dress coverage slots (front/back/detail/fabric/on_model), front required |
| `motionReel.ts` / `byteRange.ts` / ffmpeg | **retire** (§11) — but note asset-completeness assertions must be re-derived |
| `galleryQa.ts` harness | **rewrite** → `tryon:qa`, `samples/bride`+`samples/dress`, garment axes |
| `venues`/`venue_media` tables + routes | **rename** venues→shops; **replace** venue_media with dresses+dress_media |
| `couple_sessions`/`couple_media` | **rename** → bride_*; collapse partner scoring |
| Frontend pages | **rename** venue→shop; **new** `/try/:lookbookToken`, lookbooks, votes, photo gate |
| `dresses`, `lookbooks`, `lookbook_dresses`, `reactions`, `leads`, `consent_records` | **new** |
| owner-auth tables | **keep dormant** (readiness requires them); do not add flows |

---

## 6. Corrections — where this spec is wrong about the code (repo wins)

1. **Env var names.** Spec §5.1 uses `TRYON_IMAGE_MODEL`, `TRYON_IMAGE_FALLBACK_MODELS`, `TRYON_QUALITY_MODEL`, `TRYON_FRAME_ATTEMPTS`. **The repo uses** `GEMINI_IMAGE_MODEL`, `GEMINI_IMAGE_FALLBACK_MODELS`, `GEMINI_QUALITY_MODEL`, `GALLERY_FRAME_ATTEMPTS` (`.env.example`, `envValidation.ts`, `galleryQuality.ts`). `smoke:security` asserts the literal strings `GALLERY_FRAME_ATTEMPTS=4` etc. in three doc files. The port keeps the `GEMINI_*`/`GALLERY_*`/`GENERATED_IMAGE_*` names (renaming them means rewriting the guard + smoke assertions with no functional gain); the score-axis rename (venue→garment) is the meaningful change, done via `GALLERY_MIN_VENUE_SCORE` → a garment-fidelity threshold raised to 0.88.
2. **`--no-fallback` does not exist.** Spec §1.2/§5.4 invoke `tryon:qa -- --fixtures ./samples/eval --no-fallback`. glimpse's `galleryQa.ts` has only `--consent-confirmed` and `--allow-nonpassing`; no `--fixtures`, no `--no-fallback`. The port must **add** `--no-fallback` (disable fallback chain) and either `--fixtures` or keep `--couple`/`--venue` → `--bride`/`--dress`. Recorded so the port implements them rather than assuming they exist.
3. **`--skip-qa` lives in `verify-production.ts`, not the QA harness.** Spec §1.5 is right that `--skip-qa` exists for plumbing — but it short-circuits `checkGalleryQaEvidence` in the *verifier*, not the QA tool. Correct target confirmed.
4. **`manual-acceptance.json` is not written by the harness.** The harness writes `quality-report.json`; `manual-acceptance.json` is created by a human reviewer and *validated* by `verify-production.ts` (`accepted:true`, non-empty `reviewedBy`, parseable `reviewedAt`). Matches §1.5's "do not write it" rule.
5. **Fixture counts differ.** Spec §5.4 says fixtures = 20 dresses × 5 brides; glimpse harness takes one couple folder (2–3) + one venue folder (≥5) per run. The port's `tryon:qa` must iterate the fixture matrix, not assume a single pair.
6. **`/preview/:slug` is the couple flow surface** (CouplePage), not a separate consultant UI. Spec §3 calls it "in-store flow"; the port layers consultant/tablet affordances onto CouplePage rather than building a new route.
7. **Reel completeness (4 stills + 1 reel = 5 assets)** is asserted in `reset-stuck-session.cjs`, `galleryGeneration.ts`, `sessions.ts`, `venues.ts`, `app.ts`, and `security-smoke.ts`. Dropping the reel (§11) is **not** a local delete — every asset-completeness assertion and the smoke test must change together, in the same rename commit, to stay green.
8. **owner-auth tables are dormant but load-bearing for gates.** They cannot simply be deleted: `databaseReadiness`, `bootstrap.sql`, and `smoke:security` require their presence. Keep the tables; keep no flows (invariant 10 already satisfied — nothing to remove on the frontend).
9. **Node engine:** `package.json` wants `>=24`; this environment has node v22. pnpm warns but all gates pass. Not a code correction — an environment note (see BUILD-LOG).

---

## Blockers foreseen (for §1.3 / BLOCKERS.md when reached)

- **Phase 3 live fidelity loop** needs `GOOGLE_AI_API_KEY` (live Gemini) **and** real bride×dress reference images (20×5 matrix). Neither is available in this environment → the live scorecard cannot be produced here. Code plumbing (quality-gate rewrite, `tryon:qa`, thresholds, guard, disclaimer) is buildable and verifiable with the smoke/typecheck/build gates and `--skip-qa`.
- **Phase 6 `verify:production` against real production env** needs new Supabase/Clerk/Stripe projects (§2.1) — deployment credentials, not code. Buildable/verifiable locally with `--skip-qa` + `--skip-db` for plumbing; the live run is a deploy-time step.
- **`manual-acceptance.json`** is intentionally not writable by an agent (§1.5) — the launch gate waits on a named human review.
