import { z } from "zod"

// ---- Canonical product ----

export const ProductSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  price: z.number().int().positive(), // rupees
  currency: z.literal("INR"),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean()])),
  description: z.string(),
})
export type Product = z.infer<typeof ProductSchema>

// Judge-safe view: description is structurally impossible here.
export const JudgeProductSchema = ProductSchema.omit({ description: true })
export type JudgeProduct = z.infer<typeof JudgeProductSchema>

// ---- Intent contract ----

export const IntentConstraintsSchema = z.object({
  max_amount: z.number().int().positive(), // rupees
  max_quantity: z.number().int().positive(),
  allowed_categories: z.array(z.string().min(1)).min(1),
  excluded_attributes: z.array(z.string()).default([]),
  required_attributes: z.array(z.string()).default([]),
})

// What the LLM compiler is allowed to produce. Server-controlled fields
// (intent_id, merchant_id, session_id, expires_at) are NOT here on purpose.
export const CompiledIntentSchema = z
  .object({
    currency: z.literal("INR"),
    constraints: IntentConstraintsSchema,
    preferences: z.record(z.string()).default({}),
  })
  .strict()
export type CompiledIntent = z.infer<typeof CompiledIntentSchema>

export const IntentContractSchema = CompiledIntentSchema.extend({
  intent_id: z.string().min(1),
  merchant_id: z.string().min(1),
  session_id: z.string().min(1),
  expires_at: z.string().datetime(),
})
export type IntentContract = z.infer<typeof IntentContractSchema>

// ---- Cart ----

export const CartItemSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
})
export type CartItem = z.infer<typeof CartItemSchema>

export const CartProposalSchema = z.object({
  items: z.array(CartItemSchema).min(1),
})
export type CartProposal = z.infer<typeof CartProposalSchema>

// Canonical cart: server-priced from the catalog, never agent-priced.
export const CanonicalCartSchema = z.object({
  cart_id: z.string().min(1),
  intent_id: z.string().min(1),
  items: z
    .array(
      z.object({
        product: JudgeProductSchema,
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  subtotal: z.number().int().positive(), // rupees
  currency: z.literal("INR"),
})
export type CanonicalCart = z.infer<typeof CanonicalCartSchema>

// ---- Decisions ----

export const DECISIONS = ["ALLOW", "STEP_UP", "BLOCK"] as const
export type DecisionKind = (typeof DECISIONS)[number]

export const REASON_CODES = [
  "MAX_AMOUNT_EXCEEDED",
  "MAX_QUANTITY_EXCEEDED",
  "CATEGORY_MISMATCH",
  "MERCHANT_MISMATCH",
  "INTENT_EXPIRED",
  "REPLAY_DETECTED",
  "SEMANTIC_MISMATCH",
  "SEMANTIC_LOW_CONFIDENCE",
  "INVALID_INTENT",
  "RAZORPAY_API_ERROR",
  "WEBHOOK_TIMEOUT_RECONCILED",
  "PAYMENT_AMOUNT_MISMATCH",
  "DUPLICATE_WEBHOOK",
  "SKU_NOT_FOUND",
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export const SemanticVerdictSchema = z.object({
  match: z.boolean(),
  confidence: z.number().min(0).max(1),
  violated_constraints: z.array(z.string()),
  reason: z.string(),
})
export type SemanticVerdict = z.infer<typeof SemanticVerdictSchema>

export const SEMANTIC_CONFIDENCE_THRESHOLD = 0.85
