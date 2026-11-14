# Phase 0 — Financial Core Domain Model

Status: **Designed.** Decisions D1, D3, D5, D8 confirmed. Remaining Phase 0 work tracked in §13.
Scope: Expense, payer allocation, participant share, group balance.
Deliberately deferred: settlement reversal mechanics, membership lifecycle, invitations, activity feed, outbox, notification.

This document is the candidate model. Items marked **[DECIDE]** are the forks that need your call before we write a Prisma schema. Each one is also logged in [`../decisions.md`](../decisions.md).

---

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Group** | A shared ledger boundary. Exactly one currency. |
| **Member** | A user with an active membership period in a group. |
| **Expense** | A shared cost. Editable business record. Not a payment event. |
| **Payer allocation** | How much of an expense a specific member actually put in. |
| **Participant share** | How much of an expense a specific member owes. |
| **Split** | The allocation rule that produced the participant shares. |
| **Balance** | Net position of one member within one group. |
| **Settlement** | A recorded real-world repayment between two members. |
| **Minor unit** | The smallest indivisible unit of a currency (paise, cent, yen). All amounts are integers in minor units. |

Two distinct concepts that people constantly conflate, and which the whole model hangs on:

- An **expense** says: *this cost happened, and this is how it is shared.* It is a statement of obligation.
- A **settlement** says: *this money actually moved.* It is a statement of fact about the outside world.

They are corrected in opposite directions (below), and one may be true while the other is false.

---

## 2. Money, currency and precision

### 2.1 Representation

- All money is an integer count of the currency's **minor unit**. `₹1,000.50` → `100050`.
- Never a float, never a decimal string in the database.
- Amounts are signed only where the domain defines a sign (balances). Expense, payer and split amounts are non-negative by construction.

### 2.2 Type choice **[FINAL]**

`bigint` (Prisma `BigInt`) vs `int4` (Prisma `Int`).

| | `Int` (int4) | `BigInt` (int8) |
|---|---|---|
| Max value | 2,147,483,647 → ₹2.14 crore in paise | 9.2×10¹⁸ → ₹92 trillion in paise |
| JS interop | Native `number`, no friction | Native `bigint`, **throws on mixing with `number`** |
| JSON | Trivial | `JSON.stringify` throws on raw `BigInt` — needs a transformer |
| Aggregate sums | Could overflow on a long-lived group | Effectively cannot overflow |

**Recommendation: `bigint` / `BigInt`.** The per-expense ceiling is fine either way, but balance projections and group totals aggregate indefinitely, and an int4 balance table is a latent production incident. The JSON friction is contained: exactly one serializer at the HTTP boundary converts `BigInt → number` (lossless while |amount| < 2⁵³, which our ceiling guarantees).

Mitigation for the BigInt/number footgun: a single `Money` wrapper module. All arithmetic goes through it, so mixing types is a type error, not a runtime `TypeError` deep in a service.

### 2.3 Currency exponent

A group stores an ISO 4217 code. The **exponent varies** (USD 2, JPY 0, KWD 3). Amounts are stored in that currency's minor unit.

Consequence: the display layer must not hardcode `/100`. Ship a currency reference table (`code`, `exponent`, `symbol`) and divide by `10^exponent`.

### 2.4 Currency immutability

**Invariant:** a group's currency is immutable once the group has its first expense.

Without this, historical amounts silently change meaning. If we ever need to support currency changes, it must be an explicit conversion operation that rewrites every amount at a recorded rate — out of MVP scope, but the invariant closes the door deliberately rather than by accident.

### 2.5 Amount ceiling

Cap a single expense at `10^13` minor units (₹100 billion) so that:

- group totals stay well inside int8,
- percentage computation `total × percentUnits` stays inside int8 if ever done in SQL (`10^13 × 10^8 = 10^21` **overflows** — see §4.4.4).

In the application layer we use `BigInt` arithmetic, which has no overflow, but the SQL aggregate paths are bounded by this ceiling.

---

## 3. Source of truth — challenging the event-ledger assumption

The handoff states:

> Financial events are the authoritative source of truth. PostgreSQL stores the financial records. PostgreSQL also maintains balance projections.

I want to push back on this, because it is the single most consequential decision in the model.

### 3.1 The problem with "records AND events, events are truth"

If the authoritative history is a stream of events (`EXPENSE_CREATED`, `EXPENSE_UPDATED`, `SETTLEMENT_RECORDED`…), and separately we keep materialized records (`expenses`, `expense_payers`, `expense_splits`, `settlements`), then we have **two representations of the same financial state**, and the system must keep them in agreement forever. Every write path, every migration, every bug becomes a potential divergence.

Concretely:
- An expense edit must emit a *delta event* and mutate four tables. Get it wrong in one place and the balance projection silently drifts from the records.
- Reconstructing "current state" from a delta stream requires replaying events — and the replay logic is a second, untested implementation of the business rules.
- Debugging "why is my balance wrong?" requires reading the event stream and mentally simulating a replay, rather than reading the records.

### 3.2 What the event ledger actually buys us

| Capability | Event ledger | Records-as-truth |
|---|---|---|
| Audit of state transitions | Native | Revision snapshots + activity log |
| Current state | Replay required | Direct read |
| Point-in-time balance | Replay to timestamp | Filter records by date |
| Strict double-entry | Yes | No |
| Multi-currency / FX | Natural | Awkward |
| Regulated audit trail | Yes | Possible, not natural |

We explicitly do **not** need the first three rows of the right-hand column's advantages, because:

