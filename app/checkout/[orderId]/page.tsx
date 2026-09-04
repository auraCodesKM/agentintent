"use client"

import { use, useEffect, useState } from "react"

// Test Mode checkout page: opens Razorpay Standard Checkout for an authorized Order.
// The browser receives only the public key id, never the secret.

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

interface OrderInfo {
  razorpay_order_id: string
  amount_paise: number
  currency: string
  status: string
  payment: { razorpay_payment_id: string; status: string } | null
}

export default function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params)
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [result, setResult] = useState<string>("")

  useEffect(() => {
    fetch(`/api/orders/${orderId}`)
      .then((r) => r.json())
      .then((data: OrderInfo | { error: string }) => {
        if ("error" in data) setResult(`Error: ${data.error}`)
        else setOrder(data)
      })
      .catch((err: unknown) => setResult(`Error: ${String(err)}`))

    const script = document.createElement("script")
    script.src = "https://checkout.razorpay.com/v1/checkout.js"
    script.onload = () => setScriptReady(true)
    document.body.appendChild(script)
  }, [orderId])

  function pay(): void {
    if (!window.Razorpay || !order) return
    const rzp = new window.Razorpay({
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      order_id: order.razorpay_order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: "AgentIntent Demo Store",
      description: "Test Mode payment (no real money)",
      handler: (response: {
        razorpay_payment_id: string
        razorpay_order_id: string
        razorpay_signature: string
      }) => {
        setResult("Verifying signature on server...")
        fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        })
          .then((r) => r.json())
          .then((data: { verified?: boolean; payment_id?: string; status?: string; error?: string; warning?: string }) => {
            if (data.verified) {
              setResult(
                `Verified. payment_id=${data.payment_id ?? "?"} status=${data.status ?? "?"}${data.warning ? ` WARNING=${data.warning}` : ""}`,
              )
            } else {
              setResult(`Verification failed: ${data.error ?? "unknown"}`)
            }
          })
          .catch((err: unknown) => setResult(`Verify error: ${String(err)}`))
      },
    })
    rzp.open()
  }

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1>AgentIntent — Test Mode Checkout</h1>
      {order ? (
        <>
          <p>
            Order: <b>{order.razorpay_order_id}</b> · ₹{(order.amount_paise / 100).toLocaleString("en-IN")} ·
            status: {order.status}
          </p>
          {order.payment && (
            <p>
              Payment: <b>{order.payment.razorpay_payment_id}</b> · {order.payment.status}
            </p>
          )}
          <button onClick={pay} disabled={!scriptReady} style={{ padding: "8px 16px", fontSize: 16 }}>
            {scriptReady ? "Pay (Test Mode)" : "Loading checkout..."}
          </button>
          <p>Test UPI: success@razorpay (success) / failure@razorpay (failure)</p>
        </>
      ) : (
        <p>Loading order...</p>
      )}
      {result && <p>{result}</p>}
    </main>
  )
}
