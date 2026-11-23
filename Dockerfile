FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# --- Dependency layer (cached unless the lockfile changes) ---
# `pnpm fetch` populates the local store from pnpm-lock.yaml alone, so editing
# application source never busts this layer. On Railway that turns most rebuilds
# into a fast relink + build instead of a full dependency re-download.
COPY pnpm-lock.yaml .npmrc ./
RUN pnpm fetch

# --- Workspace manifests + source, installed from the fetched store ---
COPY package.json pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY supabase ./supabase

RUN pnpm install --frozen-lockfile --prefer-offline

# Optional: bake the (public) Clerk publishable key into the SPA bundle.
# Railway passes service variables as build args when declared here. The
# server also injects the key at runtime, so this is best-effort only.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
