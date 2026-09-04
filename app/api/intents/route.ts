import { NextResponse } from "next/server"
import { z } from "zod"
import { createIntent, SessionError } from "@/gateway/session"
import { IntentCompilationError } from "@/intent/compiler"

const BodySchema = z.object({
  session_id: z.string().min(1),
  request: z.string().min(3).max(2000),
})

export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })

  try {
    const contract = await createIntent(parsed.data.session_id, parsed.data.request)
    return NextResponse.json({
      intent_id: contract.intent_id,
      contract: {
        currency: contract.currency,
        constraints: contract.constraints,
        preferences: contract.preferences,
      },
      expires_at: contract.expires_at,
    })
  } catch (err) {
    if (err instanceof SessionError) {
      const status = err.code === "SESSION_NOT_FOUND" ? 404 : 409
      return NextResponse.json({ error: err.code }, { status })
    }
    if (err instanceof IntentCompilationError) {
      return NextResponse.json({ error: "INVALID_INTENT", reason_code: "INVALID_INTENT" }, { status: 400 })
    }
    return NextResponse.json({ error: "INTENT_CREATION_FAILED" }, { status: 500 })
  }
}
