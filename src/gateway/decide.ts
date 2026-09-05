// THE authorization boundary. No other application path may create Razorpay Orders.
// L1 session/expiry/merchant/replay → L2 policy → L3 semantic judge → L4 decision.

import { nanoid } from "nanoid"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { audit } from "@/audit/logger"
import { getCart, getIntent, getIntentStatus, markIntentConsumed } from "@/gateway/session"
import { makeReplayKey, replayKeyExists, reserveReplayKey } from "@/gateway/replay"
import { checkPolicy, isIntentExpired, type MerchantPolicy } from "@/policy/engine"
import { priceCart } from "@/catalog/catalog"
import { judgeCart, SemanticJudgeError } from "@/semantic/judge"
import { createOrder, RazorpayApiError } from "@/razorpay/orders"
import {
  SEMANTIC_CONFIDENCE_THRESHOLD,
  type CanonicalCart,
  type ReasonCode,
  type SemanticVerdict,
} from "@/lib/schemas"

export interface CheckoutDecision {
  decision: "ALLOW" | "STEP_UP" | "BLOCK"
  reason_codes: ReasonCode[]
  authorization_id: string | null
  razorpay_order_id: string | null
  semantic_confidence: number | null
}

/**
 * Prisma unique-constraint violation (P2002). The DB constraint — not the
 * earlier read — is the real arbiter of who won a concurrent reservation.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
}

async function getActiveMerchantPolicy(merchantId: string): Promise<MerchantPolicy> {
  const row = await prisma.policy.findFirst({ where: { merchantId, active: true } })
  if (!row) throw new Error(`no active policy for merchant ${merchantId} — run seed`)
  return {
    maxAmount: row.maxAmount,
    maxQuantity: row.maxQuantity,
    allowedCategories: JSON.parse(row.allowedCategories) as string[],
  }
}

export async function requestCheckout(intentId: string, cartId: string): Promise<CheckoutDecision> {
  const intent = await getIntent(intentId)
  if (!intent) return await persistDecision(intentId, cartId, "BLOCK", ["INVALID_INTENT"], null)

  const cart = await getCart(cartId)
  if (!cart || cart.intentId !== intentId) {
    return await persistDecision(intentId, cartId, "BLOCK", ["INVALID_INTENT"], null, intent.session_id)
  }

  // ---- L1: session / expiry / merchant / replay ----
  const session = await prisma.session.findUnique({ where: { id: intent.session_id } })
  if (!session || session.status !== "ACTIVE" || session.expiresAt.getTime() <= Date.now()) {
    return await persistDecision(intentId, cartId, "BLOCK", ["INTENT_EXPIRED"], null, intent.session_id)
  }
  if (session.merchantId !== intent.merchant_id) {
    return await persistDecision(intentId, cartId, "BLOCK", ["MERCHANT_MISMATCH"], null, intent.session_id)
  }
  if (isIntentExpired(intent, new Date())) {
    return await persistDecision(intentId, cartId, "BLOCK", ["INTENT_EXPIRED"], null, intent.session_id)
  }

  const replayKey = makeReplayKey(intentId, cart.items)

  // Idempotent retry of an already-authorized cart returns the existing Order.
  const existingOrder = await prisma.razorpayOrder.findUnique({ where: { idempotencyKey: replayKey } })
  if (existingOrder) {
    await audit({
      eventType: "IDEMPOTENT_ORDER_RETURNED",
      actor: "gateway",
      intentId,
      sessionId: intent.session_id,
      metadata: { razorpay_order_id: existingOrder.razorpayOrderId },
    })
    return {
      decision: "ALLOW",
      reason_codes: [],
      authorization_id: null,
      razorpay_order_id: existingOrder.razorpayOrderId,
      semantic_confidence: null,
    }
  }

  // Intents are single-use (product.md state machine: ACTIVE → CONSUMED, and
  // CONSUMED → ACTIVE is invalid). A consumed intent may not authorize a NEW
  // cart. Deliberately AFTER the existing-order check above so the idempotent
  // retry of the SAME intent+cart still returns its order.
  if ((await getIntentStatus(intentId)) === "CONSUMED") {
    return await persistDecision(intentId, cartId, "BLOCK", ["REPLAY_DETECTED"], null, intent.session_id)
  }

  if (await replayKeyExists(replayKey)) {
    return await persistDecision(intentId, cartId, "BLOCK", ["REPLAY_DETECTED"], null, intent.session_id)
  }

  // ---- L2: deterministic policy over the canonical cart ----
  const priced = priceCart(cart.items)
  if (!priced) {
    return await persistDecision(intentId, cartId, "BLOCK", ["SKU_NOT_FOUND"], null, intent.session_id)
  }
  const canonicalCart: CanonicalCart = {
    cart_id: cartId,
    intent_id: intentId,
    items: priced.items,
    subtotal: priced.subtotal,
    currency: "INR",
  }

  const merchantPolicy = await getActiveMerchantPolicy(intent.merchant_id)
  const policy = checkPolicy({ intent, merchantPolicy, cart: canonicalCart })
  await audit({
    eventType: policy.allowed ? "POLICY_PASSED" : "POLICY_FAILED",
    actor: "gateway",
    intentId,
    sessionId: intent.session_id,
    reasonCode: policy.reasonCodes[0],
    metadata: { subtotal: canonicalCart.subtotal },
  })
  if (!policy.allowed) {
    // Policy failure never reaches the judge.
    return await persistDecision(intentId, cartId, "BLOCK", policy.reasonCodes, null, intent.session_id)
  }

  // ---- L3: semantic judge (canonical fields only) ----
  const intentRow = await prisma.intentContract.findUnique({ where: { id: intentId } })
  const rawRequest = intentRow?.rawRequest ?? ""

  let verdict: SemanticVerdict
  try {
    verdict = await judgeCart(intent, canonicalCart, rawRequest)
  } catch (err) {
    if (err instanceof SemanticJudgeError) {
      // Judge broke → fail closed to STEP_UP, never ALLOW.
      return await persistStepUp(intentId, cartId, ["SEMANTIC_LOW_CONFIDENCE"], null, intent.session_id)
    }
    throw err
  }
  await audit({
    eventType: verdict.match ? "SEMANTIC_MATCH" : "SEMANTIC_MISMATCH",
    actor: "gateway",
    intentId,
    sessionId: intent.session_id,
    metadata: { confidence: verdict.confidence, reason: verdict.reason },
  })

  // ---- L4: decision ----
  if (!verdict.match && verdict.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD) {
    return await persistDecision(intentId, cartId, "BLOCK", ["SEMANTIC_MISMATCH"], verdict.confidence, intent.session_id)
  }
  if (verdict.confidence < SEMANTIC_CONFIDENCE_THRESHOLD) {
    return await persistStepUp(intentId, cartId, ["SEMANTIC_LOW_CONFIDENCE"], verdict.confidence, intent.session_id)
  }

  // ALLOW: reserve replay, then create the real Order.
  // The early replayKeyExists() check above is a fast path, not a lock: a
  // concurrent identical request can pass it and judge in parallel. The unique
  // constraint decides; the loser fails closed as an audited replay BLOCK
  // instead of surfacing a raw P2002.
  try {
    await reserveReplayKey(replayKey, intentId)
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return await persistDecision(
        intentId,
        cartId,
        "BLOCK",
        ["REPLAY_DETECTED"],
        verdict.confidence,
        intent.session_id,
      )
    }
    throw err
  }
  return await executeAllow({
    intentId,
    cartId,
    sessionId: intent.session_id,
    canonicalCart,
    idempotencyKey: replayKey,
    semanticConfidence: verdict.confidence,
  })
}

/** Merchant approval of a pending STEP_UP. Re-runs L1/L2; does not skip checks. */
export async function approveStepUp(authorizationId: string): Promise<CheckoutDecision> {
  const auth = await prisma.authorizationDecision.findUnique({ where: { id: authorizationId } })
  if (!auth) throw new ApprovalError("AUTHORIZATION_NOT_FOUND")
  if (auth.decision !== "STEP_UP" || auth.status !== "STEP_UP") {
    throw new ApprovalError("AUTHORIZATION_NOT_APPROVABLE")
  }

  const intent = await getIntent(auth.intentId)
  const cart = await getCart(auth.cartId)
  if (!intent || !cart) throw new ApprovalError("AUTHORIZATION_NOT_APPROVABLE")
  if (isIntentExpired(intent, new Date())) throw new ApprovalError("INTENT_EXPIRED")

  const priced = priceCart(cart.items)
  if (!priced) throw new ApprovalError("AUTHORIZATION_NOT_APPROVABLE")
  const canonicalCart: CanonicalCart = {
    cart_id: cart.id,
    intent_id: intent.intent_id,
    items: priced.items,
    subtotal: priced.subtotal,
    currency: "INR",
  }
  const merchantPolicy = await getActiveMerchantPolicy(intent.merchant_id)
  const policy = checkPolicy({ intent, merchantPolicy, cart: canonicalCart })
  if (!policy.allowed) throw new ApprovalError("AUTHORIZATION_NOT_APPROVABLE")

  const replayKey = makeReplayKey(intent.intent_id, cart.items)
  const existingOrder = await prisma.razorpayOrder.findUnique({ where: { idempotencyKey: replayKey } })
  if (existingOrder) {
    return {
      decision: "ALLOW",
      reason_codes: [],
      authorization_id: authorizationId,
      razorpay_order_id: existingOrder.razorpayOrderId,
      semantic_confidence: auth.semanticConfidence,
    }
  }
  if (!(await replayKeyExists(replayKey))) {
    try {
      await reserveReplayKey(replayKey, intent.intent_id)
    } catch (err) {
      // Same TOCTOU as requestCheckout: a concurrent writer reserved between
      // the check and the insert. Fail closed to an audited replay BLOCK.
      if (isUniqueConstraintViolation(err)) {
        return await persistDecision(
          intent.intent_id,
          cart.id,
          "BLOCK",
          ["REPLAY_DETECTED"],
          auth.semanticConfidence,
          intent.session_id,
        )
      }
      throw err
    }
  }

  await prisma.authorizationDecision.update({
    where: { id: authorizationId },
    data: { status: "APPROVED" },
  })
  await audit({
    eventType: "STEP_UP_APPROVED",
    actor: "user",
    intentId: intent.intent_id,
    sessionId: intent.session_id,
    metadata: { authorization_id: authorizationId },
  })

  return executeAllow({
    intentId: intent.intent_id,
    cartId: cart.id,
    sessionId: intent.session_id,
    canonicalCart,
    idempotencyKey: replayKey,
    semanticConfidence: auth.semanticConfidence,
    authorizationId,
  })
}

