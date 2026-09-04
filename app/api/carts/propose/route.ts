import { NextResponse } from "next/server"
import { z } from "zod"
import { proposeCart, CartError } from "@/gateway/session"

const BodySchema = z.object({
  intent_id: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "INVALID_CART" }, { status: 400 })

  try {
    const cart = await proposeCart(parsed.data.intent_id, parsed.data.items)
    return NextResponse.json({
      cart_id: cart.cartId,
      status: "PROPOSED",
      subtotal: cart.subtotal,
      currency: "INR",
    })
  } catch (err) {
    if (err instanceof CartError) {
      const status = err.code === "SKU_NOT_FOUND" ? 404 : err.code === "INTENT_NOT_FOUND" ? 404 : 409
      return NextResponse.json({ error: err.code }, { status })
    }
    return NextResponse.json({ error: "CART_FAILED" }, { status: 500 })
  }
}