- **Audit of transitions** → `expense_revisions` (full snapshot per change) + `activity_events` (human-readable diff log). Same capability, far more legible.
- **Point-in-time balance** → records carry `expense_date` and `settled_on`. "What did A owe on 5 Nov?" = the same aggregation with a date filter. Note this answers the question *"as we all agree now"*, which is what users mean — not *"as the ledger computed it back then"*.

Double-entry, multi-currency FX and regulated audit are explicitly out of scope per the handoff ("Do not confuse this simplified group-obligation ledger with a full accounting general ledger").

### 3.3 Recommendation

> **The business records are the authoritative source of truth. Balances are a rebuildable projection. The "event" concept survives only as an append-only activity/audit log, which is descriptive, not accounting substrate.**

This gives us the property that actually matters for a financial system: **the balance is a pure function of the records**. If the balance is ever wrong, we can rebuild it and know the records were right. There is no second ledger to reconcile against.

The corollary is a discipline we must accept: **the projection must be rebuildable, and there must be a reconciliation job** that recomputes balances from records and compares. That job is our canary.

### 3.4 Redis

With balances in Postgres and rebuildable, **Redis has no role in balances**. It earns its place later for rate limiting, notification fan-out and caching read models that are expensive to compute (e.g. group-level activity digests). Introducing it now for balance caching would create a third representation of financial state. Skip it.

---

## 4. The Expense aggregate

### 4.1 Shape

```
Expense
├── id
├── group_id
├── description
├── category (nullable, enum — cheap, useful for UI)
├── amount          bigint  — canonical total, derived from payers (§4.3)
├── split_type      EQUAL | EXACT | PERCENTAGE
├── expense_date    date    — when the money was spent (backdatable)
├── created_by
├── version         int     — optimistic concurrency token
├── deleted_at      — tombstone, never a hard delete (§4.6)
├── deleted_by
├── created_at / updated_at
│
├── ExpensePayer[]  (expense_id, user_id) → amount > 0
├── ExpenseSplit[]  (expense_id, user_id) → amount >= 0, percent_units?
└── ExpenseRevision[]  (one per change, full snapshot)
```

### 4.2 Payer allocations

- **One row per (expense, user).** A member who pays twice for the same expense has their contributions aggregated at write time. Rationale: in a single-currency group, "A paid ₹500 cash and ₹500 by card" is an operational detail, not a financial one — the group's obligation is ₹1000 from A. Keeping it as one row removes duplicate-row UI states and simplifies every downstream sum. The pre-edit detail is preserved in the revision snapshot if it ever matters.
- **Amount must be > 0.** A zero payment is noise.
- **A payer need not be a participant.** Paying on someone else's behalf is normal and must be supported (A pays for B's share). Likewise a participant need not be a payer.
- **Payers and participants must be group members at write time.** See §4.5 for the membership-history nuance.
- **Sums:** `Σ payers == expense.amount`.

### 4.3 The canonical total — derived, not asserted

**Recommendation: the server derives `expense.amount` as `Σ payer allocations`.**

If the client also sends a `total`, it is treated as an *assertion*: it must match the sum of payers, otherwise the request is rejected with a precise error. This eliminates an entire error class (client sends total 1500 and payers summing to 1400) rather than papering over it, and it makes the payer list the single source of truth for the total.

Trade-off accepted: `expenses.amount` is a stored derived value, so it can drift. Mitigated by a deferred constraint trigger (§7.2) that fails the transaction if the two ever disagree.

### 4.4 The split engine

The split engine is a **pure function** with no database access:

```
computeSplits(total: bigint, type: SplitType, participants: Participant[]) → SplitResult[]
```

Where `Participant` is `{ userId, amount?, percentUnits? }` depending on `type`.

It is the most test-worthy unit in the codebase, and it should be written and tested before any schema exists.

#### 4.4.1 Equal split

```
n = participants.length          (n >= 1)
base = total / n                 (integer floor division)
rem  = total % n
```

`rem` minor units are distributed to the first `rem` participants **in a deterministic, order-independent order**.

**The handoff's example implies "the first participant gets the extra unit."** That rule is not implementable as stated: we key splits by `user_id` and discard request order, so "first" is not recoverable. Worse, if order *were* persisted, editing the participant list would shuffle who pays the extra penny, producing balance changes nobody asked for.

**Final deterministic order (Option A):**

| Option | Rule | Property | Downside |
|---|---|---|---|
| **A (recommended)** | Sort participants by `user_id` ascending; first `rem` get +1 | Trivially reproducible, stable across amount edits | Systematic bias toward low `user_id`s (1 minor unit per expense — negligible) |
| B | Sort by `user_id`, rotate start offset by `hash(expense_id) % n` | Unbiased across expenses | Users can't predict who gets the odd unit; harder to explain |
| C | Largest remainder (Hamilton) with `user_id` tie-break | Standard fair-allocation method | Degenerate for equal splits — all remainders identical, so it collapses to A |

Option A satisfies the properties we actually need: **deterministic, reproducible from stored inputs, and independent of request order.**

Worked example — `₹1,000.00` (100000) among 3 participants, `user_id` order `[u_a, u_b, u_c]`:

```
base = 100000 / 3 = 33333,  rem = 100000 % 3 = 1
u_a → 33334   (₹333.34)
u_b → 33333   (₹333.33)
u_c → 33333   (₹333.33)
```

Matches the handoff example.

#### 4.4.2 Exact split

Each participant supplies an explicit minor-unit amount. `Σ amounts` must equal `total` exactly, otherwise the request is rejected (422) with a message naming the difference.

`amount >= 0` is allowed (a participant who owes nothing is legitimate — e.g. children on a trip). At least one participant must have `amount > 0`.

#### 4.4.3 Percentage split **[FINAL]**