export class ApprovalError extends Error {
  constructor(
    readonly code: "AUTHORIZATION_NOT_FOUND" | "AUTHORIZATION_NOT_APPROVABLE" | "INTENT_EXPIRED",
  ) {
    super(code)
    this.name = "ApprovalError"
  }
}

// ---- internals ----

interface AllowInput {
  intentId: string
  cartId: string
  sessionId: string
  canonicalCart: CanonicalCart
  idempotencyKey: string
  semanticConfidence: number | null
  authorizationId?: string
}

async function executeAllow(input: AllowInput): Promise<CheckoutDecision> {
  const authorizationId =
    input.authorizationId ??
    (
      await prisma.authorizationDecision.create({
        data: {
          id: `auth_${nanoid(12)}`,
          intentId: input.intentId,
          cartId: input.cartId,
          decision: "ALLOW",
          status: "ALLOWED",
          reasonCodes: JSON.stringify([]),
          semanticConfidence: input.semanticConfidence,
        },
      })
    ).id

  await audit({
    eventType: "AUTHORIZATION_ALLOWED",
    actor: "gateway",
    intentId: input.intentId,
    sessionId: input.sessionId,
    metadata: { authorization_id: authorizationId, subtotal: input.canonicalCart.subtotal },
  })

  try {
    const order = await createOrder({
      subtotalInr: input.canonicalCart.subtotal,
      receipt: input.intentId,
      notes: { intent_id: input.intentId, cart_id: input.cartId },
    })
    await prisma.razorpayOrder.create({
      data: {
        id: `rzo_${nanoid(12)}`,
        intentId: input.intentId,
        cartId: input.cartId,
        idempotencyKey: input.idempotencyKey,
        razorpayOrderId: order.razorpayOrderId,
        amount: order.amountPaise,
        currency: "INR",
        status: "CREATED",
      },
    })
    await audit({
      eventType: "ORDER_CREATED",
      actor: "razorpay",
      intentId: input.intentId,
      sessionId: input.sessionId,
      metadata: { razorpay_order_id: order.razorpayOrderId, amount_paise: order.amountPaise },
    })
    // Single-use intent: the authorization has now produced a real Order.
    // Covers both requestCheckout and approveStepUp (both end here).
    await markIntentConsumed(input.intentId)
    return {
      decision: "ALLOW",
      reason_codes: [],
      authorization_id: authorizationId,
      razorpay_order_id: order.razorpayOrderId,
      semantic_confidence: input.semanticConfidence,
    }
  } catch (err) {
    if (err instanceof RazorpayApiError) {
      await audit({
        eventType: "RAZORPAY_API_ERROR",
        actor: "razorpay",
        intentId: input.intentId,
        sessionId: input.sessionId,
        reasonCode: "RAZORPAY_API_ERROR",
        metadata: { detail: err.message },
      })
      return {
        decision: "ALLOW",
        reason_codes: ["RAZORPAY_API_ERROR"],
        authorization_id: authorizationId,
        razorpay_order_id: null,
        semantic_confidence: input.semanticConfidence,
      }
    }
    throw err
  }
}

