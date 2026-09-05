"use client"

import { useEffect, useRef, useState } from "react"
import {
  confidenceGloss,
  inr,
  REASON_GLOSS,
  SEMANTIC_THRESHOLD,
  type CartView,
  type Decision,
  type LayerView,
} from "../lib"

export function LayerRail({ layers }: { layers: LayerView[] }): React.ReactElement {
  return (
    <div className="rail">
      {layers.map((l) => (
        <div className="layer" data-state={l.state} key={l.id}>
          <span className="layer__marker" />
          <h4 className="t-layer layer__name">
            <span className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>
              {l.id}
            </span>{" "}
            {l.name}
          </h4>
          <span
            className={`layer__verdict ${
              l.state === "pass" ? "is-allow" : l.state === "fail" ? "is-block" : l.state === "warn" ? "is-stepup" : ""
            }`}
          >
            {l.verdict}
          </span>
          <span className="layer__detail">{l.detail}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * T6 — the decision word assembles once, on real arrival. It never runs while
 * anything is in flight, because it is only mounted once `decision` is non-null.
 */
function useScramble(word: string): string {
  const [shown, setShown] = useState(word)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setShown(word)
      return
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_"
    const start = performance.now()
    const DURATION = 400

    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / DURATION)
      const settled = Math.floor(p * word.length)
      setShown(
        word
          .split("")
          .map((c, i) => (i < settled || c === "_" ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join(""),
      )
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else setShown(word)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [word])

  return shown
}

function DecisionWord({ decision }: { decision: Decision }): React.ReactElement {
  const shown = useScramble(decision.decision)
  const settled = shown === decision.decision
  const tone =
    decision.decision === "ALLOW" ? "is-allow" : decision.decision === "STEP_UP" ? "is-stepup" : "is-block"
  return (
    <h2 className={`t-decision plate__word ${tone}${settled ? "" : " scramble"}`}>{shown}</h2>
  )
}

const SUBLABEL: Record<Decision["decision"], string> = {
  ALLOW: "Authorized by gateway",
  STEP_UP: "Human authorization required",
  BLOCK: "Refused before execution",
}

export function DecisionPlate({
  decision,
  approvedByMerchant,
}: {
  decision: Decision
  approvedByMerchant: boolean
}): React.ReactElement {
  const conf = decision.semantic_confidence
  return (
    <div className="plate">
      <DecisionWord decision={decision} />
      <p className="t-zone plate__sub">
        {approvedByMerchant && decision.decision === "ALLOW" ? "Authorized by merchant approval" : SUBLABEL[decision.decision]}
      </p>

      {decision.reason_codes.length > 0 ? (
        <ul className="plate__reasons">
          {decision.reason_codes.map((code, i) => (
            <li className="reason" key={code} style={{ ["--i" as string]: i }}>
              <span
                className={`reason__code ${
                  decision.decision === "BLOCK" ? "is-block" : decision.decision === "STEP_UP" ? "is-stepup" : "muted"
                }`}
              >
                {code}
              </span>
              <span className="reason__gloss">{REASON_GLOSS[code] ?? "Recorded reason code."}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="plate__reasons">
          <li className="reason">
            <span className="reason__code muted">NO VIOLATIONS RECORDED</span>
            <span className="reason__gloss">Every layer returned a clean verdict.</span>
          </li>
        </ul>
      )}

      {conf !== null && (
        <p className="compare">
          semantic_confidence <b className="is-ai">{conf}</b> {conf >= SEMANTIC_THRESHOLD ? "≥" : "<"} threshold{" "}
          <b>{SEMANTIC_THRESHOLD}</b>
          <span className="compare__gloss">{confidenceGloss(decision)}</span>
        </p>
      )}
    </div>
  )
}

/**
 * STEP_UP is not a button. It is a plate that shows exactly what is being
 * authorized, and it surfaces a gateway rejection rather than swallowing it —
 * approval is not a weaker door into the money path than checkout is.
 */
export function AuthorizationPlate({
  decision,
  cart,
  intentId,
  busy,
  rejection,
  onApprove,
}: {
  decision: Decision
  cart: CartView | null
  intentId: string
  busy: boolean
  rejection: string
  onApprove: () => void
}): React.ReactElement {
  const items = cart?.lines.reduce((n, l) => n + l.quantity, 0) ?? null
  return (
    <div className="auth">
      <div className="auth__head t-micro">
        <span>merchant approval</span>
        <span>authorization {decision.authorization_id ?? "—"}</span>
      </div>
      <div className="auth__body">
        <div className="auth__line">
          <span>authorizing</span>
          <span>{cart ? inr(cart.subtotal) : "—"}</span>
        </div>
        <div className="auth__line">
          <span>items</span>
          <span>{items !== null ? `${items} unit${items === 1 ? "" : "s"} · ${cart?.lines.length} sku` : "—"}</span>
        </div>
        <div className="auth__line">
          <span>intent</span>
          <span className="id">{intentId}</span>
        </div>
        <div className="auth__line">
          <span>escalated because</span>
          <span>{decision.reason_codes[0] ?? "—"}</span>
        </div>
      </div>
      <button type="button" className="auth__action" onClick={onApprove} disabled={busy}>
        {busy ? "authorizing…" : `Authorize ${cart ? inr(cart.subtotal) : "this cart"}`}
      </button>
      {rejection && (
        <div className="auth__reject">
          gateway refused the approval — <b>{rejection}</b>
          <br />
          <span className="muted">{REASON_GLOSS[rejection] ?? "The approval re-ran L1 and did not pass."}</span>
        </div>
      )}
    </div>
  )
}
