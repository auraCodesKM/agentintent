"use client"

import { useMemo } from "react"
import { glyphAt, glyphWeight } from "../lib"

export type BoundaryState = "idle" | "crossing" | "sealed" | "awaiting"

/**
 * T4 — centre-clear / edge-dense texture, hero band only, ≤8% ink.
 * Same deterministic seed as the boundary, so the page has one texture, not two.
 */
export function HeroField(): React.ReactElement {
  const rows = 26
  const cols = 150
  const field = useMemo(
    () =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => glyphAt(r + 7, c + 3)).join(" "),
      ),
    [],
  )
  return (
    <div className="hero__texture" aria-hidden="true">
      <div className="hero__texture-inner">
        {field.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
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
