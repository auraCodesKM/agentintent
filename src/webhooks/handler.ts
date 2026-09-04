import { nanoid } from "nanoid"
import { prisma } from "@/lib/db"
import { audit } from "@/audit/logger"
import { z } from "zod"

const WebhookPayloadSchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string(),
            order_id: z.string().nullable().optional(),
            amount: z.number(),
            status: z.string(),
            method: z.string().optional(),
          }),
        })
        .optional(),
    })
    .passthrough(),
})

export type WebhookResult =
  | { kind: "PROCESSED" }
  | { kind: "DUPLICATE" }
  | { kind: "IGNORED_EVENT" }

/**
 * Process a signature-verified webhook. Caller has already checked HMAC on raw body.
 * Persists the event id BEFORE side effects; duplicates are no-ops.
 * Treats delivery as at-least-once and unordered: payment state is taken from the
 * event entity but amount mismatches are flagged, never silently accepted.
 */
export async function processWebhookEvent(eventId: string, rawBody: string): Promise<WebhookResult> {
  const existing = await prisma.webhookEvent.findUnique({ where: { razorpayEventId: eventId } })
  if (existing) {
    await audit({
      eventType: "DUPLICATE_WEBHOOK",
      actor: "razorpay",
      reasonCode: "DUPLICATE_WEBHOOK",
      metadata: { event_id: eventId },
    })
    return { kind: "DUPLICATE" }
  }

  const parsed = WebhookPayloadSchema.safeParse(JSON.parse(rawBody))
  const eventType = parsed.success ? parsed.data.event : "unknown"

  await prisma.webhookEvent.create({
    data: {
      id: `wh_${nanoid(12)}`,
      razorpayEventId: eventId,
      eventType,
      signatureValid: true,
      payload: rawBody,
      processed: false,
    },
  })

  if (!parsed.success) return { kind: "IGNORED_EVENT" }

  const relevant = ["payment.captured", "payment.failed", "order.paid"]
  if (!relevant.includes(parsed.data.event)) {
    await markProcessed(eventId)
    return { kind: "IGNORED_EVENT" }
  }

  const payment = parsed.data.payload.payment?.entity
  if (payment?.order_id) {
    await applyPaymentState({
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amountPaise: payment.amount,
      status: payment.status,
      method: payment.method ?? null,
      source: "webhook",
    })
  }

  await markProcessed(eventId)
  await audit({
    eventType: "WEBHOOK_VERIFIED",
    actor: "razorpay",
    metadata: { event_id: eventId, event: parsed.data.event },
  })
  return { kind: "PROCESSED" }
}

async function markProcessed(eventId: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { razorpayEventId: eventId },
    data: { processed: true },
  })
}

/** Shared by webhook path and reconcile path. Validates amount against the local Order. */
export async function applyPaymentState(input: {
  razorpayPaymentId: string
  razorpayOrderId: string
  amountPaise: number
  status: string
  method: string | null
  source: "webhook" | "reconcile" | "checkout"
}): Promise<{ amountMismatch: boolean }> {
  const order = await prisma.razorpayOrder.findUnique({
    where: { razorpayOrderId: input.razorpayOrderId },
  })

  const amountMismatch = order !== null && order.amount !== input.amountPaise
  if (amountMismatch) {
    await audit({
      eventType: "PAYMENT_AMOUNT_MISMATCH",
      actor: "razorpay",
      intentId: order?.intentId,
      reasonCode: "PAYMENT_AMOUNT_MISMATCH",
      metadata: {
        expected_paise: order?.amount ?? null,
        observed_paise: input.amountPaise,
        payment_id: input.razorpayPaymentId,
        source: input.source,
      },
    })
  }

  await prisma.payment.upsert({
    where: { razorpayPaymentId: input.razorpayPaymentId },
    update: { status: input.status },
    create: {
      id: `pmt_${nanoid(12)}`,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      amount: input.amountPaise,
      status: input.status,
      method: input.method,
    },
  })

  if (order && input.status === "captured" && !amountMismatch) {
    await prisma.razorpayOrder.update({
      where: { razorpayOrderId: input.razorpayOrderId },
      data: { status: "PAID" },
    })
    await audit({
      eventType: "PAYMENT_CAPTURED",
      actor: "razorpay",
      intentId: order.intentId,
      metadata: { payment_id: input.razorpayPaymentId, source: input.source },
    })
  } else if (order && input.status === "failed") {
    await audit({
      eventType: "PAYMENT_FAILED",
      actor: "razorpay",
      intentId: order.intentId,
      metadata: { payment_id: input.razorpayPaymentId, source: input.source },
    })
  }

  return { amountMismatch }
}
