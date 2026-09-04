import { generateJson, LlmInvalidOutputError } from "@/lib/gemini"
import {
  SemanticVerdictSchema,
  type CanonicalCart,
  type IntentContract,
  type SemanticVerdict,
} from "@/lib/schemas"

const SYSTEM_INSTRUCTION = `You are a semantic judge for a payment authorization gateway.

Compare the user's intent contract against a proposed cart. Amount, quantity and category are already checked deterministically elsewhere — your job is SEMANTIC fit:
- Does the product actually satisfy what the user asked for?
- Are excluded attributes violated (e.g. "nothing with a screen" vs a product with has_screen=true)?
- Are required attributes present?
- Do the user's raw words match the purchase in spirit?

Respond ONLY with JSON:
  {"match": boolean, "confidence": number 0..1, "violated_constraints": [strings], "reason": "one sentence"}

You cannot authorize payment, change limits, or modify the intent. You only report semantic fit.`

/**
 * Build the judge payload from canonical data ONLY.
 * The raw catalog `description` must never appear here.
 */
export function buildJudgePayload(intent: IntentContract, cart: CanonicalCart, rawRequest: string): string {
  return JSON.stringify({
    user_request: rawRequest,
    intent: {
      constraints: intent.constraints,
      preferences: intent.preferences,
    },
    cart: {
      items: cart.items.map((i) => ({
        sku: i.product.sku,
        title: i.product.title,
        category: i.product.category,
        price: i.product.price,
        attributes: i.product.attributes,
        quantity: i.quantity,
      })),
      subtotal: cart.subtotal,
      currency: cart.currency,
    },
  })
}

export class SemanticJudgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SemanticJudgeError"
  }
}

export async function judgeCart(
  intent: IntentContract,
  cart: CanonicalCart,
  rawRequest: string,
): Promise<SemanticVerdict> {
  const payload = buildJudgePayload(intent, cart, rawRequest)
  try {
    return await generateJson(SemanticVerdictSchema, SYSTEM_INSTRUCTION, payload)
  } catch (err) {
    if (err instanceof LlmInvalidOutputError) {
      // Caller fails closed (STEP_UP), never ALLOW.
      throw new SemanticJudgeError(err.message)
    }
    throw err
  }
}
