# Decision Log

Running record of product and architecture decisions, so the specification does not drift.
Newest decisions appended at the bottom of each section. Status values: `final` (agreed), `proposed` (my recommendation, awaiting your call), `open`.

---

## A. Product decisions (inherited from the Phase 0 handoff)

| # | Decision | Status |
|---|---|---|
| A1 | General audience, focused MVP | final |
| A2 | Modular monolith, backend-first | final |
| A3 | Settlement is manual recording; no payment gateway | final |
| A4 | Split methods: equal, exact, percentage | final |
| A5 | Multiple payers supported | final |
| A6 | One currency per group; no conversion in MVP | final |
| A7 | Group roles: owner, admin, member | final |
| A8 | Expense editing is collaborative (any member may edit/delete any expense) | final |
| A9 | Settlements are group-level net, not per-expense | final |
| A10 | Expense edits recalculate balances; repayment history is never rewritten | final |
| A11 | Membership history is preserved; rejoining starts a new active period | final |
| A12 | Removal/leave never erases financial history or outstanding obligations | final |

### A.1 Permission matrix (final)

| Capability | Owner | Admin | Member |
|---|---|---|---|
| View expenses | Yes | Yes | Yes |
| Create expenses | Yes | Yes | Yes |
| Edit any expense | Yes | Yes | Yes |
| Delete any expense | Yes | Yes | Yes |
| Record settlements | Yes | Yes | Yes |
| Invite members | Yes | Yes | No |
| Remove members | Yes | Yes | No |
| Appoint admins | Yes | No | No |
| Transfer ownership | Yes | No | No |
| Manage group settings | Yes | Yes | No |

Enforced on the backend, never only in the frontend.

---

## B. Financial domain decisions — Phase 0, pass 1

Source: [`domain/financial-core.md`](domain/financial-core.md).

| # | Decision | Status | Rationale |
|---|---|---|---|
| D1 | **Business records are the source of truth; balances are a rebuildable projection.** The append-only event ledger is dropped as the accounting substrate and survives only as a descriptive activity log. | **final** | Two representations of the same state must be kept in agreement forever. The event ledger's advantages (transition audit, point-in-time balance) are delivered more legibly by revision snapshots + activity log + date filtering. Strict double-entry, multi-currency FX and regulated audit are explicitly out of scope. |
| D2 | Money is stored as `bigint` (Prisma `BigInt`) in currency minor units. | **final** | int4 balance aggregates are a latent production incident. BigInt's JSON friction is contained in one serializer at the HTTP boundary. |
| D3 | Equal-split remainder: participants sorted by `user_id` ascending; the first `total % n` receive one extra minor unit. | **final** | Deterministic, reproducible from stored inputs, and independent of request order (property P4). The handoff's "first participant gets the extra" is not implementable, since request order is not persisted. |
| D4 | Percentages are stored as integers with scale 1e6 per percent (`100% = 100_000_000`) and must sum to exactly that. | **final** | Exact integer arithmetic, no float tolerance, and a checkable invariant. |
| D5 | The canonical expense total is derived from the sum of payer allocations; a client-supplied total is an assertion that must match. | **final** | Removes an entire error class instead of validating it away. |
| D6 | Revisions store a full JSONB snapshot of the pre-change expense, plus a human-readable changes summary. | proposed | Reconstructing state from a delta chain is a second implementation of the business rules. A snapshot is directly diffable and directly restorable. |
| D7 | Expense deletion is a tombstone (`deleted_at`, `deleted_by`), never a hard delete. | proposed | Balance computation stays a simple filter; financial history survives; restoration stays possible. |
| D8 | Concurrent expense edits use optimistic concurrency on a `version` column and return `409 Conflict`. | **final** | With a collaborative editing policy, last-write-wins makes lost updates the default outcome. Keeping the column means the policy can be relaxed later without a migration. |
| D9 | Financial records reference `user_id`, not `membership_id`. Membership periods are recorded separately in `group_memberships`. | proposed | Makes the balance key `(group_id, user_id)`, makes rejoin a non-event for the ledger, and makes "departure preserves obligations" fall out for free. |
| D10 | Redis is not used in the balance path. | proposed | Balances live in Postgres and are rebuildable. A cache in this path would create a third representation of financial state. |
| D11 | Group currency is immutable once the group has its first expense. | proposed | Otherwise historical amounts silently change meaning. |
| D12 | Balance projections are maintained by recomputing the affected members' balances from the records, inside the mutation's transaction, with balance rows locked in `user_id` order. | proposed | The projection becomes a pure function of the records and cannot drift. Delta application is the alternative, and becomes necessary only at very high expense volumes per group. |
| D13 | A settlement row is never mutated; corrections append new rows (a reversal is a settlement with `from`/`to` swapped). | proposed | Strongest audit property; the reversal automatically cancels the original in the balance formula. |
| D14 | An overpayment is not a special case. It simply produces a positive balance. | proposed | Group-level net balances with one sign convention need no credit entity, no flag, and no debt-vs-credit distinction. |
| D15 | Idempotency keys are stored per `(user_id, scope, key)` with a request hash, inside the mutation's transaction. | proposed | Duplicate submission is a financial bug, not a UX annoyance. A rolled-back transaction must leave no key behind. |
| D16 | `expense_date` is a backdatable `date`; future dates are rejected in the MVP. | proposed | Backdating is normal usage. Planned expenses are a post-MVP feature that would muddy "what do I owe now". |

