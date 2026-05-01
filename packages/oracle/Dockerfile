# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/oracle/package.json ./packages/oracle/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

COPY packages/shared ./packages/shared
COPY packages/oracle/src ./packages/oracle/src
COPY packages/oracle/tsconfig.json ./packages/oracle/
COPY packages/oracle/nest-cli.json ./packages/oracle/

WORKDIR /app/packages/oracle
RUN pnpm run build

# ── Stage 3: Production image ──────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/oracle/package.json ./packages/oracle/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/oracle/dist ./packages/oracle/dist
COPY packages/shared/src ./packages/shared/src

ENV NODE_ENV=production
EXPOSE 3002

CMD ["node", "packages/oracle/dist/main"]
