# AgentIntent — 5-Minute Pitch Video Shooting Script

Every beat below maps to a real UI action on `http://localhost:3000/demo` (plus one Test Mode checkout page and the Razorpay Dashboard). No invented ids, no invented numbers. Every artifact quoted here is copied from `HANDOFF.md` or `README.md`.

Total runtime target: **5:00**. Timing budget sums to 5:00 exactly; treat each beat as a soft target and trim narration, not clicks, if you run long.

---

## Pre-flight checklist (do this before hitting record)

- [ ] `npm run dev` running, `http://localhost:3000/demo` loads with no console errors
- [ ] Database seeded (`npm run seed` has been run against the current `dev.db`)
- [ ] `.env` has `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` set to the two working lite tiers (per `HANDOFF.md`: `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite` — 500 RPD each on this key; do not switch to `gemini-3.8-flash` or `gemini-2.5-flash`, both are quota-dead on this key)
- [ ] `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` are Test Mode keys (`rzp_test_…`)
- [ ] `data/eval_results.json` exists (final calibrated run) so the Evaluation table on `/demo` renders numbers instead of "NOT RUN" — confirm by loading `/demo` once and checking the table appears before recording
- [ ] A second browser tab open on the Razorpay Dashboard → Test Mode → Orders, logged in, ready to refresh on camera
- [ ] Know the Test Mode UPI success handle in advance: `success@razorpay`

---

## Beat 1 — Problem (0:00–0:20, 20s)

**SAY:**
> "There is an AI buyer. There is an AI judge. There is no AI cashier. When an AI agent shops for you, something has to stop it from paying more than you agreed to."

**SHOW:** Title card or the `/demo` page header, which already carries this line verbatim: "There is an AI buyer. There is an AI judge. There is no AI cashier."

**CLICK:** none yet — just load `/demo`.

---

## Beat 2 — Happy path: real order + real payment (0:20–1:30, 70s)

**SAY:**
> "The buyer only gets four tools — search, get product, propose cart, request checkout. It never touches Razorpay. The gateway does."

**CLICK:**
1. In the textarea, enter: *"Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only."*
2. Click **Compile intent + run buyer**.

**CAMERA MUST SHOW (as they render on screen, no narration needed over these):**
- The Intent Contract block (`max_amount`, `max_quantity`, `allowed_categories`)
- The Buyer transcript list (`search_catalog`, `get_product`, `propose_cart`)
- The Gateway pipeline lights turning green: L1, L2, L3, and `L4 ALLOW`
- The line `Razorpay Order: <order_id>` with the "open Test Mode checkout →" link

**SAY (while the order id is visible):**
> "That's a real Test Mode order — it exists in the Razorpay Dashboard, not just in our database."

**CLICK:** Cut to the second browser tab (Dashboard → Test Mode → Orders) and show the order in the list — the camera must capture a real order id in the Dashboard, not only on `/demo`.

**CLICK:** Open `/checkout/<order_id>`, click **Pay (Test Mode)**, complete the Razorpay Checkout popup with UPI `success@razorpay`.

**SAY:**
> "This exact flow produced a real captured payment: `pay_TYFtu8vjA3C0iT` against order `order_TYFPRIpLlJeFpf`, ₹7,499, verified by a human end to end."

**CAMERA MUST SHOW:** the `/checkout` page's post-payment result line (`Verified. payment_id=... status=captured`), and — if time allows — the same payment visible on the Dashboard Orders page.

---

## Beat 3 — Amount block (1:30–2:10, 40s)

**SAY:**
> "Same buyer, same tools — but now the cart doesn't fit the budget. Watch what does not get created."

**CLICK:** Enter a request with the same ₹8,000 ceiling but that steers the buyer toward the ₹13,999 headphones SKU (e.g. *"Buy me the best noise-cancelling headphones you can find, under ₹8,000."* if the buyer over-proposes, or directly script the ₹13,999 item into the request). Click **Compile intent + run buyer**.

**CAMERA MUST SHOW:**
- The Gateway pipeline: `L2 policy` light turns red
- Reason code line reading `MAX_AMOUNT_EXCEEDED`
- The line `Razorpay Order:` followed by **`NOT CREATED`** in red

**SAY:**
> "Reason code `MAX_AMOUNT_EXCEEDED`. Zero Razorpay objects were created for this cart — the block happens before any API call to Razorpay."

**CLICK:** Point the cursor at the audit timeline table underneath and let it sit for a beat — the row with the reason code is the proof, not a claim.