**Percentages must not be floats.** A percentage is stored as an integer with a fixed scale:

```
percent_units: bigint,  where 100% == 100_000_000   (scale 1e6, i.e. 6 decimal places of a percent)
```

- `33.333333%` → `33333333`
- `33.33%` → `33330000`
- Sum of all `percent_units` must equal **exactly** `100_000_000`. Not approximately. Not "within a tolerance". Exactly. Any other sum is a 422.

**API representation:** accept `"33.333333"` as a decimal **string** (preferred) or a JSON number. A JSON number must be converted via its shortest round-trip decimal representation (`String(33.333333)` → `"33.333333"`) and then parsed as a decimal string into scaled units. Parsing `"33.33"` directly avoids binary float artifacts like `0.1 + 0.2 = 0.30000000000000004`.

#### 4.4.4 Percentage → amount conversion

```
raw_i     = floor(total × percent_i / 100_000_000)
leftover  = total − Σ raw_i
```

Distribute `leftover` minor units by **largest remainder (Hamilton method)**: participants with the largest fractional part get +1, ties broken by `user_id` ascending. This is the standard fair-allocation method and is exactly deterministic.

Worked example — `₹1,000.00` (100000), splits `33.333333% / 33.333333% / 33.333334%`:

```
raw:    floor(33333333/1000)=33333   floor(33333333/1000)=33333   floor(33333334/1000)=33333
sum = 99999, leftover = 1
fractional parts: 0.33333, 0.33333, 0.33334  → third participant gets +1
result: 33333 / 33333 / 33334
```

**Overflow note:** `total × percent_i` can overflow int8 in SQL (`10^13 × 10^8 = 10^21`). In the application layer we use `BigInt` (no overflow). If we ever compute this in SQL, split the multiplication:
`(total / SCALE) × percent_i + (total % SCALE) × percent_i / SCALE`.

#### 4.4.5 Properties the engine must satisfy (these become tests)

| # | Property |
|---|---|
| P1 | `Σ result.amount == total` for every input |
| P2 | every `result.amount >= 0` |
| P3 | deterministic — same input, same output |
| P4 | **order-independent** — shuffling the participant list yields the same amount per user |
| P5 | for EQUAL, `max(amount) − min(amount) <= 1` minor unit |
| P6 | for PERCENTAGE, `Σ percent_units == 100_000_000` (validated before conversion) |
| P7 | output is sorted by `user_id` (stable response ordering) |

P4 is the property that forces the deterministic-order decision in §4.4.1. It is the single most valuable test in the engine.

#### 4.4.6 One split type per expense

An expense has exactly one `split_type`. Mixed splits (e.g. "A pays for B's share") are not modelled in the MVP; the equivalent is two expenses. Keeping one type per expense keeps the split engine total (no ambiguous combination rules) and makes edits meaningful.

### 4.5 Membership and financial records — which key?

**Recommendation: financial records reference `user_id`, not `membership_id`.**

Why: the rules require that removal/ departure never erases obligations and that rejoining never duplicates history. If a financial record pointed at a membership *period*, a rejoin would create a second period and the historical records would be scattered across periods — every balance query would have to union over periods. Keying by `user_id` makes the balance key simply `(group_id, user_id)`, makes rejoin a non-event for the ledger, and makes "leaving preserves obligations" fall out for free.

The membership *history* is still fully recorded — in `group_memberships`, one row per period, with `started_at` / `ended_at` and a partial unique index guaranteeing one active period per (group, user).

**Optional forensic refinement [DECIDE]:** store `membership_period_id` on `expenses` and `settlements` as well. Benefit: a record permanently identifies the membership period under which it was created, so "was this person a member at the time?" is answerable even after periods are edited. Cost: an extra FK and a subtle rule (a record must point to a period containing its creation timestamp). Optional; I lean toward adding it because it is cheap at write time and impossible to add retroactively later.

**Nuance for edits:** when an expense is edited, participants who have since left the group are **still allowed to remain** on the expense (they were part of the original truth). Only *newly added* payers/participants must be current active members. Implement by diffing old vs new sets, not by validating the whole new set.

### 4.6 Edits, revisions and deletion

#### 4.6.1 Editing an expense

An edit may change: description, category, date, split type, payer set/amounts, participant set/shares.

Transaction:
1. Lock the expense row (`SELECT … FOR UPDATE`).
2. Check `version` — mismatch → `409 Conflict` with the current state **[DECIDE: strict 409 vs last-write-wins, see §8]**.
3. Write an `expense_revisions` row capturing the **pre-change snapshot**.
4. Apply the mutation; re-derive `amount` and re-run the split engine if the split or total changed.
5. Recompute the affected members' balances (§5.3).

#### 4.6.2 Revision format — full snapshot **[DECIDE]**

**Recommendation: full snapshot in `JSONB`, plus a compact human-readable `changes` summary.**

- Snapshot = the complete pre-change expense: `{ amount, split_type, date, payers: [...], splits: [...] }`.
- Why full snapshot rather than structured deltas:
  - Reconstructing a prior state from a delta chain is a second implementation of the business rules, and it is ambiguous when fields are removed vs set to null.
  - A snapshot is directly renderable as a diff and directly usable for restore.
  - Storage cost is irrelevant at our scale (JSONB rows of a few hundred bytes).
- The `changes` summary (e.g. `{ "amount": {"from": 100000, "to": 120000}, "participants": {"added": ["u_x"], "removed": []} }`) is written alongside for the activity feed, so we never have to compute a human-readable diff at read time.

This resolves open decision #9 in the handoff.

#### 4.6.3 Deletion is a tombstone, not a `DELETE`

`deleted_at` / `deleted_by` are set; the rows remain.

