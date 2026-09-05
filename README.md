# RecoverAI — Autonomous Revenue Recovery Agent

RecoverAI turns failed subscription payments into bounded, auditable recovery
decisions. It detects revenue at risk, has an AI understand *why* it failed,
selects a next action, forces it through a **deterministic policy gate**, executes
it, observes the outcome, and measures the money actually recovered.

> **The LLM proposes. The deterministic policy engine decides.**

## Repository layout

```
apps/           (web dashboard, api)   - coming in later steps
packages/
  domain/       domain models, Money (integer minor units), state machine, policy
  database/     Prisma schema, seed    - STEP 2
workers/        BullMQ workers         - coming in later steps
```

## Prerequisites

- Node.js **>= 20**
- pnpm **>= 9**
- PostgreSQL (local or Docker)
- Redis (for BullMQ; not needed for STEP 2)

## Setup (STEP 2)

Install dependencies (this is the step that may prompt for your password):

```bash
pnpm install
```

Create your environment file:

```bash
cp .env.example .env
# edit DATABASE_URL, REDIS_URL, AUTH_SECRET in .env
```

Generate the Prisma client and run an initial migration (populates the schema):

```bash
pnpm db:generate
pnpm --filter @recoverai/database migrate           # npx prisma migrate dev --name init
```

Seed deterministic demo data:

```bash
pnpm --filter @recoverai/database seed
```

## Build & test STEP 2

```bash
# Build the domain library
pnpm build:domain

# Run domain-invariant unit tests
pnpm test:domain
```

Expected test coverage highlights (spec §50):
- policy blocks the fourth retry / allows the third
- promise-to-pay suppresses notifications pre-date
- high-value case escalates
- duplicate action / event suppressed (idempotency)
- money arithmetic is integer & drift-free
- merchant isolation enforced
- recovery state machine transitions

## Credentials you may need later (see `.env.example`)

| Secret                    | Used for                          | Required for STEP 2? |
|---------------------------|-----------------------------------|----------------------|
| `DATABASE_URL`            | Postgres (Prisma)                 | **yes**              |
| `REDIS_URL`               | BullMQ queue (later step)         | later                |
| `AUTH_SECRET`/`SESSION_SECRET` | dashboard sessions           | later                |
| `GROQ_API_KEY`            | Groq (primary AI provider)        | later (STEP 7)       |
| `OPENAI_API_KEY`          | OpenAI fallback provider          | later                |
| `RAZORPAY_KEY_ID`/`SECRET`/`WEBHOOK_SECRET` | Razorpay test-mode | later (STEP 4)  |

## STEP status

- [x] STEP 1 — architecture approved
- [x] STEP 2 — database + migrations + domain models (+ seed + unit tests) — **verified** (build ✅, 30/30 tests ✅, migrate ✅, seed ✅)
- [ ] STEP 3 — authentication + merchant isolation
- [ ] STEP 4 — Razorpay adapter + webhook ingestion + idempotency
- [ ] STEP 5 — recovery case state machine + queue
- [ ] STEP 6 — deterministic policy engine (service wiring)
- [ ] STEP 7 — AI provider abstraction + diagnosis (Groq primary)
- [ ] STEP 8 — strategy planner (structured outputs)
- [ ] STEP 9 — Promise-to-Pay memory + scheduler
- [ ] STEP 10 — action adapters (messaging simulator first)
- [ ] STEP 11 — outcome attribution + analytics
- [ ] STEP 12 — dashboard
- [ ] STEP 13 — audit timeline
- [ ] STEP 14 — test suite
- [ ] STEP 15 — security/reliability/E2E review