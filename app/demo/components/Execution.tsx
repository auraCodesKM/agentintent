"use client"

import type { AuditEvent, Decision, OrderInfo, ReconcileResult } from "../lib"

/**
 * Band 5 exists only when a real Razorpay Order exists.
 *
 * An ORDER is not a PAYMENT. The two are separate stages with separate labels
 * and separate lit states, and stage 3 lights only from persisted payment state
 * (webhook or reconcile) — never optimistically from a checkout redirect.
 */
export function RazorpayZone({
  decision,
  order,
  auditEvents,
  busy,
  reconcileResult,
  reconcileError,
  onReconcile,
  verifyingPayment,
  pollExhausted,
}: {
  decision: Decision
  order: OrderInfo | null
  auditEvents: AuditEvent[]
  busy: boolean
  reconcileResult: ReconcileResult | null
  reconcileError: string
  onReconcile: () => void
  verifyingPayment: boolean
  pollExhausted: boolean
}): React.ReactElement | null {
  const orderId = decision.razorpay_order_id
  if (!orderId) return null

  const payment = order?.payment ?? null
  const paid = payment?.status === "captured"
  const failed = payment?.status === "failed"
  const types = new Set(auditEvents.map((e) => e.event_type))

  const chain: string[] = []
  if (types.has("ORDER_CREATED")) chain.push("order created by gateway")
  if (types.has("WEBHOOK_VERIFIED")) chain.push("webhook HMAC verified")
  if (types.has("DUPLICATE_WEBHOOK")) chain.push("duplicate event id ignored")
  if (types.has("PAYMENT_CAPTURED")) chain.push("payment capture recorded")
  if (types.has("WEBHOOK_TIMEOUT_RECONCILED")) chain.push("recovered by API poll")
  if (types.has("PAYMENT_AMOUNT_MISMATCH")) chain.push("amount mismatch flagged")

  return (
    <>
      <div className="stages">
        <div className="stage" data-lit="true">
          <span className="stage__n t-micro">stage 01</span>
          <div className="stage__name">
            <span className="stage__dot" />
            Order created
          </div>
          <div className="stage__value id is-exec">{orderId}</div>
          <div className="stage__meta t-micro">
            [test mode] {order ? `· ₹${(order.amount_paise / 100).toLocaleString("en-IN")} · ${order.status}` : ""}
          </div>
        </div>

        <div className="stage" data-lit={order ? "true" : "false"}>
          <span className="stage__n t-micro">stage 02</span>
          <div className="stage__name">
            <span className="stage__dot" />
            Checkout
          </div>
          <div className="stage__value">
            <a
              className="link"
              href={`/checkout/${orderId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              open test mode checkout →
            </a>
          </div>
          <div className="stage__meta t-micro">
            razorpay checkout.js · opens in a new tab
          </div>
        </div>

        <div className="stage" data-lit={paid ? "true" : "false"}>
          <span className="stage__n t-micro">stage 03</span>
          <div className="stage__name">
            <span
              className="stage__dot"
              style={
                paid
                  ? { background: "var(--allow)", borderColor: "var(--allow)" }
                  : failed
                    ? { background: "var(--block)", borderColor: "var(--block)" }
                    : undefined
              }
            />
            Payment captured
          </div>
          {/* Re-keyed on status so a real capture/failure remounts and replays
              the existing .reveal blur-in exactly once — never on a timer. */}
          <div className="stage__value reveal" key={payment?.status ?? "none"}>
            {paid ? (
              <span className="id is-allow">{payment?.razorpay_payment_id}</span>
            ) : failed ? (
              <span className="is-block">PAYMENT FAILED</span>
            ) : verifyingPayment ? (
              <span className="status-text">VERIFYING PAYMENT…</span>
            ) : payment ? (
              <span className="muted">PENDING · {payment.status}</span>
            ) : (
              <span className="muted">AWAITING PAYMENT</span>
            )}
          </div>
          <div className="stage__meta t-micro">
            {payment
              ? `status ${payment.status} · persisted, not assumed`
              : pollExhausted
                ? "auto-check stopped — use recover via api poll below, or reopen checkout"
                : "no persisted payment record yet · checking automatically"}
          </div>
        </div>
      </div>

      {chain.length > 0 && (
        <div className="chain t-micro">
          {chain.map((c) => (
            <span className="chain__item" key={c}>
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="recon">
        <button type="button" className="btn btn--ghost" onClick={onReconcile} disabled={busy}>
          recover via api poll
        </button>
        <span className="t-micro muted">reconcile never creates a second order</span>
      </div>
      {reconcileError && (
        <div className="recon__out">
          <span className="is-block">RECONCILE FAILED</span> — {reconcileError}
        </div>
      )}
      {reconcileResult && (
        <div className="recon__out">
          <div className="recon__row">
            <span className="recon__key t-micro">result</span>
            <span className={reconcileResult.status === "RECONCILED" ? "is-exec" : "muted"}>
              {reconcileResult.status}
            </span>
          </div>
          <div className="recon__row">
            <span className="recon__key t-micro">order polled</span>
            <span className="id">{reconcileResult.razorpay_order_id}</span>
          </div>
          <div className="recon__row">
            <span className="recon__key t-micro">payments found</span>
            <span>
              {reconcileResult.payments.length === 0 ? (
                <span className="muted">none — nothing to recover</span>
              ) : (
                reconcileResult.payments.map((pmt) => (
                  <span className="recon__pay" key={pmt.id}>
                    <span className="id">{pmt.id}</span>
                    <span className="muted"> · {pmt.status}</span>
                  </span>
                ))
              )}
            </span>
          </div>
          {reconcileResult.reason_code && (
            <div className="recon__row">
              <span className="recon__key t-micro">reason code</span>
              <span>{reconcileResult.reason_code}</span>
            </div>
          )}
          <div className="recon__row">
            <span className="recon__key t-micro">orders created</span>
            <span>0 — reconciliation only observes</span>
          </div>
        </div>
      )}
    </>
  )
}

/** The BLOCK frame's central argument is an absence, stated as a fact. */
export function ExecutionAbsent(): React.ReactElement {
  return (
    <div className="exec-absent">
      <div className="exec-absent__line">RAZORPAY NOT REACHED · 0 RAZORPAY OBJECTS CREATED</div>
      <p className="exec-absent__note t-body">
        The gateway refused before the Razorpay adapter was ever called. There is no order to
        cancel, no payment to refund, and no object in the Razorpay dashboard — because the only
        code path that can create one is the ALLOW branch of the gateway, and it did not run.
      </p>
    </div>
  )
}

/** STEP_UP: an order does not exist yet, and the UI must not imply that it does. */
export function ExecutionHeld(): React.ReactElement {
  return (
    <div className="exec-absent" style={{ borderTopColor: "var(--stepup)" }}>
      <div className="exec-absent__line is-stepup">Razorpay: not contacted · awaiting merchant approval</div>
      <p className="exec-absent__note t-body">
        The gateway stopped short of authorizing. No Razorpay Order exists until a merchant
        approves the plate above, and that approval re-runs the session, expiry and merchant-binding
        checks before it is allowed anywhere near the money path.
      </p>
    </div>
  )
}
