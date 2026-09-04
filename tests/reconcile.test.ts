import { beforeEach, describe, expect, it, vi } from "vitest"
import { nanoid } from "nanoid"

const fetchOrderMock = vi.fn()
const fetchOrderPaymentsMock = vi.fn()
vi.mock("@/razorpay/orders", () => ({
  fetchOrder: fetchOrderMock,
  fetchOrderPayments: fetchOrderPaymentsMock,
  RazorpayApiError: class RazorpayApiError extends Error {},
}))

process.env.DATABASE_URL = "file:./dev.db"

const { reconcileOrder } = await import("@/reconciliation/reconcile")
const { prisma } = await import("@/lib/db")

describe("reconciliation", () => {
  const razorpayOrderId = `order_recon_${nanoid(8)}`
  const paymentId = `pay_recon_${nanoid(8)}`

  beforeEach(async () => {
    fetchOrderMock.mockReset()
    fetchOrderPaymentsMock.mockReset()
    await prisma.razorpayOrder.deleteMany({ where: { razorpayOrderId } })
    await prisma.payment.deleteMany({ where: { razorpayOrderId } })
    await prisma.razorpayOrder.create({
      data: {
        id: `rzo_${nanoid(12)}`,
        intentId: `int_recon_${nanoid(8)}`,
        cartId: `cart_recon_${nanoid(8)}`,
        idempotencyKey: `recon_${nanoid(12)}`,
        razorpayOrderId,
        amount: 749900,
        currency: "INR",
        status: "CREATED",
      },
    })
  })

  it("recovers captured payment via poll: same order, no second order row", async () => {
    fetchOrderMock.mockResolvedValue({
      id: razorpayOrderId,
      status: "paid",
      amountPaise: 749900,
      amountPaidPaise: 749900,
    })
    fetchOrderPaymentsMock.mockResolvedValue([
      { id: paymentId, status: "captured", amountPaise: 749900, method: "upi" },
    ])

    const result = await reconcileOrder(razorpayOrderId)
    expect(result.status).toBe("RECONCILED")
    expect(result.reasonCode).toBe("WEBHOOK_TIMEOUT_RECONCILED")
    expect(result.payments).toEqual([{ id: paymentId, status: "captured" }])

    const orderRows = await prisma.razorpayOrder.count({ where: { razorpayOrderId } })
    expect(orderRows).toBe(1)
    const order = await prisma.razorpayOrder.findUnique({ where: { razorpayOrderId } })
    expect(order?.status).toBe("PAID")
    const payment = await prisma.payment.findUnique({ where: { razorpayPaymentId: paymentId } })
    expect(payment?.status).toBe("captured")
  })

  it("amount mismatch is flagged, order NOT marked paid", async () => {
    fetchOrderMock.mockResolvedValue({
      id: razorpayOrderId,
      status: "attempted",
      amountPaise: 749900,
      amountPaidPaise: 100,
    })
    fetchOrderPaymentsMock.mockResolvedValue([
      { id: paymentId, status: "captured", amountPaise: 100, method: "upi" },
    ])

    await reconcileOrder(razorpayOrderId)
    const order = await prisma.razorpayOrder.findUnique({ where: { razorpayOrderId } })
    expect(order?.status).toBe("CREATED") // not PAID
    const mismatchAudit = await prisma.auditLog.findFirst({
      where: { reasonCode: "PAYMENT_AMOUNT_MISMATCH", metadataJson: { contains: paymentId } },
    })
    expect(mismatchAudit).not.toBeNull()
  })

  it("no payments yet → NO_PAYMENTS, nothing invented", async () => {
    fetchOrderMock.mockResolvedValue({
      id: razorpayOrderId,
      status: "created",
      amountPaise: 749900,
      amountPaidPaise: 0,
    })
    fetchOrderPaymentsMock.mockResolvedValue([])

    const result = await reconcileOrder(razorpayOrderId)
    expect(result.status).toBe("NO_PAYMENTS")
    expect(result.reasonCode).toBeNull()
    const payments = await prisma.payment.count({ where: { razorpayOrderId } })
    expect(payments).toBe(0)
  })
})
