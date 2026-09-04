import { NextResponse } from "next/server"
import { reconcileOrder } from "@/reconciliation/reconcile"
import { RazorpayApiError } from "@/razorpay/orders"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  try {
    const result = await reconcileOrder(id)
    return NextResponse.json({
      status: result.status,
      razorpay_order_id: result.razorpayOrderId,
      payments: result.payments,
      reason_code: result.reasonCode,
    })
  } catch (err) {
    if (err instanceof RazorpayApiError) {
      return NextResponse.json({ error: "RAZORPAY_API_ERROR" }, { status: 502 })
    }
    return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 })
  }
}
