# HANDOFF.md — shared working doc (Claude Fable ↔ Claude Sonnet)

Both agents MUST read this file plus `product.md` (what to build — frozen) and `rules.md` (how to build — process contract) before touching code. Update the "Current stage", "Decisions log", and "Next work" sections after every meaningful session. Never delete history; append.

## Project

**AgentIntent** — merchant-side intent + policy gateway in front of Razorpay Test Mode, for Razorpay AI Buildathon 2026 Track 1. An AI buyer shops via 4 tools; a deterministic gateway (with one Gemini semantic-judge layer) decides ALLOW / STEP_UP / BLOCK; only the gateway calls Razorpay. See README.md for the public-facing story.

## Non-negotiables (from rules.md — do not re-litigate)

1. Only `src/gateway/decide.ts` ALLOW path (and approve-after-STEP_UP) may reach `createOrder` in `src/razorpay/orders.ts`. Grep before finishing any session.
2. Fail closed: any LLM/schema/API failure → STEP_UP or BLOCK, never ALLOW.
3. No fake `order_`/`pay_` ids, no mocked demo path, no hardcoded metrics. Mocks allowed in Vitest only.
4. Judge payload never contains catalog `description` (tested in `tests/judge-payload.test.ts`).
5. Eval (240 cases) never calls Razorpay. `--live-smoke` ≤ 5 orders if ever added.
6. Product changes require a CHANGE PROPOSAL to the human and a YES. Human overrides recorded below count as YES.
7. Test keys only (`rzp_test_`); secrets in `.env` (gitignored); never print secrets.

## Human-approved deviations from product.md

