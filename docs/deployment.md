# Deployment and operations

This is the operational reference for SplitCircle's deployed MVP, including the Azure email worker and how to verify a release.

## Current deployment

| Component | Provider | Responsibility |
| --- | --- | --- |
| Web client | Vercel | Serves the Vite production build |
| API | Render Web Service | Express API, authentication, financial mutations, queue publishing |
| Database | Render PostgreSQL | Source of truth for users, groups, financial records, activity, and outbox records |
| Queue storage | Render Key Value | Redis-compatible Valkey used by BullMQ and production rate limits |
| Email provider | Resend | Delivers transactional verification, invitation, and password-reset emails |
| Email worker | Azure Ubuntu 24.04 VM in Indonesia Central | Runs the compiled BullMQ worker under `systemd`, sends through Resend, and reconciles the PostgreSQL outbox |

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

The Vercel project uses `frontend` as its root directory. Its [routing configuration](../frontend/vercel.json) builds the app with an empty `VITE_API_BASE_URL` and rewrites `/api/*` requests to Render. The browser uses the Vercel URL for app requests and session cookies. Use this routing configuration's build command if the project has a dashboard override.

The Render API accepts the canonical frontend origin through `APP_BASE_URL` and `CORS_ALLOWED_ORIGINS`. Keep those settings on the Vercel production origin. The secure session cookies are scoped to the host the browser calls. Users moving from direct Render requests will sign in again to establish a session on the frontend host.

Apply the expense calendar migration and release the API's `X-Client-Time-Zone` support before serving a frontend build that sends that header. Expense and settlement forms use local calendar dates. The API checks them in the supplied time zone and uses UTC for older clients. The PostgreSQL expense trigger uses the same transaction calendar without changing the session time zone.

## OAuth sign-in

Apply the `oauth_identities` migration before enabling OAuth. Provider credentials stay in Render's **API service** environment. For the Vercel deployment, use `OAUTH_API_ORIGIN=https://splitcircle12.vercel.app` and keep `APP_BASE_URL` set to that same origin. Both the OAuth start endpoint and the provider callback pass through the Vercel rewrite. For local development through Vite's proxy, use `OAUTH_API_ORIGIN=http://localhost:5173` and open the frontend at that origin.

| Provider | App credentials in Render | Registered callback path appended to `OAUTH_API_ORIGIN` |
| --- | --- | --- |
| Google | `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` | `/api/auth/oauth/google/callback` |
| GitHub | `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` | `/api/auth/oauth/github/callback` |

