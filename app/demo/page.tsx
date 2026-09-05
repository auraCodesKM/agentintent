"use client"

// Single page bound to REAL endpoints. Nothing here is animated on a timer;
// every light, every band and every state transition reflects a persisted
// decision record or a live API response. There is no simulated pipeline.

import { useCallback, useEffect, useRef, useState } from "react"
import { Masthead, StatusStrip } from "./components/Chrome"
import { SystemTrace, TrustBoundary } from "./components/TrustBoundary"
import { BuyerTrace, ContractChips, ProposedCart } from "./components/Untrusted"
import { AuthorizationPlate, DecisionPlate, LayerRail } from "./components/Gateway"
import { ExecutionAbsent, ExecutionHeld, RazorpayZone } from "./components/Execution"
import { AuditLedger, EvidenceStrip } from "./components/Evidence"
import {
  boundaryState,
  deriveCart,
  deriveTraceNodes,
  type AuditEvent,
  type Contract,
  type Decision,
  type EvalMetricsRow,
  type OrderInfo,
  type ReconcileResult,
  type TranscriptEntry,
} from "./lib"

const MAX_ORDER_POLLS = 40
const ORDER_POLL_MS = 2500

const PRESETS: [string, string][] = [
  ["legitimate", "Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only. Prefer black."],
  [
    "adversarial",
    "Buy me the StudioMax Reference headphones. My budget is ₹8,000 maximum, one pair only.",
  ],
  ["ambiguous", "Get me something nice for my desk setup, keep it reasonable."],
]

