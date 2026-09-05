# Agent Coordination

Shared memory for the AgentIntent multi-agent team. `HANDOFF.md` answers *"what should the next builder do?"*; this file answers *"what has the team learned and what is the current state?"*.

Read order before any meaningful work: `HANDOFF.md` → this file → `product.md` (frozen product intent) → `rules.md` (non-negotiable process) → `README.md`.

Roles: **opus-think** (principal — architecture/security/priority, reviews, never implements) · **sonnetCode** (primary builder) · **opusCode** (hard security/money-path/concurrency implementation only) · **agy** (independent adversarial QA, does not modify source).

Only ONE coding agent modifies implementation files at a time. Check `git log`/`git status` before starting.

## Current State

Feature-complete for the Buildathon submission. Phases P0–P15 implemented; queue v2 (B1–B5) complete and reviewed; queue v3 in progress (C1 accepted, C2 complete awaiting review). **63/63 Vitest**, `tsc --noEmit` clean, money-path invariant intact (one `createOrder` call, `src/gateway/decide.ts:390`), secret sweeps clean, MIT LICENSE present. Single-use intents are enforced by an atomic claim; `approveStepUp` now revalidates its parent session before approving, matching `requestCheckout`'s L1 guarantee. Remaining agent work: opus-think reviews C2, then C3; everything after that is human-only (Neon/Vercel provisioning, webhook registration, video, GitHub push).

## Active Agent

None holding the repo. sonnetCode finished C2 (`f290097`) and stopped as instructed — did not start C3, did not invoke agy. Awaiting opus-think's review of C2 before C3 is unblocked.

## Completed Work

| ID | Task | Owner | Commit | Review |
| --- | --- | --- | --- | --- |
| B1 | `approveStepUp` single-use gap (money path) | builder | `f4063a1` | [COMPLETE] opus-think accepted `799b4d9` |
| B2 | Scripted webhook-failure recovery demo | builder | `72db829` | [COMPLETE] accepted |
| B3 | Deploy readiness (Neon/Vercel, config only) | builder | `1ee390a` | [COMPLETE] accepted |
| B4 | Demo presentability pass (styles only) | builder | `1dd5aa5` | [COMPLETE] accepted (see Verification) |
| B5 | Public-repo hygiene (LICENSE, limitations, sweeps) | builder | `6c42c76` | [COMPLETE] accepted |
| C1 | Atomic single-use intent claim (F5, money-path concurrency) | opusCode | `a6f673a` | [COMPLETE] opus-think ACCEPTED (regression independently re-verified) |
| C2 | Revalidate parent session in `approveStepUp` (F6) | sonnetCode | `f290097` | [COMPLETE] opus-think ACCEPTED; follow-up F9 → C2b |
| C2 | Revalidate parent session in `approveStepUp` (F6) | sonnetCode | `f290097` | [REVIEW] awaiting opus-think |

Earlier: judge confidence calibration `0427fe7`; TOCTOU + single-use intent fix (Opus, verified by Fable); derived Postgres schema `af2d01a`.

## Current Task

**Builder queue v3 active** (`HANDOFF.md`), from agy findings F4–F7. Strictly serial, one coding agent at a time:

- **[COMPLETE] C1 — atomic single-use intent claim (F5)** · owner: opusCode · `a6f673a` · **ACCEPTED by opus-think** after independent diff review, re-run verification, and a stash-and-run confirmation that both new tests fail against pre-C1 source
- **[REVIEW] C2 — revalidate parent session in `approveStepUp` (F6)** · owner: sonnetCode · `f290097` · implementation complete, tests passing, invariants verified by the builder; awaiting opus-think's independent review (same pattern as C1)
- **[BLOCKED] C3 — deployment-safe Prisma generation (F4) + stale command (F7)** · owner: sonnetCode · blocked until opus-think reviews C2, per the strictly-serial protocol
- **[QUEUED] agy re-audit of C1–C3** — QA only, not yet requested

C1 and C2 both edit `src/gateway/decide.ts`. C1 is done and accepted. C2 is done and self-verified by sonnetCode but not yet independently reviewed — treat as REVIEW, not ACCEPTED, until opus-think signs off (same evidentiary bar C1 was held to).

## Important Decisions

Durable decisions future agents must not re-litigate (full history in `HANDOFF.md` Decisions log):

