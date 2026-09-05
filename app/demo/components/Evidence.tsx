"use client"

import type { AuditEvent, EvalMetricsRow } from "../lib"

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
              <td className="ledger__reason">{e.reason_code ?? ""}</td>
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
 * T10 — measured constants, rendered static. They are not count-up animated,
 * because animation would imply a computation happening now. It is not.
 */
export function EvidenceStrip({ metrics }: { metrics: EvalMetricsRow[] | null }): React.ReactElement {
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
