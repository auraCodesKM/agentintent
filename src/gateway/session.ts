import { prisma } from "@/lib/db"
import { nanoid } from "nanoid"
import { audit } from "@/audit/logger"
import { compileIntent } from "@/intent/compiler"
import { IntentContractSchema, type CartItem, type IntentContract } from "@/lib/schemas"
import { priceCart } from "@/catalog/catalog"

const MERCHANT_ID = "demo_store"
const SESSION_TTL_MS = 60 * 60_000 // 1 hour
const INTENT_TTL_MS = 15 * 60_000 // 15 minutes

export async function createSession(): Promise<{ sessionId: string; expiresAt: Date }> {
  const id = `sess_${nanoid(12)}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await prisma.session.create({
    data: { id, merchantId: MERCHANT_ID, status: "ACTIVE", expiresAt },
  })
  await audit({ eventType: "SESSION_CREATED", actor: "user", sessionId: id })
  return { sessionId: id, expiresAt }
}

export class SessionError extends Error {
  constructor(
    readonly code: "SESSION_NOT_FOUND" | "SESSION_EXPIRED",
    message: string,
  ) {
    super(message)
    this.name = "SessionError"
  }
}

export async function requireActiveSession(sessionId: string): Promise<{ id: string; merchantId: string }> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } })
  if (!session) throw new SessionError("SESSION_NOT_FOUND", `session ${sessionId} not found`)
  if (session.status !== "ACTIVE" || session.expiresAt.getTime() <= Date.now()) {
    throw new SessionError("SESSION_EXPIRED", `session ${sessionId} is not active`)
  }
  return { id: session.id, merchantId: session.merchantId }
}

/** Compile raw text via Gemini, attach server-controlled fields, persist. */
export async function createIntent(
  sessionId: string,
  rawRequest: string,
): Promise<IntentContract> {
  const session = await requireActiveSession(sessionId)

  const compiled = await compileIntent(rawRequest)

  const contract: IntentContract = IntentContractSchema.parse({
    ...compiled,
    intent_id: `int_${nanoid(12)}`,
    merchant_id: session.merchantId,
    session_id: session.id,
    expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
  })

  await prisma.intentContract.create({
    data: {
      id: contract.intent_id,
      sessionId: session.id,
      merchantId: session.merchantId,
      rawRequest,
      structuredContract: JSON.stringify(contract),
      status: "ACTIVE",
      expiresAt: new Date(contract.expires_at),
    },
  })
  await audit({
    eventType: "INTENT_CREATED",
    actor: "user",
    sessionId: session.id,
    intentId: contract.intent_id,
    metadata: {
      max_amount: contract.constraints.max_amount,
      max_quantity: contract.constraints.max_quantity,
      categories: contract.constraints.allowed_categories.join(","),
    },
  })
  return contract
}

export async function getIntent(intentId: string): Promise<IntentContract | null> {
  const row = await prisma.intentContract.findUnique({ where: { id: intentId } })
  if (!row) return null
  const contract = IntentContractSchema.parse(JSON.parse(row.structuredContract))
  // DB row is the source of truth for expiry (status changes after persistence).
  return { ...contract, expires_at: row.expiresAt.toISOString() }
}

export async function getIntentStatus(intentId: string): Promise<string | null> {
  const row = await prisma.intentContract.findUnique({ where: { id: intentId }, select: { status: true } })
  return row?.status ?? null
}

export async function markIntentConsumed(intentId: string): Promise<void> {
  await prisma.intentContract.update({ where: { id: intentId }, data: { status: "CONSUMED" } })
}

export class CartError extends Error {
  constructor(
    readonly code: "SKU_NOT_FOUND" | "INTENT_NOT_FOUND" | "INTENT_EXPIRED",
    message: string,
  ) {
    super(message)
    this.name = "CartError"
  }
}

/** Persist a proposed cart, priced server-side from the canonical catalog. */
export async function proposeCart(
  intentId: string,
  items: CartItem[],
): Promise<{ cartId: string; subtotal: number }> {
  const intent = await getIntent(intentId)
  if (!intent) throw new CartError("INTENT_NOT_FOUND", `intent ${intentId} not found`)
  if (new Date(intent.expires_at).getTime() <= Date.now()) {
    throw new CartError("INTENT_EXPIRED", `intent ${intentId} expired`)
  }

  const priced = priceCart(items)
  if (!priced) throw new CartError("SKU_NOT_FOUND", "cart contains unknown SKU")

  const cartId = `cart_${nanoid(12)}`
  await prisma.cart.create({
    data: {
      id: cartId,
      intentId,
      itemsJson: JSON.stringify(items),
      subtotal: priced.subtotal,
      currency: "INR",
    },
  })
  await audit({
    eventType: "CART_PROPOSED",
    actor: "agent",
    sessionId: intent.session_id,
    intentId,
    metadata: { cart_id: cartId, subtotal: priced.subtotal, items: JSON.stringify(items) },
  })
  return { cartId, subtotal: priced.subtotal }
}

export async function getCart(cartId: string): Promise<{ id: string; intentId: string; items: CartItem[]; subtotal: number } | null> {
  const row = await prisma.cart.findUnique({ where: { id: cartId } })
  if (!row) return null
  return {
    id: row.id,
    intentId: row.intentId,
    items: JSON.parse(row.itemsJson) as CartItem[],
    subtotal: row.subtotal,
  }
}
