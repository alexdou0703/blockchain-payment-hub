# Permanent Hosting on Railway

The Cloudflare quick tunnels in `DEPLOYMENT.md` are great for "I want my team to test it in 5 minutes," but they die when this Mac sleeps. For 24/7 uptime, deploy to **Railway** — it picks up the Dockerfiles already in this repo, gives every service a permanent `*.up.railway.app` URL, and provides managed Postgres + Redis. Estimated setup time: ~15 minutes. Cost: covered by Railway's $5/mo free credit for a project this size.

## One-time setup

### 1. Authenticate the Railway CLI (only thing that needs your browser)

In your terminal (or paste in the Claude Code prompt with the `!` prefix):

```
railway login
```

A browser opens; approve, return to terminal. From here on, the CLI is authenticated locally.

### 2. Create the Railway project + add managed plugins

```bash
cd /Users/ducky08/Desktop/ecomBLC/payment-hub
railway init                       # name it "payment-hub"
railway add --database postgres    # spins up a managed Postgres
railway add --database redis       # spins up a managed Redis
```

Both managed plugins automatically expose `DATABASE_URL` and `REDIS_URL` env variables, available to every service in the project.

### 3. Create the three application services

Railway needs each Dockerfile-based service registered separately because we have three apps in one repo. The CLI command for monorepo services:

```bash
# Backend (NestJS)
railway service create backend
railway link --service backend
railway variables set --kv \
  NODE_ENV=production \
  PORT=3001 \
  SEPOLIA_RPC_URL='https://sepolia.infura.io/v3/190f6462cfbd4f6dbc78382957536876' \
  SEPOLIA_WS_URL='wss://sepolia.infura.io/ws/v3/190f6462cfbd4f6dbc78382957536876' \
  ESCROW_CONTRACT_ADDRESS=0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B \
  DISPUTE_CONTRACT_ADDRESS=0xC9dE93D7c83D73b82Aa147BeE3653a86CD1cdCEe \
  ORACLE_CONTRACT_ADDRESS=0xA1A34F39f2c2644941e40ef149813D22da7077e5 \
  SETTLEMENT_CONTRACT_ADDRESS=0xe6c346D2680D2c0cCfF4a00755fd947fA77E60c9 \
  USDT_ADDRESS=0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0 \
  TREASURY_ADDRESS=0x160F267cEF249Ced05c30e32172E9420E8Ad1EC8 \
  ETHERSCAN_API_KEY='X49A2V9UZ6EJ3XVUXAV157225AFEJ4WRMQ' \
  DEPLOYER_PRIVATE_KEY='<copy from .env — do NOT commit>' \
  PINATA_JWT='<copy from .env if set>' \
  CORS_ALLOWED_ORIGINS='https://<frontend>.up.railway.app'  # fill after step 5
railway up --detach

# Oracle
railway service create oracle
railway link --service oracle
railway variables set --kv \
  NODE_ENV=production \
  PORT=3002 \
  SEPOLIA_RPC_URL='https://sepolia.infura.io/v3/190f6462cfbd4f6dbc78382957536876' \
  LOGISTICS_ORACLE_ADDRESS=0xA1A34F39f2c2644941e40ef149813D22da7077e5 \
  BACKEND_API_URL='https://<backend>.up.railway.app'  # fill after step 4
railway up --detach
```

### 4. Grab the backend URL, then create the frontend

After step 3 the backend has a public URL (Railway dashboard → backend → Settings → Domains; or `railway domain`). Copy that URL.

```bash
railway service create frontend
railway link --service frontend
railway variables set --kv \
  NODE_ENV=production \
  PORT=3000 \
  NEXT_PUBLIC_API_URL='https://<backend>.up.railway.app' \
  NEXT_PUBLIC_WS_URL='https://<backend>.up.railway.app' \
  NEXT_PUBLIC_ESCROW_ADDRESS=0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B \
  NEXT_PUBLIC_USDT_ADDRESS=0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0 \
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=105e6b3219f2a5739f739ba9010ddbd3
railway up --detach
```

> **Why `NEXT_PUBLIC_*` must be set BEFORE `railway up`:** Next.js inlines these into the static JS bundle at build time. Setting them after deploy doesn't change the running site — you'd have to redeploy.

### 5. Wire CORS back to the frontend domain

After step 4 the frontend has a public URL too. Go back to the backend service variables:

```bash
railway link --service backend
railway variables set --kv CORS_ALLOWED_ORIGINS='https://<frontend>.up.railway.app'
railway redeploy
```

Backend CORS is already permissive for `*.up.railway.app` via the regex in `packages/backend/src/main.ts`, so this step is belt-and-suspenders — the env var is only needed if you later put a custom domain in front.

### 6. Hand the team the frontend URL

That's the production-ready URL. It survives Mac sleeps, restarts, IP changes, everything.

---

## What about MockUSDT for testers?

There's no public faucet for the MockUSDT token (it's a private test token deployed by you). When a tester wants to try the system, they need MockUSDT minted to their wallet. Run from your machine (using `.env` with the deployer private key):

```bash
# From repo root
npx hardhat console --network sepolia
> const usdt = await ethers.getContractAt('MockUSDT', '0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0')
> await usdt.mint('<tester-wallet-address>', ethers.parseUnits('1000', 6))  // 1000 MockUSDT
```

(Or add a small REST endpoint to the backend behind admin auth — but for a dissertation cohort, manual minting is fine.)

---

## Continuous deploys

Once the project is set up, every `git push origin main` redeploys all three services automatically (Railway watches GitHub). Branch deploys are also supported per service in the dashboard.

---

## Falling back if Railway free credit runs out

Same Dockerfiles work on:

- **Fly.io** — `flyctl launch` from each `packages/*/` directory; Postgres via `flyctl postgres create`; Redis via Upstash addon. ~$0/mo on free tier.
- **Render** — drop a `render.yaml` at repo root; free tier sleeps after 15 min idle which **breaks the blockchain event listener**, so use a paid web service ($7/mo) for the backend.
- **Any VPS** — `docker compose up -d` from the existing `docker-compose.yml`.

The codebase is hosting-agnostic — the only thing pinning it to one provider is the env-var wiring above.
