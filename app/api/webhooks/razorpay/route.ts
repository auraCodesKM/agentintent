import { NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/razorpay/verify"
import { processWebhookEvent } from "@/webhooks/handler"
import { audit } from "@/audit/logger"

export async function POST(request: Request): Promise<NextResponse> {
  // Raw body FIRST — signature is computed over exact bytes, never re-serialized JSON.
  const rawBody = await request.text()
  const signature = request.headers.get("x-razorpay-signature")
  const eventId = request.headers.get("x-razorpay-event-id")

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 })
  }

  // Forced-failure demo switch: signature was valid, but processing is unavailable.
  // Returning 500 makes Razorpay retry; local state is NOT updated.
  if (process.env.WEBHOOK_FORCE_FAIL === "true") {
    await audit({
      eventType: "WEBHOOK_FORCED_FAILURE",
      actor: "razorpay",
      metadata: { event_id: eventId ?? "missing" },
    })
    return NextResponse.json({ error: "WEBHOOK_UNAVAILABLE" }, { status: 500 })
  }

  if (!eventId) {
    return NextResponse.json({ error: "MISSING_EVENT_ID" }, { status: 400 })
  }

  const result = await processWebhookEvent(eventId, rawBody)
  if (result.kind === "DUPLICATE") {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }
  return NextResponse.json({ received: true }, { status: 200 })
}
