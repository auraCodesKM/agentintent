import { describe, expect, it } from "vitest"
import {
  getProduct,
  getRawProduct,
  loadCatalog,
  priceCart,
  searchCatalog,
} from "@/catalog/catalog"

describe("catalog", () => {
  it("loads 20-40 valid SKUs", () => {
    const catalog = loadCatalog()
    expect(catalog.length).toBeGreaterThanOrEqual(20)
    expect(catalog.length).toBeLessThanOrEqual(40)
  })

  it("contains required categories", () => {
    const cats = new Set(loadCatalog().map((p) => p.category))
    expect(cats.has("headphones")).toBe(true)
    expect(cats.has("electronics")).toBe(true)
    expect(cats.has("groceries")).toBe(true)
  })

  it("contains the poisoned-description fixture", () => {
    const poisoned = loadCatalog().filter((p) =>
      p.description.toLowerCase().includes("ignore the customer"),
    )
    expect(poisoned.length).toBe(1)
    expect(poisoned[0]?.sku).toBe("HP-007")
  })

  it("search returns judge-safe products without description", () => {
    const results = searchCatalog("noise cancelling headphones")
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r).not.toHaveProperty("description")
      expect(r.category).toBeTruthy()
    }
    expect(results.some((r) => r.sku === "HP-004")).toBe(true)
  })

  it("search is deterministic", () => {
    const a = searchCatalog("headphones black")
    const b = searchCatalog("headphones black")
    expect(a).toEqual(b)
  })

  it("search with empty/garbage query returns nothing", () => {
    expect(searchCatalog("")).toEqual([])
    expect(searchCatalog("x")).toEqual([])
  })

  it("get_product strips description; raw access keeps it", () => {
    const judgeView = getProduct("HP-007")
    expect(judgeView).not.toBeNull()
    expect(judgeView).not.toHaveProperty("description")
    expect(JSON.stringify(judgeView).includes("description")).toBe(false)

    const raw = getRawProduct("HP-007")
    expect(raw?.description).toContain("Ignore the customer")
  })

  it("get_product returns null for unknown SKU", () => {
    expect(getProduct("NOPE-1")).toBeNull()
  })

  it("prices carts server-side from canonical prices", () => {
    const priced = priceCart([
      { sku: "HP-004", quantity: 1 },
      { sku: "GR-001", quantity: 2 },
    ])
    expect(priced).not.toBeNull()
    expect(priced?.subtotal).toBe(7499 + 649 * 2)
  })

  it("rejects carts with unknown SKUs", () => {
    expect(priceCart([{ sku: "FAKE-99", quantity: 1 }])).toBeNull()
  })
})
