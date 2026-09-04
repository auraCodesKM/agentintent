import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const order = await prisma.razorpayOrder.findUnique({ where: { razorpayOrderId: id } })
  if (!order) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 })
  const payment = await prisma.payment.findFirst({
    where: { razorpayOrderId: id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({
    razorpay_order_id: order.razorpayOrderId,
    amount_paise: order.amount,
    currency: order.currency,
    status: order.status,
    payment: payment
      ? { razorpay_payment_id: payment.razorpayPaymentId, status: payment.status }
      : null,
  })
}
