# Agent Coordination

## Current State

AgentIntent (Razorpay AI Buildathon 2026 Track 1) is feature-complete for
submission. Builder queue B1-B5 (money-path fix, webhook-failure demo, deploy
prep, demo polish, repo hygiene) is done and pushed to GitHub. 59/59 tests
green, `tsc --noEmit` clean, `next build` green. Public repo:
https://github.com/auraCodesKM/agentintent (master branch, HEAD `d4b82e6`).
No deploy has been executed (Vercel/Neon steps are documented, not run).
Remaining work is entirely human checkpoints (Dashboard verification, webhook
registration, Neon/Vercel setup, pitch video).

## Active Agent

None actively modifying implementation files as of this entry.

## Completed Work

- **B1** [COMPLETE] approveStepUp single-use gap closed (money-path security).
  Owner: sonnetCode. Commit: `f4063a1`. Reviewed and accepted by Fable
  (principal window) with adversarial re-check of the fix logic.
- **B2** [COMPLETE] Scripted webhook-failure recovery demo
  (`npm run demo:webhook-fail`). Owner: sonnetCode. Commit: `72db829`.
  Reviewed and accepted by Fable.
- **B3** [COMPLETE] Deploy readiness, config only, nothing deployed
  (`docs/DEPLOY.md`, `db:push-pg`). Owner: sonnetCode. Commit: `1ee390a`.
  Reviewed and accepted by Fable.
- **B4** [COMPLETE] Demo presentability pass, styles only, zero behavior
  change. Owner: sonnetCode. Commit: `1dd5aa5`.
- **B5** [COMPLETE] Public-repo hygiene — MIT LICENSE, README limitations,
  history sweep (clean). Owner: sonnetCode. Commit: `6c42c76`.
- **GitHub publication** [COMPLETE] Repo created (`auraCodesKM/agentintent`,
  public, confirmed with human before creation), pushed normally (no force).
  Verified: local HEAD == remote HEAD (`d4b82e6`), LICENSE + README present,
  no `.env`/`dev.db` tracked, `src/`/`app/`/`tests/` all present.

## Current Task

None in progress. Awaiting either a new principal-engineer assignment via
HANDOFF.md or a human checkpoint being completed.

## Important Decisions

- **Single money path (frozen)**: only `src/gateway/decide.ts` may reach
  `createOrder` (`src/razorpay/orders.ts`). Verify with:
  `grep -rn "createOrder" src/ app/ --include="*.ts" | grep -v razorpay/orders | grep -v test`
  → must return exactly one line, `decide.ts`.
- **Intents are single-use**: `IntentContract.status` flips ACTIVE → CONSUMED
  the moment any order is created from it (`markIntentConsumed` in
  `executeAllow`, covers both `requestCheckout` ALLOW and `approveStepUp`).
  A consumed intent cannot authorize a *new* cart; the *same* intent+cart
  retry (or the *same* authorization re-approved) still returns the
  existing order (idempotent by `idempotencyKey = intent_id + sha256(cart)`).
- **Neon deploy uses `prisma db push`, never `prisma migrate deploy`** — the
  checked-in migrations are sqlite-dialect and will not apply to Postgres.
  `prisma/schema.postgresql.prisma` is a generated, committed file (source
  of truth is `prisma/schema.prisma`; regenerate via `npm run db:gen-pg`).
- **Gemini models are env-driven**, current working pair on this API key:
  `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` (500 RPD each). The
  `-flash`/`2.5-flash` tiers are 20 RPD and effectively unusable at eval
  scale. See HANDOFF.md quota table for the full picture.
- **`POST /api/checkout/approve` is deliberately unauthenticated** in this
  single-merchant demo (documented in README Limitations, not a bug).

## Findings

- **[MEDIUM] approveStepUp allowed two different-cart STEP_UPs on one intent
  to both be approved → two Orders from one intent.**
  Discovered by: sonnetCode (assigned as B1 by Fable). Date: 2026-09-05.
  Location: `src/gateway/decide.ts` `approveStepUp`.
  Status: FIXED, commit `f4063a1`, VERIFIED BY TEST (new regression test in
  `tests/decide.test.ts`) and VERIFIED BY CODE INSPECTION (Fable's
  adversarial review, recorded in HANDOFF.md 2026-09-05 entry).
