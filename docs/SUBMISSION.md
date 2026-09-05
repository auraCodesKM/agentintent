# AgentIntent — Submission Summary

Razorpay AI Buildathon 2026, Track 1 (AI Growth & Agentic Commerce).

## Problem

Agentic commerce moves the human out of the checkout loop: a human states an intent, an AI chooses a product, an AI proposes a cart, and a payment happens. Nothing in a plain payment API stops an AI buyer from turning "headphones under ₹8,000" into a ₹13,999 purchase, or "nothing with a screen" into a tablet. AgentIntent inserts a merchant-controlled authorization boundary between an AI buyer and Razorpay Test Mode, so an AI can shop but cannot unilaterally pay outside the terms it was given.

## What was built

- **Intent compiler** (`src/intent/compiler.ts`) — natural language → typed, Zod-validated intent contract via Gemini; the server owns ids and expiry, fail-closed on any schema violation.
- **Buyer agent** (`src/agent/buyer.ts`) — a hand-written, max-8-turn tool loop (no agent framework) restricted to four tools: `search_catalog`, `get_product`, `propose_cart`, `request_checkout`. It never calls Razorpay directly.
- **Deterministic policy engine** (`src/policy/engine.ts`) — pure checks on amount, quantity, category against canonical server-side prices (L2).
- **Semantic judge** (`src/semantic/judge.ts`) — Gemini-based cart-vs-intent fit check (L3); `buildJudgePayload` deliberately omits catalog `description` fields to reduce prompt-injection surface (verified by `tests/judge-payload.test.ts`).
- **Gateway** (`src/gateway/decide.ts`) — the single code path allowed to reach `createOrder` (`src/razorpay/orders.ts`); combines L1 session/expiry/replay checks, L2 policy, and L3 semantic judgment into one ALLOW / STEP_UP / BLOCK decision (L4).
- **Razorpay integration** (`src/razorpay/`) — test-key-only client guard, order creation/fetch, payment handling, HMAC signature verification.
- **Webhook handling** (`src/webhooks/handler.ts`) — event-id dedupe, amount-mismatch flagging (`PAYMENT_AMOUNT_MISMATCH`).
- **Reconciliation** (`src/reconciliation/reconcile.ts`) — API-poll recovery path that never creates orders, used when a webhook fails to arrive.
- **Audit log** (`src/audit/logger.ts`) — append-only record of every decision and reason code.
- **Offline evaluation harness** (`src/eval/`) — 240 generated cases across 8 classes (amount, quantity, category, semantic mismatch, expiry, replay, prompt injection, ambiguity), deterministic-template ground truth (Gemini never labels correctness), zero Razorpay calls.
- **Demo UI** (`app/demo/page.tsx`) — single page bound to real endpoints, showing the intent contract, buyer transcript, gateway pipeline lights, audit timeline, and the live evaluation results table.
- **Checkout UI** (`app/checkout/[orderId]/page.tsx`) — Razorpay Checkout.js integration for completing a Test Mode payment against an ALLOW-created order.

## The security invariant

> The model proposes. The gateway decides. Only the gateway can pay.

Only `src/gateway/decide.ts` (its ALLOW path, and its approve-after-STEP_UP path) may call `createOrder`. Every other code path — the intent compiler, the buyer agent, the semantic judge — can only produce data that the gateway consumes; none of them holds Razorpay credentials or can trigger a transaction. Any LLM, schema, or API failure fails closed to STEP_UP or BLOCK, never to ALLOW.

## Measured results (held-out split, 120 cases)

Copied verbatim from `README.md`. Run `2026-09-04T21:23Z` · judge model `gemini-3.5-flash-lite` · 165 judge calls · 0 Razorpay calls.

| Metric | Value |
| --- | --- |
| Accuracy (overall) | 100% (120/120) |
| Policy accuracy | 100% (37/37) |
| Semantic accuracy | 100% (83/83) |
| False blocks | 0 (₹0 lost GMV) |
| Unauthorized allows | 0 |
| Step-up rate | 2.5% (3/120 — ambiguity class H, correctly escalated) |
| Latency, mean / p95 | 9.6s / 14.4s (includes 13-RPM eval pacing waits, not raw judge latency) |

Full breakdown (dev/validation/held-out, per-class) is in `data/eval_results.json`.

## Limitations (honest, from README)

- Semantic judgment is probabilistic; ambiguous intents (e.g. "something nice for Dad") deliberately surface as STEP_UP rather than being silently authorized.
- Test Mode payments are sandbox transactions — no real money moves anywhere in this project.
- No agent identity or cryptographic credentials, no UAP/AP2/ACP/x402 implementation, no fraud platform — out of scope by design; this is the authorization boundary, not an identity protocol.
- Single merchant, INR, 26-SKU catalog.

## What broke during development (kept honest, from README)

- The evaluation initially crashed mid-run: Gemini's free tier allows 20 requests/day/model, and judge calls are the eval's hot path. The judge was hardened so any API failure fails closed to STEP_UP and is recorded per-case instead of aborting the batch.
- Replay eval cases raced: the priming pass and the scored pass landed on different concurrency workers, so the scored pass sometimes ran first. Fixed by pinning both passes of a replay case to one job.
- `gemini-2.5-flash` (the planned fallback) returns 404 for new API users; `gemini-3.6-flash` rejects `thinkingConfig` with 400. The client now drops `thinkingConfig` per-model on first rejection and remembers it.
- An early expiry check read `expires_at` from the stored intent JSON instead of the DB row, so a DB-forced expiry didn't block. The DB row is now the source of truth.

## Verification commands

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 56 tests: policy, schemas, decide, idempotency, webhooks, reconcile
npm run smoke:e2e   # live buyer → judge → real order; two BLOCKs with zero orders
npm run eval:run    # offline eval — creates ZERO Razorpay orders
```

---

Claude-Session: https://claude.ai/code/session_018bexqvxwn9rAVBvSHdeCz3
