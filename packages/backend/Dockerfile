# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace root manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy package.json for each workspace package (enables dependency resolution)
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/

WORKDIR /app/packages/backend
RUN pnpm run build

# ── Stage 3: Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output and shared source
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY packages/shared/src ./packages/shared/src

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "packages/backend/dist/main"]
