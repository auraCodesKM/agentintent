// Shared types + pure helpers for the /demo presentation layer.
// Nothing here invents state: every function is a formatter or a derivation
// over data that already arrived from a real API response.

export interface Contract {
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

export interface Decision {
  decision: "ALLOW" | "STEP_UP" | "BLOCK"
  reason_codes: string[]
  authorization_id: string | null
  razorpay_order_id: string | null
  semantic_confidence: number | null
}

export interface TranscriptEntry {
  action: { tool: string; args: Record<string, unknown> }
  observation: unknown
}

export interface AuditEvent {
  event_type: string
  reason_code: string | null
  actor: string
  created_at: string
}

export interface EvalMetricsRow {
  split: string
  cases: number
  accuracy: number
  policy: { accuracy: number }
  semantic: { accuracy: number }
  falseBlocks: number
  falseBlockGmvInr: number
  stepUpRate: number
  unauthorizedAllows: number
  meanLatencyMs?: number
  p95LatencyMs?: number
}

export interface OrderInfo {
  razorpay_order_id: string
  amount_paise: number
  currency: string
  status: string
  payment: { razorpay_payment_id: string; status: string } | null
}

/** Exact response shape of POST /api/orders/[id]/reconcile — no invented fields. */
export interface ReconcileResult {
  status: "RECONCILED" | "NO_PAYMENTS"
  razorpay_order_id: string
  payments: { id: string; status: string }[]
  reason_code: "WEBHOOK_TIMEOUT_RECONCILED" | null
}

/** Threshold mirrors SEMANTIC_CONFIDENCE_THRESHOLD in src/lib/schemas.ts. */
export const SEMANTIC_THRESHOLD = 0.85

/** The real reason-code vocabulary (src/lib/schemas.ts REASON_CODES). */
export const REASON_CODES = [
  "MAX_AMOUNT_EXCEEDED",
  "MAX_QUANTITY_EXCEEDED",
  "CATEGORY_MISMATCH",
  "MERCHANT_MISMATCH",
  "INTENT_EXPIRED",
  "REPLAY_DETECTED",
  "SEMANTIC_MISMATCH",
  "SEMANTIC_LOW_CONFIDENCE",
  "INVALID_INTENT",
  "RAZORPAY_API_ERROR",
  "WEBHOOK_TIMEOUT_RECONCILED",
  "PAYMENT_AMOUNT_MISMATCH",
  "DUPLICATE_WEBHOOK",
  "SKU_NOT_FOUND",
] as const

/** Plain-language glosses. Static strings, matching src/policy/engine.ts semantics. */
export const REASON_GLOSS: Record<string, string> = {
  MAX_AMOUNT_EXCEEDED: "Cart subtotal is above the ceiling in the intent contract (or the merchant policy — whichever is lower).",
  MAX_QUANTITY_EXCEEDED: "Total item quantity is above the ceiling in the intent contract (or the merchant policy).",
  CATEGORY_MISMATCH: "A cart item sits outside the categories the intent and the merchant policy allow.",
  MERCHANT_MISMATCH: "The session's merchant does not match the merchant the intent was issued for.",
  INTENT_EXPIRED: "The intent or its parent session is past its expiry, or is no longer active.",
  REPLAY_DETECTED: "This intent has already been consumed, or this exact intent + cart was already authorized.",
  SEMANTIC_MISMATCH: "The judge is confident that the cart does not satisfy what the user actually asked for.",
  SEMANTIC_LOW_CONFIDENCE: "The judge is not confident enough to authorize automatically — escalated to a human.",
  INVALID_INTENT: "The intent or the cart could not be resolved into a valid, bound pair.",
  RAZORPAY_API_ERROR: "Razorpay rejected or failed the order call. Fails closed — no authorization is granted.",
  WEBHOOK_TIMEOUT_RECONCILED: "The webhook never landed; payment state was recovered by polling the Razorpay API.",
  PAYMENT_AMOUNT_MISMATCH: "The captured amount does not equal the authorized order amount.",
  DUPLICATE_WEBHOOK: "A webhook with an event id already processed was received and ignored.",
  SKU_NOT_FOUND: "The agent proposed a SKU that does not exist in the server catalog.",
}

export const L1_CODES = ["INTENT_EXPIRED", "REPLAY_DETECTED", "MERCHANT_MISMATCH", "INVALID_INTENT"]
export const L2_CODES = ["MAX_AMOUNT_EXCEEDED", "MAX_QUANTITY_EXCEEDED", "CATEGORY_MISMATCH", "SKU_NOT_FOUND"]
export const L3_CODES = ["SEMANTIC_MISMATCH", "SEMANTIC_LOW_CONFIDENCE"]

export type LayerState = "idle" | "pass" | "fail" | "warn" | "skipped"

export interface LayerView {
  id: string
  name: string
  state: LayerState
  verdict: string
  detail: string
}

/**
 * Derives the four gateway layers from the decision alone, optionally
 * narrated with the real contract/cart numbers that produced an L2 pass.
 * "NOT REACHED" is used, never "FAIL", for layers the gateway never ran —
 * a policy failure short-circuits before the judge is ever invoked.
 *
 * This is the single source both <LayerRail/> and <SystemTrace/> read from,
 * so the hero trace and the gateway rail can never disagree about state.
 */
export function deriveLayers(
  decision: Decision | null,
  contract?: Contract | null,
  cart?: CartView | null,
): LayerView[] {
  const codes = decision?.reason_codes ?? []
  const has = (list: string[]): boolean => codes.some((c) => list.includes(c))

  if (!decision) {
    return [
      { id: "L1", name: "Session & replay", state: "idle", verdict: "IDLE", detail: "session active · intent unexpired · not replayed" },
      { id: "L2", name: "Deterministic policy", state: "idle", verdict: "IDLE", detail: "amount · quantity · category, over the server-priced cart" },
      { id: "L3", name: "Semantic judge", state: "idle", verdict: "IDLE", detail: `Gemini verdict consumed as data · threshold ${SEMANTIC_THRESHOLD}` },
      { id: "L4", name: "Authorization", state: "idle", verdict: "IDLE", detail: "the only path that may create a Razorpay Order" },
    ]
  }

  const l1Failed = has(L1_CODES)
  const l2Failed = has(L2_CODES)
  const l3Mismatch = codes.includes("SEMANTIC_MISMATCH")
  const l3Low = codes.includes("SEMANTIC_LOW_CONFIDENCE")

  const conf = decision.semantic_confidence

  const l1: LayerView = {
    id: "L1",
    name: "Session & replay",
    state: l1Failed ? "fail" : "pass",
    verdict: l1Failed ? "FAIL" : "PASS",
    detail: l1Failed
      ? codes.filter((c) => L1_CODES.includes(c)).join(" · ")
      : "session active · intent unexpired · merchant bound · not replayed",
  }

  const l2: LayerView = {
    id: "L2",
    name: "Deterministic policy",
    state: l1Failed ? "skipped" : l2Failed ? "fail" : "pass",
    verdict: l1Failed ? "NOT REACHED" : l2Failed ? "FAIL" : "PASS",
    detail: l1Failed
      ? "short-circuited at L1"
      : l2Failed
        ? codes.filter((c) => L2_CODES.includes(c)).join(" · ")
        : contract && cart
          ? `${inr(cart.subtotal)} ≤ ${inr(contract.constraints.max_amount)} · qty ${cart.lines.reduce((n, l) => n + l.quantity, 0)} ≤ ${contract.constraints.max_quantity}`
          : "amount · quantity · category all within the contract and merchant policy",
  }

  // Policy failures never invoke the judge. The UI must show that.
  const l3Skipped = l1Failed || l2Failed
  const l3: LayerView = {
    id: "L3",
    name: "Semantic judge",
    state: l3Skipped ? "skipped" : l3Mismatch ? "fail" : l3Low ? "warn" : "pass",
    verdict: l3Skipped ? "NOT REACHED" : l3Mismatch ? "FAIL" : l3Low ? "ESCALATE" : "PASS",
    // The bare comparison is ambiguous on a mismatch: a HIGH confidence is what
    // makes it a refusal rather than an escalation. Say which way it points.
    detail: l3Skipped
      ? "not invoked — a deterministic failure never reaches the model"
      : conf === null
        ? "verdict recorded"
        : l3Mismatch
          ? `confident the cart does NOT match the intent (${conf} ≥ ${SEMANTIC_THRESHOLD})`
          : l3Low
            ? `below the bar to authorize automatically (${conf} < ${SEMANTIC_THRESHOLD})`
            : `confident the cart matches the intent (${conf} ≥ ${SEMANTIC_THRESHOLD})`,
  }

  const l4: LayerView = {
    id: "L4",
    name: "Authorization",
    state: decision.decision === "ALLOW" ? "pass" : decision.decision === "STEP_UP" ? "warn" : "fail",
    verdict: decision.decision,
    detail:
      decision.decision === "ALLOW"
        ? decision.razorpay_order_id
          ? "authorized — one Razorpay Test Mode Order created"
          : "authorized"
        : decision.decision === "STEP_UP"
          ? "held for explicit merchant approval — no order exists yet"
          : "refused — zero Razorpay objects created",
  }

  return [l1, l2, l3, l4]
}

export function inr(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`
}

/**
 * What the confidence comparison MEANS for this decision. Without this, a BLOCK
 * shows "0.95 ≥ 0.85" beside a FAIL and reads as a contradiction — the number
 * passed the threshold, but what it measures is the judge's certainty that the
 * cart is wrong.
 */
export function confidenceGloss(decision: Decision): string {
  if (decision.reason_codes.includes("SEMANTIC_MISMATCH")) {
    return "the judge was confident — and confident it did NOT match. High certainty is what makes this a refusal rather than an escalation."
  }
  if (decision.reason_codes.includes("SEMANTIC_LOW_CONFIDENCE")) {
    return "below the bar for automatic authorization, so the decision goes to a human instead of to the model."
  }
  if (decision.decision === "ALLOW") {
    return "the judge was confident the cart matches the intent, and the deterministic layers had already passed."
  }
  return "recorded for the audit trail."
}

export function boundaryState(decision: Decision | null): "idle" | "crossing" | "sealed" | "awaiting" {
  if (!decision) return "idle"
  if (decision.decision === "ALLOW") return "crossing"
  if (decision.decision === "BLOCK") return "sealed"
  return "awaiting"
}

/**
 * What is actually in flight, derived from the same four fetch boundaries the
 * page already awaits (POST /api/sessions, /api/intents, /api/agent/run) —
 * never a guess, never a sub-step the backend didn't report.
 */
export type Phase = "idle" | "session" | "compiling" | "running" | "resolved"

export type TraceTone = "faint" | "neutral" | "ai" | "allow" | "stepup" | "block" | "exec"

/**
 * The hero system trace, as a fixed diagram (not a scrolling list): the seven
 * real stages a purchase moves through. Every tone is a pure function of
 * already-fetched state or the live `phase` of the current fetch — never a
 * timer, never invented. `gate` and `exit` are read from the SAME LayerView[]
 * that <LayerRail/> renders, via layers[3] (L4/Authorization), so the trace
 * and the rail can never disagree.
 */
export interface TraceModel {
  intent: TraceTone
  buyer: TraceTone
  proposal: TraceTone
  gate: TraceTone
  exit: TraceTone
  order: TraceTone
  payment: TraceTone
}

export function deriveTraceModel(
  phase: Phase,
  hasContract: boolean,
  hasProposal: boolean,
  hasCart: boolean,
  layers: LayerView[],
  decision: Decision | null,
  hasOrder: boolean,
  paymentStatus: string | null,
): TraceModel {
  const l4 = layers[3]
  const gate: TraceTone =
    l4?.state === "pass" ? "allow" : l4?.state === "fail" ? "block" : l4?.state === "warn" ? "stepup" : "faint"

  const paymentTone: TraceTone =
    paymentStatus === "captured" ? "allow" : paymentStatus === "failed" ? "block" : hasOrder ? "exec" : "faint"

  return {
    intent: phase === "compiling" ? "ai" : hasContract ? "neutral" : "faint",
    buyer: phase === "running" || hasProposal ? "ai" : "faint",
    proposal: hasCart ? "ai" : "faint",
    gate,
    exit: gate,
    order: hasOrder ? (decision?.decision === "ALLOW" ? "allow" : "exec") : "faint",
    payment: paymentTone,
  }
}

/**
 * Deterministic glyph field (T1). Seeded by (row, col) — never Math.random() —
 * so it is stable across re-renders and never flickers.
 */
const GLYPH_SOURCE = REASON_CODES.join("·")

export function glyphAt(row: number, col: number): string {
  const h = hash(row * 131 + col * 977)
  // Roughly 3 in 5 cells are the neutral separator; the rest carry real vocabulary.
  if (h % 5 < 3) return "·"
  return GLYPH_SOURCE[h % GLYPH_SOURCE.length] ?? "·"
}

export function glyphWeight(row: number, col: number, rows: number): number {
  const h = hash(row * 613 + col * 271)
  // Denser toward the membrane's own edges, sparser through its middle.
  const edge = 1 - Math.abs(row - (rows - 1) / 2) / ((rows - 1) / 2 || 1)
  return 0.25 + (h % 100) / 260 + edge * 0.18
}

function hash(n: number): number {
  let x = n | 0
  x = (x ^ 61) ^ (x >>> 16)
  x = x + (x << 3)
  x = x ^ (x >>> 4)
  x = Math.imul(x, 0x27d4eb2d)
  x = x ^ (x >>> 15)
  return Math.abs(x)
}

/** Compact, honest one-line summary of a buyer tool observation. */
export function summariseObservation(tool: string, obs: unknown): string {
  if (obs === null || obs === undefined) return "—"
  if (typeof obs !== "object") return String(obs)
  const o = obs as Record<string, unknown>
  if (typeof o.error === "string") return `error: ${o.error}`
  if (tool === "search_catalog" && Array.isArray(o.products)) {
    return `${o.products.length} match${o.products.length === 1 ? "" : "es"}: ${o.products
      .slice(0, 3)
      .map((p) => (p as { sku?: string }).sku ?? "?")
      .join(", ")}${o.products.length > 3 ? ", …" : ""}`
  }
  if (tool === "get_product" && typeof o.sku === "string") {
    return `${o.sku} · ${String(o.title ?? "")} · ${typeof o.price === "number" ? inr(o.price) : "?"}`
  }
  if (tool === "propose_cart" && typeof o.cart_id === "string") {
    return `${o.cart_id} · subtotal ${typeof o.subtotal === "number" ? inr(o.subtotal) : "?"} · ${String(o.status ?? "")}`
  }
  if (tool === "request_checkout" && typeof o.decision === "string") {
    return `gateway returned ${o.decision}${
      Array.isArray(o.reason_codes) && o.reason_codes.length > 0 ? ` · ${o.reason_codes.join(", ")}` : ""
    }`
  }
  return JSON.stringify(obs).slice(0, 160)
}

export interface CartLine {
  sku: string
  quantity: number
  title: string
  price: number | null
}

export interface CartView {
  cartId: string
  lines: CartLine[]
  subtotal: number
}

/**
 * Reconstructs the proposed cart from the buyer transcript that the API
 * actually returned. Titles and unit prices come from the catalog observations
 * in the same transcript; the subtotal is the SERVER-priced figure returned by
 * propose_cart. Nothing is priced or invented here.
 */
export function deriveCart(transcript: TranscriptEntry[]): CartView | null {
  const catalog = new Map<string, { title: string; price: number }>()
  for (const t of transcript) {
    const obs = t.observation as Record<string, unknown> | null
    if (!obs || typeof obs !== "object") continue
    if (Array.isArray(obs.products)) {
      for (const p of obs.products as Record<string, unknown>[]) {
        if (typeof p.sku === "string" && typeof p.title === "string" && typeof p.price === "number") {
          catalog.set(p.sku, { title: p.title, price: p.price })
        }
      }
    }
    if (typeof obs.sku === "string" && typeof obs.title === "string" && typeof obs.price === "number") {
      catalog.set(obs.sku, { title: obs.title, price: obs.price })
    }
  }

  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i]
    if (!t || t.action.tool !== "propose_cart") continue
    const obs = t.observation as Record<string, unknown> | null
    if (!obs || typeof obs.cart_id !== "string" || typeof obs.subtotal !== "number") continue
    const items = (obs.items as { sku: string; quantity: number }[] | undefined) ?? []
    return {
      cartId: obs.cart_id,
      subtotal: obs.subtotal,
      lines: items.map((it) => ({
        sku: it.sku,
        quantity: it.quantity,
        title: catalog.get(it.sku)?.title ?? it.sku,
        price: catalog.get(it.sku)?.price ?? null,
      })),
    }
  }
  return null
}