---

## Beat 4 — Ambiguity: STEP_UP then approve (2:10–3:10, 60s)

**SAY:**
> "Not everything is a clean allow or a clean block. An ambiguous request gets escalated to a human, not silently approved."

**CLICK:** Enter an ambiguous, low-confidence request (the verified live run used an intent that produced `SEMANTIC_LOW_CONFIDENCE` at confidence 0.65 — intent `int_xPYdW5_CoRiN`). Click **Compile intent + run buyer**.

**CAMERA MUST SHOW:**
- `L3 semantic` light in amber/warn state
- Decision line: `L4 STEP_UP`
- Reason code `SEMANTIC_LOW_CONFIDENCE`, semantic confidence `0.65`
- The **Approve (merchant step-up)** button

**SAY:**
> "The gateway won't guess. It waits for a merchant to approve."

**CLICK:** Click **Approve (merchant step-up)**.

**CAMERA MUST SHOW:** the decision flipping to `ALLOW` with a real order id appearing (the verified live run produced `order_TY6lxvhsKkcaME` from authorization `auth_ec5teAng2qwI`).

**SAY:**
> "One judge call, one merchant click, one real order — never an automatic allow on a guess."

---

## Beat 5 — Architecture, in one breath (3:10–4:10, 60s)

**SAY:**
> "Four layers, in order: session and replay checks, deterministic policy on amount and quantity and category, a semantic judge that never sees free-text product descriptions, then one decision. Only one file in this codebase is allowed to create a Razorpay order — the gateway's decide function. Every other call path is blocked by code review and by a grep in CI. The model proposes. The gateway decides. Only the gateway pays."

**SHOW:** Keep the `/demo` page's Gateway pipeline section on screen (from Beat 4's result) as a visual anchor while narrating; optionally cut briefly to the repo's `src/gateway/decide.ts` file in an editor to show it exists as a single named file, without reading code aloud.

**CLICK:** none required — this beat is narration over the existing screen state.

---

## Beat 6 — Evaluation evidence (4:10–4:50, 40s)

**SAY:**
> "We didn't eyeball this. Two hundred forty test cases, held-out split scored blind, zero calls to Razorpay."

**CLICK:** Scroll `/demo` down to the **Evaluation (offline, zero Razorpay calls)** table.

**CAMERA MUST SHOW:** the rendered table with all four splits, specifically the held-out row: 120 cases, 100% accuracy, 100% policy, 100% semantic, 0 false blocks (₹0), 0 unauthorized allows, 2.5% step-up rate.

**SAY:**
> "Zero false blocks, zero unauthorized allows, on the held-out split. Latency numbers on this table include our own rate-limit pacing waits, not raw model latency — we're not hiding that."

---

## Beat 7 — Close (4:50–5:00, 10s)

**SAY:**
> "There is an AI buyer. There is an AI judge. There is no AI cashier."

**SHOW:** Return to the `/demo` header line, hold for the last few seconds, cut.

---

## Timing summary

| Beat | Window | Duration |
| --- | --- | --- |
| 1. Problem | 0:00–0:20 | 0:20 |
| 2. Happy path + real payment | 0:20–1:30 | 1:10 |
| 3. Amount block | 1:30–2:10 | 0:40 |
| 4. Ambiguity STEP_UP → approve | 2:10–3:10 | 1:00 |
| 5. Architecture | 3:10–4:10 | 1:00 |
| 6. Evaluation table | 4:10–4:50 | 0:40 |
| 7. Close | 4:50–5:00 | 0:10 |
| **Total** | | **5:00** |

## Artifacts referenced in this script (all from HANDOFF.md — none invented)

- Real order (e2e ALLOW): `order_TY5hXZ5ygDvkdO`
- Real captured payment: `pay_TYFtu8vjA3C0iT` for `order_TYFPRIpLlJeFpf`, ₹7,499, via `/checkout` + UPI `success@razorpay`
- STEP_UP → approve chain: intent `int_xPYdW5_CoRiN` → `SEMANTIC_LOW_CONFIDENCE` (confidence 0.65) → authorization `auth_ec5teAng2qwI` → approved → `order_TY6lxvhsKkcaME`
- Eval: 240/240 cases generated, held-out split (120 cases) 100% accuracy / 100% policy / 100% semantic / 0 false blocks (₹0) / 0 unauthorized allows / 2.5% step-up rate, run `2026-09-04T21:23Z`, judge model `gemini-3.5-flash-lite`