async function persistDecision(
  intentId: string,
  cartId: string,
  decision: "BLOCK",
  reasonCodes: ReasonCode[],
  semanticConfidence: number | null,
  sessionId?: string,
): Promise<CheckoutDecision> {
  const id = `auth_${nanoid(12)}`
  await prisma.authorizationDecision.create({
    data: {
      id,
      intentId,
      cartId,
      decision,
      status: "BLOCKED",
      reasonCodes: JSON.stringify(reasonCodes),
      semanticConfidence,
    },
  })
  await audit({
    eventType: "AUTHORIZATION_BLOCKED",
    actor: "gateway",
    intentId,
    sessionId,
    reasonCode: reasonCodes[0],
    metadata: { authorization_id: id, razorpay_calls: 0 },
  })
  return {
    decision,
    reason_codes: reasonCodes,
    authorization_id: id,
    razorpay_order_id: null,
    semantic_confidence: semanticConfidence,
  }
}

async function persistStepUp(
  intentId: string,
  cartId: string,
  reasonCodes: ReasonCode[],
  semanticConfidence: number | null,
  sessionId?: string,
): Promise<CheckoutDecision> {
  const id = `auth_${nanoid(12)}`
  await prisma.authorizationDecision.create({
    data: {
      id,
      intentId,
      cartId,
      decision: "STEP_UP",
      status: "STEP_UP",
      reasonCodes: JSON.stringify(reasonCodes),
      semanticConfidence,
    },
  })
  await audit({
    eventType: "AUTHORIZATION_STEP_UP",
    actor: "gateway",
    intentId,
    sessionId,
    reasonCode: reasonCodes[0],
    metadata: { authorization_id: id, razorpay_calls: 0 },
  })
  return {
    decision: "STEP_UP",
    reason_codes: reasonCodes,
    authorization_id: id,
    razorpay_order_id: null,
    semantic_confidence: semanticConfidence,
  }
}
