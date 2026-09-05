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
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <span className="masthead__mark">AgentIntent</span>
          <span className="t-micro masthead__role">authorized execution</span>
          <div className="t-micro masthead__meta">
            <span>[test mode]</span>
            <span className="opt">[sandbox · no real money]</span>
          </div>
        </div>
      </header>

      <main className="sheet">
        <p className="t-micro faint" style={{ marginBottom: 28 }}>
          this order exists because the gateway authorized it
        </p>
        <h1 className="t-thesis" style={{ fontSize: "clamp(30px, 4.4vw, 46px)" }}>
          Test Mode checkout
        </h1>

        {order ? (
          <>
            <div className="sheet__rows">
              <div className="sheet__row">
                <span className="sheet__key t-micro">razorpay order</span>
                <span className="sheet__val id is-exec">{order.razorpay_order_id}</span>
              </div>
              <div className="sheet__row">
                <span className="sheet__key t-micro">amount</span>
                <span className="sheet__val">
                  ₹{(order.amount_paise / 100).toLocaleString("en-IN")} {order.currency}
                </span>
              </div>
              <div className="sheet__row">
                <span className="sheet__key t-micro">order status</span>
                <span className="sheet__val">{order.status}</span>
              </div>
              <div className="sheet__row">
                <span className="sheet__key t-micro">payment</span>
                <span className="sheet__val">
                  {order.payment ? (
                    <>
                      <span className="id">{order.payment.razorpay_payment_id}</span>
                      <span className="muted"> · {order.payment.status}</span>
                    </>
                  ) : (
                    <span className="muted">NOT CAPTURED</span>
                  )}
                </span>
              </div>
            </div>

            <div className="console__row" style={{ marginTop: 36 }}>
              <button type="button" className="btn" onClick={pay} disabled={!scriptReady}>
                {scriptReady ? "pay (test mode)" : "loading checkout…"}
              </button>
              <a className="link" href="/demo">
                ← back to gateway
              </a>
            </div>

            <p className="method" style={{ marginTop: 28 }}>
              test upi: <code>success@razorpay</code> (success) · <code>failure@razorpay</code> (failure). The
              signature returned by Checkout is verified server-side before any payment state is persisted.
            </p>
          </>
        ) : (
          <p className="t-data faint" style={{ marginTop: 36 }}>
            LOADING ORDER…
          </p>
        )}

        {result && (
          <p className="t-data" style={{ marginTop: 24 }}>
            {result}
          </p>
        )}
      </main>
    </>
  )
}
