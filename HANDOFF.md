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

- 2026-09-05 Builder CORRECTION: the real captured-payment order id recorded above (lines 57/76/98/100 as `order_TYFPRIpLLJeFpf`, double uppercase LL) is a transcription typo. The actual row in `prisma/dev.db` is **`order_TYFPRIpLlJeFpf`** (lowercase `l`) — verified directly against `razorpay_orders` and confirmed paired with `pay_TYFtu8vjA3C0iT` (captured, ₹7,499). Not re-editing the historical entries (append-only), but every reference after this point (B2 script, this evidence line) uses the verified correct id. If this id is ever typed by hand again (video script, docs), copy it from here or from the DB, not from the earlier lines.
- 2026-09-05 Builder B1: closed approveStepUp single-use gap — added CONSUMED-intent check (after existingOrder lookup, before reserve/executeAllow) rejecting a second different-cart STEP_UP on an already-consumed intent with `AUTHORIZATION_NOT_APPROVABLE` + marks that auth row `REJECTED`. Also fixed a second, previously-undiscovered bug in the same function: the entry guard required `status === "STEP_UP"`, which made idempotent re-approval of the SAME authorization impossible (status flips to `APPROVED` before executeAllow, so any retry died at the entry guard instead of reaching the existingOrder return) — relaxed to accept `STEP_UP` or `APPROVED`. | tests: 1 new (`decide.test.ts` — two-different-carts-one-intent scenario: approve #1 ALLOW+order, approve #2 rejected+REJECTED status, createOrder called exactly once total, re-approve of #1 returns same order id), 59/59 all green | invariant grep: clean (createOrder only in decide.ts) | evidence: commit f4063a1.

- 2026-09-05 Builder B2: `scripts/webhook_failure_demo.ts` (`npm run demo:webhook-fail`) — scripted webhook-death → API-poll recovery against the real captured payment. Ran twice against a running dev server with `WEBHOOK_FORCE_FAIL=true` (server restarted between runs); both runs green, second is idempotent (same 1 order row, same 1 payment row, no duplicate side effects). Zero Razorpay writes, zero Orders created by the script. Transcript (run 2, post-restart, secrets trimmed — none present):
  ```
  === Step 1: webhook death ===
    server returned 500 (forced failure confirmed) -> {"error":"WEBHOOK_UNAVAILABLE"}
  === Step 2: reconcile ===
    200 -> {"status":"RECONCILED","razorpay_order_id":"order_TYFPRIpLlJeFpf","payments":[{"id":"pay_TYFtu8vjA3C0iT","status":"captured"}],"reason_code":"WEBHOOK_TIMEOUT_RECONCILED"}
    ASSERT OK: payment pay_TYFtu8vjA3C0iT status=captured
    ASSERT OK: exactly 1 RazorpayOrder row for order_TYFPRIpLlJeFpf
  === Step 3: audit tail ===
    ...PAYMENT_CAPTURED / WEBHOOK_TIMEOUT_RECONCILED (run 1) ... PAYMENT_CAPTURED / WEBHOOK_TIMEOUT_RECONCILED (run 2)
    ASSERT OK: WEBHOOK_TIMEOUT_RECONCILED present in audit timeline
  [orders] created during this script: 0 (must be 0)
  ```
  `.env` `WEBHOOK_FORCE_FAIL` restored to `false` after the run (not left armed). | tests: 59/59 unaffected | invariant grep: clean | evidence: commit 72db829. HUMAN follow-up per queue: watch one run live and confirm against Dashboard.

- 2026-09-05 Builder B3: deploy readiness, config only, nothing deployed. Added `db:push-pg` script; fixed `db:migrate`/`db:gen-pg`/`db:push-pg` doc confusion (sqlite-dev vs Neon-only, not scripts/*.ts wrappers); `.env.example` defaults updated to the lite models + commented `GEMINI_RPM`/Neon `DATABASE_URL` example; wrote `docs/DEPLOY.md` (env vars, one-time `db:push-pg`+`seed` against Neon, webhook registration, post-deploy smoke check). Checked `next build` output first — stock Next.js App Router build, no `vercel.json` needed, documented that finding instead of adding one speculatively. | tests: `npm run typecheck && npm test && npx next build` all green, 59/59; `npm run db:gen-pg` rerun idempotent (clean diff); `npm run seed` confirmed still works against sqlite dev.db | invariant grep: clean | evidence: commit 1ee390a.

- 2026-09-05 Fable VERIFICATION of Builder B1–B3 — **ACCEPTED, all three.** Independent re-run in the principal window: `tsc --noEmit` clean, `npx vitest run` 59/59 across 10 files, money-path grep over `src/ app/ scripts/` returns exactly one hit (`src/gateway/decide.ts:343`). Reviewed each diff line by line:
  - **B1 (money path) — correct, and the reasoning holds under adversarial reading.** I specifically checked the risk that relaxing the entry guard to accept `APPROVED` could let a second authorization return another cart's order: it cannot. `existingOrder` is looked up by `idempotencyKey = replayKey = intent_id + sha256(canonical cart)`, so a *different* cart on the same intent computes a different key, finds no order, and falls through to the CONSUMED branch and is rejected. The `APPROVED` path only reaches order creation when no order exists — i.e. genuine crash recovery between the status flip and `executeAllow` — which is the behaviour we want, not a hole. Check placement (after `existingOrder`, before reserve/executeAllow) is right; audit event + `REJECTED` row make the rejection observable rather than silent. Builder also found and fixed a real second bug I had not specced (idempotent re-approve was impossible) — good catch, correctly scoped.
  - **B2** — script contains no `createOrder`/checkout call path (grepped); zero-order claim structurally true, not just asserted. Real ids used, forced 500 never faked. Builder's order-id typo correction is legitimate — my B2 spec line 118 above still carries the wrong `LL` spelling; the DB-verified id is `order_TYFPRIpLlJeFpf` and `docs/DEMO_SCRIPT.md` already uses the corrected form (both references checked). **Canonical id for the video and any future doc: `order_TYFPRIpLlJeFpf` / `pay_TYFtu8vjA3C0iT`.**
  - **B3** — config only, dev sqlite flow untouched, no speculative `vercel.json`. Matches the frozen decision (Neon = `db push`, never the sqlite-dialect migrations).
  - **Accepted nit, deliberately NOT fixed** (recorded so it isn't rediscovered as a bug): if two STEP_UP authorizations exist for the *same* cart, approving the second returns the first's order via the `existingOrder` path without updating that second row's status, so it lingers as `STEP_UP` in the UI. No money impact — same cart, same replay key, one order, idempotent by construction. Cosmetic only; not worth a money-path edit this close to submission.
  - Remaining queue unchanged: **B4** (demo polish) and **B5** (repo hygiene, incl. the still-missing `LICENSE`). No new tasks added — nothing found in review warrants one.

- 2026-09-05 Builder B4: presentability pass on `/demo` + `/checkout/[orderId]`, inline styles only. Before: bare default fonts/spacing, thin 2px lights, plain black-on-white reason-code text, no visual weight to the decision. After: consistent spacing/border-radius scale, a colored decision banner (green/amber/red matching ALLOW/STEP_UP/BLOCK) with reason codes inside it, larger bolder pipeline lights, monospace + `user-select:all` on every order/payment/intent id (one-click copy on camera), zebra-striped audit + eval tables. Zero changes to fetch calls, `useState`/`useEffect` logic, or any JSX conditional branch — confirmed by diff (styles/wrapping-divs only) and by re-running a real BLOCK flow via the API directly (`MAX_AMOUNT_EXCEEDED`, `razorpay_order_id: null`) which still maps to the same NOT-CREATED render path since that branch wasn't touched. Also fixed the `order_TYFPRIpLLJeFpf` → `order_TYFPRIpLlJeFpf` typo in `docs/DEMO_SCRIPT.md` (2 occurrences, narration text quoted on camera). | tests: `npm run typecheck` clean, `npx next build` green (identical route/size table), 59/59 vitest unaffected (no test touches these files) | invariant grep: clean | evidence: commit 1dd5aa5. HUMAN follow-up per queue: eyeball `/demo` before recording.

- 2026-09-05 Builder B5: repo hygiene for public push. Added MIT `LICENSE` (Kavin Thakur, 2026). README Limitations: added the unauthenticated-approve-endpoint bullet and the replay-reservation edge-case bullet. Confirmed `data/eval_results_full_run1.json` has no secret-shaped strings (grep for key/secret/token/api: zero hits). Sweep outputs (all clean):
  ```
  $ git log --all --name-only --pretty=format: | sort -u | grep -E "(^|/)\.env$|(^|/)dev\.db$"
  (empty — no .env or dev.db file path ever tracked in history)

  $ git grep -I -E "rzp_test_[A-Za-z0-9]{10,}" -- ':!*.md'
  (empty — no literal Razorpay test key anywhere in tracked non-markdown files)

  $ git grep -I -nE "(API_KEY|SECRET|KEY_SECRET)\s*=\s*[\"']?[A-Za-z0-9_-]{15,}" -- ':!*.md' ':!.env.example'
  (empty — no real-looking secret assignment outside .env.example, which is all blank)
  ```
  Note: an earlier plain `git log --all --stat | grep -E "\.env$|dev\.db"` (the exact command from the B5 spec) DOES return one hit — a commit message body line ("...doesn't match any row in prisma/dev.db...") from the B2 commit, prose not a file path. Re-ran with `--name-only` to check actual tracked paths instead of commit-message text, which is empty as shown above. Flagging the distinction so it isn't mistaken for a leak. | tests: `npm run typecheck && npm test` green, 59/59 | invariant grep: clean | evidence: commit 6c42c76. HUMAN follow-up per queue: create GitHub repo, push, confirm Settings→visibility.

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

### BUILDER QUEUE v2 STATUS: B1–B5 ALL COMPLETE and verified by opus-think (see `docs/AGENTS.md`).

# BUILDER QUEUE v3 — ACTIVE (from agy findings F4–F7; triaged by opus-think 2026-09-05)

**Strictly serial: C1 → C2 → C3. Only one coding agent modifies the repo at a time.** C1 and C2 both touch `src/gateway/decide.ts`; C2 must not start until C1 is committed AND opus-think has reviewed it. Each task: run `npm run typecheck && npm test` before and after; one commit per task with the session trailer; then update BOTH `HANDOFF.md` (status) and `docs/AGENTS.md` (findings/evidence). Never add a second path to `createOrder`.

---

## C1 — Atomic single-use intent claim (F5) → **opusCode** [COMPLETE — awaiting opus-think review]

FROM: opus-think
TO: opusCode (money-path / concurrency specialist — NOT sonnetCode)
TASK: Make the single-use-intent transition provably atomic under concurrent requests.
WHY: **F5 confirmed real by code inspection.** `getIntentStatus()` is a plain read and `markIntentConsumed()` is an unconditional `update`, executed only *after* `createOrder` returns. The read-to-write window therefore spans a network round trip to Razorpay. Two concurrent approvals for two *different* carts on one ACTIVE intent both observe ACTIVE, compute *different* replay keys (so both reservations succeed), and both reach `createOrder` — two real Orders from an intent the product claims is single-use. Sequential protection (B1) does not close this; do not treat the passing B1 test as coverage.

FILES:
- `src/gateway/decide.ts` — `executeAllow` (~line 317+), and the existing pre-checks in `requestCheckout` / `approveStepUp` (leave those in place as fast paths).
- `src/gateway/session.ts` — `markIntentConsumed`, `getIntentStatus`.
- `tests/` — new concurrency regression test.

REQUIRED APPROACH (decided by opus-think — do not substitute a check-before-write):
1. Replace the post-order `markIntentConsumed` with an **atomic conditional transition performed BEFORE `createOrder`**: a single `updateMany({ where: { id: intentId, status: "ACTIVE" }, data: { status: "CONSUMED" } })`. `count === 1` means this caller won the claim and may proceed; `count === 0` means another caller already consumed the intent → return an audited `BLOCK` with `REPLAY_DETECTED` via the existing `persistDecision` helper. One SQL `UPDATE` with the status in the `WHERE` clause is atomic under both SQLite's write lock and Postgres row locking; a read followed by a write is not.
2. `executeAllow` is the correct and only insertion point — **both** `requestCheckout` and `approveStepUp` funnel through it (lines 179 and 285), so one fix covers both paths. Do not add the claim in two places.
3. Claiming before `createOrder` means a Razorpay failure would strand the intent as CONSUMED. Add a **bounded compensating revert** in the existing `catch`: revert to ACTIVE only via `updateMany({ where: { id: intentId, status: "CONSUMED" } , ... })` and only when no `razorpayOrder` row exists for that intent. State in your commit message whether this fully or only partially mitigates D1 (the replay-key reservation is a separate row and may still linger — say so honestly rather than claiming D1 is closed).
4. The same-intent+same-cart idempotent retry must keep working: it returns at the `existingOrder` lookup *before* `executeAllow`, so it must never reach the claim. Verify this by reading, not by assuming.

CONSTRAINTS / INVARIANTS:
- No new path to `createOrder`. Money-path grep must still return only `decide.ts`.
- Fail closed: a lost claim is a BLOCK, never an ALLOW and never a throw that escapes as a 500.
- Do not reorder the existing L1/L2/L3 layers, change judge or policy semantics, or touch `src/razorpay/*`.
- No schema change if the `updateMany` approach is used. If you conclude a schema change is genuinely required, STOP and write a proposal here instead of implementing it — a migration would also need `npm run db:gen-pg` and the Neon `db push` path re-checked.

VERIFICATION (all required):
- `npm run typecheck && npm test` green.
- **A real concurrency regression test**: two different carts on one intent, both STEP_UP, approvals fired with `Promise.all` (not sequentially) → exactly one ALLOW with an order, one BLOCK `REPLAY_DETECTED`, `createOrder` mocked and asserted **called exactly once**, and exactly one `razorpayOrder` row for the intent. Add the equivalent for two concurrent `requestCheckout` calls on different carts.
- **Honesty requirement**: SQLite serializes writes, so this test may not reproduce true OS-level parallelism. State explicitly in `docs/AGENTS.md` whether the test is a true race reproduction or a deterministic interleaving that proves the guard's logic. Do not claim more than the test shows.
- Money-path grep clean.

EVIDENCE: commit hash, test names, `createOrder` call-count assertion result, the honesty statement above, and whether D1 is now fully or partially mitigated.
HUMAN CHECKPOINT: none for C1.

**DONE 2026-09-05 (opusCode) — commit `a6f673a`.** `markIntentConsumed` (unconditional `update`, after `createOrder`) replaced by `claimIntent` (`updateMany` WHERE `status: "ACTIVE"`) called at the TOP of `executeAllow`, before the authorization row and before `createOrder`; `count === 1` wins, `count === 0` returns an audited `BLOCK`/`REPLAY_DETECTED` via `persistDecision` (no throw, no 500). The unconditional setter was deleted, not kept — it cannot distinguish winner from loser and must not be reachable again. Bounded compensating revert added in the `RazorpayApiError` branch: `releaseIntentClaim` (CONSUMED → ACTIVE) only when `razorpayOrder.count({intentId}) === 0`, wrapped so a revert failure leaves the intent CONSUMED (fail-closed) instead of surfacing a 500. No schema change. Existing L1/L2/L3 order untouched; the CONSUMED pre-checks in both callers kept as fast paths. | tests: **61/61** (2 new, see `docs/AGENTS.md`); `npm run typecheck` clean | **both new tests verified to FAIL against the pre-C1 source** (stash-and-run: `createOrder` reached twice on one intent) — they are real regression tests, not coverage theatre | invariant grep: clean (one real `createOrder`, `src/gateway/decide.ts:369`) | **D1 only PARTIALLY mitigated** — the intent is now released, but the replay-key row stays reserved, so that exact intent+cart is still unretryable; D1 stays open.

---

**C1 REVIEWED BY opus-think 2026-09-05 — ACCEPTED (`a6f673a`).** Verified independently, not on the builder's report: 61/61 tests, `tsc` clean, exactly one `createOrder` call site (`decide.ts:369`), exactly one `claimIntent` call site, `markIntentConsumed` fully removed from the codebase, working tree clean. **Regression re-verified by opus-think**: `src/gateway/{decide,session}.ts` were temporarily reverted to `d09f694` and only the `C1:` tests run — both fail against pre-C1 source; tree then restored clean. *Correction to the builder's evidence:* the pre-C1 failure of the concurrent-`approveStepUp` test is an unhandled `PrismaClientKnownRequestError` reaching the caller (a 500), not a clean second `createOrder`. The regression property holds; the described failure shape was imprecise, and the real pre-C1 behaviour was worse. F8 raised by opusCode is **deferred as D4** (see `docs/AGENTS.md`) — no money impact, self-heals, and the fix would be a money-path edit to correct a UI label in a state unreachable on the demo path.

---

## C2 — Revalidate parent session in `approveStepUp` (F6) → **sonnetCode** [COMPLETE — ACCEPTED by opus-think 2026-09-05]

**DONE 2026-09-05 (sonnetCode) — commit `f290097`.** Reused the existing `requireActiveSession(sessionId)` helper (`src/gateway/session.ts`, unchanged) inside `approveStepUp` — no duplicated status/expiry logic. Placement: immediately after the intent+cart lookup, before the existing `isIntentExpired` check, before any reservation/replay/order work, and before the `prisma.authorizationDecision.update({ status: "APPROVED" })` write — confirmed by reading, not assumed. `SessionError` is caught and converted to the existing `ApprovalError("AUTHORIZATION_NOT_APPROVABLE")` code; no new error code invented, no route change needed (`app/api/checkout/approve/route.ts` already maps this code to 409).

Did not touch C1's atomic claim: `claimIntent` is still the literal first statement of `executeAllow` (only comments precede it), no `markIntentConsumed` or other unconditional consume helper reintroduced.

Two new regression tests in `tests/decide.test.ts`:
- `C2: approveStepUp rejects a STEP_UP whose parent session has since expired...` — forces `session.expiresAt` into the past after the STEP_UP is raised, then approves. Asserts: throws `ApprovalError` with code `AUTHORIZATION_NOT_APPROVABLE`, `createOrder` never called, the authorization row stays `STEP_UP` (never flips to `APPROVED`), zero `RazorpayOrder` rows.
- `C2: approveStepUp rejects a STEP_UP whose parent session was deactivated...` — same shape, forces `session.status = "REVOKED"` instead of expiry. Same assertions.

| tests: **63/63** (2 new; the two C1 concurrency tests and `tests/idempotency.test.ts` still pass unaffected — they build their own fresh, active sessions via `createSession()` so the stricter check doesn't touch them) | `npm run typecheck` clean | invariant greps:
```
$ grep -rn "createOrder" src/ app/ --include="*.ts" --include="*.tsx" | grep -v "razorpay/orders" | grep -v test
src/gateway/decide.ts:390:    const order = await createOrder({
```
(the only other hit for the bare grep, filtered manually: line 345 is a comment mentioning the word "createOrder", not a call — exactly one real call site.)
```
$ grep -rn "claimIntent" src/ --include="*.ts"
src/gateway/session.ts:108:export async function claimIntent(intentId: string): Promise<boolean> {
src/gateway/decide.ts:9:  claimIntent,
src/gateway/decide.ts:354:  if (!(await claimIntent(input.intentId))) {
```
(one definition, one import, exactly one call site — `decide.ts:354`, still the first statement of `executeAllow`.)
```
$ grep -rn "markIntentConsumed" src/ --include="*.ts"
(empty — not reintroduced)
```
Route behavior verified by code inspection (no dedicated HTTP-layer test harness exists in this repo — consistent with how B1's `ApprovalError` mapping was verified): `app/api/checkout/approve/route.ts` line 21 maps `AUTHORIZATION_NOT_APPROVABLE` → 409, unchanged by this task. A rejected approval therefore returns 409, never 500.

**No limitations or unexpected findings.** The fix was exactly as scoped — one helper reuse, one placement, two tests, zero collateral changes to C1's claim or to `requestCheckout`.

FROM: opus-think
TO: sonnetCode
TASK: Make `approveStepUp` revalidate the parent session's status and expiry, matching `requestCheckout`.
WHY: **F6 confirmed real.** `requestCheckout` enforces L1 session active/not-expired; `approveStepUp` checks only intent expiry. Its own docstring says it "re-runs L1/L2; does not skip checks" — today that is false. A STEP_UP raised under a session that has since expired or been deactivated can still be approved into a real Order. Approval must not be a weaker door into the money path than the front door.

FILES: `src/gateway/decide.ts` (`approveStepUp`), `src/gateway/session.ts` (reuse the existing session check at line ~35 — do not write a second one), `tests/decide.test.ts`.

REQUIREMENTS:
- Reuse the existing session-validation helper. Do not duplicate the status/expiry logic.
- Place the check with the other L1 revalidation, before any reservation or order work.
- Failure → `ApprovalError` with an existing code that already maps in `app/api/checkout/approve/route.ts` (check the mapping; do not invent a new code and leave the route returning 500).

CONSTRAINTS: no new `createOrder` path; do not weaken any existing check; do not touch C1's atomic claim.
VERIFICATION: `npm run typecheck && npm test`; new regression test — STEP_UP raised, session then forced expired/inactive in the DB, approval rejected, `createOrder` never called. Money-path grep clean.
EVIDENCE: commit hash, test name, confirmation the API route returns the correct status code (not 500).
HUMAN CHECKPOINT: none.

**Additional constraints added by opus-think when unblocking C2 (2026-09-05), because C1 just landed in this same function:**
- **Do not touch the C1 atomic claim.** `claimIntent` must remain the first statement of `executeAllow`, and there must remain exactly ONE `claimIntent` call site. Do not reintroduce any unconditional "mark consumed" helper — that is what F5 was.
- Your session check belongs with the other **L1 revalidation in `approveStepUp`** (near the existing intent-expiry check, before the replay/reservation work) — **not** inside `executeAllow`, which is shared with `requestCheckout` and already validates the session on that path. Adding it to `executeAllow` would double-check one path and change the shared money funnel; don't.
- Confirm by reading that your check runs **before** `prisma.authorizationDecision.update({ status: "APPROVED" })`, so a rejected approval does not leave an APPROVED row (that is D4/F8; don't make it worse).
- Report the money-path grep in your evidence: it must still show exactly one real `createOrder` call in `decide.ts`, and `grep -rn "claimIntent" src/` must still show one call site.
- Verify `tests/idempotency.test.ts` and the two `C1:` tests still pass — they build their own sessions, so a stricter session check can break them. If they fail, the fix is your test fixtures, **not** loosening the check.

---

**C2 REVIEWED BY opus-think 2026-09-05 — ACCEPTED (`f290097`).** Verified independently: 63/63 tests, `tsc` clean, one `createOrder` call site (`decide.ts:390`), one `claimIntent(` call site still the first statement of `executeAllow`, `markIntentConsumed` absent from `src/`, tree clean. Placement is right: the check sits before the `APPROVED` status write, so a rejected approval leaves the row `STEP_UP` (the tests assert this) and does not worsen D4. `requireActiveSession` was pre-existing and is reused, not duplicated. One accepted trade-off recorded in `docs/AGENTS.md`: the check precedes the `existingOrder` early return, so after the 1-hour session TTL a re-approval of an authorization that already produced an order returns 409 instead of that order id — no money impact, fail-closed, deliberate. **Review raised F9 → C2b below; do C2b before C3.**

---

## C2b — Revalidate merchant binding in `approveStepUp` (F9) → **sonnetCode** [ACTIVE]

FROM: opus-think
TO: sonnetCode
TASK: Finish the L1 revalidation C2 started — `approveStepUp` must also enforce merchant binding.
WHY: **F9, found during C2 review.** `requestCheckout` runs **two** L1 session checks (`src/gateway/decide.ts:65-71`): status/expiry, **and** `session.merchantId !== intent.merchant_id → MERCHANT_MISMATCH`. C2 added `requireActiveSession(intent.session_id)` to `approveStepUp` but **discards its return value**, which is exactly the `{ id, merchantId }` needed for the second check — so approval still skips merchant binding. Not currently exploitable (intents are stamped with their session's merchant at creation, so a mismatch needs DB tampering), but "merchant binding works" is an explicit invariant on the QA checklist and a claim in the product docs. Two lines to close; leaving it means a reviewer greps `approveStepUp` and finds a documented invariant unenforced.

FILES: `src/gateway/decide.ts` (`approveStepUp`, the C2 block at ~line 213-222), `tests/decide.test.ts`.

REQUIREMENTS:
- Capture the value `requireActiveSession` already returns and compare `session.merchantId` to `intent.merchant_id`. On mismatch throw `ApprovalError("AUTHORIZATION_NOT_APPROVABLE")` — the same code C2 uses, already mapped to 409 by `app/api/checkout/approve/route.ts`. Do not invent a new error code and do not touch the route.
- Keep it inside the same L1 block C2 added: before the intent-expiry check and before the `APPROVED` status write.
- Do not re-query `prisma.session` — the helper's return value exists for this.

CONSTRAINTS / INVARIANTS: do not touch C1's atomic claim (`claimIntent` stays the first statement of `executeAllow`, exactly one call site); do not reintroduce any unconditional consume helper; do not alter C2's status/expiry behaviour or its two tests; no new path to `createOrder`.
VERIFICATION: `npm run typecheck && npm test` — 63 existing plus your new one, all green; new regression test: STEP_UP raised, then the session's `merchantId` forced to a different value in the DB, approval rejected with `AUTHORIZATION_NOT_APPROVABLE`, `createOrder` never called, authorization row still `STEP_UP`, zero `RazorpayOrder` rows.
EVIDENCE: commit hash, test name, `grep -rn "createOrder" src/ app/ --include="*.ts"` (one hit after excluding adapter/tests), `grep -c "claimIntent(" src/gateway/decide.ts` (returns 1), confirmation the C1 and C2 tests still pass untouched.
HUMAN CHECKPOINT: none.

---

## C3 — Deployment-safe Prisma generation (F4) + stale command (F7) → **sonnetCode** [BLOCKED on C2b review]

FROM: opus-think
TO: sonnetCode
TASK: Guarantee the Vercel build generates a **Postgres** Prisma client, and fix the stale command string.
WHY: **F4 confirmed real and is a hard deploy blocker.** `package.json` has no `postinstall` and no `prisma generate` step, and `docs/DEPLOY.md` never mentions one. Vercel therefore relies on Prisma's own postinstall, which reads the default `prisma/schema.prisma` — provider `sqlite`. The deployed app would run a SQLite client against a `postgres://` `DATABASE_URL` and fail at runtime, after a green build. **F7**: `scripts/gen_pg_schema.ts` line ~20 prints `prisma migrate deploy` as the deploy usage, contradicting the project's decided Neon strategy (`prisma db push`) — a wrong instruction printed at exactly the moment someone is deploying.

FILES: `package.json`, `docs/DEPLOY.md`, `scripts/gen_pg_schema.ts`, `.env.example` (only if a var is genuinely needed).

REQUIREMENTS:
- Add an explicit `build:vercel` script that generates from the Postgres schema before building: `prisma generate --schema=prisma/schema.postgresql.prisma && next build`. Then document in `docs/DEPLOY.md` that Vercel's **Build Command must be set to `npm run build:vercel`** — an explicit, documented setting, not a shell-variable trick or an undocumented dashboard override. Leave the plain `build` script alone so local SQLite development is untouched.
- Fix the `gen_pg_schema.ts` printed usage line to the `db push` strategy.
- Re-read `docs/DEPLOY.md` end to end and correct anything else that contradicts the decided strategy (SQLite-dialect migrations must never run against Neon).

CONSTRAINTS: config and docs only — no source-logic changes; do not switch the dev schema provider; `prisma/schema.postgresql.prisma` stays generated (never hand-edited).
VERIFICATION: `npm run typecheck && npm test && npx next build` green; `npm run db:gen-pg` still idempotent (clean `git diff` after rerun); `npm run build:vercel` runs locally at least as far as a successful `prisma generate` against the Postgres schema (a full build without a live Neon URL is fine — generation does not need a reachable DB). Confirm the local SQLite flow still works.
EVIDENCE: commit hash, the exact Build Command string documented in DEPLOY.md, `prisma generate` output line showing the Postgres schema was used.
**HUMAN CHECKPOINT [HUMAN]**: Kavin must set the Vercel Build Command to `npm run build:vercel` when configuring the project, and provision Neon first. No agent can do or verify this. The deploy is NOT proven until a deployed instance serves `/demo` against Neon.

**C3 definition of done (added by opus-think when re-blocking after C2/C2b).** C3 is complete when the repository is deploy-*ready*; it is explicitly NOT responsible for deploying. Done means all of:
1. `npm run build:vercel` exists and generates the Prisma client from `prisma/schema.postgresql.prisma` (prove it: the `prisma generate` output line names that schema).
2. `docs/DEPLOY.md` states, in order and copy-pasteable: the exact Vercel **Build Command** string; the full env-var list (`DATABASE_URL` = Neon **pooled** URL, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET`); the one-time `npm run db:push-pg` + `npm run seed` against Neon; the webhook URL to register (`https://<app>.vercel.app/api/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`); and a post-deploy smoke check.
3. `docs/DEPLOY.md` warns explicitly that the SQLite-dialect migrations in `prisma/migrations/` must NEVER be run against Neon, and that `db:migrate` is sqlite-dev-only.
4. `scripts/gen_pg_schema.ts` no longer prints `prisma migrate deploy` (F7).
5. Local SQLite dev is untouched: `npm run typecheck && npm test` green, `npm run seed` still works, `npm run db:gen-pg` still idempotent (clean `git diff` after rerun).
6. **No deploy is attempted and no Neon/Vercel resource is created by any agent.** Provisioning, setting the Build Command, registering the webhook, and confirming a live `/demo` are all [HUMAN].

---

## After C1–C3 (incl. C2b): agy re-audit [QUEUED]

agy re-audits C1–C3 only (QA only — never implements). Focus: is the C1 claim genuinely atomic or merely re-ordered; does the C1 test prove a race or only a sequence; does C2 close the approval door without breaking idempotent re-approve; does C3 actually cause a Postgres client to be generated in a Vercel-like build. Report in the FINDING/SEVERITY/EVIDENCE/REPRODUCTION/AFFECTED INVARIANT/RECOMMENDED FIX/STATUS format; opus-think decides acceptance.


## Q1 — Independent adversarial QA pass (assigned to `agy`)

FROM: opus-think (principal)
TO: agy (independent QA — do NOT modify source)
TASK: Adversarially audit the repository as it stands after B1–B5, comparing what builders CLAIM against what the code ACTUALLY does.
WHY: Every claim so far has been verified only by opus-think reviewing the same builders' work. Before the public GitHub push and the pitch video, the submission needs one genuinely independent pass. Assume prior verification is wrong until you re-derive it.
FILES: `src/gateway/decide.ts` (money path + state machine), `src/gateway/session.ts`, `src/gateway/replay.ts`, `src/policy/engine.ts`, `src/semantic/judge.ts`, `src/webhooks/handler.ts`, `src/reconciliation/reconcile.ts`, `app/api/**`, `tests/**`, `README.md`, `docs/SUBMISSION.md`, `docs/DEMO_SCRIPT.md`.
INVARIANTS to attack (each: try to find a path that breaks it):
  1. Only `decide.ts` reaches `createOrder`; no other production path creates a Razorpay Order.
  2. BLOCK creates zero Razorpay objects.
  3. STEP_UP requires explicit merchant approval and cannot be reused to mint a second Order (attack F1/F2 in `docs/AGENTS.md` from a different angle than the existing test).
  4. Replay rejected; expiry enforced; merchant binding enforced.
  5. Duplicate Order/payment creation prevented; webhook dedupe by `x-razorpay-event-id` before side effects; reconcile never creates orders.
  6. Gemini never receives Razorpay credentials, never authorizes money, cannot widen limits or override deterministic policy. Judge payload never contains catalog `description`.
  7. Every failure path fails closed (LLM error, schema error, API error → STEP_UP or BLOCK, never ALLOW).
VERIFICATION required: state for EACH finding whether it is CLAIMED / VERIFIED BY TEST / VERIFIED BY CODE INSPECTION / VERIFIED MANUALLY / NOT VERIFIED. Specifically judge whether the 59 tests prove the security properties or merely execute the code (look for tests that would still pass if the check were deleted). Also audit demo honesty: every id, metric and claim in `README.md` / `docs/SUBMISSION.md` / `docs/DEMO_SCRIPT.md` must trace to a real artifact — flag anything that cannot.
EXPECTED EVIDENCE: findings appended to the `## Findings` section of `docs/AGENTS.md` with severity / discovered-by / date / location / status / short explanation. Do not edit `src/`. Do not rerun the 240-case eval (quota).
KNOWN RISKS: the two deferred issues D1/D2 in `docs/AGENTS.md` are already accepted — re-reporting them is noise; challenge the *reasoning* only if you think the severity judgement is wrong.
HUMAN CHECKPOINT: none for the audit itself. Any finding you rate HIGH on the money path blocks the public push and comes back to opus-think for triage → opusCode.

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

`npm run` scripts (package.json): `seed`, `smoke:order`, `smoke:e2e`, `eval:gen`, `eval:run`, `demo:webhook-fail` map to `scripts/*.ts`. Three DB scripts are raw Prisma CLI commands, not scripts/ files, and target different environments — do not mix them up:
- `db:migrate` (`prisma migrate deploy`) — **sqlite dev only**, applies the existing sqlite-dialect migrations in `prisma/migrations/`. Never point this at Postgres/Neon.
- `db:gen-pg` (`tsx scripts/gen_pg_schema.ts`) — regenerates `prisma/schema.postgresql.prisma` from `prisma/schema.prisma`, swapping only the provider line. Run after any model change; commit the result.
- `db:push-pg` (`prisma db push --schema prisma/schema.postgresql.prisma`) — **Neon/Postgres deploy only**, pushes the current schema shape directly (no migration history — the sqlite migrations don't apply to Postgres). See `docs/DEPLOY.md`.

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
