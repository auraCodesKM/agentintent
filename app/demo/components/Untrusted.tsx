"use client"

import { deriveCart, inr, summariseObservation, type Contract, type TranscriptEntry } from "../lib"

// Everything in this band is a PROPOSAL. The agent may search, inspect and
// propose. It may not price, authorize, or pay — and the zone tint says so
// peripherally, before any label is read.

export function ContractChips({
  contract,
  intentId,
}: {
  contract: Contract
  intentId: string
}): React.ReactElement {
  const c = contract.constraints
  const prefs = Object.entries(contract.preferences)

  const chips: [string, string][] = [
    ["ceiling", inr(c.max_amount)],
    ["max quantity", String(c.max_quantity)],
    ["categories", c.allowed_categories.join(", ") || "—"],
    ["required", c.required_attributes.join(", ") || "none"],
    ["excluded", c.excluded_attributes.join(", ") || "none"],
    ["preferences", prefs.length > 0 ? prefs.map(([k, v]) => `${k}=${v}`).join(" · ") : "none"],
  ]

  return (
    <>
      <div className="band__head">
        <h3 className="t-layer">Intent contract</h3>
        <span className="band__note id">{intentId}</span>
      </div>
      <p className="t-body muted" style={{ maxWidth: "62ch", margin: "0 0 28px" }}>
        Natural language compiled into a typed, server-held contract. The ceiling below is the
        constraint the gateway enforces — the agent is never asked to respect it, and is never
        trusted to.
      </p>
      <div className="chips">
        {chips.map(([k, v], i) => (
          <div className="chip reveal" key={k} style={{ ["--i" as string]: i }}>
            <span className="chip__key t-micro">{k}</span>
            <span className="chip__val">{v}</span>
          </div>
        ))}
      </div>
      <details className="disc">
        <summary>raw contract</summary>
        <div className="disc__body">
          <pre className="code">{JSON.stringify(contract, null, 2)}</pre>
        </div>
      </details>
    </>
  )
}

export function BuyerTrace({ transcript }: { transcript: TranscriptEntry[] }): React.ReactElement {
  return (
    <>
      <div className="band__head" style={{ marginTop: 72 }}>
        <h3 className="t-layer">Buyer agent</h3>
        <span className="band__note">
          {transcript.length} tool call{transcript.length === 1 ? "" : "s"} · 4 tools · bounded at 8 turns
        </span>
      </div>
      <p className="t-body muted" style={{ maxWidth: "62ch", margin: "0 0 28px" }}>
        A Gemini buyer with exactly four tools: <code>search_catalog</code>, <code>get_product</code>,{" "}
        <code>propose_cart</code>, <code>request_checkout</code>. There is no payment tool. The last
        call hands a proposal to the gateway and ends the agent&rsquo;s authority.
      </p>
      <ol className="trace-list">
        {transcript.map((t, i) => (
          <li
            key={i}
            className={`trace-row${t.action.tool === "request_checkout" ? " trace-row--gateway" : ""}`}
            style={{ ["--i" as string]: i }}
          >
            <span className="trace-row__n">{String(i + 1).padStart(2, "0")}</span>
            <span className="trace-row__tool is-ai">{t.action.tool}</span>
            <span className="trace-row__obs">{summariseObservation(t.action.tool, t.observation)}</span>
          </li>
        ))}
      </ol>
      <details className="disc">
        <summary>full transcript</summary>
        <div className="disc__body">
          <pre className="code">{JSON.stringify(transcript, null, 2)}</pre>
        </div>
      </details>
    </>
  )
}

export function ProposedCart({ transcript }: { transcript: TranscriptEntry[] }): React.ReactElement | null {
  const cart = deriveCart(transcript)
  if (!cart) return null

  return (
    <>
      <div className="band__head" style={{ marginTop: 72 }}>
        <h3 className="t-layer">Proposed cart</h3>
        <span className="band__note id">{cart.cartId}</span>
      </div>
      <p className="t-body muted" style={{ maxWidth: "62ch", margin: "0 0 28px" }}>
        The agent proposes SKUs and quantities only. Every price here is the server&rsquo;s catalog
        price — <code>priceCart</code> re-prices the cart before any check runs, so an
        agent-authored price can never become an authorized amount.
      </p>
      <div className="cart">
        {cart.lines.map((line) => (
          <div className="cart__row" key={line.sku}>
            <div>
              <div className="cart__title">{line.title}</div>
              <div className="cart__sku">{line.sku}</div>
            </div>
            <div className="cart__num muted">× {line.quantity}</div>
            <div className="cart__num">{line.price !== null ? inr(line.price * line.quantity) : "—"}</div>
          </div>
        ))}
        <div className="cart__total">
          <div className="t-micro muted">subtotal · server-priced</div>
          <div />
          <div className="cart__num">{inr(cart.subtotal)}</div>
        </div>
      </div>
    </>
  )
}
