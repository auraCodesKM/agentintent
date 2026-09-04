// Runs the offline evaluation. NEVER calls Razorpay (the eval module tree has no
// razorpay import; see src/eval/run.ts). Judge calls go to Gemini, concurrency-capped.
// Usage:
//   npx tsx scripts/run_eval.ts                 # all splits, writes data/eval_results.json
//   npx tsx scripts/run_eval.ts --split held-out
process.loadEnvFile(".env")
// Pace judge calls to stay under the key's per-minute quota (default 13 RPM; override in .env).
process.env.GEMINI_RPM ||= "13"

import { readFileSync, writeFileSync } from "node:fs"
import { runEvaluation } from "../src/eval/run"
import { computeMetrics } from "../src/eval/metrics"
import type { EvalCase } from "../src/eval/cases"

async function main(): Promise<void> {
  const splitArg = process.argv.includes("--split")
    ? process.argv[process.argv.indexOf("--split") + 1]
    : null

  const all = JSON.parse(readFileSync("data/eval_cases.json", "utf8")) as EvalCase[]
  const cases = splitArg ? all.filter((c) => c.split === splitArg) : all
  console.log(`running ${cases.length} cases${splitArg ? ` (split=${splitArg})` : ""}...`)

  const started = Date.now()
  const { results, judgeCalls, razorpayCalls } = await runEvaluation(cases, {
    onProgress: (done, total) => {
      if (done % 20 === 0 || done === total) process.stdout.write(`  ${done}/${total}\n`)
    },
  })

  const splits = splitArg ? [splitArg] : ["dev", "validation", "held-out", "all"]
  const metrics = splits.map((s) => computeMetrics(results, s))

  const output = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    judge_calls: judgeCalls,
    razorpay_calls: razorpayCalls,
    metrics,
    results,
  }
  writeFileSync("data/eval_results.json", JSON.stringify(output, null, 2))

  for (const m of metrics) {
    console.log(
      `\n[${m.split}] cases=${m.cases} accuracy=${(m.accuracy * 100).toFixed(1)}%` +
        ` policy=${(m.policy.accuracy * 100).toFixed(1)}% semantic=${(m.semantic.accuracy * 100).toFixed(1)}%` +
        `\n  falseBlocks=${m.falseBlocks} (${(m.falseBlockRate * 100).toFixed(1)}%, ₹${m.falseBlockGmvInr})` +
        ` stepUpRate=${(m.stepUpRate * 100).toFixed(1)}% unauthorizedAllows=${m.unauthorizedAllows}` +
        `\n  latency mean=${m.meanLatencyMs}ms p95=${m.p95LatencyMs}ms`,
    )
    console.log("  byClass:", JSON.stringify(m.byClass))
  }
  console.log(`\njudge calls: ${judgeCalls}, razorpay calls: ${razorpayCalls}`)
  console.log("written: data/eval_results.json")
}

main().catch((err) => {
  console.error("eval failed:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
