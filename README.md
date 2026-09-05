# RecoverAI — Autonomous Revenue Recovery Agent

RecoverAI turns failed subscription payments into bounded, auditable recovery
decisions. It detects revenue at risk, has an AI understand *why* it failed,
selects a recovery action, forces it through a **deterministic policy gate**,
executes it, observes the outcome, and measures the money actually recovered.

> **The LLM proposes. The deterministic policy engine decides.**

Every failed payment (from Razorpay's webhook) flows through:

```
failed payment → webhook (HMAC-verified, idempotent) → recovery case
  → Groq diagnosis → Groq strategy → deterministic policy gate
  → scheduled action → outcome observed → revenue attribution
  → Promise-to-Pay memory (extract, suppress, fulfill/broken) → analytics → audit trail
```

The AI never touches money — it only *understands* and *proposes*. All financial
rules (retry limits, cooldowns, amounts, dates, scheduling, attribution) are
deterministic code.

---

## Features

- **Autonomous recovery agent** — a failed payment webhook opens a case and the
  agent diagnoses + strategizes + policy-gates automatically (no clicks).
- **Real Razorpay integration** — signed webhook ingestion (HMAC-SHA256 over the
  raw body, constant-time), test-mode adapter, and real payment-retry via the API.
- **AI reasoning (Groq)** — diagnoses *why* a payment failed and proposes a
  strategy, with rationale surfaced in the email and the dashboard.
- **Promise-to-Pay memory** — understands a message like *"I'll pay Friday"*,
  stores it as structured state, suppresses outreach until the promised date, and
  auto-resolves FULFILLED / BROKEN.
- **Deterministic policy gate** — retry limits, cooldowns, message caps, channel
  allow-lists, high-value escalation, and duplicate-action suppression.
- **Revenue attribution** — recovered revenue counted **exactly once** per case
  (DB-enforced uniqueness), with analytics for recovery rate and ₹ recovered.
- **Merchant isolation** — the merchant id always comes from the JWT, never from
  the request.
- **Full audit trail** — every diagnosis, decision, policy verdict, and action is
  recorded.

---

## Repository layout

```
apps/
  api/            NestJS backend (webhooks, auth, agent, executor, analytics)
  web/            Next.js merchant dashboard (Vercel)
packages/
  domain/         Money (integer minor units), state machine, policy engine, idempotency
  database/       Prisma schema, migrations, seed
  auth/           scrypt passwords, HMAC JWT, merchant-scope guard
  ai/             LLMProvider interface → Groq (primary) / OpenAI (fallback) / Mock
  integrations/   Razorpay adapter, messaging adapters, webhook ingestion
docker-compose.yml  (Postgres + Redis for local dev)
```

## Prerequisites

- Node.js **>= 20**
- pnpm **>= 9**
- PostgreSQL (local or managed)
- Redis (optional for local demo; executor runs in-process)
- A Razorpay account (test mode), a Groq API key, and a Resend API key

---

## Local setup

```bash
# 1. Install dependencies
pnpm install

# 2. Create your environment file
cp .env.example .env
# edit DATABASE_URL, GROQ_API_KEY, RAZORPAY_*, RESEND_*, AUTH_SECRET

# 3. Start Postgres (and Redis if used) — e.g. via docker-compose
docker compose up -d     # or: sudo systemctl start postgresql

# 4. Prisma client + migration + seed
pnpm db:generate
pnpm --filter @recoverai/database migrate
pnpm --filter @recoverai/database seed

# 5. Build everything
pnpm build
```

### Run the backend (API on :3001)

```bash
cd apps/api
set -a && source ../../.env && set +a
nohup node dist/main.js > /tmp/api.log 2>&1 &
```

### Run the frontend (dashboard on :3000)

```bash
cd apps/web
pnpm exec next build
nohup pnpm exec next start -p 3000 > /tmp/web.log 2>&1 &
```

Open **http://localhost:3000** and sign in with the seeded demo merchant:

| Email | Password |
|---|---|
| `demo@acme.in` | `demo1234` |

## Environment variables (see `.env.example`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `AUTH_SECRET` / `SESSION_SECRET` | Signing secrets for dashboard sessions (use long random values in prod) |
| `GROQ_API_KEY` | Primary AI provider |
| `GROQ_MODEL` | Groq model id (e.g. `openai/gpt-oss-120b`) |
| `LLM_PROVIDER_ORDER` | `groq,openai,mock` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay test-mode keys |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature secret (must match the Razorpay dashboard) |
| `PAYMENT_PROVIDER` | `razorpay` or `mock` |
| `RESEND_API_KEY` | Email delivery |
| `RESEND_FROM` | Sender address (use a verified Resend domain for inbox delivery) |

---

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Get JWT (`demo@acme.in` / `demo1234`) |
| `GET` | `/auth/me` | Validate session |
| `POST` | `/webhooks/razorpay` | Ingest payment events (HMAC-verified, idempotent) |
| `GET` | `/recovery/cases` | List merchant cases |
| `POST` | `/recovery/cases/:id/run` | Run the agent loop (diagnose → strategy → policy → schedule) |
| `POST` | `/recovery/actions/run-due` | Fire overdue scheduled actions |
| `POST` | `/recovery/promise-to-pay` | Extract + store a Promise-to-Pay message |
| `GET` | `/recovery/analytics` | Recovery KPIs |

Authenticated routes require `Authorization: Bearer <token>`.

---

## Tests

```bash
pnpm --filter @recoverai/domain test          # 30 — money, state machine, policy, idempotency
pnpm --filter @recoverai/auth test            # 14 — passwords, tokens, isolation
pnpm --filter @recoverai/integrations test    # 17 — webhook, ingest, revenue, promises
pnpm --filter @recoverai/ai test              # 12 — providers, reasoning, clamping
```

Highlights: policy blocks the 4th retry / allows the 3rd, duplicate webhooks are
ingested exactly once, revenue is attributed exactly once, and promises suppress
outreach pre-date.

> **Migrations:** `pnpm --filter @recoverai/database migrate deploy` applies pending
> migrations to an existing database.

---

## Technologies

NestJS · Next.js · TypeScript · Prisma · PostgreSQL · Groq · Razorpay · Resend ·
pnpm workspaces · Jest · Redis (optional/BullMQ-ready)