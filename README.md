# SplitCircle

A full-stack expense-sharing application for friends, roommates, families, and travel groups. Create a group, invite people, record expenses, see net balances, and record settlements without losing the financial history behind them.

**Live app:** [splitcircle12.vercel.app](https://splitcircle12.vercel.app)
**API health:** [expense-sharing-api-ibbk.onrender.com/health](https://expense-sharing-api-ibbk.onrender.com/health)

> **Status:** deployed MVP. The web app, API, PostgreSQL database, and Redis-compatible queue storage are hosted. The email worker must still be run as a persistent process for queued emails to be delivered. See [Deployment and operations](docs/deployment.md).

## What it does

- Authenticated accounts with email verification, refresh-token rotation, password reset, password change, and account profile updates.
- Groups with owner, admin, and member roles.
- Consent-based membership. A person becomes a member only after accepting an invitation. There is no direct add-by-email path.
- Expenses with multiple payers and equal, exact, or percentage splits.
- Integer minor-unit money arithmetic, expense revisions, idempotent writes, and concurrency protection.
- Per-group balance projections, manual settlements, and settlement reversals.
- Notifications and an append-only group activity feed.
- Reliable outbound email using a transactional outbox, BullMQ, Redis/Valkey, and Resend.

## Architecture

```text
React + Vite frontend (Vercel)
             |
             v
Express API (Render) ───────────────> PostgreSQL (Render)
             |
             v
Redis / Valkey (Render) <── BullMQ email worker ──> Resend
```

PostgreSQL is the source of truth for financial records. Redis is used for rate limiting and job delivery, never for balances or financial state.

### Financial rules

- Money is stored as `BigInt` minor units, never floating point.
- Payer allocations and participant shares must each reconcile to the expense total.
- Group balances are rebuildable projections of expenses and settlements.
- Expense deletion is historical rather than destructive.
- Settlement corrections are reversals, not edits to past records.
- Idempotency keys stop retries or double-clicks from creating duplicate financial effects.

More detail is in [the financial core design](docs/domain/financial-core.md).

## Stack

| Area | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind, TanStack Query |
| API | Node.js, Express 5, TypeScript, Zod |
| Database | PostgreSQL 17, Prisma 7 with `@prisma/adapter-pg` |
| Async email | Transactional outbox, BullMQ, Redis/Valkey, Resend |
| Security | HttpOnly cookies, JWT rotation, Helmet, CORS allowlist, Redis-backed rate limits |
| Testing | Vitest, Supertest, fast-check |
| Hosting | Vercel, Render Web Service, Render PostgreSQL, Render Key Value |

## Run locally

### Prerequisites

- Node.js 22 or later
- PostgreSQL
- Redis or Valkey
- A Resend API key when testing email delivery

### API

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run dev
```

The API starts at `http://localhost:5000`. Its health endpoint is `GET /health`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Leave `VITE_API_BASE_URL` empty for local development. Vite then proxies `/api` requests to the local API. Set it to the public API origin for independently deployed frontend builds.

### Email worker

Start this separately from the API:

```bash
npm run worker:email
```

The worker claims due records from the `email_outbox` table, sends them through Resend, and marks the outcome. It also reconciles records that were committed when Redis was unavailable.

For an external Render PostgreSQL connection on some local clients, set `PGSSLMODE=verify-full` before starting the worker.

## Environment variables

Copy `.env.example` and fill in the values. Never commit `.env` files or real keys.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API and worker | PostgreSQL connection string |
| `REDIS_URL` | API and worker | Rate limits and BullMQ queue |
| `JWT_ACCESS_SECRET` | API | Token signing secret |
| `APP_BASE_URL` | API and worker | Frontend origin used in email links |
| `CORS_ALLOWED_ORIGINS` | API | Comma-separated browser origin allowlist |
| `PASSWORD_RESET_OUTBOX_KEY` | API and worker | Shared 32-byte hex key that encrypts queued email tokens |
| `RESEND_API_KEY` | Worker | Resend API credential |
| `RESEND_FROM_EMAIL` | Worker | Verified sender, for example `SplitCircle <noreply@mail.example.com>` |

In production, `PASSWORD_RESET_OUTBOX_KEY`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` must be configured on the worker as well as the API where applicable. The API and worker must share the same database, Redis instance, frontend URL, and outbox encryption key.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API in watch mode |
| `npm run build` | Compile the API |
| `npm start` | Run compiled API |
| `npm run typecheck` | Typecheck backend without emitting files |
| `npm test` | Run backend test suite |
| `npm run worker:email` | Run email worker with TypeScript |
| `npm run start:worker` | Run compiled email worker |
| `npm run migrate:deploy` | Apply committed production migrations |

Frontend commands are documented in [`frontend/README.md`](frontend/README.md).

## Current limitations and next steps

- The deployed free Render setup does not host a persistent background worker. It needs an always-on worker host before email delivery is fully unattended.
- The Activity view is group-scoped. An account-wide activity stream is a future read model.
- Account-wide balance totals are intentionally not shown because groups may use different currencies. A cross-group total needs an explicit FX and base-currency policy.
- Monitoring, error tracking, webhook handling for Resend delivery events, and CI are the next operations milestones.

## Documentation

- [Architecture and product decisions](docs/decisions.md)
- [Financial core design](docs/domain/financial-core.md)
- [Deployment and operations](docs/deployment.md)

## License

ISC
