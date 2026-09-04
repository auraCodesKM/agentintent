# AgentIntent

> There is an AI buyer. There is an AI judge. There is no AI cashier.
>
> The model can propose. The gateway decides. Only the gateway can pay.

**AgentIntent** is a merchant-side intent and policy gateway in front of **Razorpay Test Mode**. An AI buyer may shop; only the gateway may pay.

Built for **Razorpay AI Buildathon 2026 — Track 1: AI Growth & Agentic Commerce** (make a merchant transactable by an AI buyer end-to-end).

## The problem

Agentic commerce moves the human out of the checkout loop:

```
Human states intent → AI chooses product → AI proposes cart → payment
```

Nothing in a plain payment API stops an AI buyer from turning "headphones under ₹8,000" into a ₹13,999 purchase, or "nothing with a screen" into a tablet. AgentIntent inserts a merchant-controlled authorization boundary before any Razorpay transaction:

```
AI buyer → AgentIntent gateway (L1 session/expiry/replay → L2 deterministic policy
         → L3 semantic judge → L4 decision) → ALLOW | STEP_UP | BLOCK → Razorpay
```

- **Deterministic code holds all monetary authority** (amount, quantity, category, expiry, replay, idempotency).
- **The LLM handles only ambiguity** (intent compilation, buyer tool choice, semantic cart-vs-intent fit).
- A blocked cart creates **zero Razorpay objects**. A low-confidence match requires **merchant approval** (STEP_UP). Every step lands in an append-only audit log with a reason code.

## Architecture

```
                USER
                  │  natural language
                  ▼
        Intent Compiler (Gemini + Zod, fail-closed)
                  │  typed intent contract (server owns ids/expiry)
                  ▼
        Buyer agent (Gemini, hand-written loop, max 8 turns)
        tools: search_catalog · get_product · propose_cart · request_checkout
                  │  request_checkout — never Razorpay
                  ▼
        Gateway  src/gateway/decide.ts   ← the ONLY path to createOrder
          L1 session / expiry / merchant / replay
          L2 policy: amount, quantity, category (canonical server prices)
          L3 semantic judge (canonical fields only — never `description`)
          L4 ALLOW / STEP_UP / BLOCK  (confidence threshold 0.85, fail closed)
                  │ ALLOW only
                  ▼
        Razorpay Orders API (test mode) → Checkout.js → signature verify
                  │
          webhook (raw-body HMAC, event-id dedupe)  ──or──  API poll reconcile
                  ▼
        Audit timeline + offline evaluation (240 cases, zero Razorpay calls)
```

The buyer never sees Razorpay credentials. The judge never sees free-text product descriptions (prompt-injection surface reduction — one catalog SKU carries an intentionally poisoned description as a fixture). The browser receives only the public key id.

## Stack

Next.js 15 (App Router) · TypeScript strict · Gemini Flash via `@google/genai` (model set by `GEMINI_MODEL`) · Zod on every model output and API body · Prisma + SQLite locally (Neon Postgres for deploy) · official `razorpay` SDK · Vitest. No agent framework, no MCP runtime on the payment path — the authorization boundary is hand-written on purpose.

## Setup (verified commands)

```bash
npm install
cp .env.example .env       # fill values below
npx prisma migrate dev
npx tsx scripts/seed.ts
npm run dev                # http://localhost:3000/demo
```

`.env` requires:

| Var | Where |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio — key from a **billing-enabled** project (free tier's 20 req/day/model cannot run the eval) |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | model switching without code changes (defaults `gemini-3.8-flash` / `gemini-3.6-flash`) |
| `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay Dashboard → Test Mode → API Keys (`rzp_test_…` only; live keys are refused at boot) |
| `RAZORPAY_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks (events: `payment.captured`, `payment.failed`, `order.paid`) |
| `DATABASE_URL` | `file:./dev.db` locally |
| `WEBHOOK_FORCE_FAIL` | `true` only for the failure-recovery demo |

Test payments: UPI `success@razorpay` / `failure@razorpay`.

## Verify each layer

```bash
npx tsc --noEmit
npx vitest run                        # 56 tests: policy, schemas, decide, idempotency, webhooks, reconcile
npx tsx scripts/create_test_order.ts  # creates ONE real test-mode order_… (visible in Dashboard)
npx tsx scripts/e2e_smoke.ts          # live buyer → judge → real order; two BLOCKs with zero orders
npx tsx scripts/generate_eval.ts      # 240 deterministic cases (fixture ground truth, never Gemini)
npx tsx scripts/run_eval.ts           # offline eval — creates ZERO Razorpay orders
```

## Evaluation design

240 cases = 120 legitimate + 120 adversarial across classes: A amount, B quantity, C category, D semantic mismatch, E expired intent, F replay, G prompt injection, H ambiguity. Split 60 dev / 60 validation / 120 held-out; the held-out split is the reported result. Ground truth comes from deterministic templates — Gemini judges cases but never defines correctness. Metrics: overall/policy/semantic accuracy, false-block rate **and false-block GMV in ₹**, step-up rate, unauthorized-ALLOW count (must be 0), latency mean/p95.

Measured results live in `data/eval_results.json` and render on `/demo`; until a run completes the UI says **NOT RUN**. No number in this README is a claim until that file backs it.

## Failure handling (demonstrated, not narrated)

- **Webhook death**: set `WEBHOOK_FORCE_FAIL=true`, pay, watch the webhook 500; `POST /api/orders/:id/reconcile` polls `GET /v1/orders/:id` + `/payments`, recovers the same `order_…`/`pay_…`, audits `WEBHOOK_TIMEOUT_RECONCILED`, and provably creates no second order.
- **Duplicate webhooks**: `x-razorpay-event-id` persisted before side effects; replays are 200-OK no-ops.
- **LLM failure**: every Gemini output passes Zod; one retry, then STEP_UP/BLOCK. A judge outage can never mint an ALLOW.
- **Replay**: `intent_id + sha256(canonical cart)` — a consumed authorization repeats as `REPLAY_DETECTED`.
- **Amount mismatch**: observed payment amount ≠ order amount → flagged `PAYMENT_AMOUNT_MISMATCH`, order not marked paid.

## What broke during development (kept honest)

- The evaluation initially crashed mid-run: Gemini free tier allows 20 requests/day/model, and judge calls are the eval's hot path. The judge was hardened so any API failure fails closed to STEP_UP and is recorded per-case instead of aborting the batch.
- Replay eval cases raced: the priming pass and the scored pass landed on different concurrency workers, so the scored pass sometimes ran first. Fixed by pinning both passes of a replay case to one job.
- `gemini-2.5-flash` (the planned fallback) returns 404 for new API users; `gemini-3.6-flash` rejects `thinkingConfig` with 400. The client now drops `thinkingConfig` per-model on first rejection and remembers it.
- An early expiry check read `expires_at` from the stored intent JSON instead of the DB row, so a DB-forced expiry didn't block. The DB row is now the source of truth.

## Limitations

- Semantic judgment is probabilistic; ambiguous intents ("something nice for Dad") deliberately surface as STEP_UP rather than being silently authorized.
- Test Mode payments are sandbox transactions — no real money moves anywhere in this project.
- No agent identity/cryptographic credentials, no UAP/AP2/ACP/x402 implementation, no fraud platform — out of scope by design; this is the authorization boundary, not an identity protocol.
- Single merchant, INR, 26-SKU catalog.
