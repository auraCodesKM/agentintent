# AgentIntent — rules.md

Coding-agent contract. `product.md` decides **what** to build. This file decides **how**. If they conflict on product, architecture, stack, claims, or authorization, `product.md` wins. If they conflict on process, verification, or honesty, this file wins.

You are building a real system that talks to Razorpay Test Mode and Gemini. You are not building a slide.

---

## 0. Prime directives

1. **Make it work for real before it looks good.**
2. **Do not fake.** No mock Razorpay IDs in the demo path. No invented metrics. No `order_demo_123`. No `setTimeout` pretending to be a webhook.
3. **Fail closed.** Invalid, uncertain, or broken → `BLOCK` or `STEP_UP`. Never `ALLOW` by default.
4. **One path to money.** Only `lib/gateway/decide.ts` returning `ALLOW` may call the Razorpay adapter. Grep the repo before you add another caller.
5. **Prove each layer with a command or a test before starting the next layer.**
6. **UI is last.** A working CLI / API / Checkout proof beats a pretty console with stubs behind it.
7. **Do not change the product unless you can prove it is better.** `product.md` is frozen. You may propose a delta. You may not implement a product/architecture change until the human accepts a written proof. Taste, “cleaner,” “more agentic,” or “what other repos do” is not proof.
8. **Ask the human for every secret and dashboard setup. Do not invent them, skip them, or stub past them.** At session start, and again before P3 / P4 / Vercel deploy, emit a SETUP BLOCK listing what only the human can do. Wait. Missing keys → stop that path. Never put placeholder keys in committed files.

If you cannot finish everything, ship a boring page on a real gateway — not a beautiful page on a fake one.

---

## 0.1 Changing the product (must prove it)

Claude Code is an implementer of `product.md`, not a second product manager.

**Default:** implement the frozen spec. Do not reopen track, stack, rails, tool list, judge inputs, MCP, crypto, Payment Links as primary, extra agents, or extra pages.

**Allowed without asking:** bugfixes, refactors that do not change behavior, test additions, typing, log hygiene, file splits, dependency pins already implied by the spec.

**Not allowed until the human says yes:** anything that changes what the system *is* — new tools, new models, new payment rail, new identity, new UI product surface, dropping a never-cut item, adding a framework, calling Razorpay from a new module, feeding `description` to the judge, shrinking eval, mocking the demo path.

### Proof format (paste this before you edit product behavior)

```text
CHANGE PROPOSAL
What product.md says now:
What I want to change:
Why this is better for Track 1 / demo / hiring signal / reliability:
Evidence (not vibes):
  - command, test, Razorpay doc, measured failure, or replay of a broken path
  - what we gain
  - what we risk
  - what we will cut instead if this costs time
Rollback if wrong:
I will not implement this until you reply YES.
```

No proof → no change. If you already started the change, revert it and send the proposal.

### What counts as proof

Valid:

- A failing test or live Razorpay error that the spec’s approach cannot pass
- An official Razorpay / Next / Gemini constraint that makes the spec path impossible
- A measured demo break (Checkout flaky, webhook raw-body impossible on this runtime) plus a smaller alternative that preserves ALLOW-only-pays
- Eval evidence that a spec rule causes systematic false blocks and a tighter rule fixes it without opening the money path

Invalid:

- “Industry best practice”
- “LangChain would be cleaner”
- “MCP would impress them more”
- “The UI needs another page”
- “I already built it this way”
- “80 lines vs a framework”
- Hypothetical scale (multi-merchant, identity, protocols)

If you cannot prove it in that block, implement `product.md` as written.

---

## 0.2 Human setup — ask, do not invent

You cannot log into Razorpay, Gemini, Neon, or Vercel as the human. You must **ask** for credentials and dashboard clicks, then wire `.env` locally (never commit secrets).

### When to ask

1. **First message of a coding session** — full SETUP BLOCK below.
2. **Before P3** — Razorpay Test Mode must be live or you do not write a fake adapter.
3. **Before P4** — Gemini/Vertex key must exist or you do not stub the compiler for demo.
4. **Before deploy / webhook demo** — Vercel + Neon + Razorpay webhook URL must be configured.

If a value is missing, print exactly what screen to open and what to copy. Do not say “use dummy keys.” Do not write `rzp_test_xxxxx`. Do not use your own account.

### SETUP BLOCK (paste this; wait for answers)