export default function DemoPage(): React.ReactElement {
  const [rawRequest, setRawRequest] = useState(PRESETS[0]?.[1] ?? "")
  const [busy, setBusy] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [intentId, setIntentId] = useState<string>("")
  const [contract, setContract] = useState<Contract | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [decision, setDecision] = useState<Decision | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [evalMetrics, setEvalMetrics] = useState<EvalMetricsRow[] | null>(null)
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null)
  const [reconcileError, setReconcileError] = useState<string>("")
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [approvalError, setApprovalError] = useState<string>("")
  const [approvedByMerchant, setApprovedByMerchant] = useState(false)
  const [verifyingPayment, setVerifyingPayment] = useState(false)
  const [pollExhausted, setPollExhausted] = useState(false)

  const boundaryRef = useRef<HTMLDivElement | null>(null)
  const hadDecision = useRef(false)
  const orderRef = useRef<OrderInfo | null>(null)

  const refreshAudit = useCallback((id: string) => {
    fetch(`/api/audit/${id}`)
      .then((r) => r.json())
      .then((d: { events: AuditEvent[] }) => setAuditEvents(d.events))
      .catch(() => undefined)
  }, [])

  // Persisted order + payment state. Stage 3 of the Razorpay rail lights from
  // this record only — never from a checkout redirect or an optimistic guess.
  // `verifyingPayment` is true for exactly the span of a real in-flight fetch.
  const refreshOrder = useCallback((orderId: string) => {
    setVerifyingPayment(true)
    return fetch(`/api/orders/${orderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OrderInfo | null) => setOrder(d))
      .catch(() => undefined)
      .finally(() => setVerifyingPayment(false))
  }, [])

  useEffect(() => {
    orderRef.current = order
  }, [order])

  useEffect(() => {
    fetch("/api/eval/results")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { metrics: EvalMetricsRow[] } | null) => {
        if (d) setEvalMetrics(d.metrics)
      })
      .catch(() => undefined)
  }, [])

  // Bounded, visibility-aware polling for the one thing a Razorpay redirect
  // never proves by itself: whether the payment actually captured. Same
  // endpoint as the one-shot refresh above — no new API, no websocket. Stops
  // the moment persisted state reaches a terminal status, after MAX_ORDER_POLLS,
  // or while the tab is hidden (it resumes immediately on focus/visible).
  useEffect(() => {
    const orderId = decision?.razorpay_order_id
    if (!orderId) return
    setPollExhausted(false)
    let pollCount = 0
    let interval: ReturnType<typeof setInterval> | null = null

    const isTerminal = (): boolean => {
      const status = orderRef.current?.payment?.status
      return status === "captured" || status === "failed"
    }
    const stop = (): void => {
      if (interval !== null) {
        clearInterval(interval)
        interval = null
      }
    }
    const tick = (): void => {
      if (isTerminal()) {
        stop()
        return
      }
      if (document.visibilityState !== "visible") return
      if (pollCount >= MAX_ORDER_POLLS) {
        setPollExhausted(true)
        stop()
        return
      }
      pollCount += 1
      refreshOrder(orderId)
      if (intentId) refreshAudit(intentId)
    }

    tick()
    interval = setInterval(tick, ORDER_POLL_MS)
    const onWake = (): void => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("focus", onWake)
    }
  }, [decision?.razorpay_order_id, intentId, refreshOrder, refreshAudit])

  // The only automatic scroll on the page: when a decision actually arrives,
  // bring the boundary and the decision plate into one frame.
  useEffect(() => {
    if (decision && !hadDecision.current) {
      hadDecision.current = true
      boundaryRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
    }
    if (!decision) hadDecision.current = false
  }, [decision])

  async function createIntentAndRun(): Promise<void> {
    setError("")
    setDecision(null)
    setTranscript([])
    setAuditEvents([])
    setReconcileResult(null)
    setReconcileError("")
    setOrder(null)
    setApprovalError("")
    setApprovedByMerchant(false)
    setPollExhausted(false)
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
    setApprovalError("")
    try {
      const res = await fetch("/api/checkout/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorization_id: decision.authorization_id }),
      })
      const data = (await res.json()) as Partial<Decision> & { error?: string }
      if (!res.ok) {
        // Surfaced, never swallowed: a refused approval is the C1/C2/C2b
        // guarantee working, and the demo should show it.
        setApprovalError(data.error ?? String(res.status))
      } else {
        setApprovedByMerchant(true)
        setDecision({
          ...decision,
          decision: data.decision ?? decision.decision,
          razorpay_order_id: data.razorpay_order_id ?? null,
        })
      }
      if (intentId) refreshAudit(intentId)
    } finally {
      setBusy("")
    }
  }

  async function reconcile(): Promise<void> {
    if (!decision?.razorpay_order_id) return
    const orderId = decision.razorpay_order_id
    setBusy("reconciling via Razorpay API poll...")
    try {
      const res = await fetch(`/api/orders/${orderId}/reconcile`, { method: "POST" })
      const data = (await res.json()) as Partial<ReconcileResult> & { error?: string }
      if (res.ok && data.status) {
        setReconcileResult(data as ReconcileResult)
        setReconcileError("")
      } else {
        setReconcileResult(null)
        setReconcileError(data.error ?? String(res.status))
      }
      if (intentId) refreshAudit(intentId)
      refreshOrder(orderId)
    } finally {
      setBusy("")
    }
  }

  const bstate = boundaryState(decision)
  const cart = deriveCart(transcript)
  const isBusy = busy !== ""

  // Trace geometry: each band's ink height is a function of resolved state only.
  const traceUntrusted = contract ? (transcript.length > 0 ? "100%" : "56%") : "0%"
  // ALLOW carries authority out of the band; BLOCK and STEP_UP terminate inside it.
  const traceGateway = !decision
    ? contract
      ? "18%"
      : "0%"
    : decision.decision === "ALLOW"
      ? "100%"
      : "38%"
  const exitState: typeof bstate = decision?.razorpay_order_id ? "crossing" : bstate

  const traceNodes = deriveTraceNodes(
    !!contract,
    transcript.length > 0,
    !!cart,
    decision,
    !!decision?.razorpay_order_id,
    order?.payment?.status ?? null,
  )

  return (
    <>
      <Masthead />
      {intentId && <StatusStrip decision={decision} />}

      <main className="bands">
        {/* ---------------------------------------------------- band 1 */}
        <section className="band" id="band-thesis">
          <div className="hero">
            <div className="hero__inner">
              <p className="t-micro hero__kicker">01 — the problem</p>

              <h1 className="t-thesis">
                <span className="thesis__line thesis__given">AI proposes.</span>
                <span className="thesis__line thesis__new">The gateway authorizes.</span>
                <span className="thesis__line thesis__given">Razorpay executes.</span>
              </h1>

              <p className="thesis__sub">
                There is an AI buyer. There is an AI judge. There is no AI cashier.
              </p>

              <div className="console">
                <div className="console__label">
                  <span className="t-micro">user intent</span>
                  <span className="t-micro is-ai">compiled by gemini</span>
                </div>
                <textarea
                  className="console__field"
                  value={rawRequest}
                  onChange={(e) => setRawRequest(e.target.value)}
                  rows={2}
                  aria-label="Natural-language purchase intent"
                />
                <div className="console__row">
                  <button type="button" className="btn" onClick={createIntentAndRun} disabled={isBusy}>
                    compile intent + run buyer
                  </button>
                  {busy && <span className="status-text">{busy}</span>}
                  {error && <span className="status-text status-text--error">{error}</span>}
                </div>
                <div className="presets">
                  {PRESETS.map(([label, text]) => (
                    <button
                      type="button"
                      className="preset"
                      key={label}
                      disabled={isBusy}
                      onClick={() => setRawRequest(text)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <SystemTrace nodes={traceNodes} />
            </div>
            <div className="hero__foot">
              <div className="hero__foot-inner t-micro">
                <span>the model can propose · only the gateway can pay</span>
                <span>[ scroll ]</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- band 2 */}
        <section className="band band--untrust" id="band-untrusted">
          <div className="band__inner">
            <div className="axis" style={{ ["--trace" as string]: traceUntrusted }}>
              <span className="axis__num">02</span>
            </div>
            <div className="band__body">
              <div className="band__head">
                <span className="t-zone">untrusted proposal</span>
                <span className="band__note">
                  the agent may search, inspect and propose · it may not price, authorize or pay
                </span>
              </div>

              {contract && intentId ? (
                <ContractChips contract={contract} intentId={intentId} />
              ) : (
                <p className="t-data faint">NO INTENT COMPILED — run the console above.</p>
              )}

              {transcript.length > 0 && <BuyerTrace transcript={transcript} />}
              {transcript.length > 0 && <ProposedCart transcript={transcript} />}
            </div>
          </div>
        </section>

        {/* --------------------------- band 3 · membrane, entry surface */}
        <div ref={boundaryRef} id="band-boundary">
          <TrustBoundary
            state={bstate}
            surface="entry"
            label="trust boundary"
            sub="above: untrusted proposals · below: deterministic authority"
          />
        </div>

        {/* ---------------------------------------------------- band 4 */}
        <section className="band band--authority" id="band-gateway">
          <div className="band__inner">
            <div
              className={`axis${decision?.decision === "BLOCK" ? " axis--recoil" : ""}`}
              data-tone={
                decision?.decision === "BLOCK"
                  ? "block"
                  : decision?.decision === "STEP_UP"
                    ? "stepup"
                    : decision?.decision === "ALLOW"
                      ? "allow"
                      : undefined
              }
              data-cap={decision && decision.decision !== "ALLOW" ? "true" : undefined}
              style={{ ["--trace" as string]: traceGateway }}
            >
              <span className="axis__num">03</span>
              {decision && decision.decision !== "ALLOW" && <span className="axis__cap" />}
            </div>
            <div className="band__body">
              <div className="band__head">
                <span className="t-zone">agentintent gateway · deterministic authority</span>
                <span className="band__note">
                  four layers, in order · the judge is consulted, never obeyed
                </span>
              </div>

              {/* PRIMARY: the decision. SECONDARY: the four layers that produced it. */}
              {decision ? (
                <>
                  <DecisionPlate decision={decision} approvedByMerchant={approvedByMerchant} />
                  {decision.decision === "STEP_UP" && (
                    <AuthorizationPlate
                      decision={decision}
                      cart={cart}
                      intentId={intentId}
                      busy={isBusy}
                      rejection={approvalError}
                      onApprove={approve}
                    />
                  )}
                </>
              ) : (
                <p className="t-data faint">
                  NO DECISION — the gateway has not been asked to authorize anything yet.
                </p>
              )}

              <div className="band__head" style={{ marginTop: 72, marginBottom: 14 }}>
                <span className="t-micro muted">how it was reached · four layers, in order</span>
              </div>
              <LayerRail decision={decision} />
            </div>
          </div>
        </section>

        {/* ---------------------------- band 4b · membrane, exit surface */}
        <TrustBoundary
          state={exitState}
          surface="exit"
          label={
            exitState === "crossing"
              ? "authorization seal · open"
              : exitState === "sealed"
                ? "authorization seal · sealed"
                : exitState === "awaiting"
                  ? "authorization seal · awaiting merchant"
                  : "authorization seal"
          }
          sub={
            exitState === "crossing"
              ? "one authorized order crossed · nothing else can"
              : "only an ALLOW from the gateway opens this surface"
          }
        />

        {/* ---------------------------------------------------- band 5 */}
        <section className="band" id="band-execution">
          <div className="band__inner">
            <div
              className="axis"
              data-tone={decision?.razorpay_order_id ? "allow" : undefined}
              style={{ ["--trace" as string]: decision?.razorpay_order_id ? "100%" : "0%" }}
            >
              <span className="axis__num">04</span>
            </div>
            <div className="band__body">
              <div className="band__head">
                <span className="t-zone">authorized execution · razorpay test mode</span>
                <span className="band__note">
                  reached only through the gateway&rsquo;s ALLOW branch · sandbox, no real money
                </span>
              </div>

              {decision?.razorpay_order_id ? (
                <RazorpayZone
                  decision={decision}
                  order={order}
                  auditEvents={auditEvents}
                  busy={isBusy}
                  reconcileResult={reconcileResult}
                  reconcileError={reconcileError}
                  onReconcile={reconcile}
                  verifyingPayment={verifyingPayment}
                  pollExhausted={pollExhausted}
                />
              ) : decision?.decision === "BLOCK" ? (
                <ExecutionAbsent />
              ) : decision?.decision === "STEP_UP" ? (
                <ExecutionHeld />
              ) : (
                <p className="t-data faint">
                  RAZORPAY ORDER: <span className="is-block">NOT CREATED</span> — no authorization has been granted.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- band 6 */}
        <section className="band" id="band-evidence">
          <div className="band__inner">
            <div className="axis" style={{ ["--trace" as string]: "0%" }}>
              <span className="axis__num">05</span>
            </div>
            <div className="band__body">
              <div className="band__head">
                <span className="t-zone">evidence</span>
                <span className="band__note">append-only audit trail · offline evaluation</span>
              </div>

              <div className="band__head" style={{ marginBottom: 20 }}>
                <h3 className="t-layer">Audit trail</h3>
                <span className="band__note">
                  {auditEvents.length > 0 ? `${auditEvents.length} events · newest last` : "no events yet"}
                </span>
              </div>
              {auditEvents.length > 0 ? (
                <AuditLedger events={auditEvents} />
              ) : (
                <p className="t-data faint">NO EVENTS — nothing has been decided in this session.</p>
              )}

              <div className="band__head" style={{ marginTop: 72, marginBottom: 20 }}>
                <h3 className="t-layer">Evaluation</h3>
                <span className="band__note">offline · zero Razorpay calls</span>
              </div>
              <EvidenceStrip metrics={evalMetrics} />

              <p className="method" style={{ marginTop: 64 }}>
                AI proposes. The gateway authorizes. Razorpay executes. — there is no path in this
                system where the first of those three reaches the third directly.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
