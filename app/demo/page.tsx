"use client"

// Single demo page bound to REAL endpoints. Nothing here is animated on a timer;
// every light reflects a persisted decision record or live API response.

import { useCallback, useEffect, useState } from "react"

interface Contract {
  currency: string
  constraints: {
    max_amount: number
    max_quantity: number
    allowed_categories: string[]
    excluded_attributes: string[]
    required_attributes: string[]
  }
  preferences: Record<string, string>
}
interface Decision {
  decision: "ALLOW" | "STEP_UP" | "BLOCK"
  reason_codes: string[]
  authorization_id: string | null
  razorpay_order_id: string | null
  semantic_confidence: number | null
}
interface TranscriptEntry {
  action: { tool: string; args: Record<string, unknown> }
  observation: unknown
}
interface AuditEvent {
  event_type: string
  reason_code: string | null
  actor: string
  created_at: string
}
interface EvalMetricsRow {
  split: string
  cases: number
  accuracy: number
  policy: { accuracy: number }
  semantic: { accuracy: number }
  falseBlocks: number
  falseBlockGmvInr: number
  stepUpRate: number
  unauthorizedAllows: number
}

const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace" }

export default function DemoPage() {
  const [rawRequest, setRawRequest] = useState(
    "Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only. Prefer black.",
  )
  const [busy, setBusy] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [intentId, setIntentId] = useState<string>("")
  const [contract, setContract] = useState<Contract | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [decision, setDecision] = useState<Decision | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [evalMetrics, setEvalMetrics] = useState<EvalMetricsRow[] | null>(null)
  const [reconcileMsg, setReconcileMsg] = useState<string>("")

  const refreshAudit = useCallback((id: string) => {
    fetch(`/api/audit/${id}`)
      .then((r) => r.json())
      .then((d: { events: AuditEvent[] }) => setAuditEvents(d.events))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    fetch("/api/eval/results")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { metrics: EvalMetricsRow[] } | null) => {
        if (d) setEvalMetrics(d.metrics)
      })
      .catch(() => undefined)
  }, [])

  async function createIntentAndRun(): Promise<void> {
    setError("")
    setDecision(null)
    setTranscript([])
    setAuditEvents([])
    setReconcileMsg("")
    try {
      setBusy("creating session...")
      const sess = (await (await fetch("/api/sessions", { method: "POST" })).json()) as {
        session_id: string
      }
      setBusy("compiling intent (Gemini)...")
      const intentRes = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sess.session_id, request: rawRequest }),
      })
      const intentData = (await intentRes.json()) as {
        intent_id?: string
        contract?: Contract
        error?: string
      }
      if (!intentRes.ok || !intentData.intent_id) {
        setError(`Intent failed: ${intentData.error ?? intentRes.status}`)
        setBusy("")
        return
      }
      setIntentId(intentData.intent_id)
      setContract(intentData.contract ?? null)
      refreshAudit(intentData.intent_id)

      setBusy("running buyer agent (Gemini, max 8 turns)...")
      const runRes = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentData.intent_id }),
      })
      const runData = (await runRes.json()) as {
        transcript?: TranscriptEntry[]
        decision?: Decision | null
        error?: string
      }
      if (!runRes.ok) {
        setError(`Buyer failed: ${runData.error ?? runRes.status}`)
      } else {
        setTranscript(runData.transcript ?? [])
        setDecision(runData.decision ?? null)
      }
      refreshAudit(intentData.intent_id)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy("")
    }
  }

  async function approve(): Promise<void> {
    if (!decision?.authorization_id) return
    setBusy("approving STEP_UP...")
    try {
      const res = await fetch("/api/checkout/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization_id: decision.authorization_id }),
      })
      const data = (await res.json()) as Decision & { error?: string }
      if (!res.ok) setError(`Approve failed: ${data.error ?? res.status}`)
      else setDecision({ ...decision, decision: "ALLOW", razorpay_order_id: data.razorpay_order_id })
      if (intentId) refreshAudit(intentId)
    } finally {
      setBusy("")
    }
  }

  async function reconcile(): Promise<void> {
    if (!decision?.razorpay_order_id) return
    setBusy("reconciling via Razorpay API poll...")
    try {
      const res = await fetch(`/api/orders/${decision.razorpay_order_id}/reconcile`, { method: "POST" })
      const data = (await res.json()) as { status?: string; payments?: unknown[]; error?: string }
      setReconcileMsg(res.ok ? `${data.status}: ${JSON.stringify(data.payments)}` : `failed: ${data.error}`)
      if (intentId) refreshAudit(intentId)
    } finally {
      setBusy("")
    }
  }

  const light = (label: string, state: "pass" | "fail" | "idle" | "warn"): React.ReactNode => (
    <span
      key={label}
      style={{
        padding: "2px 10px",
        marginRight: 8,
        borderRadius: 4,
        background:
          state === "pass" ? "#16a34a" : state === "fail" ? "#dc2626" : state === "warn" ? "#d97706" : "#374151",
        color: "white",
      }}
    >
      {label}
    </span>
  )

  const hasDecision = decision !== null
  const blockedByPolicy =
    hasDecision &&
    decision.decision === "BLOCK" &&
    decision.reason_codes.some((r) => r !== "SEMANTIC_MISMATCH" && r !== "SEMANTIC_LOW_CONFIDENCE")
  const semanticState = !hasDecision
    ? "idle"
    : decision.reason_codes.includes("SEMANTIC_MISMATCH")
      ? "fail"
      : decision.reason_codes.includes("SEMANTIC_LOW_CONFIDENCE")
        ? "warn"
        : blockedByPolicy
          ? "idle"
          : "pass"

  return (
    <main style={{ ...mono, padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1>AgentIntent</h1>
      <p>
        There is an AI buyer. There is an AI judge. There is no AI cashier. · Razorpay <b>Test Mode</b> — sandbox
        payments, no real money.
      </p>

      <section style={{ marginTop: 16 }}>
        <textarea
          value={rawRequest}
          onChange={(e) => setRawRequest(e.target.value)}
          rows={2}
          style={{ ...mono, width: "100%", padding: 8 }}
        />
        <button onClick={createIntentAndRun} disabled={busy !== ""} style={{ padding: "8px 16px", marginTop: 8 }}>
          {busy || "Compile intent + run buyer"}
        </button>
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      </section>

      {contract && (
        <section style={{ marginTop: 16 }}>
          <h3>Intent contract {intentId && <small>({intentId})</small>}</h3>
          <pre style={{ background: "#f3f4f6", padding: 12, overflowX: "auto" }}>
            {JSON.stringify(contract, null, 2)}
          </pre>
        </section>
      )}

      {transcript.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3>Buyer transcript</h3>
          <ol>
            {transcript.map((t, i) => (
              <li key={i}>
                <code>{t.action.tool}</code> {JSON.stringify(t.action.args)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h3>Gateway pipeline</h3>
        <div>
          {light("L1 session/expiry", !hasDecision ? "idle" : decision.reason_codes.some((r) => ["INTENT_EXPIRED", "REPLAY_DETECTED", "MERCHANT_MISMATCH"].includes(r)) ? "fail" : "pass")}
          {light("L2 policy", !hasDecision ? "idle" : blockedByPolicy ? "fail" : "pass")}
          {light("L3 semantic", semanticState)}
          {light(
            `L4 ${hasDecision ? decision.decision : "—"}`,
            !hasDecision ? "idle" : decision.decision === "ALLOW" ? "pass" : decision.decision === "STEP_UP" ? "warn" : "fail",
          )}
        </div>
        {hasDecision && (
          <div style={{ marginTop: 12 }}>
            <p>
              Reason codes: <b>{decision.reason_codes.length > 0 ? decision.reason_codes.join(", ") : "none"}</b>
              {decision.semantic_confidence !== null && <> · semantic confidence: <b>{decision.semantic_confidence}</b></>}
            </p>
            <p>
              Razorpay Order:{" "}
              {decision.razorpay_order_id ? (
                <>
                  <b>{decision.razorpay_order_id}</b> ·{" "}
                  <a href={`/checkout/${decision.razorpay_order_id}`}>open Test Mode checkout →</a>
                </>
              ) : (
                <b style={{ color: "#dc2626" }}>NOT CREATED</b>
              )}
            </p>
            {decision.decision === "STEP_UP" && (
              <button onClick={approve} disabled={busy !== ""} style={{ padding: "6px 14px" }}>
                Approve (merchant step-up)
              </button>
            )}
            {decision.razorpay_order_id && (
              <button onClick={reconcile} disabled={busy !== ""} style={{ padding: "6px 14px", marginLeft: 8 }}>
                Reconcile now (API poll)
              </button>
            )}
            {reconcileMsg && <p>Reconcile: {reconcileMsg}</p>}
          </div>
        )}
      </section>

      {auditEvents.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h3>Audit timeline</h3>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              {auditEvents.map((e, i) => (
                <tr key={i}>
                  <td style={{ paddingRight: 12, color: "#6b7280" }}>{e.created_at.slice(11, 19)}</td>
                  <td style={{ paddingRight: 12 }}>{e.event_type}</td>
                  <td style={{ paddingRight: 12, color: "#dc2626" }}>{e.reason_code ?? ""}</td>
                  <td style={{ color: "#6b7280" }}>{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h3>Evaluation (offline, zero Razorpay calls)</h3>
        {evalMetrics ? (
          <table style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["split", "cases", "accuracy", "policy", "semantic", "false blocks (₹)", "step-up", "unauthorized allows"].map((h) => (
                  <th key={h} style={{ textAlign: "left", paddingRight: 14, borderBottom: "1px solid #d1d5db" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evalMetrics.map((m) => (
                <tr key={m.split}>
                  <td style={{ paddingRight: 14 }}>{m.split}</td>
                  <td style={{ paddingRight: 14 }}>{m.cases}</td>
                  <td style={{ paddingRight: 14 }}>{(m.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ paddingRight: 14 }}>{(m.policy.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ paddingRight: 14 }}>{(m.semantic.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ paddingRight: 14 }}>
                    {m.falseBlocks} (₹{m.falseBlockGmvInr})
                  </td>
                  <td style={{ paddingRight: 14 }}>{(m.stepUpRate * 100).toFixed(1)}%</td>
                  <td style={{ paddingRight: 14 }}>{m.unauthorizedAllows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            <b>NOT RUN</b> — run <code>npm run eval:run</code>
          </p>
        )}
      </section>
    </main>
  )
}
