// P6-P9 proof: real Gemini buyer + real judge + real Razorpay Test Mode order.
// Creates at most 1 real Order. Also proves two BLOCK paths create zero orders.
process.loadEnvFile(".env")

import { prisma } from "../src/lib/db"
import { createIntent, createSession, proposeCart } from "../src/gateway/session"
import { runBuyer } from "../src/agent/buyer"
import { requestCheckout } from "../src/gateway/decide"
import { getAuditTimeline } from "../src/audit/logger"

async function main(): Promise<void> {
  const ordersBefore = await prisma.razorpayOrder.count()

  // --- 1. Happy path: buyer loop end-to-end ---
  const { sessionId } = await createSession()
  const intent = await createIntent(
    sessionId,
    "Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only. Prefer black.",
  )
  console.log("[happy] intent:", intent.intent_id)

  const run = await runBuyer(intent.intent_id)
  console.log("[happy] buyer status:", run.status, "turns:", run.turns)
  for (const t of run.transcript) {
    console.log("  tool:", t.action.tool, JSON.stringify(t.action.args))
  }
  console.log("[happy] decision:", JSON.stringify(run.decision))

  // --- 2. Amount block: ₹13,999 against ₹8,000 intent ---
  const cart2 = await proposeCart(intent.intent_id, [{ sku: "HP-005", quantity: 1 }])
  const block1 = await requestCheckout(intent.intent_id, cart2.cartId)
  console.log("[amount-block] decision:", block1.decision, block1.reason_codes.join(","), "order:", block1.razorpay_order_id)

  // --- 3. Semantic block: tablet for screen-free kid gift ---
  const intent2 = await createIntent(
    sessionId,
    "Birthday gift for an 8-year-old. Nothing with a screen. Under ₹2,000.",
  )
  const cart3 = await proposeCart(intent2.intent_id, [{ sku: "TB-001", quantity: 1 }]) // KidsTab ₹1,799
  const block2 = await requestCheckout(intent2.intent_id, cart3.cartId)
  console.log(
    "[semantic-block] decision:", block2.decision,
    block2.reason_codes.join(","),
    "confidence:", block2.semantic_confidence,
    "order:", block2.razorpay_order_id,
  )

  const ordersAfter = await prisma.razorpayOrder.count()
  console.log("[orders] created during smoke:", ordersAfter - ordersBefore)

  console.log("\n[audit] timeline for happy intent:")
  for (const e of await getAuditTimeline(intent.intent_id)) {
    console.log(` ${e.createdAt.toISOString()} ${e.eventType} ${e.reasonCode ?? ""}`)
  }
}

main()
  .catch((err) => {
    console.error("e2e smoke failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
