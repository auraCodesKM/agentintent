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
const monoId: React.CSSProperties = { ...mono, userSelect: "all", cursor: "text" }
const sectionStyle: React.CSSProperties = {
  marginTop: 28,
  paddingTop: 20,
  borderTop: "1px solid #e5e7eb",
}
const h3Style: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: "0 0 12px", letterSpacing: 0.2 }

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
        display: "inline-block",
        padding: "6px 16px",
        marginRight: 10,
        marginBottom: 8,
        borderRadius: 6,
        fontSize: 14,
        fontWeight: 600,
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
    <main style={{ ...mono, padding: "32px 24px 64px", maxWidth: 980, margin: "0 auto", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>AgentIntent</h1>
      <p style={{ color: "#4b5563", margin: 0 }}>
        There is an AI buyer. There is an AI judge. There is no AI cashier. · Razorpay <b>Test Mode</b> — sandbox
        payments, no real money.
      </p>

      <section style={{ marginTop: 24 }}>
        <textarea
          value={rawRequest}
          onChange={(e) => setRawRequest(e.target.value)}
          rows={2}
          style={{ ...mono, width: "100%", padding: 10, fontSize: 14, borderRadius: 6, border: "1px solid #d1d5db" }}
        />
        <button
          onClick={createIntentAndRun}
          disabled={busy !== ""}
          style={{
            padding: "9px 18px",
            marginTop: 10,
            borderRadius: 6,
            border: "1px solid #111827",
            background: busy !== "" ? "#9ca3af" : "#111827",
            color: "white",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: busy !== "" ? "default" : "pointer",
          }}
        >
          {busy || "Compile intent + run buyer"}
        </button>
        {error && <p style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
      </section>

      {contract && (
        <section style={sectionStyle}>
          <h3 style={h3Style}>Intent contract {intentId && <small style={monoId}>({intentId})</small>}</h3>
          <pre style={{ background: "#f3f4f6", padding: 14, borderRadius: 6, overflowX: "auto", fontSize: 13 }}>
            {JSON.stringify(contract, null, 2)}
          </pre>
        </section>
      )}

      {transcript.length > 0 && (
        <section style={sectionStyle}>
          <h3 style={h3Style}>Buyer transcript</h3>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {transcript.map((t, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <code>{t.action.tool}</code> {JSON.stringify(t.action.args)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section style={sectionStyle}>
        <h3 style={h3Style}>Gateway pipeline</h3>
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
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 8,
                marginBottom: 14,
                background:
                  decision.decision === "ALLOW" ? "#dcfce7" : decision.decision === "STEP_UP" ? "#fef3c7" : "#fee2e2",
                border: `1px solid ${decision.decision === "ALLOW" ? "#16a34a" : decision.decision === "STEP_UP" ? "#d97706" : "#dc2626"}`,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: decision.decision === "ALLOW" ? "#166534" : decision.decision === "STEP_UP" ? "#92400e" : "#991b1b",
                }}
              >
                {decision.decision}
              </div>
              <div style={{ marginTop: 4, fontSize: 14 }}>
                Reason codes: <b>{decision.reason_codes.length > 0 ? decision.reason_codes.join(", ") : "none"}</b>
                {decision.semantic_confidence !== null && <> · semantic confidence: <b>{decision.semantic_confidence}</b></>}
              </div>
            </div>
            <p>
              Razorpay Order:{" "}
              {decision.razorpay_order_id ? (
                <>
                  <b style={monoId}>{decision.razorpay_order_id}</b> ·{" "}
                  <a href={`/checkout/${decision.razorpay_order_id}`}>open Test Mode checkout →</a>
                </>
              ) : (
                <b style={{ color: "#dc2626" }}>NOT CREATED</b>
              )}
            </p>
            {decision.decision === "STEP_UP" && (
              <button
                onClick={approve}
                disabled={busy !== ""}
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d97706", background: "#d97706", color: "white", fontFamily: "inherit", fontSize: 13, cursor: busy !== "" ? "default" : "pointer" }}
              >
                Approve (merchant step-up)
              </button>
            )}
            {decision.razorpay_order_id && (
              <button
                onClick={reconcile}
                disabled={busy !== ""}
                style={{ padding: "8px 16px", marginLeft: 8, borderRadius: 6, border: "1px solid #374151", background: "white", color: "#111827", fontFamily: "inherit", fontSize: 13, cursor: busy !== "" ? "default" : "pointer" }}
              >
                Reconcile now (API poll)
              </button>
            )}
            {reconcileMsg && <p>Reconcile: {reconcileMsg}</p>}
          </div>
        )}
      </section>

      {auditEvents.length > 0 && (
        <section style={sectionStyle}>
          <h3 style={h3Style}>Audit timeline</h3>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <tbody>
              {auditEvents.map((e, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#f9fafb" }}>
                  <td style={{ padding: "4px 12px 4px 0", color: "#6b7280" }}>{e.created_at.slice(11, 19)}</td>
                  <td style={{ padding: "4px 12px 4px 0" }}>{e.event_type}</td>
                  <td style={{ padding: "4px 12px 4px 0", color: "#dc2626" }}>{e.reason_code ?? ""}</td>
                  <td style={{ color: "#6b7280" }}>{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={sectionStyle}>
        <h3 style={h3Style}>Evaluation (offline, zero Razorpay calls)</h3>
        {evalMetrics ? (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                {["split", "cases", "accuracy", "policy", "semantic", "false blocks (₹)", "step-up", "unauthorized allows"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0 14px 8px 0", borderBottom: "1px solid #d1d5db" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evalMetrics.map((m, i) => (
                <tr key={m.split} style={{ background: i % 2 === 0 ? "transparent" : "#f9fafb" }}>
                  <td style={{ padding: "6px 14px 6px 0" }}>{m.split}</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{m.cases}</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{(m.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{(m.policy.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{(m.semantic.accuracy * 100).toFixed(1)}%</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>
                    {m.falseBlocks} (₹{m.falseBlockGmvInr})
                  </td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{(m.stepUpRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: "6px 14px 6px 0" }}>{m.unauthorizedAllows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            <b style={{ color: "#dc2626" }}>NOT RUN</b> — run <code>npm run eval:run</code>
          </p>
        )}
      </section>
    </main>
  )
}