Rationale:
- Balance computation excludes tombstoned expenses — same query shape as before, just a filter.
- The financial history survives, satisfying "corrections preserve historical records" and giving the activity feed something truthful to show ("X deleted the dinner expense of ₹1,500").
- Restoration is possible later without data archaeology.

**Important asymmetry with settlements:** deleting an expense asserts *"this was not a shared expense."* That is different from reversing a settlement, which asserts *"the money didn't move."* A deleted expense whose money really was spent leaves the payer out of pocket with no group record — but the tombstone + activity log retains the evidence, and this is exactly what the spec asked for (members may delete any expense). Accept it explicitly rather than discovering it later.

### 4.7 Backdating and dates

- `expense_date` is a `date` (no time), representing when the money was spent. It is backdatable — entering last week's dinner today is normal.
- **Recommendation:** reject future `expense_date` (> today) in the MVP. Planned/recurring expenses are a post-MVP feature and would muddy "what do I owe now".
- `created_at` is the audit timestamp and drives activity-feed ordering. `expense_date` drives "as of" balance semantics. These are different clocks and must not be conflated.

---

## 4.8 Expense lifecycle and edit semantics

```
        create                edit (any active member)          delete (any active member)
   ───────────────►   ACTIVE ─────────────────────────►   ACTIVE ───────────────────────►   TOMBSTONED
                        │  (version++, revision written)          │
                        └──────────────────────────────────────────┘
                                  balance recomputed for affected members
```

Restore is not in the MVP, but the tombstone retains everything needed to implement it later without archaeology.

### 4.8.1 What each field change affects

| Change | Triggers split re-run | Triggers balance recompute | Notes |
|---|---|---|---|
| `description`, `category` | No | No | Revision only |
| `expense_date` | No | No | Changes "as of" balance views, not current balances |
| Participant set (EQUAL) | Yes | Yes | Re-runs the equal engine; the remainder distribution may move (§4.4.1) |
| Participant set (EXACT) | No — client must supply amounts | Yes | Amounts must sum to the new total, else 422 |
| Participant set (PERCENTAGE) | Yes | Yes | Percent units must still sum to exactly 100% |
| Payer set / amounts | n/a | Yes | Total is re-derived from payers (D5); allocation triggers re-validate |
| `split_type` change | Yes | Yes | Any prior share values are discarded and recomputed |

**Changing the total without re-specifying the split is rejected.** For EQUAL and PERCENTAGE the engine re-derives shares automatically. For EXACT, the client must supply a complete new set of exact amounts summing to the new total — a partial update is a 422 with an actionable message, because silently keeping old shares would violate invariant I2.

### 4.8.2 Membership and the participant set on edit

Existing payers and participants are **not** re-validated against current membership on edit. A member who left the group last month can remain on an expense they were genuinely part of; only *newly added* payers/participants must be current active members.

This is why the validation is a **set diff**, not a whole-set check:

```
newlyAdded = (newPayers ∪ newParticipants) \ (oldPayers ∪ oldParticipants)
assert every u in newlyAdded is an active member of the group
```

A naive whole-set check would reject legitimate edits to old expenses whenever a group has churned — a bug that would surface months later and be miserable to trace.

### 4.8.3 Who may perform each transition

Per the confirmed permission matrix, **any active member** may create, edit or delete **any** expense in the group. No ownership concept exists on an expense; `created_by` is attribution for the activity feed, not a permission.

This is the collaborative-editing policy from the handoff, and the reason D8 (409 on concurrent edits) matters: with no ownership boundary, two members editing the same expense is an everyday event, not an exception.

---


### 5.1 Definition and sign convention

```
balance(group, u) =
      Σ paid(u, e)      for e in group, e not deleted
    − Σ share(u, e)     for e in group, e not deleted
    + Σ received(u, s)  for settlements s where s.to_user_id = u
    − Σ sent(u, s)      for settlements s where s.from_user_id = u
```

- **Positive** → the member should receive money.
- **Negative** → the member owes money.
- Zero → square.

Worked example (from the handoff): A pays 100000 (₹1,000); shares A 40000, B 35000, C 25000.

```
A = 100000 − 40000            = +60000
B =      0 − 35000            = −35000
C =      0 − 25000            = −25000
Σ = 0 ✓
```

Settlement effect: a settlement of `x` from B to A gives `A += x`, `B −= x`. Equal and opposite, by construction.

**Σ balances in a group = 0** is an emergent property, not something we enforce by making a number sum to zero — it falls out of `Σ payers == Σ splits` per expense and `Σ settlement effects == 0` per settlement. That is why the allocation invariants (§7) are the load-bearing ones.

### 5.2 Storage: a projection table

```
group_balances
    group_id   uuid
    user_id    uuid
    amount     bigint   NOT NULL DEFAULT 0
    updated_at timestamptz
    PRIMARY KEY (group_id, user_id)
```

A row is created **when a member joins the group**, with amount 0.

This matters for more than tidiness: it guarantees a row always exists to lock, which the concurrency strategy depends on (§5.3). Lazily-created balance rows would introduce an insert race on first use.

Rows are **never deleted** — not on leaving, not on removal, not when the balance reaches zero. A departed member's outstanding obligation must still be visible and lockable.

### 5.3 How the projection is maintained — recompute, don't apply deltas

Two candidate strategies:

| | Delta application | Recompute from records |
|---|---|---|
| Update cost | O(1) per affected user | O(expenses touching that user) |
| Correctness risk | Drift accumulates silently | Cannot drift — projection is a pure function of records |
| Recovery from a bug | Manual repair required | Rebuild the affected users |
| Concurrency | Needs exact delta math under lock | Needs lock + read-after-lock |

