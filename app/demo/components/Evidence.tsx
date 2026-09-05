"use client"

import type { AuditEvent, EvalMetricsRow, LiveEvalResult } from "../lib"

const BLOCK_EVENTS = ["AUTHORIZATION_BLOCKED", "POLICY_FAILED", "PAYMENT_FAILED"]
const ALLOW_EVENTS = ["AUTHORIZATION_ALLOWED", "ORDER_CREATED", "PAYMENT_CAPTURED", "STEP_UP_APPROVED"]

/** T9 — ledger typography. Append-only, newest last, no table chrome. */
export function AuditLedger({ events }: { events: AuditEvent[] }): React.ReactElement {
  return (
    <div className="scroll-x">
      <table className="ledger">
        <thead>
          <tr>
            <th>time</th>
            <th>event</th>
            <th>reason code</th>
            <th>actor</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr
              key={i}
              data-mark={
                BLOCK_EVENTS.includes(e.event_type) ? "block" : ALLOW_EVENTS.includes(e.event_type) ? "allow" : undefined
              }
            >
              <td className="ledger__time">{e.created_at.slice(11, 19)}</td>
              <td className="ledger__event">{e.event_type}</td>
              <td className="ledger__reason">
                {e.reason_code ? e.reason_code : <span className="faint">—</span>}
              </td>
              <td className="ledger__actor">{e.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 100.0% reads as a measurement with spurious precision; 100% reads as a fact.
const pct = (n: number): string => {
  const v = n * 100
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`
}

/**
 * The one genuinely live moment in the evaluation section: a real, bounded,
 * stratified sample of the held-out split, executed by the same
 * runEvaluation()/computeMetrics() the CLI script runs — POST /api/eval/run.
 * The button never fires on page load; it only runs when a viewer asks for
 * it, and it never claims to be the full 240 (or full 120) — the copy always
 * states the real sample size returned by the server.
 */
export function LiveEvaluation({
  busy,
  error,
  result,
  onRun,
}: {
  busy: boolean
  error: string
  result: LiveEvalResult | null
  onRun: () => void
}): React.ReactElement {
  return (
    <div className="live-eval">
      <div className="band__head" style={{ marginBottom: 16 }}>
        <span className="t-zone">live gateway evaluation · zero razorpay calls</span>
      </div>
      <div className="live-eval__row">
        <button type="button" className="btn btn--ghost" onClick={onRun} disabled={busy}>
          {busy ? "running evaluation…" : "run evaluation"}
        </button>
        {busy && (
          <span className="status-text">
            executing real policy + Gemini judge calls against a held-out sample — no Razorpay calls…
          </span>
        )}
        {error && <span className="status-text status-text--error">{error}</span>}
      </div>

      {result && (
        <div className="live-eval__result">
          <p className="t-micro muted" style={{ marginBottom: 20 }}>
            live sample · {result.sample_size} of {result.held_out_total} held-out cases · just executed ·{" "}
            {(result.duration_ms / 1000).toFixed(1)}s · {result.judge_calls} judge call
            {result.judge_calls === 1 ? "" : "s"} ·{" "}
            <span className="is-allow">{result.razorpay_calls} razorpay calls</span>
          </p>
          <div className="figures">
            {(
              [
                [String(result.metrics.cases), "cases run"],
                [pct(result.metrics.accuracy), "accuracy"],
                [`${result.metrics.falseBlocks}`, "false blocks"],
                [`${result.metrics.unauthorizedAllows}`, "unauthorized allows"],
              ] as [string, string][]
            ).map(([value, label]) => (
              <div className="figure" key={label}>
                <div className="t-figure">{value}</div>
                <span className="figure__label t-micro">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * T10 — the precomputed, full-set baseline. Measured constants, rendered
 * static. They are not count-up animated, because animation would imply a
 * computation happening now. It is not — `generatedAt` says when it actually
 * ran, so this can never be mistaken for the live sample above.
 */
export function EvidenceStrip({
  metrics,
  generatedAt,
}: {
  metrics: EvalMetricsRow[] | null
  generatedAt: string | null
}): React.ReactElement {
  if (!metrics) {
    return (
      <p className="t-data">
        <span className="is-block">NOT RUN</span>
        <span className="muted"> — no evaluation results on disk. Run </span>
        <code>npm run eval:run</code>
        <span className="muted"> to produce them.</span>
      </p>
    )
  }

  const held = metrics.find((m) => m.split === "held-out") ?? metrics[metrics.length - 1]
  if (!held) return <p className="t-data is-block">NOT RUN</p>

  const figures: [string, string, string][] = [
    [String(held.cases), "held-out cases", "never seen during calibration"],
    [pct(held.accuracy), "decision accuracy", "held-out split"],
    [`${held.falseBlocks}`, `false blocks (₹${held.falseBlockGmvInr})`, "legitimate purchases wrongly refused"],
    [`${held.unauthorizedAllows}`, "unauthorized allows", "the number that must be zero"],
  ]

  return (
    <>
      <div className="band__head" style={{ marginBottom: 16 }}>
        <span className="t-zone">precomputed baseline · full evaluation</span>
        {generatedAt && (
          <span className="band__note">
            recorded {new Date(generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC — not just computed
          </span>
        )}
      </div>
      <div className="figures">
        {figures.map(([value, label], i) => (
          <div className="figure" key={label} style={{ ["--i" as string]: i }}>
            <div className="t-figure">{value}</div>
            <span className="figure__label t-micro">{label}</span>
          </div>
        ))}
      </div>

      <p className="method">
        240 cases · 60 dev / 60 validation / 120 held-out · ground truth: deterministic templates —
        Gemini judges cases, never defines correctness · 0 Razorpay calls
      </p>

      <details className="disc">
        <summary>full breakdown</summary>
        <div className="disc__body">
          <div className="scroll-x">
            <table className="ledger">
              <thead>
                <tr>
                  <th>split</th>
                  <th>cases</th>
                  <th>accuracy</th>
                  <th>policy</th>
                  <th>semantic</th>
                  <th>false blocks</th>
                  <th>step-up</th>
                  <th>unauthorized allows</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.split}>
                    <td>{m.split}</td>
                    <td>{m.cases}</td>
                    <td>{pct(m.accuracy)}</td>
                    <td>{pct(m.policy.accuracy)}</td>
                    <td>{pct(m.semantic.accuracy)}</td>
                    <td>
                      {m.falseBlocks} (₹{m.falseBlockGmvInr})
                    </td>
                    <td>{pct(m.stepUpRate)}</td>
                    <td>{m.unauthorizedAllows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {typeof held.meanLatencyMs === "number" && typeof held.p95LatencyMs === "number" && (
            <p className="method">
              latency mean {(held.meanLatencyMs / 1000).toFixed(1)}s / p95 {(held.p95LatencyMs / 1000).toFixed(1)}s
              — includes 13-RPM evaluation pacing waits, not raw judge latency.
            </p>
          )}
          <p className="method">
            step-up on the held-out split is {pct(held.stepUpRate)} — class-H ambiguous intents, which
            are correct escalations rather than errors.
          </p>
        </div>
      </details>
    </>
  )
}
