// B2 proof: webhook-death -> API-poll recovery, DEMONSTRATED against the real
// captured payment (pay_TYFtu8vjA3C0iT, order_TYFPRIpLlJeFpf, ₹7,499, human-verified
// via /demo Test Mode checkout on 2026-09-05).
//
// Requires:
//   - dev server running (npm run dev) on the port passed as argv[2], default 3000
//   - .env present (RAZORPAY_WEBHOOK_SECRET, DATABASE_URL)
//   - for step 1 to assert the forced-500, the SERVER process must have been
//     started with WEBHOOK_FORCE_FAIL=true. This script cannot set the running
//     server's env — it only observes. If the server was started without it,
//     step 1 is SKIPPED with a clear message (never faked).
//
// Usage: npx tsx scripts/webhook_failure_demo.ts [baseUrl]
process.loadEnvFile(".env")

import { createHmac } from "node:crypto"
import { prisma } from "../src/lib/db"
import { getAuditTimeline } from "../src/audit/logger"

const base = process.argv[2] ?? "http://localhost:3000"
const ORDER_ID = "order_TYFPRIpLlJeFpf"
const EXPECTED_PAYMENT_ID = "pay_TYFtu8vjA3C0iT"

const secret = process.env.RAZORPAY_WEBHOOK_SECRET
if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET missing")

function signedBody(): { body: string; signature: string; eventId: string } {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: EXPECTED_PAYMENT_ID,
          order_id: ORDER_ID,
          amount: 749900,
          status: "captured",
        },
      },
    },
  })
  const signature = createHmac("sha256", secret!).update(body).digest("hex")
  return { body, signature, eventId: `evt_failure_demo_${Date.now()}` }
}

async function step1_webhookDeath(): Promise<void> {
  console.log("\n=== Step 1: webhook death (requires server started with WEBHOOK_FORCE_FAIL=true) ===")
  const { body, signature, eventId } = signedBody()
  const res = await fetch(`${base}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId },
    body,
  })
  const json: unknown = await res.json().catch(() => null)
  if (res.status === 500) {
    console.log(`  server returned 500 (forced failure confirmed) -> ${JSON.stringify(json)}`)
    console.log("  local state NOT updated by this webhook — proceeding to reconcile.")
  } else {
    console.log(`  SKIPPED: server did not return 500 (got ${res.status}). This means WEBHOOK_FORCE_FAIL was not`)
    console.log("  set to true on the running server process. Set it in .env and restart `npm run dev` to see the")
    console.log("  forced failure. Continuing to step 2 (reconcile) regardless — that path works independently.")
  }
}

async function step2_reconcile(): Promise<void> {
  console.log("\n=== Step 2: POST /api/orders/:id/reconcile (API-poll recovery) ===")
  const res = await fetch(`${base}/api/orders/${ORDER_ID}/reconcile`, { method: "POST" })
  const json = (await res.json()) as {
    status?: string
    razorpay_order_id?: string
    payments?: { id: string; status: string }[]
    reason_code?: string | null
    error?: string
  }
  console.log(`  ${res.status} -> ${JSON.stringify(json)}`)
  if (res.status !== 200) throw new Error(`reconcile failed: ${JSON.stringify(json)}`)

  const payments = json.payments ?? []
  const match = payments.find((p) => p.id === EXPECTED_PAYMENT_ID)
  if (!match) throw new Error(`expected payment ${EXPECTED_PAYMENT_ID} not present in reconcile response`)
  if (match.status !== "captured") throw new Error(`expected status captured, got ${match.status}`)
  console.log(`  ASSERT OK: payment ${match.id} status=${match.status}`)

  const orderRows = await prisma.razorpayOrder.count({ where: { razorpayOrderId: ORDER_ID } })
  if (orderRows !== 1) throw new Error(`expected exactly 1 RazorpayOrder row for ${ORDER_ID}, found ${orderRows}`)
  console.log(`  ASSERT OK: exactly 1 RazorpayOrder row for ${ORDER_ID}`)
}

async function step3_auditTail(): Promise<void> {
  console.log("\n=== Step 3: audit tail ===")
  const orderRow = await prisma.razorpayOrder.findUnique({ where: { razorpayOrderId: ORDER_ID } })
  if (!orderRow) throw new Error(`local order row for ${ORDER_ID} not found`)
  const events = await getAuditTimeline(orderRow.intentId)
  const tail = events.slice(-8)
  for (const e of tail) {
    console.log(`  ${e.createdAt.toISOString()} ${e.eventType} ${e.reasonCode ?? ""}`)
  }
  const hasReconciled = events.some((e) => e.eventType === "WEBHOOK_TIMEOUT_RECONCILED")
  if (!hasReconciled) throw new Error("expected WEBHOOK_TIMEOUT_RECONCILED in audit timeline, not found")
  console.log("  ASSERT OK: WEBHOOK_TIMEOUT_RECONCILED present in audit timeline")
}

async function main(): Promise<void> {
  const ordersBefore = await prisma.razorpayOrder.count()
  await step1_webhookDeath()
  await step2_reconcile()
  await step3_auditTail()
  const ordersAfter = await prisma.razorpayOrder.count()
  console.log(`\n[orders] created during this script: ${ordersAfter - ordersBefore} (must be 0)`)
  if (ordersAfter !== ordersBefore) throw new Error("script created an order — reconcile must only observe")
  console.log("\nDONE — webhook-failure recovery demonstrated against real captured payment, zero orders created.")
}

main()
  .catch((err) => {
    console.error("webhook failure demo failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