**Recommendation: recompute the affected members' balances from the records, inside the same transaction as the mutation.**

The set of affected members is known before we start:
- create expense → payers ∪ participants
- edit expense → (old payers ∪ old participants) ∪ (new payers ∪ new participants)
- delete expense → old payers ∪ old participants
- settlement → from ∪ to

Procedure for a mutation affecting set `U`:

```
BEGIN;
  1. lock balance rows for U  -- SELECT ... FROM group_balances
                                -- WHERE group_id = ? AND user_id = ANY(U)
                                -- ORDER BY user_id FOR UPDATE
  2. perform the record mutation
  3. recompute balance(u) from records for each u in U
  4. UPDATE group_balances SET amount = ..., updated_at = now()
  5. COMMIT;
```

Two subtleties that make this correct:

1. **Lock ordering must be deterministic** (sort by `user_id`). Two concurrent transactions needing overlapping member sets otherwise deadlock. With a consistent order, one waits.
2. **The lock must be acquired *before* the recompute read**, and the isolation level must be `READ COMMITTED` (statement-level snapshots). Transaction T2 blocks on the lock until T1 commits; T2's subsequent recompute query then *sees* T1's committed rows. Under `REPEATABLE READ` or `SERIALIZABLE` the snapshot would be taken earlier and T2 would still miss T1's expense. This is the classic write-skew that a naive recompute implementation gets wrong.

**Cost.** Recompute is O(number of expenses in the group that touch that member). At MVP scale (hundreds to low thousands of expenses per group) this is a couple of indexed aggregate queries — negligible. If a group ever reaches tens of thousands of expenses, switch to delta application, using the revision snapshots as the source of the old values. The revision snapshot makes that switch possible; that's another reason to keep full snapshots.

**Reconciliation.** A scheduled job recomputes *every* member's balance in every group and compares against the projection, alerting on mismatch. This is the canary for the projection, and it makes the "rebuildable" claim in §3.3 testable rather than aspirational.

### 5.4 Balances of departed members

A member who leaves or is removed keeps their balance row and their balance value. The balance read model includes them, flagged as a former member. Their obligation is real and someone still has to pay it.

### 5.5 Pairwise debt (deferred, but derivable)

Group-level net balances hide pairwise structure. If B owes A 500 and B owes C 500 and C owes A 500, the net view says B: −1000, A: +1000, C: 0 — but the honest pairwise view says B owes A 500 and B owes C 500, and C owes A 500.

The net view is what the group-level settlement decision (§4 of the handoff) is built on, and it is correct as a settlement instruction set. But the *explanation* "B owes A" is a simplification, and the UI should not present net balances as if they were pairwise debts.

A pairwise matrix is fully derivable from the same records (aggregate paid/share per ordered pair), so this is a read-model addition, not a schema change. Deferred, but cheap later.

---

## 6. Overpayment and credit — the hard case

Scenario: A pays ₹1,000 for a shared dinner. Shares are A 400, B 350, C 250. B settles ₹350 to A. Now edit the expense: A's share becomes 600 (A paid for more), B 200, C 200.

```
before edit:  A = 100000 − 40000 + 35000 = +95000
               B =        − 35000 − 35000 = −70000
               C =        − 25000          = −25000

after edit:   A = 100000 − 60000 + 35000 = +75000
               B =        − 20000 − 35000 = −55000
               C =        − 20000          = −20000
```

The settlement row is untouched. B paid A ₹350 — that is a fact about the world. B's net obligation is now ₹550; A is owed ₹750. Nothing is inconsistent, and nothing was rewritten.

**Overpayment case.** B settles ₹700 when B only owed ₹350. After the edit above, B's balance becomes `−20000 − 70000 = −90000`... wait, let me restate it as the credit case: if B settles more than B owes, B's balance crosses zero and becomes **positive** — B is now owed money by the group.

```
B owes 350, settles 700  →  B = −35000 + 70000 = +35000  (B is owed ₹350)
```

**This is the answer to open decision #6: overpayment is not a special case at all.** With group-level net balances and a single sign convention, an overpayment simply produces a positive balance. There is no separate "credit balance" entity, no `overpayment` flag, no debt-vs-credit distinction. A member's balance is one number.

Two consequences to accept:
- The UI must be able to explain *why* someone who "owes" now shows as "is owed". That requires the balance breakdown (which expenses and settlements contributed) — a read model over the records, not a schema change.
- A settlement larger than the current obligation is **allowed**, not rejected. It is a legitimate real-world action (paying ahead, or paying off a rounded-up amount).

---

## 7. Invariants

Each invariant names the layer that enforces it. "App" = service layer, "DB" = constraint/trigger.

### 7.1 Allocation invariants

| # | Invariant | Enforced by |
|---|---|---|
| I1 | `Σ payer.amount == expense.amount` | App (derived) + DB deferred trigger |
| I2 | `Σ split.amount == expense.amount` | App (split engine) + DB deferred trigger |
| I3 | `payer.amount > 0` | DB check constraint |
| I4 | `split.amount >= 0` | DB check constraint |
| I5 | PERCENTAGE ⇒ `Σ percent_units == 100_000_000` | App (Zod refinement) |
| I6 | PERCENTAGE ⇒ `percent_units` present; otherwise absent | App + DB trigger |
| I7 | at least one payer, at least one participant | App |
| I8 | payers ∪ participants ⊆ group members | App (see §4.5 for the edit nuance) |
| I9 | all payers and participants belong to the expense's group | App + DB trigger |
| I10 | at most one payer row and one split row per (expense, user) | DB primary key |
| I11 | `expense.amount > 0` | DB check constraint |

