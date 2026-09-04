import { prisma } from "@/lib/db"
import { audit } from "@/audit/logger"
import { fetchOrder, fetchOrderPayments } from "@/razorpay/orders"
import { applyPaymentState } from "@/webhooks/handler"

export interface ReconcileResult {
  status: "RECONCILED" | "NO_PAYMENTS"
  razorpayOrderId: string
  payments: { id: string; status: string }[]
  reasonCode: "WEBHOOK_TIMEOUT_RECONCILED" | null
}

/**
 * Webhook-failure recovery: poll Razorpay for the order's true state.
 * Never creates a new Order — only observes and applies existing state.
 */
export async function reconcileOrder(razorpayOrderId: string): Promise<ReconcileResult> {
  const local = await prisma.razorpayOrder.findUnique({ where: { razorpayOrderId } })
  if (!local) throw new Error(`unknown order ${razorpayOrderId}`)

  const remote = await fetchOrder(razorpayOrderId)
  const payments = await fetchOrderPayments(razorpayOrderId)

  for (const p of payments) {
    await applyPaymentState({
      razorpayPaymentId: p.id,
      razorpayOrderId,
      amountPaise: p.amountPaise,
      status: p.status,
      method: p.method,
      source: "reconcile",
    })
  }

  const reconciled = payments.length > 0
  if (reconciled) {
    await audit({
      eventType: "WEBHOOK_TIMEOUT_RECONCILED",
      actor: "gateway",
      intentId: local.intentId,
      reasonCode: "WEBHOOK_TIMEOUT_RECONCILED",
      metadata: {
        razorpay_order_id: razorpayOrderId,
        remote_status: remote.status,
        payments: payments.length,
      },
    })
  }

  return {
    status: reconciled ? "RECONCILED" : "NO_PAYMENTS",
    razorpayOrderId,
    payments: payments.map((p) => ({ id: p.id, status: p.status })),
    reasonCode: reconciled ? "WEBHOOK_TIMEOUT_RECONCILED" : null,
  }
}
