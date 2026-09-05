"use client"

import { useMemo } from "react"
import { glyphAt, glyphWeight, type TraceModel, type TraceTone } from "../lib"

export type BoundaryState = "idle" | "crossing" | "sealed" | "awaiting"

const TONE_CLASS: Record<TraceTone, string> = {
  faint: "faint",
  neutral: "trace2__neutral",
  ai: "is-ai",
  allow: "is-allow",
  stepup: "is-stepup",
  block: "is-block",
  exec: "is-exec",
}

/**
 * The hero system trace — a fixed monospace diagram of the real architecture,
 * not a second hero. Geometry never changes; only tone does, and tone is a
 * pure function of already-fetched state (see deriveTraceModel in lib.ts).
 * "entry"/"exit surface" are the same two membrane surfaces <TrustBoundary/>
 * renders further down the page — this is that same boundary, explained.
 * A node's key includes its tone, so it re-mounts (replaying `.reveal`) only
 * on a real transition; reduced-motion collapses that to a plain fade via the
 * global media query, same as everywhere else on the page.
 */
export function SystemTrace({ model }: { model: TraceModel }): React.ReactElement {
  const tone = (t: TraceTone): string => `trace2__node reveal ${TONE_CLASS[t]}`
  const key = (label: string, t: TraceTone): string => `${label}:${t}`

  return (
    <pre className="trace2" aria-label="system architecture trace">
      <span>{"   "}</span>
      <span key={key("intent", model.intent)} className={tone(model.intent)}>
        user intent
      </span>
      {"\n        │\n   "}
      <span key={key("buyer", model.buyer)} className={tone(model.buyer)}>
        ai buyer
      </span>
      <span className="faint">{"          search · inspect · propose"}</span>
      {"\n        │\n   "}
      <span key={key("proposal", model.proposal)} className={tone(model.proposal)}>
        untrusted proposal
      </span>
      {"\n   "}
      <span key={key("gate-rule", model.gate)} className={tone(model.gate)}>
        {"──────────────────"}
      </span>
      <span className="faint">{"  entry surface"}</span>
      {"\n        │\n   "}
      <span key={key("gate", model.gate)} className={tone(model.gate)}>
        l1 · l2 · l3 · l4
      </span>
      {"\n   "}
      <span key={key("exit-rule", model.exit)} className={tone(model.exit)}>
        {"──────────────────"}
      </span>
      <span className="faint">{"  exit surface"}</span>
      {"\n        │\n   "}
      <span key={key("order", model.order)} className={tone(model.order)}>
        [ razorpay ]
      </span>
      <span className="faint">{"  order → "}</span>
      <span key={key("payment", model.payment)} className={tone(model.payment)}>
        payment
      </span>
    </pre>
  )
}

/**
 * The authorization boundary — the one full-bleed element on the page.
 *
 * It is a membrane with two surfaces. The ENTRY surface admits an untrusted
 * proposal for inspection; the gateway does its work inside; the EXIT surface
 * emits authority, and opens only when the gateway actually said ALLOW.
 * That is why Razorpay can never sit adjacent to the agent: it is on the far
 * side of a surface that only a real ALLOW opens.
 *
 * Every state derives from the decision object. Nothing here runs on a timer.
 */
export function TrustBoundary({
  state,
  surface,
  label,
  sub,
  id,
}: {
  state: BoundaryState
  surface: "entry" | "exit"
  label: string
  sub?: string
  id?: string
}): React.ReactElement {
  const rows = surface === "entry" ? 11 : 7
  const cols = 132

  // Deterministic: seeded by (row, col), stable across every re-render.
  const field = useMemo(
    () =>
      Array.from({ length: rows }, (_, r) => ({
        r,
        cells: Array.from({ length: cols }, (_, c) => ({
          ch: glyphAt(r, c),
          o: glyphWeight(r, c, rows),
        })),
      })),
    [rows],
  )

  return (
    <div className={`boundary boundary--${surface}`} data-state={state} id={id} aria-hidden="true">
      <div className="boundary__field">
        {field.map((row) => (
          <div className="boundary__row" key={row.r}>
            {row.cells.map((cell, c) => (
              <span key={c} style={{ opacity: cell.o }}>
                {cell.ch}
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* the trace axis passing through the membrane, at the page's fixed x */}
      <div className="boundary__seam" style={{ left: "var(--seam-x)" }} />
      <div className="boundary__gap" style={{ left: "calc(var(--seam-x) - 18px)" }} />
      <div className="boundary__sweep" />

      <div className="boundary__label">
        <span className="boundary__knockout">{label}</span>
        {sub && <span className="boundary__sub t-micro">{sub}</span>}
      </div>
    </div>
  )
}