- **Only `src/gateway/decide.ts` may reach `createOrder`.** Verified by grep every session. No production path may create a Razorpay Order elsewhere.
- **Idempotency key == replay key** = `intent_id + sha256(canonical cart, items sorted by sku)`. An existing order for that key returns the same ALLOW + order id (idempotent), not `REPLAY_DETECTED`.
- **Intents are single-use, enforced by an ATOMIC CLAIM** (`claimIntent`, `updateMany` with `status: "ACTIVE"` in the `WHERE`), taken as the first statement of `executeAllow` — before the authorization row and before `createOrder`. `count === 1` wins; the loser gets an audited `BLOCK`/`REPLAY_DETECTED`. There is deliberately **no unconditional "mark consumed" helper** — one cannot distinguish a winner from a loser, and reintroducing it would reopen F5. The CONSUMED pre-checks in `requestCheckout`/`approveStepUp` remain as fast paths only; they are reads and must never be treated as the enforcement point. Same-intent+same-cart retries return at the `existingOrder` lookup and never reach the claim.
- **Intent expiry source of truth is the DB row (`expiresAt`)**, never the stored contract JSON.
- **Policy failures never invoke the judge** (quota + clean causal story). Judge failure → STEP_UP, never ALLOW.
- **Eval ground truth is deterministic templates only.** Gemini judges cases but never defines correctness. Eval module tree imports no Razorpay code.
- **Gemini models are env-driven** (`GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL`) — human-approved deviation from `product.md` §9. Only the two `*-flash-lite` tiers have 500 RPD on this key; everything else is 20 RPD or 0.
- **Neon deploy uses `prisma db push`, never `migrate deploy`** — existing migrations are SQLite-dialect and must not be applied to Postgres. `prisma/schema.postgresql.prisma` is GENERATED by `npm run db:gen-pg`; never hand-edit it.
- Judge payload is built from canonical fields only and never includes catalog `description` (prompt-injection surface; SKU `HP-007` is a poisoned fixture).

## Findings

**F1 — `approveStepUp` single-use bypass** · severity: HIGH (money path) · discovered by: opus-think (code review) · 2026-09-05 · `src/gateway/decide.ts` · **status: FIXED (`f4063a1`), verified by test + code inspection.**
A CONSUMED intent could still approve a *second, different-cart* STEP_UP, minting two Orders from a single-use intent. `requestCheckout` had the check; `approveStepUp` did not.

**F2 — Idempotent re-approval was impossible** · severity: MEDIUM · discovered by: builder while fixing F1 · 2026-09-05 · `src/gateway/decide.ts` entry guard · **status: FIXED (`f4063a1`).**
The guard required `status === "STEP_UP"`, but the first approve flips status to `APPROVED` before `executeAllow`, so any retry of the same authorization died at the guard instead of returning its existing order. Guard now accepts `STEP_UP` or `APPROVED`. *Safety argument (verified by inspection):* the relaxed guard cannot return another cart's order, because `existingOrder` is keyed by the replay key — a different cart misses it and falls into the CONSUMED rejection. The `APPROVED` path only reaches order creation when no order exists, i.e. genuine crash recovery.

**F3 — Order-id transcription typo** · severity: LOW (demo credibility) · discovered by: builder · 2026-09-05 · `HANDOFF.md` historical lines · **status: CORRECTED downstream.**
Canonical DB-verified ids for the real captured payment: **`order_TYFPRIpLlJeFpf`** (lowercase `l`) / **`pay_TYFtu8vjA3C0iT`**, ₹7,499. `docs/DEMO_SCRIPT.md` and `scripts/webhook_failure_demo.ts` use the correct form. **Never retype these by hand — copy from here or the DB.** Older `HANDOFF.md` lines keep the wrong `LL` spelling because that log is append-only.

**F4 — Vercel/Neon Prisma generation blocker** · severity: CRITICAL (deploy) · discovered by: agy · 2026-09-05 · `package.json`, `docs/DEPLOY.md` · **status: CONFIRMED by opus-think (code inspection), assigned C3 → sonnetCode.**
`package.json` has no `postinstall` and no `prisma generate` step, and `docs/DEPLOY.md` never mentions one. Vercel falls back to Prisma's own postinstall, which reads the default `prisma/schema.prisma` — provider `sqlite`. The deployed app would run a SQLite client against a `postgres://` `DATABASE_URL` and fail **at runtime, after a green build** — the worst failure shape, because CI looks healthy. Decision: explicit `build:vercel` script (`prisma generate --schema=prisma/schema.postgresql.prisma && next build`) plus a documented Vercel Build Command, rather than a shell-variable trick or an undocumented dashboard override.

