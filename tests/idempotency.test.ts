import { beforeEach, describe, expect, it, vi } from "vitest"

const createOrderMock = vi.fn()
vi.mock("@/razorpay/orders", () => ({
  createOrder: createOrderMock,
  RazorpayApiError: class RazorpayApiError extends Error {},
}))

const judgeCartMock = vi.fn()
vi.mock("@/semantic/judge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/semantic/judge")>()
  return { ...actual, judgeCart: judgeCartMock }
})

process.env.DATABASE_URL = "file:./dev.db"

const { requestCheckout } = await import("@/gateway/decide")
const { createSession, proposeCart } = await import("@/gateway/session")
const { makeReplayKey, reserveReplayKey } = await import("@/gateway/replay")
const { prisma } = await import("@/lib/db")
const { nanoid } = await import("nanoid")

async function makeIntent(constraints: {
  max_amount: number
  max_quantity: number
  allowed_categories: string[]
}): Promise<string> {
  const { sessionId } = await createSession()
  const intentId = `int_${nanoid(12)}`
  const contract = {
    intent_id: intentId,
    merchant_id: "demo_store",
    session_id: sessionId,
    currency: "INR",
    constraints: { ...constraints, excluded_attributes: [], required_attributes: [] },
    preferences: {},
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
  await prisma.intentContract.create({
    data: {
      id: intentId,
      sessionId,
      merchantId: "demo_store",
      rawRequest: "headphones under 8000",
      structuredContract: JSON.stringify(contract),
      status: "ACTIVE",
      expiresAt: new Date(contract.expires_at),
    },
  })
  return intentId
}

describe("order idempotency + replay", () => {
  beforeEach(() => {
    createOrderMock.mockReset()
    judgeCartMock.mockReset()
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.95, violated_constraints: [], reason: "ok" })
    createOrderMock.mockResolvedValue({
      razorpayOrderId: `order_mock_${nanoid(8)}`,
      amountPaise: 749900,
      currency: "INR",
      status: "created",
    })
  })

  it("concurrent duplicate: losing the reserve race BLOCKs REPLAY_DETECTED instead of throwing", async () => {
    // Simulates the TOCTOU loser: the replay key is reserved after the early
    // existence check would have passed, so reserveReplayKey hits P2002.
    const intentId = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])
    await reserveReplayKey(makeReplayKey(intentId, [{ sku: "HP-004", quantity: 1 }]), intentId)

    const decision = await requestCheckout(intentId, cart.cartId)
    expect(decision.decision).toBe("BLOCK")
    expect(decision.reason_codes).toContain("REPLAY_DETECTED")
    expect(decision.razorpay_order_id).toBeNull()
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it("consumed intent BLOCKs a new cart, but the same intent+cart retry still returns the order", async () => {
    const intentId = await makeIntent({ max_amount: 8000, max_quantity: 2, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])

    const first = await requestCheckout(intentId, cart.cartId)
    expect(first.decision).toBe("ALLOW")
    expect(await prisma.intentContract.findUnique({ where: { id: intentId }, select: { status: true } })).toEqual({
      status: "CONSUMED",
    })

    // A DIFFERENT cart on the consumed intent is blocked before the judge runs.
    const otherCart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 2 }])
    const blocked = await requestCheckout(intentId, otherCart.cartId)
    expect(blocked.decision).toBe("BLOCK")
    expect(blocked.reason_codes).toContain("REPLAY_DETECTED")

    // Idempotency contract survives consumption: same intent+cart → same order.
    const retry = await requestCheckout(intentId, cart.cartId)
    expect(retry.decision).toBe("ALLOW")
    expect(retry.razorpay_order_id).toBe(first.razorpay_order_id)
    expect(createOrderMock).toHaveBeenCalledTimes(1)
  })

  it("same intent+cart retried → one createOrder call, same order id returned", async () => {
    createOrderMock.mockResolvedValue({
      razorpayOrderId: `order_mock_${nanoid(8)}`,
      amountPaise: 749900,
      currency: "INR",
      status: "created",
    })

    const { sessionId } = await createSession()
    const intentId = `int_${nanoid(12)}`
    const contract = {
      intent_id: intentId,
      merchant_id: "demo_store",
      session_id: sessionId,
      currency: "INR",
      constraints: {
        max_amount: 8000,
        max_quantity: 1,
        allowed_categories: ["headphones"],
        excluded_attributes: [],
        required_attributes: [],
      },
      preferences: {},
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    }
    await prisma.intentContract.create({
      data: {
        id: intentId,
        sessionId,
        merchantId: "demo_store",
        rawRequest: "headphones under 8000",
        structuredContract: JSON.stringify(contract),
        status: "ACTIVE",
        expiresAt: new Date(contract.expires_at),
      },
    })

    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])

    const first = await requestCheckout(intentId, cart.cartId)
    expect(first.decision).toBe("ALLOW")
    expect(first.razorpay_order_id).not.toBeNull()

    const second = await requestCheckout(intentId, cart.cartId)
    expect(second.decision).toBe("ALLOW")
    expect(second.razorpay_order_id).toBe(first.razorpay_order_id)

    expect(createOrderMock).toHaveBeenCalledTimes(1)

    const rows = await prisma.razorpayOrder.count({ where: { intentId } })
    expect(rows).toBe(1)
  })
})
