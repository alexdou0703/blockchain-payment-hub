# Production Hosting — Live URLs

## What your team uses

| What | URL |
| - | - |
| **Frontend (the website)** | https://payment-hub-frontend.vercel.app |
| Backend API | https://backend-production-5488.up.railway.app |
| Backend Swagger docs | https://backend-production-5488.up.railway.app/api/docs |

Smart contracts live on **Sepolia testnet** (immutable, shared across all environments):

| Contract | Address |
| - | - |
| EscrowManager | `0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B` |
| LogisticsOracle | `0xA1A34F39f2c2644941e40ef149813D22da7077e5` |
| DisputeResolution | `0xC9dE93D7c83D73b82Aa147BeE3653a86CD1cdCEe` |
| SettlementContract | `0xe6c346D2680D2c0cCfF4a00755fd947fA77E60c9` |
| MockUSDT | `0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0` |

---

## Architecture

```
┌────────────────────────────────────────────────┐
│  Browser (anywhere on the internet)            │
│  + MetaMask on Sepolia testnet                 │
└──────────────┬─────────────────────────────────┘
               │ HTTPS
               ▼
┌────────────────────────────────────────────────┐
│  Vercel — Frontend (Next.js 14)                │
│  payment-hub-frontend.vercel.app               │
│  Auto-redeploys from main branch               │
└──────────────┬─────────────────────────────────┘
               │ HTTPS (CORS-allowed cross-origin)
               ▼
┌────────────────────────────────────────────────┐
│  Railway — Backend (NestJS)                    │
│  backend-production-5488.up.railway.app        │
│  Auto-redeploys from main branch               │
└────────┬───────────────────────────┬───────────┘
         │ private network           │ HTTPS
         ▼                           ▼
┌─────────────────┐          ┌──────────────────┐
│ Railway Postgres│          │ Sepolia (Infura) │
│ Railway Redis   │          │ ethers.js        │
└─────────────────┘          └──────────────────┘
```

**Why split?** Railway's free plan caps at 3 services per project; we used those for Postgres, Redis, and the backend. Vercel hosts the Next.js frontend for free with no service cap, and is purpose-built for Next.js (faster builds, edge cache, automatic preview URLs per PR).

---

## Auto-deploy

Both Vercel and Railway are wired to the GitHub repo (`alexdou0703/blockchain-payment-hub`, branch `main`):

- Pushing to `main` triggers a Vercel build of the frontend.
- Pushing to `main` triggers a Railway build of the backend.

No manual redeploy needed for code changes.

---

## What testers need

1. **MetaMask** (or any WalletConnect wallet).
2. Wallet on **Sepolia testnet** (chain id `11155111`). The checkout page auto-prompts a switch if you're on the wrong chain.
3. **Sepolia ETH** for gas — free at https://www.alchemy.com/faucets/ethereum-sepolia
4. **MockUSDT** — ask the project deployer to mint some to your wallet (no public faucet — it's a test token).

The checkout page does pre-flight balance checks and shows clear errors with faucet links if either is short.

---

## On-chain error handling (frontend)

The checkout flow classifies and surfaces the common failure modes:

| Code | Meaning | What user sees |
| - | - | - |
| `user_rejected` | User cancelled the wallet popup | "You cancelled the transaction…" |
| `wrong_network` | Wallet not on Sepolia | Auto-prompt network switch |
| `insufficient_eth` | No Sepolia ETH for gas | Faucet link |
| `insufficient_usdt` | MockUSDT balance < amount | Mint hint |
| `insufficient_allowance` | approve() failed | "Approve again and retry" |
| `deadline_expired` | Payment older than 24h | Auto-refetch (backend re-signs) |
| `nonce_used` | Already locked on-chain | Clear message |
| `invalid_signature` | Merchant sig mismatch | Auto-refetch |
| `token_not_whitelisted` | Token not allowed | Surfaced |
| `rpc_error` | Sepolia RPC flaky | "Network error… try again" |
| `simulation_revert` | Other contract revert | The contract reason itself |

Pre-flight before sending the lock tx: chain check + auto-switch to Sepolia, ETH balance ≥ 0.001, USDT balance ≥ amount, approve receipt waited before lockEscrow, simulateContract first.

---

## Local re-deploy commands

You shouldn't normally need these — git push handles auto-deploy. But for debugging:

### Backend (Railway)

```bash
# Manual redeploy of latest main commit
RAILWAY_TOKEN=<your-project-token> \
  curl -sS https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{ serviceInstanceDeployV2(serviceId:\"<backend-id>\", environmentId:\"<env-id>\") }"}'

# View logs
railway logs --service backend
```

Project ID: `76d81044-83db-483b-a759-9cb132b36906`
Environment ID (production): `0ba9983a-9c02-49ff-a601-9d17291ce872`
Backend service ID: `78557a88-7f97-4788-a7de-f8ae484c67b9`

### Frontend (Vercel)

```bash
cd /Users/ducky08/Desktop/ecomBLC/payment-hub
VERCEL_TOKEN=<your-token> vercel deploy --prod --yes
```

Vercel project: `dylannn08200-4065s-projects/payment-hub-frontend`

---

## Updating env vars

### On Railway backend (any of the SEPOLIA_*, contract addresses, etc.):

Use the Railway dashboard at https://railway.com/project/76d81044-83db-483b-a759-9cb132b36906 → backend service → Variables, OR via API:

```bash
curl -sS https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation{ variableUpsert(input:{projectId:\"76d81044-83db-483b-a759-9cb132b36906\", environmentId:\"0ba9983a-9c02-49ff-a601-9d17291ce872\", serviceId:\"78557a88-7f97-4788-a7de-f8ae484c67b9\", name:\"MY_VAR\", value:\"my_value\"}) }"}'
```

### On Vercel frontend (the `NEXT_PUBLIC_*` vars):

Vercel dashboard at https://vercel.com/dylannn08200-4065s-projects/payment-hub-frontend/settings/environment-variables, OR via CLI:

```bash
echo "https://new-backend-url" | VERCEL_TOKEN=... vercel env add NEXT_PUBLIC_API_URL production
VERCEL_TOKEN=... vercel deploy --prod --yes  # rebuild needed — NEXT_PUBLIC_* are baked at build time
```

---

## Cloudflare quick tunnels (legacy "test in 5 minutes" mode)

`DEPLOYMENT.md` documents the cloudflared-tunnel setup that runs the whole stack on your Mac. It's ephemeral but sometimes useful for very rapid iteration. The Railway+Vercel setup above replaces it for permanent team testing.
