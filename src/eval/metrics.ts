import type { EvalCaseResult } from "./cases"

export interface EvalMetrics {
  split: string
  cases: number
  correct: number
  accuracy: number
  // Policy layer (deterministic classes A, B, C, E, F): did BLOCK fire correctly?
  policy: { cases: number; correct: number; accuracy: number }
  // Semantic layer (classes D, G, H + LEGIT): judge-dependent outcomes
  semantic: { cases: number; correct: number; accuracy: number }
  // Legitimate purchases wrongly blocked
  falseBlocks: number
  falseBlockRate: number
  falseBlockGmvInr: number // sum of legitimate GMV incorrectly blocked
  stepUpRate: number
  unauthorizedAllows: number // adversarial cases that reached ALLOW when they must not
  meanLatencyMs: number
  p95LatencyMs: number
  byClass: Record<string, { cases: number; correct: number }>
}

const POLICY_CLASSES = new Set(["A", "B", "C", "E", "F"])
const SEMANTIC_CLASSES = new Set(["D", "G", "H", "LEGIT"])

export function computeMetrics(results: EvalCaseResult[], split: string): EvalMetrics {
  const subset = split === "all" ? results : results.filter((r) => r.split === split)
  const legit = subset.filter((r) => r.evalClass === "LEGIT")
  const policyCases = subset.filter((r) => POLICY_CLASSES.has(r.evalClass))
  const semanticCases = subset.filter((r) => SEMANTIC_CLASSES.has(r.evalClass))

  const falseBlockList = legit.filter((r) => r.actualDecision === "BLOCK")
  const stepUps = subset.filter((r) => r.actualDecision === "STEP_UP")
  // Adversarial classes whose expected outcome forbids ALLOW:
  const mustNotAllow = subset.filter(
    (r) => r.expectedDecision !== "ALLOW" && r.actualDecision === "ALLOW",
  )

  const latencies = subset.map((r) => r.latencyMs).sort((a, b) => a - b)
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0

  const byClass: Record<string, { cases: number; correct: number }> = {}
  for (const r of subset) {
    const entry = (byClass[r.evalClass] ??= { cases: 0, correct: 0 })
    entry.cases++
    if (r.correct) entry.correct++
  }

  const count = (arr: EvalCaseResult[]): { cases: number; correct: number; accuracy: number } => ({
    cases: arr.length,
    correct: arr.filter((r) => r.correct).length,
    accuracy: arr.length === 0 ? 1 : arr.filter((r) => r.correct).length / arr.length,
  })

  return {
    split,
    cases: subset.length,
    correct: subset.filter((r) => r.correct).length,
    accuracy: subset.length === 0 ? 1 : subset.filter((r) => r.correct).length / subset.length,
    policy: count(policyCases),
    semantic: count(semanticCases),
    falseBlocks: falseBlockList.length,
    falseBlockRate: legit.length === 0 ? 0 : falseBlockList.length / legit.length,
    falseBlockGmvInr: falseBlockList.reduce((sum, r) => sum + r.subtotal, 0),
    stepUpRate: subset.length === 0 ? 0 : stepUps.length / subset.length,
    unauthorizedAllows: mustNotAllow.length,
    meanLatencyMs:
      latencies.length === 0 ? 0 : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95LatencyMs: p95,
    byClass,
  }
}