- **Gemini models are env-driven** (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` in `.env`), not the hardcoded `gemini-2.5-flash` from product.md §9. Human instruction (Sep 5): they switch models by editing `.env` only. Current: `gemini-3.5-flash-lite` primary / `gemini-3.1-flash-lite` fallback (only tiers with 500 RPD on this key; see quota table below).
- Everything else in product.md stands.

## Key quota reality (this API key, verified Sep 5 2026)

| Model | RPM | RPD |
| --- | --- | --- |
| gemini-3.5-flash-lite | 15 | 500 |
| gemini-3.1-flash-lite | 15 | 500 |
| gemini-3.8-flash | (free tier) | 20 — burned instantly, unusable |
| gemini-2.5-flash | 5 | 20 — also 404s for new users |

`GEMINI_RPM` env (default unset; eval runner sets 13) paces requests globally in `src/lib/gemini.ts`. Keep eval concurrency at 3 (`src/eval/run.ts` CONCURRENCY).

## Gemini client behaviors (src/lib/gemini.ts) — learned the hard way

- `thinkingConfig: { thinkingBudget: 0 }` → 400 INVALID_ARGUMENT on 3.6-flash and the lite tiers. Client tries with it, on 400 retries without and remembers per-model (`noThinkingConfig` set). Do not remove this.
- Transient 429/5xx → one 2s backoff retry per model, then fallback model.
- All outputs Zod-validated; one re-prompt retry; then `LlmInvalidOutputError` → callers fail closed.
- Judge wraps ALL errors into `SemanticJudgeError` → decide.ts turns into STEP_UP.

## Current stage (update me!)

Last update: 2026-09-05 ~03:00 IST by Sonnet — task queue (tasks 1-4) done and committed, task 5 is a written proposal pending Fable/human OK.

Phases P0–P15 all have code + tests. 56/56 Vitest, tsc clean, `next build` green, 13+ commits.

**Proven live (real API objects):**
- Real test order via script: `order_TY5UjaGUfiajXO` (P3)
- Full buyer loop → ALLOW → real `order_TY5hXZ5ygDvkdO`, judge confidence 1 (e2e_smoke)
- Amount BLOCK + semantic-intent flows with zero Razorpay objects
- Webhook route live-tested: 400 bad sig / 200 valid / duplicate no-op

**Eval status: FINAL — 240/240 (100%) on all splits** with calibrated judge (run 2026-09-04T21:23Z, gemini-3.5-flash-lite, 165 judge calls, 0 Razorpay calls). Held-out: accuracy 100%, policy 100%, semantic 100%, false blocks 0 (₹0), unauthorized allows 0, step-up 2.5% (H cases, correct), latency mean 9.6s / p95 14.4s (includes 13-RPM pacing waits — quote with that caveat). `data/eval_results.json` (gitignored, regenerable); pre-calibration run preserved in `data/eval_results_full_run1.json` (held-out 98.3%, H 1/5) — keep both for the honest before/after story.

**NOT yet done (blocked on human or pending):**
- [x] Human completes a Checkout.js payment — **DONE 2026-09-05: `pay_TYFtu8vjA3C0iT` status `captured` for `order_TYFPRIpLLJeFpf` (₹7,499) via /demo Test Mode checkout.** P10 done-when satisfied with a real, human-verified payment.
- [ ] Human confirms orders visible in Dashboard → Test Mode → Orders (camera shot for video)
- [ ] Human registers webhook in Dashboard (needs public URL: ngrok or Vercel) → live webhook delivery test
- [ ] `WEBHOOK_FORCE_FAIL=true` end-to-end failure demo (needs a real payment + registered webhook)
- [ ] Vercel + Neon deploy (human: create Neon DB, link Vercel, set env vars; agent: `prisma migrate deploy`, deploy config)
- [ ] STEP_UP live demo pass (ambiguous intent → approve button → order) — needs working judge quota, verify after eval run
- [ ] 5-min pitch video (human records; script beats in product.md §14)
- [ ] Public GitHub repo push (human creates repo; check no secrets in history before push)

## Decisions log (append-only)

- 2026-09-05 Fable: DB row (`expiresAt` column) is source of truth for intent expiry, not the stored contract JSON (early bug: forced-expiry didn't block).
- 2026-09-05 Fable: idempotency key == replay key (`intent_id + sha256(canonical cart)`); an existing order for the key returns the same ALLOW+order instead of REPLAY_DETECTED; replay-without-order blocks.
- 2026-09-05 Fable: policy failures never invoke the judge (quota + clean story); judge failure → STEP_UP.
- 2026-09-05 Fable: eval replay cases (class F) run priming+scored passes inside ONE worker job (parallel workers raced and broke ground truth).
- 2026-09-05 Fable: eval ground truth = deterministic templates only; Gemini never labels correctness. Class G (poisoned SKU HP-007) expected ALLOW — proves description never reaches judge.
- 2026-09-05 Fable: buyer transcript persisted only in run response (not DB) — acceptable for demo; audit log carries the durable trail.
- 2026-09-05 Sonnet: independently verified quota table above via direct `generateContent` calls — `gemini-3.8-flash`/`gemini-3.6-flash` both returned `RESOURCE_EXHAUSTED` (20 RPD free tier, burned). `.env` already correctly on the two 500-RPD lite models; no change needed.
- 2026-09-05 Fable (principal review of Sonnet tasks 1-5): all verified — diffs minimal, 56/56, tsc clean, money-path invariant intact. Task-5 verdict: two hand-maintained schema files REJECTED (drift risk); approved variant = `schema.postgresql.prisma` DERIVED from `schema.prisma` by a script that swaps only the provider line (single source of truth). Execute only when human has Neon DB ready — not before.
- 2026-09-05 Fable (human-verified): real captured payment `pay_TYFtu8vjA3C0iT` for `order_TYFPRIpLLJeFpf` (₹7,499) through /demo checkout. This is the canonical "real money-shaped proof" for the submission; separate from all automated claims.
- 2026-09-05 Fable: judge confidence calibration added (commit 0427fe7) — vague/open-ended intents must report confidence < 0.7 → STEP_UP. Justified by eval evidence (class H 1/5 across all splits; rules.md §0.1). Validation rerun after fix: 100% (60/60), H 2/2, zero new false blocks. Full-run-1 results (pre-fix, held-out 98.3%/policy 100%) preserved at `data/eval_results_full_run1.json`; final full rerun with calibrated judge writes `data/eval_results.json`.

- 2026-09-05 Opus (verified+committed by Fable): TOCTOU fix in decide.ts — reserveReplayKey P2002 → audited BLOCK REPLAY_DETECTED (both requestCheckout and approveStepUp); intents single-use — markIntentConsumed after successful order creation in executeAllow; consumed intent blocks NEW carts (after idempotent-retry check, so same intent+cart still returns its order). 2 new tests, 58/58.
- 2026-09-05 Fable: KNOWN LIMITATION (pre-existing, accepted): Razorpay API failure after replay-key reservation leaves that intent+cart unretryable (key held, no order). Frequency ~0 in test mode; fix would need reservation rollback on RazorpayApiError — deferred, do not fix without proposal.
- 2026-09-05 Fable: Neon deploy prep executed per approved variant — `scripts/gen_pg_schema.ts` derives `prisma/schema.postgresql.prisma` (gitignore the generated file? NO — commit it so Vercel builds without a gen step, but regenerate via `npm run db:gen-pg` after any schema change).

- 2026-09-05 Builder B1: closed approveStepUp single-use gap — added CONSUMED-intent check (after existingOrder lookup, before reserve/executeAllow) rejecting a second different-cart STEP_UP on an already-consumed intent with `AUTHORIZATION_NOT_APPROVABLE` + marks that auth row `REJECTED`. Also fixed a second, previously-undiscovered bug in the same function: the entry guard required `status === "STEP_UP"`, which made idempotent re-approval of the SAME authorization impossible (status flips to `APPROVED` before executeAllow, so any retry died at the entry guard instead of reaching the existingOrder return) — relaxed to accept `STEP_UP` or `APPROVED`. | tests: 1 new (`decide.test.ts` — two-different-carts-one-intent scenario: approve #1 ALLOW+order, approve #2 rejected+REJECTED status, createOrder called exactly once total, re-approve of #1 returns same order id), 59/59 all green | invariant grep: clean (createOrder only in decide.ts) | evidence: commit f4063a1.

## BUILDER QUEUE v2 (written by Fable/principal — execute in the subscription window)

Protocol: work strictly in order (B1 blocks nothing but is highest risk-value; B2-B5 independent). Per task: run `npm run typecheck && npm test` before AND after; one commit per task ending with the session trailer already used in git log; append an evidence entry to the Decisions log (author tag: Builder). NEVER touch: layer ordering in decide.ts, judge/policy semantics, src/razorpay/* API surface, eval ground truth. Do NOT rerun the 240-case eval. Money-path invariant grep before finishing: `grep -rn "createOrder" src/ app/ --include="*.ts" | grep -v razorpay/orders | grep -v test` → must show only decide.ts.

### B1 — Close single-use gap in approveStepUp (money path, highest priority)
- **Objective**: a CONSUMED intent must not be approvable. Today two different-cart STEP_UPs on one intent can BOTH be approved → two orders from a single-use intent.
- **Inspect**: src/gateway/decide.ts approveStepUp (~line 172-250), src/gateway/session.ts getIntentStatus, tests/decide.test.ts, tests/idempotency.test.ts.
- **Implement**: in approveStepUp, after the auth-status check and BEFORE creating anything: if `getIntentStatus(intent.intent_id) === "CONSUMED"` AND no existing order matches this authorization's replay key (preserve idempotent re-approve of the SAME authorization that already produced an order — the existingOrder check must stay reachable), throw `ApprovalError("AUTHORIZATION_NOT_APPROVABLE")`. Also mark the losing AuthorizationDecision row status "REJECTED" so the UI stops offering approve.
- **Constraints**: fail closed; no new reason codes unless schemas.ts union already has a fit; do not reorder existing checks except inserting this one; ApprovalError codes are already mapped in app/api/checkout/approve/route.ts (409) — keep mapping.
- **Verify**: new Vitest (mock Razorpay+judge as decide.test.ts does): intent → two different carts → two STEP_UPs → approve #1 → ALLOW+order; approve #2 → throws AUTHORIZATION_NOT_APPROVABLE, createOrder called exactly once, second auth row status REJECTED. Also: re-approve of auth #1 returns the SAME order id (idempotent). All existing tests green.
- **Evidence to record**: test names + counts, one-line diff summary, confirmation createOrder call-count assertion passed.

### B2 — Scripted webhook-failure recovery demo (demo credibility; zero human dependency)
- **Objective**: one command that DEMONSTRATES (not narrates) webhook death → API-poll recovery, against the REAL paid order `order_TYFPRIpLLJeFpf` (payment `pay_TYFtu8vjA3C0iT`, captured, human-verified).
- **Inspect**: scripts/webhook_route_smoke.ts (signing pattern), src/reconciliation/reconcile.ts, app/api/webhooks/razorpay/route.ts, src/audit/logger.ts.
- **Implement**: `scripts/webhook_failure_demo.ts` (+ npm script `demo:webhook-fail`): (1) POST a correctly-signed synthetic payment.captured webhook for that order to the local route while env `WEBHOOK_FORCE_FAIL=true` is set FOR THE SERVER — since the script can't set the server's env, instead print an instruction + verify the 500 response IF the server has it set, and otherwise SKIP gracefully with a clear message (never fake a 500); (2) call POST /api/orders/order_TYFPRIpLLJeFpf/reconcile; (3) print recovered payments, assert the payment id equals pay_TYFtu8vjA3C0iT and status captured, assert exactly ONE RazorpayOrder row exists for the order, print the audit tail (WEBHOOK_TIMEOUT_RECONCILED present). Requires dev server running + .env — document that in the script header.
- **Constraints**: script must create ZERO orders (reconcile only observes); no writes to Razorpay; real ids only.
- **Verify**: run it twice with server up (`WEBHOOK_FORCE_FAIL=true` in .env, restart server) — second run must be idempotent (payment row upserted, still one order row). Paste script output into Decisions log.
- **Evidence**: full command transcript (trim secrets), audit lines shown.
- **HUMAN follow-up (flag for Kavin)**: watch the run once and confirm output matches Dashboard.

### B3 — Deploy readiness (config only; do NOT deploy)
- **Objective**: repo deploys to Vercel+Neon with zero code edits on the day.
- **Decision already made (do not revisit)**: Neon gets `prisma db push --schema prisma/schema.postgresql.prisma` (existing migrations are sqlite-dialect and MUST NOT be applied to postgres). Generated pg schema is committed; regenerate via `npm run db:gen-pg` after any schema change.
- **Inspect**: package.json scripts, next.config.ts, prisma/schema.postgresql.prisma, .env.example.
- **Implement**: (1) npm script `db:push-pg": "prisma db push --schema prisma/schema.postgresql.prisma"`; (2) fix `db:migrate` doc-string confusion — it targets sqlite dev only; (3) `.env.example`: update GEMINI_MODEL/GEMINI_FALLBACK_MODEL defaults to the lite models actually in use, add `GEMINI_RPM=` (blank, commented "eval pacing, e.g. 13"), add commented `# DATABASE_URL=postgres://... (Neon pooled URL for deploy)`; (4) `docs/DEPLOY.md`: exact Vercel steps (env vars list, build command `next build`, one-time `npm run db:push-pg` + `npm run seed` against Neon, webhook URL to register afterwards `https://<app>.vercel.app/api/webhooks/razorpay`). No vercel.json unless something actually requires it — check `next build` output first; note the finding.
- **Constraints**: no provider switch of the dev schema; SQLite dev flow untouched.
- **Verify**: `npm run typecheck && npm test && npx next build` green; `npm run db:gen-pg` idempotent (git diff clean after rerun).
- **Evidence**: DEPLOY.md path, build output tail, confirmation dev.db flow still works (`npm run seed` output line).
- **HUMAN follow-up**: create Neon project + link Vercel + set envs, then tell either window to execute DEPLOY.md.

### B4 — Demo page presentability pass (judge impression; behavior frozen)
- **Objective**: /demo and /checkout/[orderId] look intentional on camera without changing ANY behavior, endpoint, or state logic.
- **Inspect**: app/demo/page.tsx, app/checkout/[orderId]/page.tsx, docs/DEMO_SCRIPT.md (camera shots it promises).
- **Implement**: inline-style/CSS-only improvements: consistent spacing scale, readable font sizes, pipeline lights sized for screen recording, decision banner (big ALLOW green / STEP_UP amber / BLOCK red with reason codes prominent), order-id row copyable (monospace + user-select), eval table zebra rows. No new dependencies, no component libraries, no dark mode, no animations beyond none.
- **Constraints**: zero changes to fetch logic, state machine, or JSX conditional structure (styling attributes only; wrapping divs allowed); `next build` must stay green; page must still render every honest empty-state (NOT CREATED, NOT RUN).
- **Verify**: `npm run typecheck && npx next build`; manual: dev server, run one BLOCK flow (₹13,999 request) and screenshot — attach nothing, just record in Decisions log that empty/error states render.
- **Evidence**: one-paragraph before/after description + confirmation of unchanged behavior (diff shows styles only).
- **HUMAN follow-up**: eyeball /demo before recording video.

### B5 — Public-repo hygiene
- **Objective**: repo safe + presentable for public GitHub push.
- **Implement**: (1) MIT `LICENSE` (holder: Kavin Thakur, 2026); (2) README Limitations section: add bullet — approve endpoint is deliberately unauthenticated (single-merchant demo; production would bind it to merchant auth/session), and bullet for the recorded replay-reservation wart (see Decisions log 2026-09-05 KNOWN LIMITATION); (3) confirm `data/eval_results_full_run1.json` contains no secrets (it doesn't — verify anyway); (4) final history sweep: `git log --all --stat | grep -E "\.env$|dev\.db"` must be empty; `git grep -I "rzp_test_" -- ':!*.md'` must show no literal key values (pattern-prefix mentions in code/docs are fine — only flag a full 23-char key).
- **Verify/Evidence**: paste sweep command outputs (empty) into Decisions log.
- **HUMAN follow-up**: create GitHub repo, push, confirm Settings→visibility.

### Builder reporting format (append per task to Decisions log)
`2026-09-05 Builder Bn: <what changed> | tests: <n passed> | invariant grep: clean | evidence: <ids/output lines>`

## Sonnet task queue v1 — COMPLETE (all 5 verified by Fable; kept for history)

Work these in order. Rules: run `npx vitest run` + `npx tsc --noEmit` before and after; commit per task with clear message; append what you did to Decisions log; DO NOT touch `src/gateway/decide.ts`, `src/razorpay/*`, or judge/policy semantics without a written proposal here.

1. **README metrics section**: read `data/eval_results.json` (final calibrated run). Replace nothing silently — add a "Measured results" table (held-out split: accuracy, policy, semantic, false blocks + ₹, step-up rate, unauthorized allows, latency mean/p95) with run date + judge model name. Note: latency numbers include 13-RPM pacing waits — say so.
2. **`npm run` scripts**: add package.json scripts — `seed`, `smoke:order`, `smoke:e2e`, `eval:gen`, `eval:run`, `db:migrate` — mapping to existing scripts/. Update README + HANDOFF verification commands to use them.
3. ~~**STEP_UP live check**~~ DONE (Sonnet, 2026-09-05): ambiguous intent → STEP_UP → approve → ALLOW. `int_xPYdW5_CoRiN` → `SEMANTIC_LOW_CONFIDENCE`, semantic_confidence 0.65 → `auth_ec5teAng2qwI` → approve → `order_TY6lxvhsKkcaME`. Cost: 1 intent-compile + 1 judge call, 1 test order.
4. ~~**Demo page eval table**~~ DONE (Sonnet, 2026-09-05): `GET /demo` 200, `GET /api/eval/results` returns the final calibrated run, field names (`falseBlockGmvInr`, `stepUpRate`, `unauthorizedAllows`, split labels) match `app/demo/page.tsx` exactly, table renders all 4 splits. Fixed a stale command reference on the same page (`npx tsx scripts/run_eval.ts` → `npm run eval:run`, matches task 2's new scripts).
5. **Deploy prep** — PROPOSAL ONLY, not implemented (Sonnet, 2026-09-05):

   Checked `prisma/schema.prisma`: no sqlite-specific column types in use — both JSON-ish fields (`itemsJson`, `metadataJson`) are stored as `String`, not Prisma's `Json` type. So the *models* are already Postgres-portable; only the `datasource.provider` literal (currently `"sqlite"`, line 6) needs to differ per environment, and Prisma does not allow that literal to be env-driven.

   **Proposed approach**: add a second schema file `prisma/schema.postgresql.prisma` — identical to `prisma/schema.prisma` except `provider = "postgresql"` — checked into the repo, kept in sync by hand (small model count, low drift risk) or via a `scripts/sync_prisma_schema.ts` diff-check in CI later if drift becomes a problem. Deploy uses `prisma generate --schema=prisma/schema.postgresql.prisma` and `prisma migrate deploy --schema=prisma/schema.postgresql.prisma` (the `db:migrate` script added in task 2 would need a `--schema` flag added, or a second `db:migrate:prod` script) against `DATABASE_URL` pointed at the Neon connection string in Vercel env vars. Local dev (`sqlite`, `file:./dev.db`) is untouched.

   Alternative rejected: switching local dev to Postgres too (matching prod exactly) — adds a Docker/Neon-branch dependency to local setup that the current `npm install && cp .env.example .env && npx prisma migrate dev` flow doesn't need; not worth it for a hackathon timeline.

   Needs Fable/human OK before creating `schema.postgresql.prisma` or touching `db:migrate`.

Fable verification checklist for Sonnet's work: git diff review per commit; rerun vitest/tsc; grep money-path invariant (`grep -rn "createOrder" src/ app/ | grep -v razorpay/orders | grep -v test` → only decide.ts); confirm no secrets/dev.db committed.

## Repo map (what lives where)

```
src/lib/        money.ts (paise boundary), schemas.ts (all Zod), gemini.ts (client), db.ts
src/catalog/    catalog.ts — deterministic search, judge-safe views, server pricing
src/policy/     engine.ts — pure L2 checks
src/intent/     compiler.ts — NL → typed contract (Gemini)
src/agent/      buyer.ts — hand-written 8-turn tool loop (4 tools)
src/semantic/   judge.ts — L3; buildJudgePayload omits description
src/gateway/    decide.ts (SACRED: only money path), session.ts, replay.ts
src/razorpay/   client.ts (test-key guard), orders.ts (createOrder/fetch), payments.ts, verify.ts (HMACs)
src/webhooks/   handler.ts — dedupe + applyPaymentState (amount-mismatch flagging)
src/reconciliation/ reconcile.ts — poll recovery, never creates orders
src/eval/       cases.ts, generate.ts (240 cases), run.ts (offline), metrics.ts
src/audit/      logger.ts — append-only
app/api/        sessions, intents, agent/run, carts/propose, checkout/{request,approve,verify},
                webhooks/razorpay, orders/[id]{,/reconcile}, audit/[intentId], eval/results
app/demo/       single honest demo page   app/checkout/[orderId]/  Checkout.js page
scripts/        seed, create_test_order, compile_intent_smoke, p5_smoke, e2e_smoke,
                webhook_route_smoke, generate_eval, run_eval
tests/          8 files, 56 tests — run `npx vitest run` before calling anything done
```

## Verification commands (all previously run green)

```bash
npm run typecheck && npm test
npm run smoke:e2e           # costs ~10 Gemini calls + 1 real order
npm run eval:run            # ~160 judge calls, ZERO orders, ~13 min at 13 RPM
```

`npm run` scripts (package.json): `seed`, `smoke:order`, `smoke:e2e`, `eval:gen`, `eval:run`, `db:migrate` (`prisma migrate deploy`) — all map to existing `scripts/*.ts`.

## Next work queue (in order)

1. Confirm full-eval results; investigate class D/H misses if semantic accuracy < 85%; consider judge prompt tweak (allowed without proposal ONLY if eval evidence shows systematic false blocks — rules.md §0.1 "valid proof").
2. STEP_UP live path check via `/demo` (ambiguous request → approve → order).
3. Human checkout + webhook registration + forced-failure demo (see checklist above).
4. Vercel/Neon deploy; re-run webhook_route_smoke against deployed URL.
5. Repo hygiene for public push: verify `.env`/`dev.db` never committed (`git log --stat | grep -E '\.env|dev\.db'` must be empty).
6. Pitch video support: `/demo` screen-flow matches product.md §14 beat sheet.

## Update protocol for both agents

- After each session: update "Current stage", tick checklist items, append decisions, adjust queue.
- Before each session: read this file top to bottom; run `npx vitest run` to confirm inherited state.
- Conflicts: product.md > rules.md > this file > chat memory.