- **[LOW] Idempotent re-approval of the same STEP_UP authorization was
  impossible** — the entry guard in `approveStepUp` required
  `status === "STEP_UP"`, but the first approval flips status to `APPROVED`
  before `executeAllow` runs, so any retry died at the guard instead of
  returning the existing order. Discovered by: sonnetCode, while
  implementing B1 (not separately assigned — found via the test itself
  failing). Date: 2026-09-05. Status: FIXED in the same commit `f4063a1`,
  VERIFIED BY TEST.
- **[LOW] Documentation typo**: the real captured-payment order id was
  recorded in HANDOFF.md/docs/DEMO_SCRIPT.md as `order_TYFPRIpLLJeFpf`
  (double uppercase LL) — does not match any row in `prisma/dev.db`. The
  correct id, verified directly against the `razorpay_orders` table, is
  `order_TYFPRIpLlJeFpf` (lowercase `l`). Discovered by: sonnetCode, date:
  2026-09-05, while building B2. Status: FIXED in `docs/DEMO_SCRIPT.md`
  (commit `1dd5aa5`); historical HANDOFF.md entries left as-is (append-only)
  with a correction note added. Fable confirmed this as canonical.

## Deferred Issues

- **Replay-key reservation not rolled back on Razorpay API failure.** If
  `createOrder` fails *after* `reserveReplayKey` succeeds, that exact
  intent+cart becomes permanently unretryable (key held, no order).
  Frequency ~0 in Test Mode. Documented in README Limitations. Do not fix
  without a written proposal (money-path change).
- **Cosmetic**: if two STEP_UP authorizations exist for the *same* cart,
  approving the second returns the first's order via the `existingOrder`
  path without updating the second row's status — it lingers as `STEP_UP`
  in the UI. No money impact (same cart → same replay key → one order).
  Recorded by Fable in HANDOFF.md 2026-09-05, deliberately not fixed this
  close to submission.

## Verification Evidence

- 59/59 Vitest across 10 files, `tsc --noEmit` clean, `next build` green —
  re-verified after every one of B1-B5.
- Money-path grep clean after every task (see Important Decisions above).
- B1: regression test proves two different-cart STEP_UPs on one intent
  cannot both mint an Order; `createOrder` mock called exactly once across
  the full scenario including a re-approval attempt.
- B2: `npm run demo:webhook-fail` run twice against a live server with
  `WEBHOOK_FORCE_FAIL=true` (restarted between runs) — second run
  idempotent (same 1 order row, same 1 payment row). Zero Razorpay writes.
- B5 secret sweep (all clean, VERIFIED BY COMMAND, outputs in HANDOFF.md):
  no `.env`/`dev.db` file ever tracked in git history (checked actual
  tracked paths, not commit-message prose); no literal `rzp_test_` key in
  any tracked non-markdown file; no real-looking `*_KEY`/`*_SECRET`
  assignment outside `.env.example` (which is all blank).
- GitHub push: local HEAD == remote HEAD (`d4b82e6`), confirmed via
  `git rev-parse` on both sides post-push.
- Eval: 240/240 (100%) held-out split, calibrated judge, 165 judge calls,
  0 Razorpay calls (run 2026-09-04T21:23Z) — CLAIMED BY Fable, VERIFIED BY
  FILE (`data/eval_results.json`, gitignored/regenerable). Not rerun by
  sonnetCode per explicit instruction (do not rerun the 240-case eval
  without a concrete regression).

## Human Checkpoints

- [HUMAN] Confirm both real test orders visible in Razorpay Dashboard →
  Test Mode → Orders (camera shot for the pitch video).
- [HUMAN] Watch one `npm run demo:webhook-fail` run live and confirm its
  output matches the Dashboard state.
- [HUMAN] Eyeball `/demo` visually before recording (B4 styling pass).
- [HUMAN] Register the webhook in the Razorpay Dashboard (needs a public
  URL — ngrok locally, or the Vercel URL after deploy) and run a live
  webhook delivery test.
- [HUMAN] Create the Neon project, link Vercel, set the env vars listed in
  `docs/DEPLOY.md`, then tell an agent to execute the one-time
  `db:push-pg` + `seed` steps.
- [HUMAN] Record the 5-minute pitch video (`docs/DEMO_SCRIPT.md` has the
  full shot-by-shot script with corrected ids).
- [HUMAN] Confirm GitHub repo Settings → Visibility on
  `auraCodesKM/agentintent` matches intent (currently public).

## Next Recommended Action

No open engineering task. Next step is human checkpoints above, or a new
assignment from opus-think in HANDOFF.md once one exists.
