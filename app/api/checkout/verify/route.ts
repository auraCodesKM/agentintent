import { NextResponse } from "next/server"
import { z } from "zod"
import { verifyCheckoutSignature } from "@/razorpay/verify"
import { fetchPayment } from "@/razorpay/payments"
import { applyPaymentState } from "@/webhooks/handler"
import { audit } from "@/audit/logger"

const BodySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data

  const valid = verifyCheckoutSignature({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  })
  if (!valid) {
    await audit({
      eventType: "CHECKOUT_SIGNATURE_INVALID",
      actor: "razorpay",
      metadata: { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
    })
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 })
  }

  // Trust nothing from the browser beyond the verified triplet: fetch payment from Razorpay.
  const payment = await fetchPayment(razorpay_payment_id)
  const { amountMismatch } = await applyPaymentState({
    razorpayPaymentId: payment.id,
    razorpayOrderId: razorpay_order_id,
    amountPaise: payment.amountPaise,
    status: payment.status,
    method: payment.method,
    source: "checkout",
  })

  if (amountMismatch) {
    return NextResponse.json({ verified: true, warning: "PAYMENT_AMOUNT_MISMATCH" }, { status: 200 })
  }
  return NextResponse.json({ verified: true, payment_id: payment.id, status: payment.status })
}