### 7.2 The deferred constraint trigger

This is how I1 and I2 are made **impossible to violate at the database level**, even if a future code path forgets to validate.

```sql
CREATE OR REPLACE FUNCTION check_expense_allocations() RETURNS trigger AS $$
DECLARE
    exp_id  uuid;
    total   bigint;
    pay_sum bigint;
    spl_sum bigint;
BEGIN
    exp_id := COALESCE(NEW.expense_id, OLD.expense_id);

    SELECT e.amount INTO total
      FROM expenses e
     WHERE e.id = exp_id AND e.deleted_at IS NULL;

    IF total IS NULL THEN          -- tombstoned or missing expense: nothing to check
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO pay_sum
      FROM expense_payers WHERE expense_id = exp_id;

    SELECT COALESCE(SUM(amount), 0) INTO spl_sum
      FROM expense_splits WHERE expense_id = exp_id;

    IF pay_sum <> total OR spl_sum <> total THEN
        RAISE EXCEPTION
            'allocation mismatch on expense %: total=%, payers=%, splits=%',
            exp_id, total, pay_sum, spl_sum
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER expense_allocations_payers
    AFTER INSERT OR UPDATE OR DELETE ON expense_payers
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_expense_allocations();

CREATE CONSTRAINT TRIGGER expense_allocations_splits
    AFTER INSERT OR UPDATE OR DELETE ON expense_splits
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_expense_allocations();
```

`DEFERRABLE INITIALLY DEFERRED` means the check runs at **commit**, not per statement. That is what lets a transaction insert the expense, then insert payers and splits, and be validated once the whole unit of work is complete.

Cost: the check runs once per affected row, so an expense with `n` payers costs `O(n²)` row reads. At `n <= 50` this is trivial. It is still a per-row scan, so it is a candidate for the reconciliation job to double-check at scale.

Operational note: these triggers live in a **custom Prisma migration** (`prisma/migrations/<ts>_financial_constraints/migration.sql`). `prisma migrate diff` and `prisma db push` do not model triggers, so the schema file and the trigger must be kept in sync manually — flag it in the repo so a future `db push` does not silently drop the guarantees.

### 7.3 Balance invariants

| # | Invariant | Enforced by |
|---|---|---|
| I13 | `Σ balance(group, ·) == 0` | Emergent from I1/I2 + settlement symmetry; verified by the reconciliation job |
| I14 | a settlement changes two members' balances by equal and opposite amounts | Emergent from the balance formula |
| I15 | a balance row exists for every (group, user) that has ever been a member | App (create at join) |
| I16 | balance rows are never deleted | App + no FK cascade from memberships |
| I17 | financial operations are atomic | Single transaction per mutation |
| I18 | a repeated request produces no duplicate financial effect | Idempotency key + unique constraints (§8) |
| I19 | corrections preserve history | Tombstones + immutable revisions + append-only settlements |

### 7.4 Settlement invariants (summary; full treatment in the settlement module)

| # | Invariant |
|---|---|
| I20 | `from_user_id <> to_user_id` |
| I21 | `amount > 0` |
| I22 | at most one reversal per settlement (unique index on `reverses_id`) |
| I23 | a settlement is never mutated; corrections append new rows |

---

## 8. Concurrency and idempotency

### 8.1 Concurrent edits to the same expense

Two members edit expense E simultaneously.

**Recommendation: optimistic concurrency with a `version` column.** The client sends the version it read; the server rejects the stale write with `409 Conflict` and returns the current state so the UI can show "Aisha changed this expense — review and retry".

Why not last-write-wins: the collaborative-editing policy (any member may edit any expense) makes lost updates the *default* outcome. With a `409`, the second editor loses nothing and is told. This is a product-visible decision, not just a technical one. **[DECIDE]**

If the product later wants "last write wins" (Splitwise-style, no conflict UI), the fix is to drop the version check — the trigger and invariants still hold either way. Keep the `version` column now so the switch is a policy change, not a migration.

### 8.2 Idempotency

Duplicate submission is a *financial* bug, not a UX annoyance: a double-tapped "create expense" creates two obligations.

**Recommendation: an `idempotency_keys` table, scoped per user per operation.**

```
PRIMARY KEY (user_id, scope, key)
    scope        -- e.g. 'POST /groups/:id/expenses'
    request_hash -- sha256 of the canonical request body
    resource_id  -- the created entity
    status       -- IN_PROGRESS | COMPLETED
```

- Same key, same body → return the stored response. No new effect.
- Same key, **different** body → `409`/`422`. Reusing a key for different content is a client bug and must not silently create a second record.
- The row is inserted **inside the same transaction** as the mutation, so a rolled-back transaction leaves no key behind and a retry can proceed.

Scope the key to the user (not globally) so two users cannot collide, and so a key is not a bearer token.

### 8.3 Deadlocks and retries

- Acquire balance-row locks in a deterministic order (`ORDER BY user_id`) → no deadlock between two mutations touching overlapping member sets.
- Row-lock the expense row before editing it → serializes concurrent edits of the same expense.
- Prisma's `P2034` (transaction conflict) → retry with exponential backoff. Already studied; use it as the safety net for the cases our ordering doesn't cover.
- PostgreSQL `40P01` (deadlock detected) → also retry. Prisma surfaces this as a write-conflict error; confirm the exact mapping against Prisma 7 docs before relying on it.

---

## 9. Logical schema

Postgres-flavoured DDL. The Prisma schema is the *next* step and will be derived from this.

