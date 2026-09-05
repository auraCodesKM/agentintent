import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock Razorpay adapter and Gemini judge — unit-test only; demo path stays real.
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

const { requestCheckout, approveStepUp, ApprovalError } = await import("@/gateway/decide")
const { createSession, proposeCart } = await import("@/gateway/session")
const { prisma } = await import("@/lib/db")
const { nanoid } = await import("nanoid")

async function makeIntent(constraints: {
  max_amount: number
  max_quantity: number
  allowed_categories: string[]
}): Promise<{ intentId: string; sessionId: string }> {
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
      rawRequest: "test request",
      structuredContract: JSON.stringify(contract),
      status: "ACTIVE",
      expiresAt: new Date(contract.expires_at),
    },
  })
  return { intentId, sessionId }
}

describe("decide.ts authorization boundary", () => {
  beforeEach(() => {
    createOrderMock.mockReset()
    judgeCartMock.mockReset()
    createOrderMock.mockResolvedValue({
      razorpayOrderId: `order_mock_${nanoid(8)}`,
      amountPaise: 749900,
      currency: "INR",
      status: "created",
    })
    judgeCartMock.mockResolvedValue({
      match: true,
      confidence: 0.95,
      violated_constraints: [],
      reason: "matches",
    })
  })

  it("BLOCK on over-amount: zero createOrder calls, judge never invoked", async () => {
    const { intentId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-005", quantity: 1 }]) // ₹13,999
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("BLOCK")
    expect(decision.reason_codes).toContain("MAX_AMOUNT_EXCEEDED")
    expect(decision.razorpay_order_id).toBeNull()
    expect(createOrderMock).not.toHaveBeenCalled()
    expect(judgeCartMock).not.toHaveBeenCalled()
  })

  it("ALLOW invokes createOrder exactly once", async () => {
    const { intentId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }]) // ₹7,499
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("ALLOW")
    expect(decision.razorpay_order_id).toMatch(/^order_mock_/)
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    // Amount passed in rupees; adapter converts to paise at boundary.
    expect(createOrderMock.mock.calls[0]?.[0]).toMatchObject({ subtotalInr: 7499 })
  })

  it("semantic mismatch with high confidence BLOCKs without createOrder", async () => {
    judgeCartMock.mockResolvedValue({ match: false, confidence: 0.97, violated_constraints: ["has_screen"], reason: "screen" })
    const { intentId } = await makeIntent({ max_amount: 2000, max_quantity: 1, allowed_categories: ["electronics"] })
    const cart = await proposeCart(intentId, [{ sku: "TB-001", quantity: 1 }]) // ₹1,799 passes policy
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("BLOCK")
    expect(decision.reason_codes).toContain("SEMANTIC_MISMATCH")
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it("low confidence yields STEP_UP without createOrder", async () => {
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.61, violated_constraints: [], reason: "unsure" })
    const { intentId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["speakers"] })
    const cart = await proposeCart(intentId, [{ sku: "SP-002", quantity: 1 }])
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("STEP_UP")
    expect(decision.reason_codes).toContain("SEMANTIC_LOW_CONFIDENCE")
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it("judge failure fails closed to STEP_UP, never ALLOW", async () => {
    const { SemanticJudgeError } = await import("@/semantic/judge")
    judgeCartMock.mockRejectedValue(new SemanticJudgeError("invalid model output"))
    const { intentId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("STEP_UP")
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it("expired intent BLOCKs at L1 without judge or createOrder", async () => {
    const { intentId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })
    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])
    await prisma.intentContract.update({ where: { id: intentId }, data: { expiresAt: new Date(Date.now() - 1000) } })
    const decision = await requestCheckout(intentId, cart.cartId)

    expect(decision.decision).toBe("BLOCK")
    expect(decision.reason_codes).toContain("INTENT_EXPIRED")
    expect(judgeCartMock).not.toHaveBeenCalled()
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it("B1: a consumed intent cannot approve a second STEP_UP from a different cart (single-use enforced on approveStepUp)", async () => {
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.6, violated_constraints: [], reason: "unsure" })
    const { intentId } = await makeIntent({ max_amount: 20000, max_quantity: 5, allowed_categories: ["headphones"] })

    const cartA = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }]) // ₹7,499
    const stepUpA = await requestCheckout(intentId, cartA.cartId)
    expect(stepUpA.decision).toBe("STEP_UP")
    expect(stepUpA.authorization_id).not.toBeNull()

    const cartB = await proposeCart(intentId, [{ sku: "HP-005", quantity: 1 }]) // ₹13,999, different cart
    const stepUpB = await requestCheckout(intentId, cartB.cartId)
    expect(stepUpB.decision).toBe("STEP_UP")
    expect(stepUpB.authorization_id).not.toBeNull()
    expect(stepUpB.authorization_id).not.toBe(stepUpA.authorization_id)

    // Approve #1 succeeds: real ALLOW, one order, intent now CONSUMED.
    const approve1 = await approveStepUp(stepUpA.authorization_id!)
    expect(approve1.decision).toBe("ALLOW")
    expect(approve1.razorpay_order_id).not.toBeNull()
    expect(createOrderMock).toHaveBeenCalledTimes(1)

    // Approve #2 (different cart, same now-consumed intent) must be rejected,
    // not silently mint a second Order.
    await expect(approveStepUp(stepUpB.authorization_id!)).rejects.toThrow(ApprovalError)
    await expect(approveStepUp(stepUpB.authorization_id!)).rejects.toMatchObject({
      code: "AUTHORIZATION_NOT_APPROVABLE",
    })
    expect(createOrderMock).toHaveBeenCalledTimes(1) // still exactly once — no second order

    const authB = await prisma.authorizationDecision.findUnique({ where: { id: stepUpB.authorization_id! } })
    expect(authB?.status).toBe("REJECTED")

    // Idempotent re-approval of auth #1 (the one that already produced an
    // order) still returns that SAME order, unaffected by consumption.
    const reapprove1 = await approveStepUp(stepUpA.authorization_id!)
    expect(reapprove1.decision).toBe("ALLOW")
    expect(reapprove1.razorpay_order_id).toBe(approve1.razorpay_order_id)
    expect(createOrderMock).toHaveBeenCalledTimes(1) // no new order from the idempotent re-approve

    const orderRows = await prisma.razorpayOrder.count({ where: { intentId } })
    expect(orderRows).toBe(1)
  })

  it("C2: approveStepUp rejects a STEP_UP whose parent session has since expired, without approving or creating an order", async () => {
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.6, violated_constraints: [], reason: "unsure" })
    const { intentId, sessionId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })

    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }]) // ₹7,499
    const stepUp = await requestCheckout(intentId, cart.cartId)
    expect(stepUp.decision).toBe("STEP_UP")
    expect(stepUp.authorization_id).not.toBeNull()

    // The STEP_UP's parent session dies after the fact (expiry or deactivation
    // — either way requireActiveSession must reject it).
    await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } })

    await expect(approveStepUp(stepUp.authorization_id!)).rejects.toThrow(ApprovalError)
    await expect(approveStepUp(stepUp.authorization_id!)).rejects.toMatchObject({
      code: "AUTHORIZATION_NOT_APPROVABLE",
    })
    expect(createOrderMock).not.toHaveBeenCalled()

    const auth = await prisma.authorizationDecision.findUnique({ where: { id: stepUp.authorization_id! } })
    expect(auth?.status).not.toBe("APPROVED")
    expect(auth?.status).toBe("STEP_UP") // untouched — rejection happens before the APPROVED write

    expect(await prisma.razorpayOrder.count({ where: { intentId } })).toBe(0)
  })

  it("C2: approveStepUp rejects a STEP_UP whose parent session was deactivated (status != ACTIVE)", async () => {
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.6, violated_constraints: [], reason: "unsure" })
    const { intentId, sessionId } = await makeIntent({ max_amount: 8000, max_quantity: 1, allowed_categories: ["headphones"] })

    const cart = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }])
    const stepUp = await requestCheckout(intentId, cart.cartId)
    expect(stepUp.decision).toBe("STEP_UP")

    await prisma.session.update({ where: { id: sessionId }, data: { status: "REVOKED" } })

    await expect(approveStepUp(stepUp.authorization_id!)).rejects.toMatchObject({
      code: "AUTHORIZATION_NOT_APPROVABLE",
    })
    expect(createOrderMock).not.toHaveBeenCalled()
    expect(await prisma.razorpayOrder.count({ where: { intentId } })).toBe(0)
  })

  // ---- C1 (finding F5): CONCURRENT single-use enforcement ----
  //
  // HONESTY NOTE — read before trusting these two tests. They fire the calls
  // with Promise.all instead of awaiting them in sequence, so the two flows
  // genuinely interleave at every await point and each one's CONSUMED
  // pre-check can be overtaken by the other. That is what makes them a
  // regression test for F5: both fail against the pre-C1 code, where the
  // intent was consumed only AFTER createOrder returned.
  //
  // They are NOT a true OS-level race reproduction. Node runs one thread,
  // Prisma multiplexes these queries, and SQLite serializes writers with a
  // file lock, so the interleaving is deterministic rather than adversarial.
  // What they prove is that the guard's LOGIC is correct when the two flows
  // interleave — not that the database's locking is correct under real
  // parallelism. The atomicity argument itself rests on the claim being a
  // single conditional UPDATE (status in the WHERE clause), which SQLite and
  // Postgres both serialize; that part is verified by code inspection, not by
  // this test.
  it("C1: two CONCURRENT approveStepUp calls on different carts of one intent create exactly one order", async () => {
    judgeCartMock.mockResolvedValue({ match: true, confidence: 0.6, violated_constraints: [], reason: "unsure" })
    const { intentId } = await makeIntent({ max_amount: 20000, max_quantity: 5, allowed_categories: ["headphones"] })

    const cartA = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }]) // ₹7,499
    const cartB = await proposeCart(intentId, [{ sku: "HP-005", quantity: 1 }]) // ₹13,999
    const stepUpA = await requestCheckout(intentId, cartA.cartId)
    const stepUpB = await requestCheckout(intentId, cartB.cartId)
    expect(stepUpA.decision).toBe("STEP_UP")
    expect(stepUpB.decision).toBe("STEP_UP")

    // Fired together, NOT awaited one after the other.
    const settled = await Promise.allSettled([
      approveStepUp(stepUpA.authorization_id!),
      approveStepUp(stepUpB.authorization_id!),
    ])

    // Exactly one winner with a real order id.
    const allowed = settled.filter(
      (r) => r.status === "fulfilled" && r.value.decision === "ALLOW" && r.value.razorpay_order_id !== null,
    )
    expect(allowed).toHaveLength(1)

    // The loser must fail closed. Which shape depends on where it lost: it
    // either read CONSUMED at the pre-check (ApprovalError) or lost the atomic
    // claim inside executeAllow (audited BLOCK/REPLAY_DETECTED). Both are
    // acceptable; an ALLOW or an unhandled throw is not.
    const loser = settled.find((r) => !(r.status === "fulfilled" && r.value.decision === "ALLOW"))!
    if (loser.status === "fulfilled") {
      expect(loser.value.decision).toBe("BLOCK")
      expect(loser.value.reason_codes).toContain("REPLAY_DETECTED")
      expect(loser.value.razorpay_order_id).toBeNull()
    } else {
      expect(loser.reason).toBeInstanceOf(ApprovalError)
    }

    // The money-path assertions: one Razorpay call, one order row.
    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(await prisma.razorpayOrder.count({ where: { intentId } })).toBe(1)
  })

  it("C1: two CONCURRENT requestCheckout calls on different carts of one intent create exactly one order", async () => {
    const { intentId } = await makeIntent({ max_amount: 20000, max_quantity: 5, allowed_categories: ["headphones"] })

    const cartA = await proposeCart(intentId, [{ sku: "HP-004", quantity: 1 }]) // ₹7,499
    const cartB = await proposeCart(intentId, [{ sku: "HP-005", quantity: 1 }]) // ₹13,999

    // Different carts hash to different replay keys, so the replay reservation
    // does NOT separate these two — only the atomic intent claim does.
    const [resA, resB] = await Promise.all([
      requestCheckout(intentId, cartA.cartId),
      requestCheckout(intentId, cartB.cartId),
    ])

    const decisions = [resA.decision, resB.decision].sort()
    expect(decisions).toEqual(["ALLOW", "BLOCK"])

    const winner = resA.decision === "ALLOW" ? resA : resB
    const loser = resA.decision === "ALLOW" ? resB : resA
    expect(winner.razorpay_order_id).not.toBeNull()
    expect(loser.reason_codes).toContain("REPLAY_DETECTED")
    expect(loser.razorpay_order_id).toBeNull()

    expect(createOrderMock).toHaveBeenCalledTimes(1)
    expect(await prisma.razorpayOrder.count({ where: { intentId } })).toBe(1)
  })
})
