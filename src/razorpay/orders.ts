import { getRazorpayClient } from "./client"
import { toPaise } from "@/lib/money"

export interface CreatedOrder {
  razorpayOrderId: string
  amountPaise: number
  currency: string
  status: string
}

export interface CreateOrderInput {
  /** Canonical cart subtotal in RUPEES. Converted to paise here, at the boundary. */
  subtotalInr: number
  receipt: string // intent_id
  notes: Record<string, string>
}

const TIMEOUT_MS = 15_000

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ])
}

/**
 * The ONLY function that creates Razorpay Orders.
 * Callable exclusively from the gateway ALLOW / approved-STEP_UP path.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const rzp = getRazorpayClient()
  const amountPaise = toPaise(input.subtotalInr)

  try {
    const order = await withTimeout(
      rzp.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes,
      }),
      "razorpay orders.create",
    )
    return {
      razorpayOrderId: order.id,
      amountPaise: Number(order.amount),
      currency: order.currency,
      status: order.status,
    }
  } catch (err) {
    throw new RazorpayApiError("orders.create failed", err)
  }
}

export async function fetchOrder(razorpayOrderId: string): Promise<{
  id: string
  status: string
  amountPaise: number
  amountPaidPaise: number
}> {
  const rzp = getRazorpayClient()
  try {
    const order = await withTimeout(rzp.orders.fetch(razorpayOrderId), "razorpay orders.fetch")
    return {
      id: order.id,
      status: order.status,
      amountPaise: Number(order.amount),
      amountPaidPaise: Number(order.amount_paid),
    }
  } catch (err) {
    throw new RazorpayApiError("orders.fetch failed", err)
  }
}

export async function fetchOrderPayments(razorpayOrderId: string): Promise<
  { id: string; status: string; amountPaise: number; method: string }[]
> {
  const rzp = getRazorpayClient()
  try {
    const res = await withTimeout(
      rzp.orders.fetchPayments(razorpayOrderId),
      "razorpay orders.fetchPayments",
    )
    return res.items.map((p) => ({
      id: p.id,
      status: p.status,
      amountPaise: Number(p.amount),
      method: p.method,
    }))
  } catch (err) {
    throw new RazorpayApiError("orders.fetchPayments failed", err)
  }
}

export class RazorpayApiError extends Error {
  readonly cause2: unknown
  constructor(message: string, cause: unknown) {
    // Include safe fields from Razorpay error body; never credentials.
    const detail = extractSafeDetail(cause)
    super(detail ? `${message}: ${detail}` : message)
    this.name = "RazorpayApiError"
    this.cause2 = cause
  }
}

function extractSafeDetail(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) {
    const e = err as { error?: { code?: string; description?: string }; statusCode?: number }
    const parts = [e.statusCode, e.error?.code, e.error?.description].filter(Boolean)
    if (parts.length > 0) return parts.join(" ")
  }
  return ""
}
