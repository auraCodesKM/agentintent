import { createHmac, timingSafeEqual } from "node:crypto"

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Standard Checkout success verification: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(input: {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET missing")
  const expected = createHmac("sha256", secret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex")
  return safeEqualHex(expected, input.razorpaySignature)
}

/** Webhook verification over the RAW request body. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET missing")
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  return safeEqualHex(expected, signature)
}
