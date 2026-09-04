import { NextResponse } from "next/server"
import { getAuditTimeline } from "@/audit/logger"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ intentId: string }> },
): Promise<NextResponse> {
  const { intentId } = await params
  const events = await getAuditTimeline(intentId)
  return NextResponse.json({
    events: events.map((e) => ({
      event_type: e.eventType,
      reason_code: e.reasonCode,
      actor: e.actor,
      created_at: e.createdAt.toISOString(),
      metadata: JSON.parse(e.metadataJson) as Record<string, unknown>,
    })),
  })
}
