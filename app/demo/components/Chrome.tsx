"use client"

import type { Decision } from "../lib"

// Sticky chrome. [TEST MODE] is in every recorded frame — that label defends
// every claim made in the video.

export function Masthead(): React.ReactElement {
  return (
    <header className="masthead">
      <div className="masthead__inner">
        <span className="masthead__mark">AgentIntent</span>
        <span className="t-micro masthead__role">merchant authorization gateway</span>
        <div className="t-micro masthead__meta">
          <span>[test mode]</span>
          <span className="opt">[merchant: demo_store]</span>
          <span className="opt">[session ttl 60m]</span>
        </div>
      </div>
    </header>
  )
}

function scrollTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" })
}

/**
 * Satisfies product.md §"UI requirements": the current decision, its first
 * reason code, and the Razorpay order id (or NOT CREATED) are readable at any
 * scroll position, with no navigation.
 */
export function StatusStrip({ decision }: { decision: Decision | null }): React.ReactElement {
  const tone =
    decision?.decision === "ALLOW"
      ? "is-allow"
      : decision?.decision === "STEP_UP"
        ? "is-stepup"
        : decision?.decision === "BLOCK"
          ? "is-block"
          : ""

  return (
    <div className="strip">
      <div className="strip__inner">
        <button type="button" className="strip__field" onClick={() => scrollTo("band-gateway")}>
          <span className="strip__key">decision</span>
          <span className={`strip__value ${tone}`}>{decision?.decision ?? "—"}</span>
        </button>
        <span className="strip__sep" />
        <button type="button" className="strip__field strip__field--reason" onClick={() => scrollTo("band-gateway")}>
          <span className="strip__key">reason</span>
          <span className="strip__value">{decision?.reason_codes[0] ?? "—"}</span>
        </button>
        <span className="strip__sep" />
        <button type="button" className="strip__field strip__field--order" onClick={() => scrollTo("band-execution")}>
          <span className="strip__key">order</span>
          <span className={`strip__value ${decision?.razorpay_order_id ? "is-exec" : decision ? "is-block" : ""}`}>
            {decision?.razorpay_order_id ?? (decision ? "NOT CREATED" : "—")}
          </span>
        </button>
      </div>
    </div>
  )
}
