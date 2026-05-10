# Payment Hub — Public Test Deployment

Live URLs your team can hit from any browser (no localhost):

| What                | URL |
| ------------------- | --- |
| **Frontend (UI)**   | https://determination-highlighted-surplus-difference.trycloudflare.com |
| Backend API         | https://robust-function-determining-possibility.trycloudflare.com |
| Backend Swagger     | https://robust-function-determining-possibility.trycloudflare.com/api/docs |

The smart contracts are already live on **Sepolia testnet** — no redeploy needed.

| Contract        | Address |
| --------------- | --- |
| EscrowManager   | `0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B` |
| LogisticsOracle | `0xA1A34F39f2c2644941e40ef149813D22da7077e5` |
| DisputeResolution | `0xC9dE93D7c83D73b82Aa147BeE3653a86CD1cdCEe` |
| SettlementContract | `0xe6c346D2680D2c0cCfF4a00755fd947fA77E60c9` |
| MockUSDT        | `0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0` |

---

## What testers need

1. **MetaMask** (or any WalletConnect wallet) installed in their browser.
2. Wallet switched to **Sepolia testnet** (chain id `11155111`). The checkout page now auto-prompts a network switch if you're on the wrong chain.
3. **Sepolia ETH** for gas — free at https://www.alchemy.com/faucets/ethereum-sepolia
4. **MockUSDT** — ask the project deployer to mint some to your wallet (no public faucet — it's a test token).

The checkout page does pre-flight balance checks and shows a clear error + faucet link if either is short.

---

## Test flow

1. Hit the **Frontend** URL above.
2. Use the seller dashboard to find an order, or `POST /api/v1/orders` via Swagger to create one.
3. Open `<frontend>/checkout/<orderId>`.
4. Connect wallet → click "Pay …".
5. Approve USDT → confirm escrow lock. Both txs are sent to Sepolia.
6. View the on-chain tx on [sepolia.etherscan.io](https://sepolia.etherscan.io).

---

## On-chain error handling

The checkout flow now classifies and surfaces the common failure modes with actionable hints:

| Error code              | What it means                               | What user sees |
| ----------------------- | ------------------------------------------- | --- |
| `user_rejected`         | User cancelled the wallet popup             | "You cancelled the transaction in your wallet." |
| `wrong_network`         | Wallet not on Sepolia                       | Auto-prompt network switch |
| `insufficient_eth`      | No Sepolia ETH for gas                      | Faucet link |
| `insufficient_usdt`     | MockUSDT balance < amount                   | Mint hint |
| `insufficient_allowance`| Approve failed or was insufficient          | "Approve again and retry" |
| `deadline_expired`      | Payment request older than 24 h             | Auto-refetch (backend re-signs with fresh deadline) |
| `nonce_used`            | Same payment already locked on-chain        | Clear message |
| `invalid_signature`     | Merchant signature mismatch                 | Auto-refetch |
| `token_not_whitelisted` | Token not allowed by escrow                 | Surfaced |
| `rpc_error`             | Sepolia RPC down or flaky                   | "Network error … try again" |
| `simulation_revert`     | Other contract revert                       | The contract reason itself |

Pre-flight before sending the lock tx:
- Wallet on Sepolia (auto-switch).
- ETH balance ≥ 0.001 (covers two simple txs).
- USDT balance ≥ amount.
- Approve tx waited for inclusion before lockEscrow (avoids the "transferFrom no allowance" race).
- `simulateContract` runs first so reverts surface the real reason instead of viem's "gas too high" wrapper.

---

## How this is hosted (transparent)

This is **not** on Railway / Vercel / a VPS — it's the local stack on your Mac, exposed to the internet via Cloudflare's free quick tunnels. Trade-offs:

- **Pros:** zero cloud accounts, zero billing, instant.
- **Cons:** the public URLs disappear when this Mac sleeps or the `cloudflared` processes are killed. Quick-tunnel domains are also random per-restart, so the team needs the latest URL whenever the stack restarts.

If we need 24/7 uptime later, the `Dockerfile`s in `packages/{backend,frontend,oracle}/` already work with `docker-compose` — push to Railway / Fly.io and bind the same env vars.

---

## Process map (this Mac)

```
PostgreSQL  127.0.0.1:5432   — brew services
Redis       127.0.0.1:6379   — brew services
Backend     :3001            — node packages/backend/dist/main
Oracle      :3002            — node packages/oracle/dist/main      (internal only)
Frontend    :3000            — pnpm --filter frontend start
Tunnel BE   pid 23404        — cloudflared → 3001
Tunnel FE   pid 26020        — cloudflared → 3000
```

Logs live at `/tmp/payment-hub-logs/`:

```
backend.log  oracle.log  frontend.log  tunnel-backend.log  tunnel-frontend.log
```

To restart everything cleanly:

```bash
# Kill all
pkill -f "packages/(backend|oracle)/dist/main"
pkill -f "next-server"
pkill -f "cloudflared tunnel"

# Start backend
set -a && source .env && set +a
PORT=3001 nohup node packages/backend/dist/main > /tmp/payment-hub-logs/backend.log 2>&1 &

# Start oracle
PORT=3002 BACKEND_API_URL=http://localhost:3001 \
  LOGISTICS_ORACLE_ADDRESS=$ORACLE_CONTRACT_ADDRESS \
  nohup node packages/oracle/dist/main > /tmp/payment-hub-logs/oracle.log 2>&1 &

# Tunnel backend → grab URL from log
nohup cloudflared tunnel --no-autoupdate --url http://localhost:3001 \
  > /tmp/payment-hub-logs/tunnel-backend.log 2>&1 &
sleep 10
BE_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" \
  /tmp/payment-hub-logs/tunnel-backend.log | head -1)
echo "Backend tunnel: $BE_URL"

# Update frontend env (NEXT_PUBLIC_* are baked at build time)
cat > packages/frontend/.env.local <<EOF
NEXT_PUBLIC_API_URL=$BE_URL
NEXT_PUBLIC_WS_URL=$BE_URL
NEXT_PUBLIC_ESCROW_ADDRESS=0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B
NEXT_PUBLIC_USDT_ADDRESS=0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=105e6b3219f2a5739f739ba9010ddbd3
EOF

# Rebuild + start frontend
pnpm --filter frontend build
cd packages/frontend && PORT=3000 nohup pnpm start \
  > /tmp/payment-hub-logs/frontend.log 2>&1 &
cd ../..

# Tunnel frontend
nohup cloudflared tunnel --no-autoupdate --url http://localhost:3000 \
  > /tmp/payment-hub-logs/tunnel-frontend.log 2>&1 &
sleep 10
FE_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" \
  /tmp/payment-hub-logs/tunnel-frontend.log | head -1)
echo "Frontend tunnel: $FE_URL"
```