---

## C. Decisions still open (not yet resolved — do not guess)

| # | Decision | Resolve when |
|---|---|---|
| C1 | Invitation mechanism (email / username / link) | invitations module |
| C2 | Invitation expiry duration | invitations module |
| C3 | Whether removed members retain read access to the group's history | memberships module |
| C4 | Account deletion and financial-history retention | users module |
| C5 | Whether `membership_period_id` is added to financial rows for forensics (optional refinement of D9) | schema freeze |
| C6 | Settlement rules for pairs involving former members (E15) | settlements module |
| C7 | Whether pairwise debt explanation is in the MVP read models | read models |
| C8 | Settlement requests / reminders in the initial release | notifications module |
| C9 | Whether archived groups can be restored | groups module |

---

## D. Implemented product and operations decisions

| # | Decision | Status | Rationale |
| --- | --- | --- | --- |
| O1 | Membership is invitation-only. A group owner or admin cannot directly add an existing user by email. | final | Group membership changes a person's shared financial context. The invited user must explicitly accept before an active membership and zero balance row are created. |
| O2 | Invitations can target an email address or an existing username. | final | Email invites support people who are not yet registered. Username invites are handled in-app for existing users. |
| O3 | Email delivery uses a transactional outbox and BullMQ rather than being performed in the request handler. | final | A request can commit its user or invitation state even if the email provider or Redis is temporarily unavailable. The worker reconciles due outbox records later. |
| O4 | Outbox tokens are encrypted at rest using a shared API and worker key. | final | Verification, password-reset, and invitation tokens must not be stored in clear text inside durable job payloads. |
| O5 | The deployed MVP uses Vercel for the frontend and Render for the API, PostgreSQL, and Redis-compatible Valkey. | final | It provides a simple, low-cost deployment path while preserving separate web, database, and queue responsibilities. |
| O6 | The worker is a separately deployable process and is currently manual until an always-on worker host is provisioned. | final | Free Render web-service hosting does not provide the needed background-worker service on the current plan. The queue architecture remains valid and has been verified locally. |
| O7 | Dashboard balances remain group-scoped. | final | Groups may have different currencies. A cross-group amount would be misleading without an explicit base currency and exchange-rate policy. |
| O8 | Activity is recorded per group, with an account-wide feed deferred. | final | Group-level activity preserves the group context and keeps the initial read model simple. A unified feed can be added later with pagination and group links. |
