// P11 proof: POST signed/unsigned webhooks at the running dev server.
// Usage: npx tsx scripts/webhook_route_smoke.ts [baseUrl]
process.loadEnvFile(".env")

import { createHmac } from "node:crypto"

const base = process.argv[2] ?? "http://localhost:3111"
const secret = process.env.RAZORPAY_WEBHOOK_SECRET
if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET missing")

const body = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: `pay_smoke_${Date.now()}`,
        order_id: null, // no local order: state untouched, event still recorded
        amount: 100,
        status: "captured",
      },
    },
  },
})
const signature = createHmac("sha256", secret).update(body).digest("hex")
const eventId = `evt_smoke_${Date.now()}`

async function post(headers: Record<string, string>): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${base}/api/webhooks/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  })
  return { status: res.status, json: await res.json() }
}

async function main(): Promise<void> {
  const bad = await post({ "x-razorpay-signature": "00".repeat(32), "x-razorpay-event-id": eventId })
  console.log("bad signature ->", bad.status, JSON.stringify(bad.json))

  const good = await post({ "x-razorpay-signature": signature, "x-razorpay-event-id": eventId })
  console.log("valid ->", good.status, JSON.stringify(good.json))

  const dup = await post({ "x-razorpay-signature": signature, "x-razorpay-event-id": eventId })
  console.log("duplicate ->", dup.status, JSON.stringify(dup.json))
}

main().catch((err) => {
  console.error("webhook smoke failed:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
