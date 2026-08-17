# Railway environment variables

Grounded in the production startup guard (`artifacts/api-server/src/lib/envValidation.ts`),
`/api/readyz`, and every `process.env.*` the code reads. Set these in
**Railway → your service → Variables**. The deploy runs the `Dockerfile`
(`railway.toml`), which sets `NODE_ENV=production` and installs `ffmpeg`.

> Generate the two secrets with `pnpm run generate:secrets`. Use a **new**
> Supabase / Clerk / Stripe project — never reuse another app's.

## 1. Required for full production readiness

Missing values no longer crash the boot: the server starts in **setup mode**
(the SPA serves, unconfigured subsystems answer 503, and `/api/readyz` stays
503 until every check passes). Only `PORT` and `DATABASE_URL` are needed for
the process to come up at all. Set `STRICT_PRODUCTION_BOOT=1` to restore the
hard crash-on-incomplete-env guard for the final launch cutover.

| Variable | Notes |
|---|---|
| `PORT` | Railway injects it; Dockerfile defaults `5000`. Must be a positive integer. |
| `DATABASE_URL` | Supabase Postgres URI (session pooler), `...?sslmode=require`. |
| `UPLOAD_TOKEN_SECRET` | Long random string. |
| `SESSION_SECRET` | Long random string (different from the above). |
| `SUPABASE_URL` | `https://<project>.supabase.co` (not the placeholder). |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key. |
| `GOOGLE_AI_API_KEY` | Gemini key (or `GEMINI_API_KEY`). Powers generation + the quality judge. |
| `STRIPE_SECRET_KEY` | Must be a **live** `sk_live_…` key in production. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for `POST /api/billing/webhook`. |
| `STRIPE_PRICE_STARTER_MONTHLY` | Real `price_…` id (not a placeholder label). |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Real `price_…` id. |
| `STRIPE_PRICE_CREDIT_PACK_10` | Real `price_…` id. |
| `RESEND_API_KEY` | `re_…`. |
| `EMAIL_FROM` | Verified sender, e.g. `veil <noreply@yourdomain.com>` — **not** `onboarding@resend.dev`. |
| `APP_BASE_URL` | Public https URL for emails/share links, e.g. `https://<svc>.up.railway.app`. Can be omitted **only** if `RAILWAY_PUBLIC_DOMAIN` is present (Railway sets it). |

*Storage alternative:* instead of the two `SUPABASE_*` storage vars you may set
`PRIVATE_OBJECT_DIR` + `PUBLIC_OBJECT_SEARCH_PATHS` (GCS). One pair is required.

## 2. AI model chain — production defaults; the guard rejects weaker values

These already default to safe values in code; set them explicitly so nothing
drifts. The guard **refuses to boot** if the chain doesn't start with
`gemini-3-pro-image`, if the judge isn't a Gemini Pro model, if the gate is off,
if any threshold/attempt/edge is lowered, or if the base URL isn't `v1beta`.

```
GEMINI_IMAGE_MODEL=gemini-3-pro-image
GEMINI_IMAGE_FALLBACK_MODELS=gemini-3.1-flash-image
GEMINI_QUALITY_MODEL=gemini-2.5-pro
GEMINI_IMAGE_SIZE=2K                       # one of 1K, 2K, 4K
GENERATED_IMAGE_MIN_EDGE_PX=1024           # >= 1024
GENERATED_IMAGE_MIN_CONTRAST=8             # >= 8
GENERATED_IMAGE_MIN_SHARPNESS=6            # >= 6
GALLERY_FRAME_ATTEMPTS=4                   # >= 4
GALLERY_QUALITY_GATE=on
GALLERY_MIN_LIKENESS_SCORE=0.82
GALLERY_MIN_PARTNER_LIKENESS_SCORE=0.78
GALLERY_MIN_VENUE_SCORE=0.80
GALLERY_MIN_COMPOSITION_SCORE=0.74
```

**Bridal garment-fidelity gate** (default to the target; the guard refuses lower):

```
TRYON_QUALITY_GATE=on
TRYON_MIN_LIKENESS_SCORE=0.82
TRYON_MIN_GARMENT_SCORE=0.88               # garment fidelity — never lower
TRYON_MIN_BODY_PROPORTION_SCORE=0.85       # non-negotiable
TRYON_MIN_COMPOSITION_SCORE=0.74
```

## 3. Storage buckets

```
SUPABASE_STORAGE_BUCKET=<your private bucket>   # create it; `pnpm run setup:storage` provisions it
SUPABASE_PUBLIC_BUCKET=<your public bucket>
```

## 4. Clerk — optional at boot, required for owner / org / billing to work

Without these the app still deploys, but owner/organization routes return 503
and the console shows a setup notice. Use `pk_test_`/`sk_test_` on the
`*.up.railway.app` host; `pk_live_`/`sk_live_` only work from the Clerk
instance's own domain.

```
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...     # also declare as a Dockerfile build arg to bake into the SPA
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...     # for POST /api/webhooks/clerk (org name sync)
```

## 5. Optional tuning (safe defaults; leave unset unless needed)

```
# NODE_ENV=production            # Dockerfile already sets this
# LOG_LEVEL=info
# FFMPEG_PATH=/usr/bin/ffmpeg    # ffmpeg is on PATH via the Dockerfile; leave unset
# GEMINI_API_BASE_URL=https://generativelanguage.googleapis.com/v1beta   # must be v1beta if set
# STALE_PROCESSING_SESSION_MINUTES=90
# UPLOAD_INTENT_CLEANUP_BATCH_SIZE=100
# OWNER_AUTH_CLEANUP_BATCH_SIZE=500
# GALLERY_FLOOR_LIKENESS_SCORE / _PARTNER_ / _VENUE_ / _COMPOSITION_   # best-effort floors
# TRYON_FLOOR_LIKENESS_SCORE / TRYON_FLOOR_GARMENT_SCORE / TRYON_FLOOR_COMPOSITION_SCORE
```

Railway provides `RAILWAY_PUBLIC_DOMAIN` / `RAILWAY_STATIC_URL` automatically —
the app falls back to them for `APP_BASE_URL` when it's unset.

## First deploy

1. Set the §1 variables (+ §2/§3, and §4 to enable the console).
2. Deploy — the Dockerfile builds and starts `node dist/index.mjs`.
3. Railway health-checks `/api/readyz`; it stays 503 until DB + storage + AI are reachable. First run only: apply the schema (`pnpm run setup:db`) and provision buckets (`pnpm run setup:storage`).
4. Point the Stripe webhook at `https://<host>/api/billing/webhook` and the Clerk webhook at `https://<host>/api/webhooks/clerk`.
