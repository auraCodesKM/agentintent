import { generateJson, LlmInvalidOutputError } from "@/lib/gemini"
import { CompiledIntentSchema, type CompiledIntent } from "@/lib/schemas"
import { loadCatalog } from "@/catalog/catalog"

const SYSTEM_INSTRUCTION = `You compile a user's natural-language purchase request into a strict JSON intent contract for a shopping gateway.

Rules:
- Output ONLY JSON matching exactly:
  {
    "currency": "INR",
    "constraints": {
      "max_amount": <positive integer rupees>,
      "max_quantity": <positive integer>,
      "allowed_categories": [<category strings>],
      "excluded_attributes": [<attribute names the user forbids>],
      "required_attributes": [<attribute names the user requires>]
    },
    "preferences": { <string key-value soft preferences> }
  }
- max_amount: the budget the user stated. NEVER invent a higher budget. If no budget stated, use a conservative estimate for the cheapest plausible product and note "budget_assumed": "true" in preferences.
- max_quantity: what the user asked for; default 1.
- allowed_categories: choose ONLY from the known category list provided in the prompt.
- excluded_attributes: e.g. user says "nothing with a screen" -> ["has_screen"].
- preferences: soft wishes (color, quality, occasion) that do not gate payment.
- You cannot authorize payment, set ids, or set expiry.`

export class IntentCompilationError extends Error {
  readonly reasonCode = "INVALID_INTENT" as const
  constructor(message: string) {
    super(message)
    this.name = "IntentCompilationError"
  }
}

export async function compileIntent(rawRequest: string): Promise<CompiledIntent> {
  const categories = [...new Set(loadCatalog().map((p) => p.category))]
  const prompt = `Known catalog categories: ${categories.join(", ")}\n\nUser request:\n"""${rawRequest}"""`

  try {
    return await generateJson(CompiledIntentSchema, SYSTEM_INSTRUCTION, prompt)
  } catch (err) {
    if (err instanceof LlmInvalidOutputError) {
      throw new IntentCompilationError(err.message)
    }
    throw err
  }
}