```sql
-- ---------- identity ----------
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         citext UNIQUE NOT NULL,
    display_name  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- group ----------
CREATE TABLE groups (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    currency     char(3) NOT NULL,              -- ISO 4217; exponent from a reference table
    archived_at  timestamptz,
    created_by   uuid NOT NULL REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE group_role      AS ENUM ('OWNER','ADMIN','MEMBER');
CREATE TYPE member_status   AS ENUM ('ACTIVE','LEFT','REMOVED');

-- one row per membership *period*; rejoining creates a new period
CREATE TABLE group_memberships (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    uuid NOT NULL REFERENCES groups(id),
    user_id     uuid NOT NULL REFERENCES users(id),
    role        group_role    NOT NULL,
    status      member_status NOT NULL DEFAULT 'ACTIVE',
    started_at  timestamptz NOT NULL DEFAULT now(),
    ended_at    timestamptz,
    ended_by    uuid REFERENCES users(id)
);
-- at most one ACTIVE period per (group, user); history rows coexist
CREATE UNIQUE INDEX group_memberships_one_active
    ON group_memberships (group_id, user_id) WHERE status = 'ACTIVE';

-- ---------- expenses ----------
CREATE TYPE split_type AS ENUM ('EQUAL','EXACT','PERCENTAGE');

CREATE TABLE expenses (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id     uuid NOT NULL REFERENCES groups(id),
    description  text NOT NULL,
    category     text,
    amount       bigint NOT NULL CHECK (amount > 0),        -- canonical total = Σ payers
    split_type   split_type NOT NULL,
    expense_date date NOT NULL,
    created_by   uuid NOT NULL REFERENCES users(id),
    version      integer NOT NULL DEFAULT 1,
    deleted_at   timestamptz,
    deleted_by   uuid REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_group_active
    ON expenses (group_id, expense_date DESC, id) WHERE deleted_at IS NULL;

CREATE TABLE expense_payers (
    expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id),
    amount     bigint NOT NULL CHECK (amount > 0),
    PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX expense_payers_user ON expense_payers (user_id, expense_id);

CREATE TABLE expense_splits (
    expense_id    uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id),
    amount        bigint NOT NULL CHECK (amount >= 0),
    percent_units bigint,        -- set only for PERCENTAGE (see §4.4.3 scale)
    PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX expense_splits_user ON expense_splits (user_id, expense_id);

CREATE TABLE expense_revisions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id  uuid NOT NULL REFERENCES expenses(id),
    revision    integer NOT NULL,
    snapshot    jsonb NOT NULL,      -- full pre-change snapshot
    changes     jsonb,               -- human-readable summary for the activity feed
    created_by  uuid NOT NULL REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (expense_id, revision)
);

-- ---------- balances (projection) ----------
CREATE TABLE group_balances (
    group_id   uuid NOT NULL REFERENCES groups(id),
    user_id    uuid NOT NULL REFERENCES users(id),
    amount     bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- ---------- settlements ----------
CREATE TABLE settlements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id      uuid NOT NULL REFERENCES groups(id),
    from_user_id  uuid NOT NULL REFERENCES users(id),
    to_user_id    uuid NOT NULL REFERENCES users(id),
    amount        bigint NOT NULL CHECK (amount > 0),
    settled_on    date NOT NULL,
    note          text,
    reverses_id   uuid REFERENCES settlements(id),
    created_by    uuid NOT NULL REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX settlements_single_reversal
    ON settlements (reverses_id) WHERE reverses_id IS NOT NULL;
CREATE INDEX settlements_from ON settlements (group_id, from_user_id);
CREATE INDEX settlements_to   ON settlements (group_id, to_user_id);

-- ---------- idempotency ----------
CREATE TABLE idempotency_keys (
    user_id      uuid NOT NULL REFERENCES users(id),
    scope        text NOT NULL,
    key          text NOT NULL,
    request_hash text NOT NULL,
    resource_id  uuid,
    status       text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, scope, key)
);
```

### 9.1 Index rationale for the balance recompute

The recompute query drives from `expenses` filtered by group, then into `expense_payers` / `expense_splits` by `expense_id`:

```sql
SELECT COALESCE(SUM(p.amount), 0)
  FROM expense_payers p
  JOIN expenses e ON e.id = p.expense_id
 WHERE e.group_id = $1 AND e.deleted_at IS NULL AND p.user_id = $2;
```

The `expense_payers (user_id, expense_id)` index serves the `user_id` predicate; `expenses_group_active` serves the group filter. Alternatively drive from `expense_payers` filtered by `user_id` and join to `expenses` by PK. Both plans are acceptable at our scale — we will verify with `EXPLAIN ANALYZE` once real data exists, not guess.

### 9.2 Entities deliberately *not* created

- `ledger_entries` / `financial_events` — rejected in §3.
- `expense_categories` table — a plain `text` column plus an app-level enum is enough for MVP.
- `exchange_rates` — no conversion in MVP.
- `recurring_expenses` — post-MVP.
- `payment_intents` — no gateway.

---

## 10. Edge cases

