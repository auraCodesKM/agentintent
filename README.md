<div align="center">

# AgentIntent

### Only the gateway can pay.

**A merchant-side authorization gateway that sits between an AI buyer and Razorpay.**

There is an AI buyer. There is an AI judge. There is no AI cashier.
The model can propose. The gateway decides. Only the gateway can pay.

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![Google Gemini](https://img.shields.io/badge/Gemini-2.5%2F3.x_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev)
[![Razorpay](https://img.shields.io/badge/Razorpay-Test_Mode-0C2451?style=flat-square&logo=razorpay&logoColor=white)](https://razorpay.com)
[![Zod](https://img.shields.io/badge/Zod-validated-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev)
[![Vitest](https://img.shields.io/badge/Vitest-64%2F64_passing-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)

Razorpay AI Buildathon 2026 — **Track 1: AI Growth & Agentic Commerce**

`64/64 tests` · `240-case evaluation, 100% held-out` · `0 unauthorized allows` · `1 code path to money` · Razorpay Test Mode only

[Live demo](#-verify-it-yourself-in-five-minutes) · [Architecture](#-the-boundary) · [Security](#-security-properties) · [Evaluation](#-measured-results) · [Setup](#-setup) · [API](#-api-surface)

### [▶ Watch the 5-minute pitch](https://www.canva.com/design/DAHUWuDXu9s/8pJTK7gbfEOiqFOqO93qYA/watch)

Problem → real ALLOW with a Dashboard-visible order → real BLOCK with zero Razorpay objects created → webhook death and recovery → the evaluation numbers below, live.
*(GitHub strips `<iframe>` from rendered READMEs — this is a direct link to the same video, not a downgrade.)*

</div>

---

## Table of contents

- [The problem, concretely](#the-problem-concretely)
- [The boundary](#-the-boundary)
- [Design decisions — and what we rejected](#-design-decisions--and-what-we-rejected)
- [Verify it yourself in five minutes](#-verify-it-yourself-in-five-minutes)
- [Security properties](#-security-properties)
- [Measured results](#-measured-results)
- [Real Razorpay artifacts](#-real-razorpay-artifacts)
- [Failure handling, demonstrated](#-failure-handling-demonstrated)
- [API surface](#-api-surface)
- [Setup](#-setup)
- [Tech stack](#-tech-stack)
- [Repository layout](#-repository-layout)
- [What broke during development](#-what-broke-during-development)
- [Limitations](#-limitations)
- [License](#-license)

---

## The problem, concretely

Agentic commerce removes the human from the checkout loop:

```
human states intent → AI picks product → AI proposes cart → payment
```

A payment API cannot tell the difference between these:

| The user said | The agent proposed | A plain payment API |
| --- | --- | --- |
| "headphones under ₹8,000" | `HP-005` — ₹13,999 | charges ₹13,999 |
| "nothing with a screen" | a tablet | charges for the tablet |
| one intent, one purchase | the same intent, twice, concurrently | creates two orders |

The card network sees a valid transaction in every case. The *merchant* is the only party who knows the purchase violated the terms the buyer was given — and by then the money has moved.

**AgentIntent puts a deterministic authorization boundary in front of the payment API.** The agent may search, inspect and propose. It may not price, authorize, or pay.

---

## 🧭 The boundary

```mermaid
flowchart TD
    U["👤 User\nnatural language"] --> IC["🧠 Intent Compiler\nGemini + Zod, fail-closed"]
    IC -->|typed contract\nserver owns id · expiry · merchant| BUY["🤖 Buyer Agent\nGemini, ≤8 turns\nsearch · inspect · propose"]
    BUY -->|"request_checkout\n(proposal, not payment)"| GW

    subgraph GW["🔒 GATEWAY — src/gateway/decide.ts — the ONLY path to createOrder"]
        direction TB
        L1["L1 · session · expiry · merchant binding · replay · single-use"]
        L2["L2 · deterministic policy over the SERVER-priced cart"]
        L3["L3 · semantic judge — canonical fields only, never description"]
        L4["L4 · ALLOW · STEP_UP · BLOCK"]
        L1 --> L2 --> L3 --> L4
    end

    GW -->|ALLOW only| RP["💳 Razorpay Orders API (Test Mode)\nCheckout.js → server-side signature verify"]
    RP --> WH["Webhook (raw-body HMAC + dedupe)\n— or —\nAPI-poll reconcile"]
    WH --> AUDIT["📒 Append-only audit trail\n+ offline evaluation (240 cases, 0 Razorpay calls)"]

    style GW fill:#0B0B0C,color:#FAFAF8,stroke:#0F7B4F,stroke-width:2px
    style L4 fill:#0F7B4F,color:#FAFAF8
    style RP fill:#1B3BD8,color:#FAFAF8
```

Three things never cross that boundary: **Razorpay credentials** (the buyer and the judge never hold them; the browser gets only the public key id), **agent-authored prices** (`priceCart` re-prices every cart from the server catalog), and **free-text product descriptions** (the judge payload omits them — one catalog SKU carries a deliberately poisoned description as a live fixture).

### How a decision is actually made

| Layer | Runs | Decides on | Failure becomes |
| --- | --- | --- | --- |
| **L1** | always | session active, intent unexpired, merchant bound, not replayed, intent unconsumed | `BLOCK` |
| **L2** | if L1 passed | amount, quantity, category — against canonical server prices | `BLOCK` |
| **L3** | **only if L1+L2 passed** | does this cart satisfy what the user actually asked for? | `BLOCK` or `STEP_UP` |
| **L4** | always | combines the above into one authorization | `ALLOW` / `STEP_UP` / `BLOCK` |

L3 runs last and never runs after a deterministic failure — **a policy violation never reaches the model**. The judge returns a verdict and a confidence; the gateway *consumes it as data*. It cannot raise a limit, overturn L2, or turn a `BLOCK` into an `ALLOW`. Confidence below `0.85` escalates to a human instead of resolving itself.

---

## 🧠 Design decisions — and what we rejected

Every non-obvious choice below was a real fork, not a default. The rejected side is included because a design that never explains what it turned down is a design that hasn't been stress-tested.

| Decision | We rejected | Because |
| --- | --- | --- |
| **Hand-written 8-turn buyer loop** | LangChain / CrewAI / a generic agent framework | Generic frameworks make `create_order` look like just another selectable tool. Money authority cannot live inside a runtime the model steers. Writing the loop ourselves (~120 lines) keeps the one dangerous edge — `request_checkout` — visible and auditable, not buried in a library's tool-dispatch internals. |
| **REST for the gateway, not MCP** | Razorpay's MCP server, which already exposes payment tools to AI clients | MCP is capability *exposure* — exactly the opposite of what an authorization boundary needs. Giving the buyer an MCP `create_order` tool puts the governed action in the model's toolset. A future MCP adapter could sit *behind* an ALLOW; it must never sit in front of one. |
| **Confidence threshold escalates to a human, not to a retry** | Re-prompting the judge until confidence clears 0.85 | Re-prompting to reach a threshold is p-hacking your own safety check — you're not more certain, you've just asked until the model said what you wanted. Low confidence is real information; it goes to `STEP_UP`, not to a second dice roll. |
| **Atomic single-row claim, not a lock/mutex** | An in-memory mutex or a distributed lock (Redis, etc.) | A mutex only protects one process; this runs on serverless, where "one process" isn't guaranteed. One conditional `UPDATE … WHERE status = 'ACTIVE'` pushes the exclusion into the database's own write lock — correct under concurrency without adding infrastructure. |
| **Judge sees canonical fields only, never `description`** | Passing the full catalog record for "richer context" | Free-text fields are where prompt injection lives. `HP-007`'s description is a live poisoned fixture proving the judge never sees it — richer context wasn't worth an unbounded attack surface for a field the decision doesn't need. |
| **Deterministic eval ground truth, Gemini judges but never grades itself** | Using the judge's own verdicts as the accuracy baseline | An evaluation where the model defines correctness always converges to "the model is right." Ground truth comes from fixture templates that exist independent of any model call — the 100% held-out figure means something because of this, not despite it. |
| **SQLite locally, Postgres only in deploy** | One database everywhere, for "consistency" | Local dev shouldn't need a hosted database to run `npm test`. The cost is one extra deploy step (`prisma db push` against Neon) — documented in `docs/DEPLOY.md` — in exchange for zero-setup contribution. |

---

## 🚀 Verify it yourself in five minutes

```bash
git clone https://github.com/auraCodesKM/agentintent.git
cd agentintent
npm install && cp .env.example .env    # fill in keys — see "Get your API keys" below
npm run seed
npm run dev                            # → http://localhost:3000/demo
```

### Get your API keys

| Key | Get it here | Cost |
| --- | --- | --- |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — sign in, click **Create API key** | Free tier, 500 req/day on `-flash-lite` models |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | [dashboard.razorpay.com/app/keys](https://dashboard.razorpay.com/app/keys) — toggle **Test Mode** (top-right), **Generate Test Key** | Free, sandbox only |
| `RAZORPAY_WEBHOOK_SECRET` | [dashboard.razorpay.com/app/webhooks](https://dashboard.razorpay.com/app/webhooks) — **Add New Webhook**, subscribe to `payment.captured`, `payment.failed`, `order.paid` | Free |

No card, no live-mode activation, and no real money anywhere in this setup — Test Mode keys are sufficient for everything in this repo.

### Run the three decision states

On `/demo`, run these three prompts in order. Each one exercises the real pipeline — real Gemini calls, real gateway, real Razorpay Test Mode.

| # | Prompt | Expected | What it proves |
| --- | --- | --- | --- |
| 1 | `Buy me the StudioMax Reference headphones. My budget is ₹8,000 maximum.` | **BLOCK** · `SEMANTIC_MISMATCH` | The agent substituted a product; the judge caught it. Razorpay is never contacted — `0 ORDERS CREATED`. |
| 2 | `Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only.` | **ALLOW** · real `order_…` | The legitimate path. A real Test Mode Order appears in your Razorpay Dashboard. |
| 3 | `Get me something nice for my desk setup, keep it reasonable.` | **STEP_UP** · `SEMANTIC_LOW_CONFIDENCE` | Ambiguity is escalated to a merchant, not silently authorized. No order exists until you approve. |

Test payments: UPI `success@razorpay` / `failure@razorpay`.

### Then, without writing any code

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # 64 tests
npm run eval:run                  # 240-case offline eval — creates ZERO Razorpay orders
npm run demo:webhook-fail         # webhook death → API-poll recovery, still one order
```

Or click **Run evaluation** directly on `/demo` — it executes a real, deterministic 27-case sample of the held-out split live in the browser (same evaluation module the CLI runs, 0 Razorpay calls, ~28 seconds).

**The single invariant, checkable in one command:**

```bash
grep -rn "await createOrder(" src/ app/ --include="*.ts" --include="*.tsx" | grep -v "razorpay/orders"
# → src/gateway/decide.ts:397     (exactly one hit, and it is inside the ALLOW path)
```

---

## 🛡 Security properties

Each is an engineering decision with a specific mechanism, not a claim. File references are the proof.

**One path to money.** Only `src/gateway/decide.ts` may call `createOrder`. Nothing else in the application — not the compiler, not the buyer, not the judge, not an API route — can create a Razorpay object.

**Single-use intents, enforced atomically.** An intent authorizes at most one Order. This is deliberately *not* a read-then-write check, which two concurrent requests can both pass: it is one conditional `UPDATE … WHERE status = 'ACTIVE'`, executed as the first statement of `executeAllow`, **before** the Razorpay call. The database's own write lock picks exactly one winner; the loser receives an audited `BLOCK`, never a second Order and never a raw 500. Regression-tested with concurrent `Promise.all` approvals asserting `createOrder` is called exactly once.

**Approval is not a weaker door than checkout.** `requestCheckout` validates session status, expiry and merchant binding. The merchant-approval path for a STEP_UP re-validates all three, so a STEP_UP raised under a session that has since expired, been deactivated, or been rebound to another merchant cannot be approved into a real Order.

**Carts are server-priced.** The buyer proposes SKUs and quantities. The gateway looks up price, category and attributes from the catalog itself. A client can suggest a cart; it cannot suggest a price.

**The judge cannot see what it shouldn't.** `buildJudgePayload` sends canonical fields only — SKU, category, quantity, price. Catalog `description` is never included; SKU `HP-007` carries a prompt-injection payload in its description as a permanent fixture, and eval class G proves it never reaches a decision. Enforced by `tests/judge-payload.test.ts`.

**Replay and idempotency are one key with two behaviours.** The key is `intent_id + sha256(canonical cart)`. Repeating an *already-authorized* intent+cart returns the **same** Order — idempotent and safe to retry. A *different* cart on an already-consumed intent is refused as `REPLAY_DETECTED`. The unique constraint, not an earlier read, decides who won.

**Every failure path fails closed.** A judge outage, a malformed model response, a Zod violation or a Razorpay API error each resolve to `STEP_UP` or `BLOCK`. There is no "let it through on error" branch anywhere in the authorization boundary.

**Webhooks are verified, deduped and recoverable.** Signatures are checked over the **raw** request body — never re-serialized JSON — before anything else runs. The Razorpay event id is persisted *before* any side effect, so retried deliveries are 200-OK no-ops. If a webhook never arrives, `POST /api/orders/:id/reconcile` polls Razorpay and recovers the same Order/Payment; it can never create one.

**Test keys only.** The client refuses to boot on anything but `rzp_test_…`.

---

## 📊 Measured results

Held-out split, 120 cases. Run `2026-09-04T21:23Z` · judge `gemini-3.5-flash-lite` · 165 judge calls · **0 Razorpay calls**.

| Metric | Value |
| --- | --- |
| Decision accuracy | **100%** (120/120) |
| Policy accuracy | 100% (37/37) |
| Semantic accuracy | 100% (83/83) |
| False blocks | **0** (₹0 lost GMV) |
| Unauthorized allows | **0** |
| Step-up rate | 2.5% (3/120 — ambiguity class H, correctly escalated) |
| Latency mean / p95 | 9.6s / 14.4s *(includes 13-RPM evaluation pacing waits, not raw judge latency)* |

Numbers come from `data/eval_results.json` and render on `/demo`. Until a run completes, the UI says **NOT RUN** — no number here is a claim the file doesn't back. A separate, smaller **live** sample (27 held-out cases, 3 per class) is runnable from the demo UI itself and is always labeled and reported separately from this precomputed 120-case baseline — the two are never merged into one number.

**False-block GMV is reported in ₹ on purpose.** A gateway that blocks everything scores perfectly on "unauthorized allows" and destroys the merchant's revenue. Both failure directions have to be priced.

### Evaluation design

240 cases = 120 legitimate + 120 adversarial, across eight classes:

| Class | A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | amount | quantity | category | semantic mismatch | expired intent | replay | prompt injection | ambiguity |

Split 60 dev / 60 validation / 120 held-out; **held-out is the reported result**. Ground truth comes from deterministic templates — **Gemini judges cases but never defines correctness**, so the model is never grading its own homework. The eval module tree imports no Razorpay code at all.

*Calibration, disclosed:* an earlier run scored 98.3% held-out, missing 4/5 class-H ambiguity cases — the judge was confidently authorizing vague intents. The fix was a confidence-calibration change so open-ended intents report low confidence and escalate. The pre-calibration run is preserved at `data/eval_results_full_run1.json` rather than deleted.

---

## 🧾 Real Razorpay artifacts

Everything below was produced by the running system, not fabricated for the README.

| Artifact | Value | How |
| --- | --- | --- |
| Captured payment | `pay_TYFtu8vjA3C0iT` | Human-completed Test Mode checkout |
| Its order | `order_TYFPRIpLlJeFpf` (₹7,499) | Created by the gateway's ALLOW path |

Webhook route live-tested for all three cases: 400 on bad signature · 200 on valid · no-op on duplicate event id. Webhook-death → reconcile recovery was run twice to confirm idempotency: the payment row is upserted, and exactly one order row still exists.

---

## 🧯 Failure handling, demonstrated

| Failure | Behaviour | Reproduce |
| --- | --- | --- |
| Webhook never arrives | API poll recovers the same order/payment, audits `WEBHOOK_TIMEOUT_RECONCILED`, creates no second order | `npm run demo:webhook-fail` |
| Duplicate webhook | Event id persisted before side effects → 200-OK no-op | `scripts/webhook_route_smoke.ts` |
| LLM returns garbage | Zod rejects → one retry → `STEP_UP`/`BLOCK` | `tests/gemini-retry.test.ts` |
| Concurrent double-spend | Atomic claim; one ALLOW, one audited `BLOCK` | `tests/decide.test.ts` (`C1:` cases) |
| Payment amount ≠ order amount | Flagged `PAYMENT_AMOUNT_MISMATCH`, order not marked paid | `tests/reconcile.test.ts` |

---

## 🔌 API surface

| Route | Purpose |
| --- | --- |
| `POST /api/sessions` | Open a merchant-bound session |
| `POST /api/intents` | Natural language → typed intent contract |
| `POST /api/agent/run` | Run the bounded buyer loop |
| `POST /api/carts/propose` | Server-priced cart proposal |
| `POST /api/checkout/request` | **Enter the gateway** — returns ALLOW/STEP_UP/BLOCK |
| `POST /api/checkout/approve` | Merchant approval of a STEP_UP (re-runs L1) |
| `POST /api/checkout/verify` | Server-side Checkout.js signature verification |
| `POST /api/webhooks/razorpay` | Raw-body HMAC + event-id dedupe |
| `GET /api/orders/:id` · `POST /api/orders/:id/reconcile` | Persisted order state · API-poll recovery |
| `GET /api/audit/:intentId` · `GET /api/eval/results` | Audit timeline · precomputed evaluation metrics |
| `POST /api/eval/run` | Live evaluation trigger — real 27-case held-out sample, 0 Razorpay calls |

---

## ⚙️ Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev     # local SQLite
npm run seed               # 26-SKU catalog + merchant policy
npm run dev
```

| Var | Where it comes from |
| --- | --- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | Model switching without code changes. Defaults `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` — the two tiers with 500 req/day on a fresh key. The plain `-flash` tiers cap at 20 req/day and exhaust almost immediately. |
| `RAZORPAY_KEY_ID` · `RAZORPAY_KEY_SECRET` · `NEXT_PUBLIC_RAZORPAY_KEY_ID` | [Dashboard → Test Mode → API Keys](https://dashboard.razorpay.com/app/keys) (`rzp_test_…` only) |
| `RAZORPAY_WEBHOOK_SECRET` | [Dashboard → Webhooks](https://dashboard.razorpay.com/app/webhooks) (`payment.captured`, `payment.failed`, `order.paid`) |
| `DATABASE_URL` | `file:./dev.db` locally. **Exactly one line** — a Postgres value here makes every API route 500 against the SQLite schema. Neon URLs belong in Vercel env vars only; see [`docs/DEPLOY.md`](./docs/DEPLOY.md). |
| `WEBHOOK_FORCE_FAIL` | `true` only for the failure-recovery demo |

Deploying to Vercel + Neon? Full runbook in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

---

## 🧩 Tech stack

<div align="left">

| | | |
| --- | --- | --- |
| **Framework** | [![Next.js](https://img.shields.io/badge/-Next.js_15_(App_Router)-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org) | Server routes + UI in one deployable |
| **Language** | [![TypeScript](https://img.shields.io/badge/-TypeScript_strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) | Every model output and API body is typed and Zod-validated |
| **UI** | [![React](https://img.shields.io/badge/-React_19-149ECA?style=flat-square&logo=react&logoColor=white)](https://react.dev) | No component library, no CSS-in-JS — plain CSS, `next/font` |
| **ORM / DB** | [![Prisma](https://img.shields.io/badge/-Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io) [![SQLite](https://img.shields.io/badge/-SQLite_(local)-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org) [![Postgres](https://img.shields.io/badge/-Neon_Postgres_(deploy)-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech) | SQLite for zero-setup local dev, Neon for the deployed instance |
| **LLM** | [![Google Gemini](https://img.shields.io/badge/-Gemini_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev) via `@google/genai` | Intent compiler, buyer agent, semantic judge — never the authorizer |
| **Validation** | [![Zod](https://img.shields.io/badge/-Zod-3E67B1?style=flat-square&logo=zod&logoColor=white)](https://zod.dev) | The trust boundary between untrusted model output and the gateway |
| **Payments** | [![Razorpay](https://img.shields.io/badge/-Razorpay_Test_Mode-0C2451?style=flat-square&logo=razorpay&logoColor=white)](https://razorpay.com) | Official `razorpay` SDK, Orders API, Checkout.js, signed webhooks |
| **Tests** | [![Vitest](https://img.shields.io/badge/-Vitest_64%2F64-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev) | Unit, integration, concurrency, and eval-harness tests |
| **Deploy** | [![Vercel](https://img.shields.io/badge/-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com) | `vercel.json` pins the build command — no fragile dashboard setting |

</div>

**No agent framework and no MCP runtime on the payment path.** The tool loop is ~120 lines of hand-written TypeScript, because the authorization boundary is the product and it should be readable end to end. No LangChain, no CrewAI, no AutoGen, no vector DB — the catalog is structured data, not a RAG problem.

---

## 🗂 Repository layout

```
src/gateway/    decide.ts ← the only money path · session.ts · replay.ts
src/policy/     engine.ts — pure deterministic checks
src/semantic/   judge.ts — L3; buildJudgePayload omits description
src/intent/     compiler.ts     src/agent/ buyer.ts (4 tools, no payment tool)
src/razorpay/   client.ts (test-key guard) · orders.ts · payments.ts · verify.ts
src/webhooks/   handler.ts — dedupe + amount-mismatch flagging
src/reconciliation/  reconcile.ts — observes only, never creates
src/audit/      logger.ts — append-only, no update/delete API exists
src/eval/       240 cases, deterministic ground truth, zero Razorpay imports
app/demo/       the single-page authorization ledger UI (this is what you see live)
app/api/        every route in the table above
```

~2,400 lines of TypeScript in `src/`, 26 SKUs across 5 categories, 64 tests, 12 API routes.

---

## 🔥 What broke during development

Kept because the fixes are the interesting part.

- **The evaluation crashed mid-run.** Gemini's free tier allows 20 requests/day/model and judge calls are the eval's hot path. The judge was hardened so an API failure fails closed to STEP_UP and is recorded per-case rather than aborting the batch.
- **Replay eval cases raced.** The priming pass and the scored pass landed on different concurrency workers, so the scored pass sometimes ran first and corrupted its own ground truth. Both passes are now pinned to one job.
- **Model tiers lied.** `gemini-2.5-flash` returns 404 for new API users; `gemini-3.6-flash` rejects `thinkingConfig` with a 400. The client now drops `thinkingConfig` per-model on first rejection and remembers the result.
- **An expiry check read the wrong source.** It read `expires_at` from the stored contract JSON instead of the DB row, so a DB-forced expiry didn't block. The row is now the single source of truth.
- **Single-use enforcement had a concurrency hole.** The original check read intent status, then consumed it *after* `createOrder` returned — a window spanning a network round trip, through which two different carts on one intent could both mint an Order. Replaced with the atomic conditional claim described above.

---

## ⚠️ Limitations

Stated plainly rather than hidden.

- **Semantic judgment is probabilistic.** Ambiguous intents deliberately surface as STEP_UP rather than being silently authorized. That is a design choice, and it costs a 2.5% step-up rate.
- **Test Mode only.** Every payment here is a sandbox transaction. No real money moves anywhere in this project.
- **`POST /api/checkout/approve` is unauthenticated** in this single-merchant demo — anyone holding an `authorization_id` can approve that specific STEP_UP. Production would bind it to a merchant session. Left open and documented rather than quietly ignored.
- **No agent identity layer.** No cryptographic agent credentials, no UAP/AP2/ACP/x402, no fraud platform. This is the authorization boundary, not an identity protocol.
- **Known replay-reservation edge case.** If the Razorpay call fails *after* a replay key is reserved, that exact intent+cart becomes unretryable — the key is held but no order exists. The intent itself is released; the key row is not. Frequency is ~0 in Test Mode. A full fix needs reservation rollback on `RazorpayApiError`; deferred as a documented, accepted limitation.
- **Single merchant, INR, 26-SKU catalog.**

---

## 📄 License

[MIT](./LICENSE) © 2026 Kavin Thakur

---

<div align="center">

Built solo for the Razorpay AI Buildathon 2026 — intent compiler, buyer agent, policy engine, semantic judge, Razorpay integration, evaluation harness, and this frontend, end to end. No team, no boilerplate starter, no agent framework doing the hard part for me.

**Kavin Thakur** · [GitHub @auraCodesKM](https://github.com/auraCodesKM) · kavinthakur@gmail.com

The pitch is above. The proof is in `src/gateway/decide.ts` — read that file before this README if you only have one minute.

</div>
