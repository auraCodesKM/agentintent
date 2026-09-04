import { NextResponse } from "next/server"
import { z } from "zod"
import { requestCheckout } from "@/gateway/decide"

const BodySchema = z.object({
  intent_id: z.string().min(1),
  cart_id: z.string().min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })

  const decision = await requestCheckout(parsed.data.intent_id, parsed.data.cart_id)
  return NextResponse.json({
    decision: decision.decision,
    reason_codes: decision.reason_codes,
    authorization_id: decision.authorization_id,
    razorpay_order_id: decision.razorpay_order_id,
    semantic_confidence: decision.semantic_confidence,
  })
}
