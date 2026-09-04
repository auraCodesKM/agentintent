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

Last update: 2026-09-05 ~02:30 IST by Fable.

Phases P0–P15 all have code + tests. 56/56 Vitest, tsc clean, `next build` green, 13+ commits.

**Proven live (real API objects):**
- Real test order via script: `order_TY5UjaGUfiajXO` (P3)
- Full buyer loop → ALLOW → real `order_TY5hXZ5ygDvkdO`, judge confidence 1 (e2e_smoke)
- Amount BLOCK + semantic-intent flows with zero Razorpay objects
- Webhook route live-tested: 400 bad sig / 200 valid / duplicate no-op

**Eval status: FINAL — 240/240 (100%) on all splits** with calibrated judge (run 2026-09-04T21:23Z, gemini-3.5-flash-lite, 165 judge calls, 0 Razorpay calls). Held-out: accuracy 100%, policy 100%, semantic 100%, false blocks 0 (₹0), unauthorized allows 0, step-up 2.5% (H cases, correct), latency mean 9.6s / p95 14.4s (includes 13-RPM pacing waits — quote with that caveat). `data/eval_results.json` (gitignored, regenerable); pre-calibration run preserved in `data/eval_results_full_run1.json` (held-out 98.3%, H 1/5) — keep both for the honest before/after story.

**NOT yet done (blocked on human or pending):**
- [ ] Human confirms `order_TY5UjaGUfiajXO` in Dashboard → Test Mode → Orders
- [ ] Human completes a Checkout.js payment (`/checkout/<order_id>`, UPI `success@razorpay`) → real `pay_` + Dashboard camera shot (P10 done-when)
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
- 2026-09-05 Fable: judge confidence calibration added (commit 0427fe7) — vague/open-ended intents must report confidence < 0.7 → STEP_UP. Justified by eval evidence (class H 1/5 across all splits; rules.md §0.1). Validation rerun after fix: 100% (60/60), H 2/2, zero new false blocks. Full-run-1 results (pre-fix, held-out 98.3%/policy 100%) preserved at `data/eval_results_full_run1.json`; final full rerun with calibrated judge writes `data/eval_results.json`.

## Sonnet task queue (Fable delegates; Fable verifies before merge)

Work these in order. Rules: run `npx vitest run` + `npx tsc --noEmit` before and after; commit per task with clear message; append what you did to Decisions log; DO NOT touch `src/gateway/decide.ts`, `src/razorpay/*`, or judge/policy semantics without a written proposal here.

1. **README metrics section**: read `data/eval_results.json` (final calibrated run). Replace nothing silently — add a "Measured results" table (held-out split: accuracy, policy, semantic, false blocks + ₹, step-up rate, unauthorized allows, latency mean/p95) with run date + judge model name. Note: latency numbers include 13-RPM pacing waits — say so.
2. **`npm run` scripts**: add package.json scripts — `seed`, `smoke:order`, `smoke:e2e`, `eval:gen`, `eval:run`, `db:migrate` — mapping to existing scripts/. Update README + HANDOFF verification commands to use them.
3. **STEP_UP live check**: with dev server up, POST an ambiguous intent ("Get something nice for Dad, budget 8000") via `/api/sessions` + `/api/intents` + `/api/agent/run`; confirm decision STEP_UP; then `/api/checkout/approve` with the authorization_id; confirm ALLOW + real `order_` id. Record ids here. Costs ~6 Gemini calls + 1 test order (allowed: live smoke ≤5 orders).
4. **Demo page eval table**: verify `/demo` renders final metrics correctly (falseBlockGmvInr, splits). Screenshot optional.
5. **Deploy prep** (code only, no deploy): `prisma/schema.prisma` needs a Postgres-compatible datasource switch strategy for Neon (env-driven provider is NOT supported by Prisma — document chosen approach here as proposal, do not implement without Fable/human OK).

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
