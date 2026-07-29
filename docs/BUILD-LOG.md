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