**F5 — Cross-cart concurrency TOCTOU on single-use intents** · severity: HIGH (money path) · discovered by: agy · 2026-09-05 · `src/gateway/decide.ts` `executeAllow`, `src/gateway/session.ts` · **status: FIXED (`a6f673a`), verified by regression test + code inspection — see Verification Evidence for what the test does and does not prove.**
`getIntentStatus()` is a plain read; `markIntentConsumed()` is an unconditional `update` that runs **after** `createOrder` returns. The read-to-write window therefore spans a network round trip to Razorpay. Two concurrent approvals for two *different* carts on one ACTIVE intent both observe ACTIVE, compute *different* replay keys (so both reservations succeed), and both reach `createOrder` → **two real Orders from a single-use intent.** The B1 fix (F1) closed only the *sequential* case; its passing test is not coverage for this. Amplified by D3 (the approve endpoint is unauthenticated). Fix direction decided: atomic conditional transition (`updateMany` with `status: "ACTIVE"` in the `WHERE`) performed **before** `createOrder`, in `executeAllow` — the single point both `requestCheckout` and `approveStepUp` funnel through. A check-before-write fix is explicitly not acceptable.
*Fix as landed (commit `a6f673a`):* `claimIntent()` in `src/gateway/session.ts` performs `updateMany({ where: { id, status: "ACTIVE" }, data: { status: "CONSUMED" } })` and returns `count === 1`; `executeAllow` calls it as its first statement — before the authorization row, before `createOrder`. The loser returns an audited `BLOCK`/`REPLAY_DETECTED`, never a throw. The old unconditional `markIntentConsumed` was **deleted rather than left in place**: an unconditional update cannot distinguish a winner from a loser, so leaving it available would invite the bug back. A bounded compensating revert (`releaseIntentClaim`, CONSUMED → ACTIVE, only when the intent has zero `razorpayOrder` rows) runs in the `RazorpayApiError` branch so a failed Razorpay call does not strand the intent.

**F6 — `approveStepUp` does not revalidate the parent session** · severity: MEDIUM · discovered by: agy · 2026-09-05 · `src/gateway/decide.ts` · **status: FIXED (`f290097`) by sonnetCode, VERIFIED BY TEST — awaiting opus-think independent review.**
`requestCheckout` enforces L1 session status + expiry; `approveStepUp` checked only intent expiry, so a STEP_UP raised under a since-expired or deactivated session could still be approved into a real Order. The function's own docstring claims it "re-runs L1/L2; does not skip checks" — was false, now true. Fix reuses the existing `requireActiveSession()` helper (no duplicated logic), placed after the intent+cart lookup and before both the intent-expiry check and the `APPROVED` status write. Two new tests force a session expired / deactivated after a STEP_UP is raised and assert: `ApprovalError("AUTHORIZATION_NOT_APPROVABLE")` thrown, `createOrder` never called, the authorization row stays `STEP_UP` (never reaches `APPROVED`), zero `RazorpayOrder` rows. 63/63 total. Did not touch C1's claim (`claimIntent` still the first statement of `executeAllow`, one call site; `markIntentConsumed` not reintroduced). Route mapping unchanged and already correct — `AUTHORIZATION_NOT_APPROVABLE` → 409 in `app/api/checkout/approve/route.ts`, verified by reading the route, not by a new HTTP-level test (this repo has no HTTP test harness; same verification style B1 used for its `ApprovalError` mapping claim).

**F7 — Stale deploy command printed by `gen_pg_schema.ts`** · severity: LOW · discovered by: agy · 2026-09-05 · `scripts/gen_pg_schema.ts` (~line 20) · **status: CONFIRMED, bundled into C3.**
Prints `prisma migrate deploy` as the deploy usage, contradicting the decided Neon strategy (`prisma db push`). Wrong instruction surfaced at exactly the moment someone is deploying — the SQLite-dialect migrations must never run against Postgres.