```text
SETUP NEEDED FROM YOU
Reply with values or "skip, I will do this later" per line.
Do not paste secrets into chat if you can put them in .env yourself —
then just say "written to .env".

1) Gemini
   [ ] GEMINI_API_KEY
   or Vertex:
   [ ] GOOGLE_GENAI_USE_VERTEXAI=true
   [ ] GOOGLE_CLOUD_PROJECT
   [ ] GOOGLE_CLOUD_LOCATION
   Where: Google AI Studio / Gemini Enterprise / Vertex console.

2) Razorpay Test Mode (Dashboard → Account & Settings → API Keys, Test mode toggle ON)
   [ ] RAZORPAY_KEY_ID          (starts with rzp_test_)
   [ ] RAZORPAY_KEY_SECRET
   [ ] NEXT_PUBLIC_RAZORPAY_KEY_ID  (same as KEY_ID)

3) Razorpay webhooks (Dashboard → Developers → Webhooks)
   [ ] RAZORPAY_WEBHOOK_SECRET
   [ ] Webhook URL I should register (local ngrok or https://YOUR.vercel.app/api/webhooks/razorpay)
   [ ] Events enabled: payment.captured, payment.failed, order.paid
   After deploy I will give you the exact Vercel URL to paste.

4) Database
   Local (default): I will use SQLite file:./dev.db — you do nothing.
   Vercel:
   [ ] Neon (or Vercel Postgres) DATABASE_URL
   [ ] Confirm I may run prisma migrate against it

5) Hosting
   [ ] Vercel project linked / I should run vercel?
   [ ] Domain I will record the video against

6) You will do in Razorpay Dashboard (I cannot)
   [ ] Test mode is ON
   [ ] Created Test API keys
   [ ] Copied webhook secret from the webhook you added
   [ ] Can open Transactions / Orders to show order_ and pay_ on camera
   [ ] Know test payment: UPI success@razorpay / failure@razorpay or Razorpay test cards

Missing any of 1–3 means that layer stays blocked. I will keep building policy/catalog/tests only.
```

### Razorpay Test Mode — human checklist you must walk them through

Give this as numbered UI steps, not “configure Razorpay.”

