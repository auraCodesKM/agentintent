"use client"

import { useMemo } from "react"
import { glyphAt, glyphWeight, type TraceNode, type TraceTone } from "../lib"

export type BoundaryState = "idle" | "crossing" | "sealed" | "awaiting"

const TONE_CLASS: Record<TraceTone, string> = {
  faint: "faint",
  neutral: "",
  ai: "is-ai",
  allow: "is-allow",
  stepup: "is-stepup",
  block: "is-block",
  exec: "is-exec",
}

/**
 * The hero system trace — replaces the old decorative glyph backdrop with the
 * one diagram that actually matters: the seven real stages a purchase moves
 * through. Every node's colour is a pure function of already-fetched state
 * (see deriveTraceNodes); nothing here runs on a timer. A node re-mounts
 * (via its key) only when its tone changes, replaying the existing `.reveal`
 * blur-in exactly once per real transition — reduced-motion collapses that to
 * a plain fade via the global media query, same as everywhere else on the page.
 */
export function SystemTrace({ nodes }: { nodes: TraceNode[] }): React.ReactElement {
  return (
    <div className="trace" aria-live="off">
      {nodes.map((n, i) => (
        <span className="trace__item" key={`item-${i}`}>
          <span key={`${n.label}:${n.tone}`} className={`trace__node reveal ${TONE_CLASS[n.tone]}`}>
            {n.label}
          </span>
          {i < nodes.length - 1 && (
            <span className="trace__sep" aria-hidden="true">
              →
            </span>
          )}
        </span>
      ))}
    </div>
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