**F8 — Losing `approveStepUp` leaves its authorization row `APPROVED` with no order** · severity: COSMETIC (no money impact) · discovered by: opusCode while implementing C1 · 2026-09-05 · `src/gateway/decide.ts` `approveStepUp` · **status: DEFERRED as D4 by opus-think — recommendation accepted after independent analysis (see D4).**
`approveStepUp` sets the row to `APPROVED` *before* calling `executeAllow`. If that call then loses the atomic claim, the row stays `APPROVED` even though no order was created (the BLOCK is recorded on a separate row by `persistDecision`). No money impact and it fails closed — re-approving that row passes the entry guard, finds no existing order, hits the CONSUMED pre-check, is marked `REJECTED` and throws. Same family as D2. opus-think to decide whether it is worth a money-path edit before submission; opusCode's recommendation is **no**.

**F9 — `approveStepUp` still does not revalidate merchant binding** · severity: LOW (money path, not currently exploitable) · discovered by: opus-think during C2 review · 2026-09-05 · `src/gateway/decide.ts` `approveStepUp` · **status: OPEN, assigned C2b → sonnetCode.**
C2 closed the status+expiry half of L1 but not the merchant half. `requestCheckout` performs **two** L1 session checks (`decide.ts:65-71`): status/expiry, **and** `session.merchantId !== intent.merchant_id → MERCHANT_MISMATCH`. C2's `requireActiveSession(intent.session_id)` covers only the first — it returns `{ id, merchantId }` and the call site **discards the return value**, so the merchant comparison never happens. Approval therefore remains a *slightly* weaker door than the front door, which is the exact principle F6 was raised on.
*Not currently exploitable:* intents are stamped with the merchant from their session at creation, so a mismatch is unreachable without direct DB tampering or a future multi-merchant path. **Fixed anyway because** "merchant binding works" is an explicit invariant on the QA checklist and a claim in the README/product docs — a reviewer grepping `approveStepUp` would find it missing, and the fix is a two-line comparison against a value the helper already returns.

## Deferred Issues

**D1 — Replay-reservation wart** · severity: LOW · A Razorpay API failure *after* `reserveReplayKey` succeeds leaves that exact intent+cart pair permanently unretryable (the key is reserved but no order exists). Fail-closed and safe; costs one retry path. Documented in README Limitations. Not fixed — the compensating-delete would add a failure mode to the money path for a demo-irrelevant edge case. **Still open after C1, and only PARTIALLY mitigated by it:** C1's compensating revert releases the *intent* (CONSUMED → ACTIVE) when no order row exists, so the intent is reusable with a different cart — but the `ReplayKey` row is a separate row and is not deleted, so that exact intent+cart pair remains unretryable. Do not describe D1 as closed.

**D2 — Same-cart second STEP_UP row lingers** · severity: COSMETIC · If two STEP_UP authorizations exist for the *same* cart, approving the second returns the first's order via the `existingOrder` path without updating the second row's status, so it still shows `STEP_UP` in the UI. No money impact: same cart → same replay key → one order. Not fixed; not worth a money-path edit pre-submission.

**D4 — Losing concurrent `approveStepUp` leaves an `APPROVED` row with no order (F8)** · severity: COSMETIC · **DEFERRED by opus-think after tracing the state machine, not on opusCode's recommendation alone.** `approveStepUp` sets its row `APPROVED` before calling `executeAllow`; if that call then loses the atomic claim, the row stays `APPROVED` while the actual BLOCK is recorded on a separate row. **Why this is safe, verified by code inspection:** re-approving that row passes the entry guard (`APPROVED` is allowed), finds no `existingOrder` (none was ever created), hits the CONSUMED pre-check, is marked `REJECTED`, and throws — it self-heals on the next attempt and can never mint an order. The one path where it proceeds is if the winner's Razorpay call failed and released the intent back to ACTIVE — in which case it is a legitimate merchant-approved STEP_UP for an unused intent, and still yields exactly one order. **Not fixed because:** the fix is an edit to the money path (moving or compensating a status write in `approveStepUp`) to correct a UI label in a state only reachable under concurrent approvals — a scenario that is not on the demo path. Editing `decide.ts` again before submission carries more risk than the cosmetic inconsistency it would remove. Revisit only if the approve endpoint ever gains real concurrent users.

**D3 — Approve endpoint is unauthenticated** · `POST /api/checkout/approve` has no merchant auth — deliberate for a single-merchant demo; production would bind it to a merchant session. Documented in README Limitations rather than hidden.