| # | Case | Handling |
|---|---|---|
| E1 | Expense total not divisible by participant count | Deterministic remainder distribution (§4.4.1) |
| E2 | Percentages sum to 99.99% or 100.01% | Rejected (422). Exact equality, never auto-normalised |
| E3 | Percentages given as floats (`33.33`) | Accepted; parsed via shortest round-trip decimal string into scaled units |
| E4 | Payer sum ≠ asserted total | 422 with the difference |
| E5 | Payer is not a participant | Allowed (paying on someone's behalf) |
| E6 | Participant is not a payer | Allowed |
| E7 | Zero-amount expense | Rejected (422 / DB check) |
| E8 | Zero-amount participant share | Allowed (exact splits) |
| E9 | Member leaves with an outstanding balance | Balance row and value persist; obligation survives (§5.4) |
| E10 | Member is removed | Same as E9. Their historical expense/settlement rows are never cascaded away |
| E11 | Member rejoins | New membership period; same `user_id` ⇒ same balance row, no duplicated history (§4.5) |
| E12 | Expense edited after a participant left | Existing participant stays; only newly added participants must be current members (§4.5) |
| E13 | Expense edited after it was settled against | Settlement untouched; balances recomputed; net may flip direction (§6) |
| E14 | Settlement larger than the balance | Allowed. Produces a positive balance (credit) — not a special case (§6) |
| E15 | Settlement between two users who are both departed | 422 (both must be current members) — revisit in the settlement module |
| E16 | Settlement between a user and themselves | Rejected (DB check) |
| E17 | Two members edit the same expense simultaneously | `409 Conflict` via version check **[DECIDE]** |
| E18 | Double-tap on "create expense" | Idempotency key ⇒ one effect (§8.2) |
| E19 | Two concurrent settlements between the same pair | Both are valid records; balance recompute is serialized by row locks (§5.3) |
| E20 | Currency with 0 decimals (JPY) | Amounts are whole units; display must use the exponent, not a hardcoded `/100` (§2.3) |
| E21 | Currency with 3 decimals (KWD) | Same handling; minor unit is 1/1000 |
| E22 | Group currency changed after expenses exist | Forbidden — currency is immutable once the first expense exists (§2.4) |
| E23 | Expense dated in the future | Rejected in MVP (§4.7) |
| E24 | Expense backdated to last year | Allowed; `expense_date` drives "as of" balance semantics, `created_at` drives the activity feed |
| E25 | Expense deleted | Tombstone; excluded from balances; history retained (§4.6.3) |
| E26 | Group archived | Read-only; balances frozen |
| E27 | Expense whose payer and only participant are the same member | Legal. Zero net effect on that member |
| E28 | Expense amount exceeding the ceiling | Rejected (422). Prevents int8 overflow in aggregate paths (§2.5) |
| E29 | A member's net balance is zero but they have unsettled shares | Legal. Net balances hide pairwise structure (§5.5) |
| E30 | Two settlements that cancel each other out | Legal; net effect zero; both records visible in history |

---

## 11. Implementation sequence

Ordered so that the riskiest logic is built and tested before it is entangled with infrastructure.

| # | Step | Deliverable | Done when |
|---|---|---|---|
| 1 | **Money module** | `bigint` money type + currency exponent handling | Type-safe arithmetic; JSON boundary serializer |
| 2 | **Split engine** | Pure `computeSplits` with P1–P7 property tests | All properties green; no DB dependency |
| 3 | **Schema + migrations** | Tables, constraints, indexes, deferred triggers | `psql` refuses to commit an unbalanced expense |
| 4 | **Expense service** | create / edit / delete with allocation validation, revisions | Round-trip tests; revision history renders |
| 5 | **Balance service** | recompute + projection + reconciliation job | Projection matches recomputation on every fixture |
| 6 | **Settlement service** | record / reverse | Reversal cancels exactly; history intact |
| 7 | **Idempotency middleware** | key table + middleware | Replayed request returns the original result, creates nothing new |
| 8 | **Read models** | group balances, member balance breakdown, expense list | A member can see *why* their balance is what it is |
| 9 | **Concurrency tests** | Parallel edit/settle under load | No lost updates; no deadlocks; no drift |

Step 2 before step 3 is deliberate: the split engine is pure and fully testable in isolation, and it is where the financial risk concentrates.

---

## 12. Decision status

Numbered for reference in [`../decisions.md`](../decisions.md).

### Confirmed

| # | Decision | Outcome |
|---|---|---|
| D1 | Are records the source of truth, or is the event ledger? | **Records.** Balance = pure function of records |
| D3 | Equal-split remainder distribution | **Sort by `user_id` ascending** (option A) |
| D5 | Canonical expense total | **Derived from payers**; client total is an assertion |
| D8 | Concurrent expense edits | **Optimistic concurrency → 409 Conflict** |

### Recommended, pending a nod (low controversy — proceeding unless objected)

| # | Decision | Recommendation |
|---|---|---|
| D2 | Money column type | **`bigint` / Prisma `BigInt`** |
| D4 | Percentage scale | **1e6 per percent (100% = 100_000_000)** |
| D6 | Revision format | **Full JSONB snapshot** + human-readable changes summary |
| D7 | Expense deletion | **Tombstone** (`deleted_at`), never hard delete |
| D9 | Financial records keyed by `user_id` or `membership_id`? | **`user_id`**; optionally add `membership_period_id` for forensics |
| D10 | Redis in the balance path | **No.** Postgres projection + rebuild is enough |

### Open, deferred to the relevant module

| # | Decision | Resolve in |
|---|---|---|
| C3 | Whether removed members retain read access to the group's history | memberships |
| C5 | Whether `membership_period_id` is added to financial rows for forensics | schema freeze |
| C6 | Settlement rules for pairs involving former members | settlements |
| C7 | Whether pairwise debt explanation is in the MVP read models | read models |

---

## 13. Module status

**Expense · payer allocation · split · balance — designed.**

Remaining Phase 0 work, in the order it should be taken:

1. **Settlements and corrections** — reversal semantics, the `reverses_id` chain, settlement eligibility, and the "overpayment" read model. Touches the balance model established here, so it belongs next.
2. **Group and membership lifecycle** — invitation acceptance, leave/remove/rejoin, ownership transfer, archival. Resolves C3 and C5.
3. **Schema freeze** — translate §9 into the Prisma schema plus the custom migration for the deferred triggers, then reconcile against the DDL in §9.

