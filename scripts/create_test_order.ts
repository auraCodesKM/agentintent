// P3 proof: create ONE real Razorpay Test Mode Order and print its id.
// Not part of the demo path. Run manually: npx tsx scripts/create_test_order.ts
process.loadEnvFile(".env")

import { createOrder } from "../src/razorpay/orders"

async function main(): Promise<void> {
  const order = await createOrder({
    subtotalInr: 1, // ₹1 smoke order
    receipt: `p3_smoke_${Date.now()}`,
    notes: { purpose: "P3 adapter smoke test" },
  })
  console.log("created:", order.razorpayOrderId)
  console.log("amount paise:", order.amountPaise, "status:", order.status)
  console.log("Check Dashboard (Test Mode) → Orders. It should show this order id.")
}

main().catch((err) => {
  console.error("create_test_order failed:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
