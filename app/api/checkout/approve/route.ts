import { NextResponse } from "next/server"
import { z } from "zod"
import { approveStepUp, ApprovalError } from "@/gateway/decide"

const BodySchema = z.object({ authorization_id: z.string().min(1) })

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })

  try {
    const decision = await approveStepUp(parsed.data.authorization_id)
    return NextResponse.json({
      decision: decision.decision,
      razorpay_order_id: decision.razorpay_order_id,
      authorization_id: decision.authorization_id,
    })
  } catch (err) {
    if (err instanceof ApprovalError) {
      const status = err.code === "AUTHORIZATION_NOT_FOUND" ? 404 : 409
      return NextResponse.json({ error: err.code }, { status })
    }
    return NextResponse.json({ error: "APPROVAL_FAILED" }, { status: 500 })
  }
}
