import { describe, expect, it } from "vitest"
import { CompiledIntentSchema, IntentContractSchema } from "@/lib/schemas"

const valid = {
  currency: "INR",
  constraints: {
    max_amount: 8000,
    max_quantity: 1,
    allowed_categories: ["headphones"],
    excluded_attributes: [],
    required_attributes: [],
  },
  preferences: { color: "black" },
}

describe("intent schemas", () => {
  it("accepts a valid compiled intent", () => {
    expect(CompiledIntentSchema.parse(valid).constraints.max_amount).toBe(8000)
  })

  it("rejects missing constraints", () => {
    expect(() => CompiledIntentSchema.parse({ currency: "INR" })).toThrow()
  })

  it("rejects non-positive or non-integer amounts", () => {
    for (const bad of [0, -1, 79.99]) {
      expect(() =>
        CompiledIntentSchema.parse({
          ...valid,
          constraints: { ...valid.constraints, max_amount: bad },
        }),
      ).toThrow()
    }
  })

  it("rejects empty category list", () => {
    expect(() =>
      CompiledIntentSchema.parse({
        ...valid,
        constraints: { ...valid.constraints, allowed_categories: [] },
      }),
    ).toThrow()
  })

  it("rejects non-INR currency", () => {
    expect(() => CompiledIntentSchema.parse({ ...valid, currency: "USD" })).toThrow()
  })

  it("strict mode rejects LLM-invented server fields (cannot mint its own intent_id/expiry)", () => {
    expect(() =>
      CompiledIntentSchema.parse({ ...valid, intent_id: "int_evil", expires_at: "2099-01-01T00:00:00Z" }),
    ).toThrow()
  })

  it("full contract requires server-controlled fields", () => {
    expect(() => IntentContractSchema.parse(valid)).toThrow()
    const full = IntentContractSchema.parse({
      ...valid,
      intent_id: "int_1",
      merchant_id: "demo_store",
      session_id: "sess_1",
      expires_at: new Date().toISOString(),
    })
    expect(full.intent_id).toBe("int_1")
  })
})
