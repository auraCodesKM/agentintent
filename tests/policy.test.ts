import { describe, expect, it } from "vitest"
import { checkPolicy, isIntentExpired, type MerchantPolicy } from "@/policy/engine"
import type { CanonicalCart, IntentContract } from "@/lib/schemas"

const merchantPolicy: MerchantPolicy = {
  maxAmount: 50000,
  maxQuantity: 10,
  allowedCategories: ["headphones", "electronics", "groceries", "speakers", "toys"],
}

function intent(overrides: Partial<IntentContract["constraints"]> = {}): IntentContract {
  return {
    intent_id: "int_test1",
    merchant_id: "demo_store",
    session_id: "sess_test1",
    currency: "INR",
    constraints: {
      max_amount: 8000,
      max_quantity: 1,
      allowed_categories: ["headphones"],
      excluded_attributes: [],
      required_attributes: [],
      ...overrides,
    },
    preferences: {},
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
}

function cart(items: { category: string; price: number; quantity: number }[]): CanonicalCart {
  return {
    cart_id: "cart_test1",
    intent_id: "int_test1",
    items: items.map((i, idx) => ({
      product: {
        sku: `SKU-${idx}`,
        title: `Product ${idx}`,
        category: i.category,
        price: i.price,
        currency: "INR" as const,
        attributes: {},
      },
      quantity: i.quantity,
    })),
    subtotal: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    currency: "INR",
  }
}

describe("policy engine", () => {
  it("allows a compliant cart", () => {
    const result = checkPolicy({
      intent: intent(),
      merchantPolicy,
      cart: cart([{ category: "headphones", price: 7499, quantity: 1 }]),
    })
    expect(result.allowed).toBe(true)
    expect(result.reasonCodes).toEqual([])
  })

  it("blocks over-budget carts", () => {
    const result = checkPolicy({
      intent: intent(),
      merchantPolicy,
      cart: cart([{ category: "headphones", price: 13999, quantity: 1 }]),
    })
    expect(result.allowed).toBe(false)
    expect(result.reasonCodes).toContain("MAX_AMOUNT_EXCEEDED")
  })

  it("blocks exactly one rupee over the limit", () => {
    const result = checkPolicy({
      intent: intent({ max_amount: 8000 }),
      merchantPolicy,
      cart: cart([{ category: "headphones", price: 8001, quantity: 1 }]),
    })
    expect(result.reasonCodes).toContain("MAX_AMOUNT_EXCEEDED")
  })

  it("allows exactly at the limit", () => {
    const result = checkPolicy({
      intent: intent({ max_amount: 8000 }),
      merchantPolicy,
      cart: cart([{ category: "headphones", price: 8000, quantity: 1 }]),
    })
    expect(result.allowed).toBe(true)
  })

  it("blocks over-quantity carts", () => {
    const result = checkPolicy({
      intent: intent({ max_quantity: 1 }),
      merchantPolicy,
      cart: cart([{ category: "headphones", price: 2000, quantity: 2 }]),
    })
    expect(result.reasonCodes).toContain("MAX_QUANTITY_EXCEEDED")
  })

  it("sums quantity across line items", () => {
    const result = checkPolicy({
      intent: intent({ max_quantity: 2, max_amount: 20000, allowed_categories: ["headphones", "groceries"] }),
      merchantPolicy,
      cart: cart([
        { category: "headphones", price: 2000, quantity: 2 },
        { category: "groceries", price: 300, quantity: 1 },
      ]),
    })
    expect(result.reasonCodes).toContain("MAX_QUANTITY_EXCEEDED")
  })

  it("blocks category violations", () => {
    const result = checkPolicy({
      intent: intent({ allowed_categories: ["headphones"] }),
      merchantPolicy,
      cart: cart([{ category: "electronics", price: 1799, quantity: 1 }]),
    })
    expect(result.reasonCodes).toContain("CATEGORY_MISMATCH")
  })

  it("merchant policy caps intent limits (min of both wins)", () => {
    const tightMerchant: MerchantPolicy = { ...merchantPolicy, maxAmount: 5000 }
    const result = checkPolicy({
      intent: intent({ max_amount: 8000 }),
      merchantPolicy: tightMerchant,
      cart: cart([{ category: "headphones", price: 7499, quantity: 1 }]),
    })
    expect(result.reasonCodes).toContain("MAX_AMOUNT_EXCEEDED")
  })

  it("merchant category list also gates", () => {
    const result = checkPolicy({
      intent: intent({ allowed_categories: ["alcohol"] }),
      merchantPolicy, // merchant does not sell alcohol
      cart: cart([{ category: "alcohol", price: 900, quantity: 1 }]),
    })
    expect(result.reasonCodes).toContain("CATEGORY_MISMATCH")
  })

  it("collects multiple violations at once", () => {
    const result = checkPolicy({
      intent: intent({ max_amount: 1000, max_quantity: 1, allowed_categories: ["groceries"] }),
      merchantPolicy,
      cart: cart([{ category: "electronics", price: 12999, quantity: 3 }]),
    })
    expect(result.allowed).toBe(false)
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["MAX_AMOUNT_EXCEEDED", "MAX_QUANTITY_EXCEEDED", "CATEGORY_MISMATCH"]),
    )
  })

  it("detects expired intents", () => {
    const expired = { ...intent(), expires_at: new Date(Date.now() - 1000).toISOString() }
    expect(isIntentExpired(expired, new Date())).toBe(true)
    expect(isIntentExpired(intent(), new Date())).toBe(false)
  })

  it("treats exact expiry instant as expired (fail closed)", () => {
    const now = new Date()
    const atBoundary = { ...intent(), expires_at: now.toISOString() }
    expect(isIntentExpired(atBoundary, now)).toBe(true)
  })
})
