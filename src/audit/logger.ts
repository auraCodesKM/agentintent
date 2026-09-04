import { prisma } from "@/lib/db"
import { nanoid } from "nanoid"

export type AuditActor = "user" | "agent" | "gateway" | "razorpay"

/** Append-only. No update/delete API exists on purpose. */
export async function audit(event: {
  eventType: string
  actor: AuditActor
  sessionId?: string
  intentId?: string
  reasonCode?: string
  metadata?: Record<string, string | number | boolean | null>
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: `aud_${nanoid(12)}`,
      eventType: event.eventType,
      actor: event.actor,
      sessionId: event.sessionId ?? null,
      intentId: event.intentId ?? null,
      reasonCode: event.reasonCode ?? null,
      metadataJson: JSON.stringify(event.metadata ?? {}),
    },
  })
}

export async function getAuditTimeline(intentId: string): Promise<
  { eventType: string; reasonCode: string | null; actor: string; createdAt: Date; metadataJson: string }[]
> {
  return prisma.auditLog.findMany({
    where: { intentId },
    orderBy: { createdAt: "asc" },
    select: { eventType: true, reasonCode: true, actor: true, createdAt: true, metadataJson: true },
  })
}
