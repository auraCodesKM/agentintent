import { beforeAll, describe, expect, it } from "vitest"
import { createHmac } from "node:crypto"
import { nanoid } from "nanoid"

process.env.DATABASE_URL = "file:./dev.db"
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret_for_unit_tests"
process.env.RAZORPAY_KEY_SECRET = "test_key_secret_for_unit_tests"

const { verifyWebhookSignature, verifyCheckoutSignature } = await import("@/razorpay/verify")
const { processWebhookEvent } = await import("@/webhooks/handler")
const { prisma } = await import("@/lib/db")

function sign(body: string): string {
  return createHmac("sha256", "test_webhook_secret_for_unit_tests").update(body).digest("hex")
}

describe("webhook signature", () => {
  it("accepts a valid raw-body HMAC", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} })
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })

  it("rejects a bad signature", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} })
    expect(verifyWebhookSignature(body, "deadbeef".repeat(8))).toBe(false)
  })

  it("rejects when body was tampered after signing", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} })
    const sig = sign(body)
    const tampered = body.replace("captured", "failed")
    expect(verifyWebhookSignature(tampered, sig)).toBe(false)
  })
})

describe("checkout signature", () => {
  it("accepts HMAC(order_id|payment_id)", () => {
    const sig = createHmac("sha256", "test_key_secret_for_unit_tests")
      .update("order_abc|pay_xyz")
      .digest("hex")
    expect(
      verifyCheckoutSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: sig,
      }),
    ).toBe(true)
  })

  it("rejects wrong signature", () => {
    expect(
      verifyCheckoutSignature({
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_xyz",
        razorpaySignature: "00".repeat(32),
      }),
    ).toBe(false)
  })
})

describe("webhook event dedupe", () => {
  const eventId = `evt_test_${nanoid(8)}`
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: `pay_test_${nanoid(8)}`,
          order_id: null,
          amount: 100,
          status: "captured",
        },
      },
    },
  })

  beforeAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { razorpayEventId: eventId } })
  })

  it("first delivery processes, second is a duplicate no-op", async () => {
    const first = await processWebhookEvent(eventId, body)
    expect(first.kind).toBe("PROCESSED")

    const second = await processWebhookEvent(eventId, body)
    expect(second.kind).toBe("DUPLICATE")

    const rows = await prisma.webhookEvent.count({ where: { razorpayEventId: eventId } })
    expect(rows).toBe(1)
  })
})
