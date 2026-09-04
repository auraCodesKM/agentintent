// Generates data/eval_cases.json — 240 deterministic cases with fixture ground truth.
import { writeFileSync } from "node:fs"
import { generateEvalCases } from "../src/eval/generate"

const cases = generateEvalCases()
writeFileSync("data/eval_cases.json", JSON.stringify(cases, null, 2))

const bySplit: Record<string, number> = {}
const byClass: Record<string, number> = {}
for (const c of cases) {
  bySplit[c.split] = (bySplit[c.split] ?? 0) + 1
  byClass[c.evalClass] = (byClass[c.evalClass] ?? 0) + 1
}
console.log("total:", cases.length)
console.log("splits:", JSON.stringify(bySplit))
console.log("classes:", JSON.stringify(byClass))
