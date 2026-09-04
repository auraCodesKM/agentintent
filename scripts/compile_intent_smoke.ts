// P4 proof: compile one real intent through Gemini. Two calls max.
process.loadEnvFile(".env")

import { compileIntent } from "../src/intent/compiler"

async function main(): Promise<void> {
  const contract = await compileIntent(
    "Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only. Prefer black.",
  )
  console.log(JSON.stringify(contract, null, 2))
}

main().catch((err) => {
  console.error("compile failed:", err instanceof Error ? err.message : err)
  process.exitCode = 1
})
