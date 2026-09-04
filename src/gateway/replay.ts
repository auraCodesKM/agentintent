import { createHash } from "node:crypto"
import { prisma } from "@/lib/db"
import type { CartItem } from "@/lib/schemas"

/** Canonical cart JSON: items sorted by sku, stable field order. */
export function canonicalCartJson(items: CartItem[]): string {
  const sorted = [...items]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((i) => ({ sku: i.sku, quantity: i.quantity }))
  return JSON.stringify(sorted)
}

export function makeReplayKey(intentId: string, items: CartItem[]): string {
  const hash = createHash("sha256").update(canonicalCartJson(items)).digest("hex")
  return `${intentId}:${hash}`
}

export async function replayKeyExists(key: string): Promise<boolean> {
  const row = await prisma.replayKey.findUnique({ where: { key } })
  return row !== null
}

export async function reserveReplayKey(key: string, intentId: string): Promise<void> {
  await prisma.replayKey.create({ data: { key, intentId } })
}
