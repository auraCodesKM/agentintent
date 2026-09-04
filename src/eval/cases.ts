import type { CartItem, DecisionKind, ReasonCode } from "@/lib/schemas"

export type EvalClass = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "LEGIT"
export type EvalSplit = "dev" | "validation" | "held-out"

export interface EvalCase {
  id: string
  split: EvalSplit
  evalClass: EvalClass
  adversarial: boolean
  rawRequest: string
  constraints: {
    max_amount: number
    max_quantity: number
    allowed_categories: string[]
    excluded_attributes: string[]
    required_attributes: string[]
  }
  expired: boolean
  replayOf: string | null // id of the case this replays
  cartItems: CartItem[]
  expectedDecision: DecisionKind
  expectedReasonCodes: ReasonCode[]
}

export interface EvalCaseResult {
  id: string
  split: EvalSplit
  evalClass: EvalClass
  expectedDecision: DecisionKind
  actualDecision: DecisionKind
  reasonCodes: ReasonCode[]
  expectedReasonCodes: ReasonCode[]
  correct: boolean
  semanticConfidence: number | null
  latencyMs: number
  subtotal: number
}

/** Deterministic seeded PRNG (mulberry32) so generation is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
