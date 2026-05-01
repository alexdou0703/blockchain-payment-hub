# Blockchain Payment Hub

A dissertation project — a blockchain-powered payment gateway for e-commerce built on Ethereum (Sepolia testnet). Buyers lock payments into a smart contract escrow; funds are only released when logistics providers confirm delivery. Disputes are resolved by a 2-of-3 arbiter vote on-chain.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [System Architecture](#2-system-architecture)
3. [Live Deployed Contracts (Sepolia)](#3-live-deployed-contracts-sepolia)
4. [Prerequisites — What to Install](#4-prerequisites--what-to-install)
5. [Project Structure](#5-project-structure)
6. [First-Time Setup](#6-first-time-setup)
7. [Running the Full System (Docker — Recommended)](#7-running-the-full-system-docker--recommended)
8. [Running for Development (Without Docker)](#8-running-for-development-without-docker)
9. [How to Use the Application](#9-how-to-use-the-application)
10. [Running Tests](#10-running-tests)
11. [Pushing Changes to GitHub](#11-pushing-changes-to-github)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What This System Does

Traditional e-commerce payments go through banks and payment processors (Stripe, PayPal). This system replaces that with **smart contracts** on the Ethereum blockchain.

Here is what happens when a buyer makes a purchase:

```
Buyer pays  →  Money locked in smart contract  →  Seller ships item
                                                         │
                                          Delivery providers confirm
                                                         │
                                    Smart contract releases money to seller
```

If there is a dispute (item not received, wrong item, etc.), three independent arbiters vote on-chain. The majority decision is enforced automatically — no bank or human administrator can override it.

**Key benefits for the dissertation:**
- Payments are trustless — no single party controls the funds
- Every transaction is permanently recorded on the blockchain
- Settlement records are anchored to Ethereum via a Merkle tree (tamper-proof audit trail)
- Delivery confirmation is aggregated from 3 logistics providers (GHN, GHTK, Viettel Post)

---

## 2. System Architecture

The project has **5 services** that work together:

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Browser                           │
│              (connects wallet via MetaMask extension)           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP / WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend  (port 3000)                                          │
│  Next.js 14 — the website users see and interact with           │
│  • Checkout page — buyer pays for an order                      │
│  • Seller dashboard — seller sees orders and shipment status    │
│  • Disputes page — raise or vote on a dispute                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API + WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend  (port 3001)                                           │
│  NestJS — the business logic server                             │
│  • Stores orders and payment records in PostgreSQL              │
│  • Listens to blockchain events in real time (via WebSocket)    │
│  • Runs nightly batch settlement jobs (via Redis queue)         │
│  • Pushes real-time notifications to the browser                │
│  • API documentation at http://localhost:3001/api/docs          │
└────────────┬──────────────────────────────────┬─────────────────┘
             │                                  │
             ▼                                  ▼
┌────────────────────────┐      ┌───────────────────────────────┐
│  PostgreSQL (database) │      │  Oracle Service  (port 3002)  │
│  Stores all orders,    │      │  Receives webhooks from        │
│  payments, disputes    │      │  logistics providers.          │
└────────────────────────┘      │  When 2 of 3 confirm delivery, │
                                │  calls the smart contract.     │
┌────────────────────────┐      └───────────────────────────────┘
│  Redis (job queue)     │
│  Schedules nightly     │
│  settlement cron jobs  │
└────────────────────────┘

All services connect to Ethereum Sepolia testnet via Infura (cloud node provider)
```

---

## 3. Live Deployed Contracts (Sepolia)

These contracts are already deployed and live on the Ethereum Sepolia testnet. You can view them on [sepolia.etherscan.io](https://sepolia.etherscan.io).

| Contract | Purpose | Address |
|---|---|---|
| **EscrowManager** | Locks buyer funds; releases to seller on delivery | `0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B` |
| **LogisticsOracle** | Aggregates delivery confirmations from 3 providers | `0xA1A34F39f2c2644941e40ef149813D22da7077e5` |
| **DisputeResolution** | 2-of-3 arbiter voting for disputed orders | `0xC9dE93D7c83D73b82Aa147BeE3653a86CD1cdCEe` |
| **SettlementContract** | Anchors batch settlement Merkle roots to L1 | `0xe6c346D2680D2c0cCfF4a00755fd947fA77E60c9` |
| **MockUSDT** | Test stablecoin used for payments (not real money) | `0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0` |

**Deployer / Treasury wallet:** `0x160F267cEF249Ced05c30e32172E9420E8Ad1EC8`

> These contracts are on Sepolia **testnet** — no real money is involved.

---

## 4. Prerequisites — What to Install

You need to install the following tools on your computer before anything will work. Click each link for the official download page.

### Required

| Tool | What it is | Version needed |
|---|---|---|
| [Node.js](https://nodejs.org/en/download) | JavaScript runtime — runs all the code | 20 or 22 (NOT 25) |
| [pnpm](https://pnpm.io/installation) | Package manager (like npm but faster) | 8 or 9 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Runs the database and all services in containers | Latest |
| [Git](https://git-scm.com/downloads) | Version control — already installed if you've used GitHub | Latest |

### Required for Payments
| Tool | What it is | How to get it |
|---|---|---|
| [MetaMask](https://metamask.io/download/) | Browser wallet extension for Chrome/Firefox | Install from Chrome Web Store |

### How to verify everything is installed

Open your Terminal (Mac: press `Cmd + Space`, type "Terminal") and run these commands one by one. Each should print a version number:

```bash
node --version
# Should print: v20.x.x or v22.x.x

pnpm --version
# Should print: 8.x.x or 9.x.x

docker --version
# Should print: Docker version 24.x.x or higher

git --version
# Should print: git version 2.x.x
```

> **Important about Node.js version:** This project uses Hardhat which does not support Node.js version 25. If `node --version` shows v25.x.x, you need to install Node.js 22 LTS from [nodejs.org](https://nodejs.org).

---

## 5. Project Structure

```
payment-hub/
│
├── packages/
│   ├── contracts/          ← Solidity smart contracts + deployment scripts
│   │   ├── contracts/      ← The .sol files (EscrowManager, etc.)
│   │   ├── scripts/        ← deploy.ts — deploys contracts to blockchain
│   │   └── test/           ← Hardhat tests for contracts
│   │
│   ├── backend/            ← NestJS server (REST API + event listener)
│   │   ├── src/
│   │   │   ├── orders/     ← Create and track orders
│   │   │   ├── payments/   ← Lock and release payments
│   │   │   ├── disputes/   ← Raise and resolve disputes
│   │   │   ├── settlement/ ← Nightly Merkle tree batch settlement
│   │   │   ├── fiat/       ← Fiat currency bridge (exchange rates)
│   │   │   ├── oracle/     ← Listens to oracle events on-chain
│   │   │   └── blockchain/ ← Connects to Sepolia, listens to events
│   │   └── test/           ← Jest unit tests + Supertest E2E tests
│   │
│   ├── frontend/           ← Next.js 14 website
│   │   └── src/app/
│   │       ├── page.tsx            ← Home page
│   │       ├── checkout/[orderId]/ ← Buyer checkout & payment page
│   │       ├── seller/dashboard/   ← Seller order management
│   │       └── disputes/           ← Dispute filing and tracking
│   │
│   ├── oracle/             ← Standalone NestJS service for logistics webhooks
│   │   └── src/            ← Receives delivery webhooks, triggers on-chain consensus
│   │
│   └── shared/
│       └── constants/
│           └── addresses.json  ← Live Sepolia contract addresses (auto-generated on deploy)
│
├── docker-compose.yml      ← Starts all 5 services with one command
├── .env.example            ← Template for environment variables
├── .env                    ← Your actual secrets (NOT committed to git)
└── README.md               ← This file
```

---

## 6. First-Time Setup

Follow these steps **once** when setting up the project on a new machine.

### Step 1 — Clone the repository

Open Terminal and run:

```bash
git clone https://github.com/alexdou0703/blockchain-payment-hub.git
cd blockchain-payment-hub
```

### Step 2 — Install all dependencies

This installs all Node.js packages for every service at once:

```bash
pnpm install
```

> This may take 2–3 minutes the first time.

### Step 3 — Create your environment file

The `.env` file stores secrets (API keys, private keys). It is never committed to GitHub for security reasons.

```bash
cp .env.example .env
```

Now open the `.env` file in any text editor and fill in your values. Here is what each variable means:

```bash
# The URL to connect to Ethereum Sepolia via Infura
# Get one free at: https://app.infura.io → Create Project → Copy Sepolia HTTPS URL
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Same Infura key but WebSocket version (for real-time event listening)
SEPOLIA_WS_URL=wss://sepolia.infura.io/ws/v3/YOUR_INFURA_KEY

# Your MetaMask wallet's private key
# MetaMask → click your account → Account Details → Export Private Key
# IMPORTANT: Add 0x at the front. Example: 0xabc123...
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Your MetaMask wallet address (the 0x... address you see in MetaMask)
TREASURY_ADDRESS=0xYOUR_WALLET_ADDRESS_HERE

# These are already filled in — the live Sepolia contract addresses
ESCROW_CONTRACT_ADDRESS=0xC40AB9fDD3B70a3327647ff7aD851921D85D0C4B
DISPUTE_CONTRACT_ADDRESS=0xC9dE93D7c83D73b82Aa147BeE3653a86CD1cdCEe
ORACLE_CONTRACT_ADDRESS=0xA1A34F39f2c2644941e40ef149813D22da7077e5
SETTLEMENT_CONTRACT_ADDRESS=0xe6c346D2680D2c0cCfF4a00755fd947fA77E60c9
USDT_ADDRESS=0xfAB3f938A1E198119e32b7a2Fd1F16BFAE9e07a0

# IPFS storage — get a free JWT at: https://app.pinata.cloud/keys
PINATA_JWT=YOUR_PINATA_JWT_HERE

# WalletConnect — get a free Project ID at: https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=YOUR_PROJECT_ID_HERE
```

### Step 4 — Configure MetaMask for Sepolia

1. Open MetaMask in your browser
2. Click the network dropdown at the top (it may say "Ethereum Mainnet")
3. Click **"Show test networks"** and select **"Sepolia"**
4. Get free test ETH at [sepoliafaucet.com](https://sepoliafaucet.com) — paste your wallet address and request funds

---

## 7. Running the Full System (Docker — Recommended)

This is the easiest way. Docker starts everything automatically with a single command.

### Make sure Docker Desktop is running first

Open Docker Desktop from your Applications folder and wait for it to say "Docker Desktop is running" (the whale icon in your menu bar stops animating).

### Start all services

```bash
cd blockchain-payment-hub
docker compose up --build
```

> The first run takes 5–10 minutes because Docker needs to download and build images. Subsequent runs start in under 60 seconds.

You will see logs from all services scrolling in the terminal. When you see lines like:

```
backend   | Payment Hub backend listening on port 3001
frontend  | Ready on http://localhost:3000
oracle    | Oracle service listening on port 3002
```

Everything is running. Open your browser and go to **http://localhost:3000**.

### Stop all services

Press `Ctrl + C` in the terminal, then run:

```bash
docker compose down
```

> Add `--volumes` if you also want to delete the database data: `docker compose down --volumes`

---

## 8. Running for Development (Without Docker)

Use this approach when you are actively editing code and want instant reload. You need to run each service in a separate terminal window.

### Terminal 1 — Start PostgreSQL and Redis (still uses Docker for these)

```bash
docker compose up postgres redis
```

### Terminal 2 — Start the Backend

```bash
cd packages/backend
pnpm run start:dev
```

The backend will reload automatically when you save any file.

### Terminal 3 — Start the Frontend

```bash
cd packages/frontend
pnpm run dev
```

Visit **http://localhost:3000**

### Terminal 4 — Start the Oracle Service

```bash
cd packages/oracle
pnpm run start:dev
```

---

## 9. How to Use the Application

### As a Buyer

1. Go to **http://localhost:3000**
2. Click **"Connect Wallet"** — MetaMask will open and ask you to connect
3. Make sure MetaMask is set to the **Sepolia** network
4. Browse to a product and click **"Buy Now"** — this creates an order
5. On the checkout page, you will see the order details and a **"Pay with mUSDT"** button
6. Click it — MetaMask will ask you to approve two transactions:
   - **Approve** — allows the contract to spend your mUSDT
   - **Lock Payment** — sends your mUSDT into the escrow contract
7. Once confirmed on-chain, the seller is notified and will ship the item

> **Getting test mUSDT:** Since this is testnet, the deployer wallet has 10,000 mUSDT. To get some for testing, you can use Hardhat to call `MockUSDT.mint()` or ask the deployer wallet to transfer some.

### As a Seller

1. Go to **http://localhost:3000/seller/dashboard**
2. Connect your seller wallet via MetaMask
3. You will see all incoming orders with their payment status
4. When you ship an item, mark it as shipped — this notifies the logistics oracle
5. Track delivery confirmations in real time

### Simulating a Delivery (for testing)

In a real deployment, GHN/GHTK/Viettel Post would send webhooks automatically. For testing, you simulate them manually. Open a new terminal and run:

```bash
# Replace ORDER_ID with the actual order ID from the dashboard

# Simulate GHN confirming delivery
curl -X POST http://localhost:3002/webhook/ghn \
  -H "Content-Type: application/json" \
  -d '{"orderId": "ORDER_ID", "status": "delivered"}'

# Simulate GHTK confirming delivery
curl -X POST http://localhost:3002/webhook/ghtk \
  -H "Content-Type: application/json" \
  -d '{"orderId": "ORDER_ID", "status": "delivered"}'
```

Two confirmations is enough (2-of-3 threshold). The oracle will call the smart contract and the funds will be released to the seller automatically.

### Raising a Dispute

1. Go to **http://localhost:3000/disputes**
2. Click **"Raise Dispute"** and select the order
3. Describe the issue and submit — this calls `DisputeResolution` on-chain
4. The three arbiters (configured at deploy time) can each cast a vote
5. When 2 of 3 arbiters vote, the majority decision is enforced on-chain

### Viewing the API Documentation

The backend has auto-generated API documentation. With the backend running, go to:

**http://localhost:3001/api/docs**

This shows every available API endpoint with example request and response formats.

---

## 10. Running Tests

### Smart Contract Tests (Hardhat)

```bash
cd packages/contracts
pnpm run test
```

Expected output: **18/18 tests passing**

To also see code coverage:

```bash
pnpm run coverage
```

### Backend Unit Tests (Jest)

```bash
cd packages/backend
pnpm run test
```

Expected output: **74/74 tests passing**

### Backend End-to-End Tests

```bash
cd packages/backend
pnpm run test:e2e
```

These tests spin up a real HTTP server and test the full request/response cycle.

---

## 11. Pushing Changes to GitHub

When you make changes to the code, follow these steps to save them to GitHub.

> **Important:** Never commit the `.env` file. It contains private keys and API secrets. It is already listed in `.gitignore` so Git will automatically ignore it.

### Step 1 — Check what files you changed

```bash
git status
```

This shows all modified files in red (not yet staged) and green (staged and ready to commit).

### Step 2 — Stage the files you want to save

To stage specific files:

```bash
git add packages/backend/src/some-file.ts
git add packages/frontend/src/app/page.tsx
```

To stage all changed files at once (use carefully):

```bash
git add .
```

### Step 3 — Write a commit message describing what you changed

```bash
git commit -m "feat: add dispute notification to seller dashboard"
```

Good commit message format:
- `feat: ...` — new feature
- `fix: ...` — bug fix
- `docs: ...` — documentation change

### Step 4 — Push to GitHub

```bash
git push origin main
```

This uploads your commit to [github.com/alexdou0703/blockchain-payment-hub](https://github.com/alexdou0703/blockchain-payment-hub).

### Full example workflow

```bash
# 1. Check what changed
git status

# 2. Stage your changes
git add .

# 3. Review exactly what will be committed
git diff --staged

# 4. Commit with a message
git commit -m "fix: correct escrow release condition"

# 5. Push to GitHub
git push origin main
```

---

## 12. Troubleshooting

### "Empty string for network or forking URL"

This means Hardhat cannot find the `SEPOLIA_RPC_URL`. Check that your `.env` file exists at the **repo root** (not inside `packages/contracts`) and that the value is filled in.

```bash
# Check the file exists and has a value
grep SEPOLIA_RPC_URL .env
```

### "Insufficient funds" error when deploying

Your wallet does not have enough Sepolia ETH to pay for gas. Get free test ETH at [sepoliafaucet.com](https://sepoliafaucet.com).

### Docker: "port is already in use"

Another process is using port 3000, 3001, or 3002. Find and stop it:

```bash
# Find what is using port 3001
lsof -i :3001

# Kill the process (replace PID with the number from the output above)
kill -9 PID
```

### MetaMask shows wrong network

Make sure MetaMask is set to **Sepolia Test Network**. If you do not see it, go to MetaMask Settings → Advanced → Show test networks → toggle ON.

### "nonce too high" or "replacement transaction underpriced"

MetaMask has a stuck pending transaction. Open MetaMask → Settings → Advanced → Reset Account. This clears the local transaction history without affecting your funds.

### pnpm install fails

Make sure you are using Node.js 20 or 22 (not 25):

```bash
node --version   # Must be v20 or v22

# If wrong version, install Node.js 22 from https://nodejs.org
```

### Backend does not connect to database

Make sure PostgreSQL is running:

```bash
docker compose ps
# postgres should show "healthy"
```

If not:

```bash
docker compose up postgres redis
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, Hardhat, OpenZeppelin v5 |
| Blockchain Network | Ethereum Sepolia Testnet |
| RPC Provider | Infura |
| Backend | NestJS 10, TypeORM, Bull (Redis queues), Socket.IO |
| Database | PostgreSQL 15 |
| Job Queue | Redis 7 |
| Frontend | Next.js 14, Wagmi v2, RainbowKit, TanStack Query |
| Wallet Integration | MetaMask, WalletConnect |
| IPFS Storage | Pinata |
| Monorepo Tooling | pnpm workspaces, Turborepo |
| Containerisation | Docker, Docker Compose |
| CI/CD | GitHub Actions |

---

## GitHub Repository

[https://github.com/alexdou0703/blockchain-payment-hub](https://github.com/alexdou0703/blockchain-payment-hub)
