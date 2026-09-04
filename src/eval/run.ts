import { createHash } from "node:crypto"
import { priceCart } from "@/catalog/catalog"
import { checkPolicy, type MerchantPolicy } from "@/policy/engine"
import { judgeCart, SemanticJudgeError } from "@/semantic/judge"
import {
  SEMANTIC_CONFIDENCE_THRESHOLD,
  type CanonicalCart,
  type DecisionKind,
  type IntentContract,
  type ReasonCode,
} from "@/lib/schemas"
import { canonicalCartJson } from "@/gateway/replay"
import type { EvalCase, EvalCaseResult } from "./cases"

// Offline evaluation of the authorization pipeline.
// L1 expiry/replay (in-memory) → L2 policy → L3 judge → L4 decision.
// NEVER calls Razorpay. Judge calls are capped at CONCURRENCY.

const CONCURRENCY = 3

const MERCHANT_POLICY: MerchantPolicy = {
  maxAmount: 50000,
  maxQuantity: 10,
  allowedCategories: ["headphones", "electronics", "speakers", "toys", "groceries"],
}

export interface EvalRunOutput {
  results: EvalCaseResult[]
  judgeCalls: number
  razorpayCalls: 0 // structurally zero: no razorpay import exists in this module tree
}

export async function runEvaluation(
  cases: EvalCase[],
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<EvalRunOutput> {
  const replaySeen = new Set<string>()
  const results: EvalCaseResult[] = []
  let judgeCalls = 0

  // Replay cases (class F) evaluate the same intent+cart twice inside ONE job so the
  // priming pass always completes (and reserves the replay key) before the scored pass.
  let done = 0
  let index = 0
  const total = cases.length
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < cases.length) {
      const evalCase = cases[index++]
      if (!evalCase) break
      if (evalCase.evalClass === "F") {
        await evaluateOne(evalCase, replaySeen, () => judgeCalls++) // priming pass (not scored)
      }
      const outcome = await evaluateOne(evalCase, replaySeen, () => judgeCalls++)
      results.push({
        id: evalCase.id,
        split: evalCase.split,
        evalClass: evalCase.evalClass,
        expectedDecision: evalCase.expectedDecision,
        actualDecision: outcome.decision,
        reasonCodes: outcome.reasonCodes,
        expectedReasonCodes: evalCase.expectedReasonCodes,
        correct: outcome.decision === evalCase.expectedDecision,
        semanticConfidence: outcome.semanticConfidence,
        latencyMs: outcome.latencyMs,
        subtotal: outcome.subtotal,
      })
      done++
      opts.onProgress?.(done, total)
    }
  })
  await Promise.all(workers)

  results.sort((a, b) => a.id.localeCompare(b.id))
  return { results, judgeCalls, razorpayCalls: 0 }
}

interface CaseOutcome {
  decision: DecisionKind
  reasonCodes: ReasonCode[]
  semanticConfidence: number | null
  latencyMs: number
  subtotal: number
}

async function evaluateOne(
  c: EvalCase,
  replaySeen: Set<string>,
  countJudgeCall: () => void,
): Promise<CaseOutcome> {
  const start = Date.now()
  const finish = (
    decision: DecisionKind,
    reasonCodes: ReasonCode[],
    semanticConfidence: number | null,
    subtotal: number,
  ): CaseOutcome => ({ decision, reasonCodes, semanticConfidence, latencyMs: Date.now() - start, subtotal })

  const priced = priceCart(c.cartItems)
  const subtotal = priced?.subtotal ?? 0

  // L1: expiry
  if (c.expired) return finish("BLOCK", ["INTENT_EXPIRED"], null, subtotal)

  // L1: replay
  const replayKey = `${c.id}:${createHash("sha256").update(canonicalCartJson(c.cartItems)).digest("hex")}`
  if (replaySeen.has(replayKey)) return finish("BLOCK", ["REPLAY_DETECTED"], null, subtotal)

  if (!priced) return finish("BLOCK", ["SKU_NOT_FOUND"], null, 0)

  const intent: IntentContract = {
    intent_id: c.id,
    merchant_id: "demo_store",
    session_id: `sess_eval`,
    currency: "INR",
    constraints: c.constraints,
    preferences: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }
  const cart: CanonicalCart = {
    cart_id: `cart_${c.id}`,
    intent_id: c.id,
    items: priced.items,
    subtotal: priced.subtotal,
    currency: "INR",
  }

  // L2: deterministic policy (failures never reach the judge)
  const policy = checkPolicy({ intent, merchantPolicy: MERCHANT_POLICY, cart })
  if (!policy.allowed) return finish("BLOCK", policy.reasonCodes, null, subtotal)

  // L3: semantic judge
  countJudgeCall()
  try {
    const verdict = await judgeCart(intent, cart, c.rawRequest)
    if (!verdict.match && verdict.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD) {
      replaySeen.add(replayKey)
      return finish("BLOCK", ["SEMANTIC_MISMATCH"], verdict.confidence, subtotal)
    }
    if (verdict.confidence < SEMANTIC_CONFIDENCE_THRESHOLD) {
      replaySeen.add(replayKey)
      return finish("STEP_UP", ["SEMANTIC_LOW_CONFIDENCE"], verdict.confidence, subtotal)
    }
    replaySeen.add(replayKey)
    return finish("ALLOW", [], verdict.confidence, subtotal)
  } catch (err) {
    if (err instanceof SemanticJudgeError) {
      // Fail closed; record the error so failed judge calls are visible in results.
      console.error(`  [${c.id}] judge error -> STEP_UP: ${err.message.slice(0, 120)}`)
      replaySeen.add(replayKey)
      return finish("STEP_UP", ["SEMANTIC_LOW_CONFIDENCE"], null, subtotal)
    }
    throw err
  }
}
