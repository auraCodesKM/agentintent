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
    <main style={{ fontFamily: "ui-monospace, monospace", padding: "32px 24px 64px", maxWidth: 640, margin: "0 auto", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20, margin: "0 0 20px" }}>AgentIntent — Test Mode Checkout</h1>
      {order ? (
        <>
          <div style={{ padding: "14px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", marginBottom: 16 }}>
            <p style={{ margin: 0 }}>
              Order: <b style={{ userSelect: "all", cursor: "text" }}>{order.razorpay_order_id}</b> · ₹
              {(order.amount_paise / 100).toLocaleString("en-IN")} · status: {order.status}
            </p>
            {order.payment && (
              <p style={{ margin: "8px 0 0" }}>
                Payment: <b style={{ userSelect: "all", cursor: "text" }}>{order.payment.razorpay_payment_id}</b> ·{" "}
                {order.payment.status}
              </p>
            )}
          </div>
          <button
            onClick={pay}
            disabled={!scriptReady}
            style={{
              padding: "10px 20px",
              fontSize: 15,
              borderRadius: 6,
              border: "1px solid #111827",
              background: scriptReady ? "#111827" : "#9ca3af",
              color: "white",
              fontFamily: "inherit",
              cursor: scriptReady ? "pointer" : "default",
            }}
          >
            {scriptReady ? "Pay (Test Mode)" : "Loading checkout..."}
          </button>
          <p style={{ color: "#6b7280", marginTop: 12 }}>
            Test UPI: <code>success@razorpay</code> (success) / <code>failure@razorpay</code> (failure)
          </p>
        </>
      ) : (
        <p>Loading order...</p>
      )}
      {result && <p style={{ marginTop: 16 }}>{result}</p>}
    </main>
  )
}
