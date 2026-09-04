import type { CanonicalCart, IntentContract, ReasonCode } from "@/lib/schemas"

export interface PolicyResult {
  allowed: boolean
  reasonCodes: ReasonCode[]
}

export interface MerchantPolicy {
  maxAmount: number // rupees
  maxQuantity: number
  allowedCategories: string[]
}

/**
 * L2 deterministic policy. Pure function: no I/O, no LLM.
 * Checks intent constraints AND merchant policy against the canonical cart.
 * Collects every violated rule rather than stopping at the first.
 */
export function checkPolicy(input: {
  intent: IntentContract
  merchantPolicy: MerchantPolicy
  cart: CanonicalCart
}): PolicyResult {
  const { intent, merchantPolicy, cart } = input
  const reasonCodes: ReasonCode[] = []

  const totalQuantity = cart.items.reduce((sum, i) => sum + i.quantity, 0)

  const maxAmount = Math.min(intent.constraints.max_amount, merchantPolicy.maxAmount)
  if (cart.subtotal > maxAmount) {
    reasonCodes.push("MAX_AMOUNT_EXCEEDED")
  }

  const maxQuantity = Math.min(intent.constraints.max_quantity, merchantPolicy.maxQuantity)
  if (totalQuantity > maxQuantity) {
    reasonCodes.push("MAX_QUANTITY_EXCEEDED")
  }

  const intentCategories = new Set(intent.constraints.allowed_categories)
  const merchantCategories = new Set(merchantPolicy.allowedCategories)
  for (const item of cart.items) {
    const cat = item.product.category
    if (!intentCategories.has(cat) || !merchantCategories.has(cat)) {
      if (!reasonCodes.includes("CATEGORY_MISMATCH")) {
        reasonCodes.push("CATEGORY_MISMATCH")
      }
    }
  }

  return { allowed: reasonCodes.length === 0, reasonCodes }
}

/** L1 expiry check, pure. */
export function isIntentExpired(intent: IntentContract, now: Date): boolean {
  return new Date(intent.expires_at).getTime() <= now.getTime()
}
