# Deployment and operations

This is the operational reference for the deployed MVP. It documents the current setup and the gap that remains before unattended email delivery.

## Current deployment

| Component | Provider | Responsibility |
| --- | --- | --- |
| Web client | Vercel | Serves the Vite production build |
| API | Render Web Service | Express API, authentication, financial mutations, queue publishing |
| Database | Render PostgreSQL | Source of truth for users, groups, financial records, activity, and outbox records |
| Queue storage | Render Key Value | Redis-compatible Valkey used by BullMQ and production rate limits |
| Email provider | Resend | Delivers transactional verification, invitation, and password-reset emails |
| Email worker | Local process for now | Consumes email jobs and reconciles the outbox |

The API is deliberately deployable without the worker. A successful request can commit its business data and its outbox record even when the queue or worker is unavailable.

## Render configuration

[`render.yaml`](../render.yaml) provisions the API, PostgreSQL, and Key Value service. It runs migrations during the build because the free plan does not provide a pre-deploy command.

Required API environment variables:

```text
JWT_ACCESS_SECRET
APP_BASE_URL
CORS_ALLOWED_ORIGINS
PASSWORD_RESET_OUTBOX_KEY
DATABASE_URL
REDIS_URL
```

For the current Vercel frontend, `APP_BASE_URL` and `CORS_ALLOWED_ORIGINS` must use the exact deployed frontend origin, including `https://` and without a trailing path.

`DATABASE_URL` and `REDIS_URL` are wired by Render in the Blueprint. The secrets marked `sync: false` must be entered in Render before deployment.

## Vercel configuration

Set this variable in the Vercel **Production** environment, then redeploy:

```text
VITE_API_BASE_URL=https://your-api.onrender.com
```

Vite replaces `VITE_*` values at build time. Editing the variable without a new deployment does not change the already-built JavaScript bundle.

The API must allow the Vercel origin through `CORS_ALLOWED_ORIGINS`. Production auth cookies use `Secure` and `SameSite=None` so the browser can send them from the Vercel origin to the Render API.

## Email pipeline

```text
API transaction writes user/invitation/password-reset state
             + email_outbox record
                         |
                         v
             BullMQ job in Redis/Valkey
                         |
                         v
             email worker claims outbox record
                         |
                         v
                     Resend sends email
                         |
                         v
          worker marks delivery outcome in PostgreSQL
```

The transactional outbox is important because the API never has to choose between committing product data and sending an email. If Redis is temporarily unavailable after the transaction commits, the worker's reconciliation loop finds due outbox rows later.

BullMQ job IDs are derived from the outbox record ID. This prevents duplicate jobs for the same record. The worker also claims records in PostgreSQL, so two workers cannot both send the same claimed record.

### Worker environment

The worker needs:

```text
NODE_ENV=production
DATABASE_URL=...
REDIS_URL=...
APP_BASE_URL=https://your-frontend.example
PASSWORD_RESET_OUTBOX_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=ClearLedger <noreply@your-verified-domain.example>
```

Use the exact same `PASSWORD_RESET_OUTBOX_KEY` as the API. It decrypts the short-lived token that was encrypted before the outbox record was stored.

### Current operational limitation

The worker is currently run manually with `npm run worker:email`. Queueing is working, but unattended delivery requires an always-on worker host.

The next deployment step is an always-free or paid Linux VM, configured with SSH keys and `systemd` or PM2. It will run `npm run start:worker`, receive the same worker variables, restart after crashes, and write logs somewhere inspectable. It does not need a public HTTP port.

## Release checklist

Before considering a release complete:

1. Run backend `npm run typecheck` and `npm test`.
2. Run frontend `npm run build` and its test suite.
3. Commit migrations with the code that needs them.
4. Confirm Render deployment reaches `/health` successfully.
5. Confirm Vercel was redeployed after any `VITE_*` change.
6. Test from a browser against production with two accounts.
7. Check worker logs and Resend activity after registration, invitation, and password reset.
8. Never place database URLs, JWT secrets, Resend keys, or outbox keys in Git, screenshots, or issue text.

## Recommended next operational work

1. Host the email worker continuously.
2. Add error tracking and structured log aggregation for the API and worker.
3. Add a readiness endpoint that verifies database and Redis connectivity, separate from the simple liveness endpoint.
4. Receive and verify Resend webhooks for delivery, bounce, and complaint events.
5. Add GitHub Actions for typechecking, tests, and production builds on every pull request.
