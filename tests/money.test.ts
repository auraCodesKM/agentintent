import { describe, expect, it } from "vitest"
import { formatInr, fromPaise, toPaise } from "@/lib/money"

describe("money", () => {
  it("converts rupees to integer paise", () => {
    expect(toPaise(7499)).toBe(749900)
    expect(toPaise(1)).toBe(100)
    expect(toPaise(0)).toBe(0)
  })

  it("rounds fractional rupees to nearest paisa", () => {
    expect(toPaise(99.99)).toBe(9999)
    expect(toPaise(0.005)).toBe(1)
    // float artifacts must not truncate
    expect(toPaise(19.9)).toBe(1990)
  })

  it("converts paise back to rupees", () => {
    expect(fromPaise(749900)).toBe(7499)
    expect(fromPaise(1)).toBe(0.01)
  })

  it("round-trips", () => {
    for (const inr of [1, 42, 7499, 13999, 199.5]) {
      expect(fromPaise(toPaise(inr))).toBe(inr)
    }
  })

  it("locks the ₹7,499 → 749900 boundary example", () => {
    // Never send 7499 as Razorpay amount when ₹7,499 is meant.
    expect(toPaise(7499)).not.toBe(7499)
    expect(toPaise(7499)).toBe(749900)
  })

  it("formats INR for UI", () => {
    expect(formatInr(7499)).toBe("₹7,499")
  })
})