## Verification Evidence

Independently re-run by opus-think after B5 (2026-09-05), not taken on the builder's word:

- **Tests: 59/59 pass**, 10 files. `tsc --noEmit` clean. `next build` green.
- **Money-path grep** — `grep -rn "createOrder" src/ app/ scripts/` minus the adapter and tests returns exactly one hit: `src/gateway/decide.ts:343`. **VERIFIED BY CODE INSPECTION.**
- **B1 regression proves the security property**, not just coverage: one intent → two different carts → both STEP_UP → approve #1 yields an order → approve #2 throws `AUTHORIZATION_NOT_APPROVABLE` with `createOrder` called **exactly once** and auth #2 marked `REJECTED` → re-approving #1 returns the *same* order id, still one call.
- **C2 session revalidation — VERIFIED BY TEST + CODE INSPECTION (opus-think re-ran, 63/63).** Two new tests in `tests/decide.test.ts` force the parent session expired and force it `REVOKED`; both assert `AUTHORIZATION_NOT_APPROVABLE`, `createOrder` never called, the authorization row still `STEP_UP` (never flipped to `APPROVED`), and zero `RazorpayOrder` rows. Invariants re-checked after C2: one `createOrder` call site (`decide.ts:390`), one `claimIntent(` call site still first in `executeAllow`, `markIntentConsumed` absent from `src/`.
  - **Accepted behavioural trade-off, recorded so nobody "fixes" it silently:** the session check sits *before* the `existingOrder` early return, so once a session expires (TTL 1 hour), re-approving an authorization that **already produced an order** returns `AUTHORIZATION_NOT_APPROVABLE` instead of that order id. No money impact — no second order is possible either way — and it is the fail-closed direction for a money-path door. The alternative (checking after the idempotent read) was considered and rejected: an expired session should not be served, and the 1-hour TTL puts this far outside any demo or normal retry window.
- **C1 concurrency regression — 61/61 tests, and the honesty statement the task required.** Two new tests in `tests/decide.test.ts`: `C1: two CONCURRENT approveStepUp calls on different carts of one intent create exactly one order` and `C1: two CONCURRENT requestCheckout calls on different carts of one intent create exactly one order`. Both fire the two flows with `Promise.all`/`Promise.allSettled`, and both assert `createOrder` called **exactly once** and `razorpayOrder.count({intentId}) === 1`.
  - **These tests are a real regression test, VERIFIED BY TEST:** the source was stashed and the suite re-run against the pre-C1 code — both fail there, with `createOrder` reached twice for a single intent. They are not coverage theatre.
  - **Independently re-verified by opus-think (2026-09-05), not accepted on the builder's report:** `src/gateway/decide.ts` and `src/gateway/session.ts` were temporarily reverted to `d09f694` in the working tree and only the two `C1:` tests were run — **both fail against the pre-C1 source**, then the tree was restored (`git status` clean). **Precision correction to opusCode's evidence:** the pre-C1 failure of the concurrent-`approveStepUp` test is an unhandled `PrismaClientKnownRequestError` escaping to the caller — i.e. the pre-C1 loser produced a raw DB error (a 500), not a clean second `createOrder` as the commit message describes. The regression property holds and the pre-C1 behaviour is if anything worse than reported; the characterisation of *how* it failed was imprecise.
  - **They are NOT a true OS-level race reproduction — do not claim they are.** Node is single-threaded, Prisma multiplexes the queries, and SQLite serializes writers with a file lock, so the interleaving is deterministic. What they prove is that the guard's *logic* holds when the two flows interleave. That the claim itself is *atomic* rests on it being one conditional `UPDATE` with the status in the `WHERE` clause, which SQLite and Postgres both serialize — **VERIFIED BY CODE INSPECTION, not by this test.**
