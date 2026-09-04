import rawCatalog from "../../data/catalog.json"
import {
  JudgeProductSchema,
  ProductSchema,
  type CartItem,
  type JudgeProduct,
  type Product,
} from "@/lib/schemas"
import { z } from "zod"

const CatalogSchema = z.array(ProductSchema)

let cached: Product[] | null = null

export function loadCatalog(): Product[] {
  if (!cached) {
    cached = CatalogSchema.parse(rawCatalog)
  }
  return cached
}

/** Deterministic server-side search: lowercase token match over title, category, sku, attribute keys/values. */
export function searchCatalog(query: string): JudgeProduct[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
  if (tokens.length === 0) return []

  const scored = loadCatalog()
    .map((p) => {
      const hay = [
        p.title.toLowerCase(),
        p.category.toLowerCase(),
        p.sku.toLowerCase(),
        ...Object.entries(p.attributes).map(
          ([k, v]) => `${k.toLowerCase()} ${String(v).toLowerCase()}`,
        ),
      ].join(" ")
      const score = tokens.filter((t) => hay.includes(t)).length
      return { p, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, 8).map(({ p }) => toJudgeProduct(p))
}

export function getProduct(sku: string): JudgeProduct | null {
  const p = loadCatalog().find((x) => x.sku === sku)
  return p ? toJudgeProduct(p) : null
}

/** Full product incl. description — internal use only; never for judge payloads. */
export function getRawProduct(sku: string): Product | null {
  return loadCatalog().find((x) => x.sku === sku) ?? null
}

export function toJudgeProduct(p: Product): JudgeProduct {
  // Structurally strips description (and anything unknown).
  return JudgeProductSchema.parse({
    sku: p.sku,
    title: p.title,
    category: p.category,
    price: p.price,
    currency: p.currency,
    attributes: p.attributes,
  })
}

/** Server-side canonical pricing of a cart proposal. Returns null if any SKU is unknown. */
export function priceCart(
  items: CartItem[],
): { items: { product: JudgeProduct; quantity: number }[]; subtotal: number } | null {
  const priced: { product: JudgeProduct; quantity: number }[] = []
  let subtotal = 0
  for (const item of items) {
    const product = getProduct(item.sku)
    if (!product) return null
    priced.push({ product, quantity: item.quantity })
    subtotal += product.price * item.quantity
  }
  return { items: priced, subtotal }
}
