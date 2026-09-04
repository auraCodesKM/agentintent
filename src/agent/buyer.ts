import { z } from "zod"
import { generateJson, LlmInvalidOutputError } from "@/lib/gemini"
import { getProduct, searchCatalog } from "@/catalog/catalog"
import { getIntent, proposeCart, CartError } from "@/gateway/session"
import { requestCheckout, type CheckoutDecision } from "@/gateway/decide"
import { audit } from "@/audit/logger"
import type { IntentContract } from "@/lib/schemas"

const MAX_TURNS = 8

// Fixed tool union. No dynamic registry, no Razorpay tools.
const BuyerActionSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("search_catalog"), args: z.object({ query: z.string().min(1) }) }),
  z.object({ tool: z.literal("get_product"), args: z.object({ sku: z.string().min(1) }) }),
  z.object({
    tool: z.literal("propose_cart"),
    args: z.object({
      items: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() })).min(1),
    }),
  }),
  z.object({ tool: z.literal("request_checkout"), args: z.object({ cart_id: z.string().min(1) }) }),
])
type BuyerAction = z.infer<typeof BuyerActionSchema>

const SYSTEM_INSTRUCTION = `You are a shopping agent. You buy on behalf of a user whose intent contract is given.

You have EXACTLY four tools. Respond with ONLY JSON for one tool call:
  {"tool":"search_catalog","args":{"query":"..."}}
  {"tool":"get_product","args":{"sku":"..."}}
  {"tool":"propose_cart","args":{"items":[{"sku":"...","quantity":1}]}}
  {"tool":"request_checkout","args":{"cart_id":"..."}}

Strategy: search for products matching the intent, inspect a candidate, propose a cart within the user's constraints, then request checkout with the returned cart_id. Respect the user's budget and preferences. You cannot pay; a gateway decides whether checkout is authorized.`

export interface BuyerRunResult {
  status: "COMPLETED" | "TURN_LIMIT"
  turns: number
  cartId: string | null
  decision: CheckoutDecision | null
  transcript: { action: BuyerAction; observation: unknown }[]
}

/** Hand-written bounded tool loop. request_checkout goes to the gateway, never Razorpay. */
export async function runBuyer(intentId: string): Promise<BuyerRunResult> {
  const intent = await getIntent(intentId)
  if (!intent) throw new Error(`intent ${intentId} not found`)

  const transcript: { action: BuyerAction; observation: unknown }[] = []
  let lastCartId: string | null = null

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let action: BuyerAction
    try {
      action = await generateJson(BuyerActionSchema, SYSTEM_INSTRUCTION, buildPrompt(intent, transcript))
    } catch (err) {
      if (err instanceof LlmInvalidOutputError) {
        // Fail closed: buyer confusion never becomes payment authority.
        await audit({ eventType: "BUYER_INVALID_ACTION", actor: "agent", intentId, sessionId: intent.session_id })
        return { status: "TURN_LIMIT", turns: turn, cartId: lastCartId, decision: null, transcript }
      }
      throw err
    }

    if (action.tool === "request_checkout") {
      const decision = await requestCheckout(intentId, action.args.cart_id)
      transcript.push({ action, observation: decision })
      return { status: "COMPLETED", turns: turn + 1, cartId: action.args.cart_id, decision, transcript }
    }

    const observation = await runLocalTool(intentId, action)
    if (action.tool === "propose_cart" && isCartObservation(observation)) {
      lastCartId = observation.cart_id
    }
    transcript.push({ action, observation })
  }

  await audit({ eventType: "BUYER_TURN_LIMIT", actor: "agent", intentId, sessionId: intent.session_id })
  return { status: "TURN_LIMIT", turns: MAX_TURNS, cartId: lastCartId, decision: null, transcript }
}

function isCartObservation(obs: unknown): obs is { cart_id: string } {
  return typeof obs === "object" && obs !== null && "cart_id" in obs
}

async function runLocalTool(
  intentId: string,
  action: Exclude<BuyerAction, { tool: "request_checkout" }>,
): Promise<unknown> {
  switch (action.tool) {
    case "search_catalog":
      return { products: searchCatalog(action.args.query) }
    case "get_product": {
      const product = getProduct(action.args.sku)
      return product ?? { error: "SKU_NOT_FOUND" }
    }
    case "propose_cart": {
      try {
        const cart = await proposeCart(intentId, action.args.items)
        return { cart_id: cart.cartId, items: action.args.items, subtotal: cart.subtotal, status: "PROPOSED" }
      } catch (err) {
        if (err instanceof CartError) return { error: err.code }
        throw err
      }
    }
  }
}

function buildPrompt(
  intent: IntentContract,
  transcript: { action: BuyerAction; observation: unknown }[],
): string {
  const history = transcript
    .map(
      (t, i) =>
        `Turn ${i + 1}:\naction: ${JSON.stringify(t.action)}\nobservation: ${JSON.stringify(t.observation)}`,
    )
    .join("\n\n")
  return `Intent contract:\n${JSON.stringify({ constraints: intent.constraints, preferences: intent.preferences })}\n\n${
    history ? `History:\n${history}\n\n` : ""
  }Choose your next single tool call. JSON only.`
}
