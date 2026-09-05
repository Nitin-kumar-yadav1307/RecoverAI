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

## Deployment

RecoverAI deploys as a **NestJS API** (Render) + a **Next.js dashboard** (Vercel)
with managed PostgreSQL.

```
[Vercel] Next.js (apps/web)
    │  NEXT_PUBLIC_API_URL = https://<api>.onrender.com
    ▼
[Render] NestJS API (apps/api)
    │  DATABASE_URL, GROQ_API_KEY, RAZORPAY_*, RESEND_*
    ▼
[Render / Neon / Supabase] PostgreSQL
Razorpay webhook → https://<api>.onrender.com/webhooks/razorpay
```

### 1. Push the code to GitHub

```bash
git push -u origin master
```

### 2. Database

Create a managed Postgres (Render, Neon, or Supabase) and copy its connection URL
— for Render services use the **external** (TLS) URL.

### 3. Backend on Render

Render Dashboard → **New → Web Service** → connect the GitHub repo.

| Setting | Value |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @recoverai/database generate && pnpm --filter @recoverai/api build` |
| Start command | `pnpm --filter @recoverai/api start` |
| Environment | Node 20+ |
| Instance | Free or Starter |

Environment variables (all from `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`, `SESSION_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`PAYMENT_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM`, `API_PORT=10000`.

> **Migrations:** run `pnpm --filter @recoverai/database migrate deploy` once
> against the Render DB (either locally with `DATABASE_URL` set, or via a
> `predeploy` command in a `render.yaml` blueprint).

### 4. Razorpay webhook → Render

Razorpay Dashboard (test mode) → Settings → Webhooks → set:
- URL: `https://<api>.onrender.com/webhooks/razorpay`
- Secret: must match `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.failed` + `payment.captured`

### 5. Frontend on Vercel

Vercel Dashboard → **New Project** → import the same GitHub repo.

| Setting | Value |
|---|---|
| Root directory | `apps/web` |
| Framework | Next.js (auto) |
| Environment variable | `NEXT_PUBLIC_API_URL=https://<api>.onrender.com` |

Deploy, then open `https://<app>.vercel.app` → sign in → click **Pay with Razorpay**
to run a full recovery cycle.

---

## Demo flow

1. **Payment fails** — the Razorpay checkout declines the card → webhook → case opens.
2. **Agent reacts automatically** — Groq diagnoses, proposes a strategy, the policy
   gate approves, and an email is scheduled (≤5 min) with the AI's reasoning.
3. **Promise remembered** — paste *"I'll pay Friday"* in the simulator; the agent
   stores the date and suppresses outreach until then.
4. **Recovery** — a successful payment matches the case → `RECOVERED` → revenue
   attributed exactly once → analytics update.

---

## Technologies

NestJS · Next.js · TypeScript · Prisma · PostgreSQL · Groq · Razorpay · Resend ·
pnpm workspaces · Jest · Redis (optional/BullMQ-ready)