- Create a **Web application** client in Google Auth Platform and register the exact callback as an authorized redirect URI. Configure consent and test users as applicable. [Google web-server setup](https://developers.google.com/identity/protocols/oauth2/web-server)
- Create a **GitHub OAuth App** with the frontend as its homepage and the exact API callback as its authorization callback URL. Use a separate GitHub OAuth App for local development if you need both environments. [GitHub OAuth setup](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)

The API exchanges the authorization code with PKCE, then uses the provider account ID as the persistent sign-in identity. New Google accounts can skip local verification when Google is authoritative for the email. A Google account using a third-party email can register through SplitCircle's email flow and connect Google afterward. GitHub sign-up requires a verified primary email. An existing user signs in with their current method and opens **Account settings → Sign-in methods** to connect a provider using their verified SplitCircle address. A matching email by itself never links an existing account. [Google account email verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

### Move an existing deployment to the Vercel callback

1. Register `https://splitcircle12.vercel.app/api/auth/oauth/google/callback` in the existing Google OAuth client. For GitHub, register `https://splitcircle12.vercel.app/api/auth/oauth/github/callback` in the existing OAuth app if enabled. Keep the old redirect URI during the transition where the provider supports multiple URIs.
2. Release the Vercel rewrite and update Render's `OAUTH_API_ORIGIN` in the same deployment window. Register the provider URLs before switching. Open the canonical production URL for this check.
3. Sign in with Google while third-party cookies are blocked. Confirm that the callback and `GET /api/auth/me` use the Vercel host and that the session survives a reload. Verify password sign-in and GitHub sign-in if enabled.

Social and password sign-in use the same session cookies. To recover password sign-in for an account created through OAuth, use the existing password-reset flow.

Deploy the `oauth_link_tickets` migration and API before deploying the Settings change. **Connect Google** and **Connect GitHub** start with an authenticated API request. The browser then submits a single-use ticket in a navigation form so the redirect can continue even if the browser withholds session cookies on that navigation. Use the callback URLs and credential settings in the table above.

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

BullMQ job IDs are derived from the outbox record ID. PostgreSQL conditionally claims eligible rows, so only one worker can acquire a given claim. If a worker retries after an ambiguous provider response, it sends the same Resend idempotency key for that outbox record.

Resend response diagnostics are stored in `email_outbox.last_error` and logged on job failure. Provider messages are bounded and known credentials and tokens are redacted. A permanent 4xx response marks the row `DEAD` immediately. Timeouts, rate limits, an in-progress idempotent request, and 5xx responses can retry with backoff until the attempt limit.

### Worker environment

The worker needs:

```text
NODE_ENV=production
DATABASE_URL=...
REDIS_URL=...
APP_BASE_URL=https://your-frontend.example
PASSWORD_RESET_OUTBOX_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=SplitCircle <noreply@your-verified-domain.example>
```

Use the exact same `PASSWORD_RESET_OUTBOX_KEY` as the API. It decrypts the short-lived token that was encrypted before the outbox record was stored.

### Azure worker setup

The worker runs on an Azure Ubuntu 24.04 VM using Node.js 24. The VM needs outbound access to Render and Resend. The Azure network security group allows inbound SSH (TCP 22) from the administrator's public IP. The worker has no public HTTP endpoint.

1. Add the VM's **outbound public IPv4** as a `/32` to the inbound IP allowlists for both Render PostgreSQL and Render Key Value. Use the plain IP without `/32` in Render's address validator.
2. In the VM's `.env`, set `DATABASE_URL` to the external PostgreSQL URL with `sslmode=verify-full` and `REDIS_URL` to the external `rediss://` Key Value URL. The API on Render uses its internal datastore URLs. Protect the worker's `.env` with `chmod 600 .env`.
3. In the checkout, run the build commands below. Prisma client generation produces code. The Render API release handles database migrations.
4. Run `npm run start:worker` in the foreground and trigger a verification email for an account you control. After the test passes, stop the foreground process and start the systemd service.

```bash
npm ci --include=dev
npx prisma generate --config prisma7.config.ts
npm run build
```

The service is named `splitcircle-worker`. It runs as `azureuser` with `/home/azureuser/splitcircle-worker` as its working directory, where the compiled worker can load `.env`. Its `ExecStart` uses the full path from `command -v node` and runs `dist/src/workers/email.worker.js`. If Node was installed with nvm, update the unit's absolute Node path when changing Node versions.

```ini
[Unit]
Description=SplitCircle email worker
Wants=network-online.target
After=network-online.target

[Service]
User=azureuser
WorkingDirectory=/home/azureuser/splitcircle-worker
ExecStart=/absolute/path/to/node /home/azureuser/splitcircle-worker/dist/src/workers/email.worker.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save the unit as `/etc/systemd/system/splitcircle-worker.service` after replacing the Node path. Then enable it and check the logs.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now splitcircle-worker
sudo systemctl status splitcircle-worker --no-pager
sudo journalctl -u splitcircle-worker -n 50 --no-pager
```

For a worker release, build the intended revision, run `sudo systemctl restart splitcircle-worker`, and repeat the email test. After changing the unit file, run `daemon-reload` before restarting.

### Verified deployment and troubleshooting

On 25 November 2026 the service showed **enabled** and **active (running)**. A fresh verification email was received after SSH was closed and the local worker was stopped. This confirms delivery from the deployed worker. Reboot recovery and the full set of invitation and password-reset flows still need separate checks.

| Symptom | Check |
| --- | --- |
| SSH times out on TCP 22 | Check the VM state, public IP, and the source IP on the Azure inbound rule. |
| Windows SSH rejects the .pem file permissions | Restrict access to the private key file and retry. |
| The worker receives jobs but PostgreSQL rejects authorization | Verify the VM's outbound IP against the PostgreSQL allowlist and inspect the driver's full error. |
| PostgreSQL returns `28000` with `SSL/TLS required` | Check that the worker uses the external PostgreSQL URL with `sslmode=verify-full`. |
| The worker logs a failed email job | Read the provider status and message in the worker journal or the outbox row's `last_error`. A `DEAD` row has reached a terminal state. |

## Balance reconciliation

Run `npm run rebuild-balances` from the backend checkout against the database you intend to check. Use `-- --group <group-uuid>` to limit the check. It compares each group's stored projection with a rebuild from current expense allocations and settlement history in one consistent snapshot. A missing or unexpected balance row is also a mismatch. The command does not update production records.

Exit code `0` means the projections matched, `1` means drift was found, and `2` means the check could not finish. Each difference includes the group and user IDs and both amounts as strings in minor units. A null amount indicates a missing row on that side of the comparison.

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

1. Document and rehearse the worker release and rollback process, including a reboot recovery check.
2. Add error tracking and structured log aggregation for the API and worker.
3. Add a readiness endpoint that verifies database and Redis connectivity, separate from the simple liveness endpoint.
4. Receive and verify Resend webhooks for delivery, bounce, and complaint events.
5. Review the CI results before merging. The workflow uses disposable PostgreSQL and Redis services and never needs production credentials.
