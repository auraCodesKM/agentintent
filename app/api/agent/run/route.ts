import { NextResponse } from "next/server"
import { z } from "zod"
import { runBuyer } from "@/agent/buyer"

const BodySchema = z.object({ intent_id: z.string().min(1) })

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })

  try {
    const run = await runBuyer(parsed.data.intent_id)
    return NextResponse.json({
      status: run.status,
      turns: run.turns,
      cart_id: run.cartId,
      decision: run.decision,
      transcript: run.transcript.map((t) => ({ action: t.action, observation: t.observation })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    if (message.includes("not found")) {
      return NextResponse.json({ error: "INTENT_NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ error: "BUYER_RUN_FAILED" }, { status: 500 })
  }
}