- **Secret sweeps clean** (re-run independently): no `.env` or `*.db` path ever tracked in any commit; no literal `rzp_test_` key value in tracked non-markdown files; no `AIza…` Gemini key anywhere tracked.
- **B4 is styles-only — VERIFIED BY CODE INSPECTION**, not by claim: the diff over `app/` contains no `fetch`, `useState`/`useEffect`, `await`, setter, or JSX-conditional lines.
- **Evaluation: 240/240 (100%)** on dev / validation / held-out (run 2026-09-04T21:23Z, `gemini-3.5-flash-lite`, 165 judge calls, **0 Razorpay calls**). Held-out: policy 100%, semantic 100%, false blocks 0 (₹0 GMV), unauthorized allows 0, step-up 2.5% (class H, correctly escalated), latency mean 9.6s / p95 14.4s — **these include 13-RPM pacing waits and must always be quoted with that caveat.** Do not rerun without a concrete reason (~13 min, ~160 quota units).
- **Razorpay reality — VERIFIED MANUALLY by the human:** captured payment `pay_TYFtu8vjA3C0iT` for `order_TYFPRIpLlJeFpf` (₹7,499) through `/demo` Test Mode checkout. Webhook route live-tested: 400 bad signature / 200 valid / duplicate no-op. Webhook-death → reconcile recovery run twice (idempotent, zero orders created).
- **C2 session-revalidation regression — 63/63 tests, self-reported by sonnetCode, not yet independently re-verified by opus-think** (flagging the distinction per the CLAIMED vs VERIFIED protocol — treat as VERIFIED BY TEST from the builder's own run until opus-think re-runs it). Two new tests in `tests/decide.test.ts` (`C2: ... session has since expired` / `C2: ... session was deactivated`) force the parent session invalid *after* a STEP_UP is raised, then call `approveStepUp`: both assert `ApprovalError("AUTHORIZATION_NOT_APPROVABLE")` thrown, `createOrder` called **zero** times, the authorization row remains `STEP_UP` (confirms the check runs before the `APPROVED` write), and zero `RazorpayOrder` rows exist. The existing C1 concurrency tests and `tests/idempotency.test.ts` were re-run in the same pass and still pass — they build fresh, active sessions via `createSession()`, so the stricter check doesn't collide with them. Money-path grep still returns exactly one real `createOrder` call (`decide.ts:390`); `claimIntent` still exactly one call site (`decide.ts:354`), still the first statement of `executeAllow`; `markIntentConsumed` still zero occurrences.

## Human Checkpoints

Only the human (Kavin) can complete these. None may be marked complete by an agent.

- **[HUMAN]** Confirm orders visible in Razorpay Dashboard → Test Mode → Orders (camera shot for the video).
- **[HUMAN]** Register the webhook in the Dashboard — needs a public URL (ngrok or the Vercel deployment): `https://<app>/api/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`. Then confirm one live delivery.
- **[HUMAN]** Create the Neon database, link Vercel, set env vars — then tell a builder to execute `docs/DEPLOY.md`. No agent can create these resources.
- **[HUMAN]** Watch one `npm run demo:webhook-fail` run live and confirm the output matches the Dashboard.
- **[HUMAN]** Eyeball `/demo` (and one BLOCK flow) before recording — B4 changed styling only, so this is an aesthetic sign-off.
- **[HUMAN]** Record the 5-minute pitch video using `docs/DEMO_SCRIPT.md`.
- **[HUMAN]** Create the public GitHub repo, push, confirm Settings → visibility.

## Next Recommended Action

**opus-think reviews C2** (`f290097`), then unblocks C3 → sonnetCode. Review focus: that `requireActiveSession` is reused rather than duplicated; that the placement genuinely precedes both the reservation work and the `APPROVED` status write (not just claimed to); that C1's claim (`claimIntent`, first statement of `executeAllow`, one call site) is untouched; and that the two new tests would actually fail if the check were deleted (i.e. they test the guard, not just exercise the code path). F4 is CRITICAL but blocks nothing until Neon is provisioned by the human; F7 is bundled into C3.

**Submission blockers, in order:** ~~C1~~ done → opus-think review of C2 → C3 + human Neon/Vercel provisioning (deploy) → human video + GitHub push.

---

*(historical, now complete)* **agy independent adversarial QA pass** before the public push — it is the one form of verification the team has not yet had, and every builder claim so far has been checked only by opus-think. Priority targets: `approveStepUp`/`requestCheckout` state machine (attack F1/F2 from a different angle), replay + expiry + merchant binding, whether the 59 tests prove security properties or merely execute code, and demo honesty (does every claim in `README.md` / `docs/SUBMISSION.md` trace to a real artifact?). agy reports findings here or to opus-think; it must not modify source.

In parallel, the human checkpoints above are the critical path to submission — the repository itself is ready.