1. Open [https://dashboard.razorpay.com](https://dashboard.razorpay.com) and switch **Test Mode** on (toggle in the sidebar).
2. **Account & Settings → API Keys → Generate Test Keys.** Copy Key ID (`rzp_test_…`) and Key Secret once. Put in `.env` as `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
3. **Developers → Webhooks → Add webhook.**
   - URL: `https://<deploy>/api/webhooks/razorpay` (ask human for deploy URL; locally they create an ngrok/Cloudflare tunnel and paste that).
   - Secret: generate/copy into `RAZORPAY_WEBHOOK_SECRET`.
   - Active events: `payment.captured`, `payment.failed`, `order.paid`.
4. Confirm they can see **Orders** and **Payments** in Test Mode for the camera shot.
5. Test pay methods to tell them:
   - UPI: `success@razorpay` (success), `failure@razorpay` (failure)
   - Test cards from Razorpay docs (do not invent card numbers if unsure; link the official test-card page)
6. After first successful `createOrder` from our script, tell them: “Refresh Dashboard → Orders. You should see `order_…`. Reply with the id if it appeared.”

Do not proceed to P10 narration until they confirm they saw the id.

### Database / Vercel — what to ask

- Local: “No action. I will create `dev.db` via `npx prisma migrate dev`.”
- Deploy: “Create a free Neon project → copy pooled `DATABASE_URL` → add it in Vercel env + local `.env`. Also add all Razorpay and Gemini vars in Vercel. Then I need you to trigger a deploy.”
- Prisma: ask permission before `prisma migrate deploy` against Neon.

### Rules for keys

- `.env` is gitignored. `.env.example` has empty names only.
- Never print full secrets back in chat. You may echo prefixes (`rzp_test_`, `AIza`) to confirm format.
- Never commit `.env`, `dev.db`, service-account JSON.
- If the human says keys are in `.env`, read the file locally if the environment allows; do not ask them to re-paste into the transcript.
- Wrong key type (live `rzp_live_`): refuse to use it for this repo. Ask them to switch Test Mode on and generate test keys.

### If they are blocked

Keep moving on P0–P2 (catalog, policy, tests, schemas). Write the Razorpay/Gemini modules to read env and **throw a clear error** if unset. Do not implement a demo happy path that returns fake ids while waiting.

---

## 1. Build order (mandatory)

Do not skip ahead. Do not start `app/page.tsx` polish before T13-equivalent exists.

| Phase | Build | Done when | Forbidden until done |
| --- | --- | --- | --- |
| P0 | Repo, env, Prisma, `lib/money.ts` | `npm run dev` boots; paise helpers unit-tested | UI chrome |
| P1 | Catalog | `search` / `get` return canonical SKUs from `data/catalog.json` | Buyer loop |
| P2 | Policy engine | Vitest covers amount, qty, category, expiry | Gemini |
| P3 | Razorpay adapter | **You** created a Test Mode `order_` in Dashboard with a script or route | Checkout UI |
| P4 | Intent compiler | Gemini + Zod; invalid JSON retries once then rejects | Gateway |
| P5 | Persist intent / session / expiry / nonce | DB rows exist; expiry blocks | Agent |
| P6 | Buyer tool loop | 4 tools only; `request_checkout` hits gateway | Razorpay from agent |
| P7 | `decide.ts` L1+L2 | Deterministic BLOCK works with zero Razorpay calls | Judge |
| P8 | Semantic judge | Canonical fields only; description never in prompt payload | Checkout |
| P9 | ALLOW → `POST /v1/orders` | Real `order_` returned | Fancy demo |
| P10 | Checkout.js + signature verify | Real `pay_` in Dashboard | Webhook polish |
| P11 | Webhook raw-body HMAC + event-id dedupe | Event row stored | Reconcile |
| P12 | Reconcile poll | `WEBHOOK_FORCE_FAIL` + poll recovers same IDs, no second order | Eval UI |
| P13 | Eval generator + runner | 240 cases, no Razorpay in default run, empty metrics until run | Pitch video |
| P14 | Thin demo UI | One page that reads **real** state | Visual redesign |
| P15 | README + limitations | Clone in 15 minutes | Extra features |

If time dies, cut in `product.md` cut-first order. Never cut P3, P7, P9, P10, P11, P12, P13.

---

## 2. No-fake rules

These are disqualifying if broken.

### Payments

- Do not invent `order_`, `pay_`, or `plink_` strings.
- Do not persist a payment as captured unless Razorpay said so (checkout verify or webhook or poll).
- Do not use a mock adapter in `NODE_ENV=production` or in the demo deploy.
- A test double is allowed **only** in Vitest, behind an explicit interface, never imported by `app/` demo routes.
- `--live-smoke` max 5 real Orders. Default eval creates **zero** Orders.

### Models

- Do not stub Gemini in the demo deploy.
- Do not hardcode intent JSON for the happy-path demo while claiming the compiler ran.
- Fixtures for eval classes A–H are generated data, not “the live demo.”
- If Gemini is down, the UI shows the error. It does not silently use a canned contract.

### Webhooks

- Do not `fetch('/api/webhooks/razorpay')` from the client to simulate Razorpay.
- `WEBHOOK_FORCE_FAIL=true` must make the **route** fail so Razorpay retries / you reconcile. It is not a CSS state.
- Signature must be verified on the **raw body**. Parsing JSON first and resigning is fake security.

### Metrics

- UI tables start empty or show `NOT RUN`.
- Do not ship `99%` in README or UI unless `data/eval_results.json` exists and was produced by `npx tsx scripts/run_eval.ts`.
- TARGET ≠ measured. Label them.

### Identity / protocols / MCP

- Do not add Ed25519, PKI, UAP, AP2, ACP, x402, or MCP clients “to look complete.”
- Do not leave `TODO: call Razorpay` in a function the demo can reach.

---

## 3. Definition of “working”

A layer is working only if all of the following are true:

1. Typecheck passes: `npx tsc --noEmit`
2. Relevant Vitest passes
3. You can demonstrate it without touching source mid-demo
4. Failure mode is explicit (reason code or thrown typed error), not `undefined`

P3 working means: Razorpay Dashboard shows an order you created from this repo with `rzp_test_` keys.

P10 working means: Dashboard shows `captured` (or documented test success state) for that order after Checkout.

P12 working means: same `order_` / `pay_`, webhook path failed, reconcile succeeded, orders table has one row not two.

---

## 4. TypeScript and project hygiene

- TypeScript `strict` on. No `any` unless you are typing an untyped SDK boundary, and then wrap it immediately.
- Prefer `unknown` + Zod parse over `as Foo`.
- No `as any` to silence Razorpay or Gemini types.
- Public functions have explicit return types.
- One module, one job. `decide.ts` does not talk HTTP. `client.ts` does not decide policy. Routes do not embed policy ifs.
- Do not create god files over ~300 lines. Split.
- Do not install a package to avoid writing 30 lines. Allowed deps are those in `product.md` plus tiny utilities (`nanoid` / `zod` already assumed).
- Do not add LangChain, LangGraph, LlamaIndex, CrewAI, AutoGen, Redis, Bull, Pinecone, Clerk, NextAuth.
- Do not add a Python service.
- Delete dead code and commented-out experiments before moving on.
- Do not leave `console.log` of payloads that may contain secrets. Structured logs: ids, reason codes, latency. Never keys.

### Money

```ts
// rupees in UI and intent JSON
// paise at Razorpay boundary only
export const toPaise = (inr: number) => Math.round(inr * 100)
export const fromPaise = (paise: number) => paise / 100
```

Never send `7499` as Razorpay `amount` when you mean ₹7,499. Tests must lock this.

### IDs

Prefix: `int_`, `sess_`, `cart_`, `auth_`. Razorpay ids stay Razorpay ids. Do not mint fake Razorpay prefixes.

---

## 5. Zod and Gemini

- Every model output goes through a Zod schema. No “looks like JSON.”
- One retry on parse failure. Then `INVALID_INTENT` / `STEP_UP` / `BLOCK` as specified.
- Prompts live in the module that calls Gemini, as named constants, not scattered in routes.
- Judge payload builder must omit `description`. Add a unit test that `JSON.stringify(judgeInput).includes('description') === false` even when the SKU has a poisoned description.
- Buyer tools are a fixed union type. No dynamic tool registry.
- Max 8 buyer turns. Loop must terminate.
- Cap eval concurrency (start at 3). Do not fire 240 Gemini calls at once.
- Timeouts on Gemini and Razorpay HTTP. No hung request that looks like ALLOW.

---

## 6. Authorization boundary

`lib/gateway/decide.ts` is sacred.

```text
L1 session / expiry / merchant / replay
L2 policy (amount, qty, category, canonical SKU)
L3 semantic judge
L4 ALLOW | STEP_UP | BLOCK
```

Rules:

- Policy failure must not call the judge (save quota, keep the story clean).
- Judge failure / low confidence cannot override a policy BLOCK.
- `ALLOW` is the only case that calls `createOrder`.
- `STEP_UP` stores a pending authorization. Approve endpoint re-checks expiry, then creates the order. It does not skip L1/L2.
- Grep before PR-equivalent finish: `createOrder`, `orders.create`, `POST /v1/orders` may appear only in `lib/razorpay/**` and only invoked from gateway ALLOW / approve-after-STEP_UP.

Replay key: `intent_id + sha256(canonical_cart_json)`.

Canonical cart is server-re-fetched SKUs, not agent-supplied price.

---

## 7. Razorpay

- Test keys only (`rzp_test_`). Refuse to boot live keys in this submission.
- Server uses key id + secret. Browser gets **only** `NEXT_PUBLIC_RAZORPAY_KEY_ID`.
- Create order amount from canonical cart, never from the model.
- Verify checkout signature on the server before trusting `pay_`.
- Webhook: read raw body. Next.js App Router: do not `await request.json()` before verify. Use `await request.text()`, verify, then `JSON.parse`.
- Persist `x-razorpay-event-id` uniquely **before** side effects.
- Treat webhooks as at-least-once and unordered. After an event, fetch current order/payment state if it matters.
- Idempotent create: if the idempotency row exists, return existing `order_id`.
- Compensation refund is not a buyer tool and not a demo requirement. If implemented, use `X-Refund-Idempotency`.
- Log Razorpay error bodies (safe fields) when create/fetch fails. Do not swallow.

### Local / Vercel webhook

- Prefer deployed Vercel URL for the recorded demo.
- `WEBHOOK_FORCE_FAIL` is an env or explicit header/flag checked **inside** the webhook route after signature verify (or before, if you document that forced fail still returns 500 to Razorpay). Forced fail must not mark payment captured locally.

---

## 8. Data and Prisma

- Local: SQLite `file:./dev.db`. Prod: Neon via `DATABASE_URL`.
- Schema lives in `prisma/schema.prisma`. Migrate; do not hand-edit prod DB.
- `audit_logs` is append-only. No update/delete in application code.
- Do not store raw card data. Razorpay handles cards.
- Do not store Gemini or Razorpay secrets in tables.
- Seed script creates merchant, policy, catalog-backed demo data.
- If Prisma friction blocks P3, you may use a thin SQL helper **without changing product**. Do not stall a week on ORM aesthetics.

---

## 9. Tests (non-negotiable)

Run `npx vitest` before you call a phase done.

Minimum files:

- `tests/money.test.ts` — paise
- `tests/policy.test.ts` — amount, qty, category, expiry
- `tests/intent-schema.test.ts` — reject raised budget / missing fields
- `tests/judge-payload.test.ts` — no description field
- `tests/decide.test.ts` — BLOCK does not invoke a razorpay mock; ALLOW does
- `tests/idempotency.test.ts` — same intent+cart → one order factory call
- `tests/webhook-verify.test.ts` — bad signature rejected; duplicate event id ignored
- `tests/reconcile.test.ts` — timeout path does not create a second order

Do not test only the happy path. A policy engine with no fail cases is unfinished.

You may mock Gemini and Razorpay **in unit tests**. You may not mock them in the deployed demo.

---

## 10. API routes

- Validate bodies with Zod at the route edge.
- Return JSON errors `{ error, reason_code? }`. No stack traces to the client.
- `POST /api/webhooks/razorpay` returns 200 for duplicates after persist-check, 400 for bad signature, 500 when `WEBHOOK_FORCE_FAIL` is on.
- `POST /api/eval/run` never calls Razorpay.
- Keep routes thin: parse → call lib → map result.

---

## 11. UI rules (only after P12)

The first UI is a single demo page that binds to real endpoints.

Must show:

- raw intent text
- parsed contract
- cart vs contract
- pipeline lights driven by **actual** decision records
- reason code
- `order_` / `pay_` or the literal `NOT CREATED`
- audit list from DB
- Approve button only when status is `STEP_UP`
- metrics panel reads `data/eval_results.json` or `/api/eval/results`, else `NOT RUN`

Must not:

- hardcode green checkmarks
- animate a fake 4-layer pipeline on a timer
- hide errors
- require a design system binge

No extra pages until the one page is honest.

---

## 12. Git and files

- Small commits by phase: `feat(policy): block over-budget carts`
- Do not commit `.env`, `dev.db`, `node_modules`, eval result secrets.
- Do commit `.env.example`, `data/catalog.json`, generated **fixtures** if they contain no secrets.
- Do not commit 20 unused shadcn components.
- README setup must be commands you have run yourself.

---

## 13. README honesty

Required sections exist in `product.md`. In README:

- Test Mode, not “we charged the customer”
- TARGET vs measured
- limitations
- what broke
- exact local commands you verified

If a command is in README and fails on a clean clone, the README is wrong. Fix it before adding features.

---

## 14. Agent behavior while coding

When implementing:

1. Read `product.md` section for the current phase. Implement only that.
2. Write or update tests first or immediately after the function, not after the whole app.
3. Run the smallest verification command.
4. If Razorpay/Gemini/DB/Vercel credentials or dashboard steps are missing, emit the SETUP BLOCK from §0.2 and stop that path. Do not stub the demo path. Do not invent keys.
5. If a requirement is ambiguous, choose the fail-closed option and note it in a short comment + audit reason code.
6. Do not reopen stack, track, MCP, crypto, or Payment-Links-as-primary **unless you first send a CHANGE PROPOSAL and get YES**.
7. Do not “improve” the product with extra agents, memory, embeddings, or multi-merchant.
8. After each phase, print: what command proved it, what reason codes fire, what is still stubbed (must be nothing on the money path).
9. If you believe a product decision in `product.md` is wrong, stop coding that part. Send the proof block. Wait. Do not silently diverge.

---

## 15. Stop-the-line conditions

Stop and fix before any new feature if:

- `tsc` fails
- policy tests fail
- createOrder is reachable from the buyer module
- judge payload includes `description`
- eval default path calls Razorpay
- webhook verifies parsed JSON instead of raw text
- UI shows a captured payment that Dashboard does not have
- metrics are hardcoded

---

## 16. Phase verification cheatsheet

```bash
npx tsc --noEmit
npx vitest run
npx tsx scripts/seed.ts
npx tsx scripts/create_test_order.ts          # P3: must appear in Dashboard
npx tsx scripts/generate_eval.ts
npx tsx scripts/run_eval.ts                   # no Orders
npx tsx scripts/run_eval.ts --live-smoke      # ≤5, optional
```

Happy-path manual:

1. `POST /api/intents` with the headphones sentence
2. run buyer or tools until `propose_cart` + `request_checkout`
3. receive `order_`
4. pay with test UPI `success@razorpay` or test card
5. confirm Dashboard
6. propose ₹13,999 → `MAX_AMOUNT_EXCEEDED`, no new order
7. child + no screen + tablet → `SEMANTIC_MISMATCH`, no new order
8. `WEBHOOK_FORCE_FAIL=true`, pay, reconcile, one order

---

## 17. What “good engineering” means here

Good is not more abstractions. Good is:

- a reason code a stranger can read
- a state machine that cannot double-charge
- a webhook you can kill without lying
- tests that fail when someone wires the buyer to `createOrder`
- a clone path that works

Build the cashier-less gateway until it is boring and true. Then wrap a thin UI around it.
