import { getRazorpayClient } from "./client"
import { RazorpayApiError } from "./orders"

export async function fetchPayment(paymentId: string): Promise<{
  id: string
  orderId: string | null
  status: string
  amountPaise: number
  method: string
}> {
  const rzp = getRazorpayClient()
  try {
    const p = await rzp.payments.fetch(paymentId)
    return {
      id: p.id,
      orderId: p.order_id ?? null,
      status: p.status,
      amountPaise: Number(p.amount),
      method: p.method,
    }
  } catch (err) {
    throw new RazorpayApiError("payments.fetch failed", err)
  }
}
