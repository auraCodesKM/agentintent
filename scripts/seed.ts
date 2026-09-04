import { PrismaClient } from "@prisma/client"
import { loadCatalog } from "../src/catalog/catalog"

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const categories = [...new Set(loadCatalog().map((p) => p.category))]

  await prisma.merchant.upsert({
    where: { id: "demo_store" },
    update: {},
    create: { id: "demo_store", name: "Demo Store", currency: "INR" },
  })

  await prisma.policy.upsert({
    where: { id: "pol_demo_1" },
    update: {
      maxAmount: 50000,
      maxQuantity: 10,
      allowedCategories: JSON.stringify(categories),
      active: true,
    },
    create: {
      id: "pol_demo_1",
      merchantId: "demo_store",
      maxAmount: 50000,
      maxQuantity: 10,
      allowedCategories: JSON.stringify(categories),
      approvalThreshold: null,
      policyVersion: 1,
      active: true,
    },
  })

  const merchant = await prisma.merchant.findUnique({ where: { id: "demo_store" } })
  const policy = await prisma.policy.findUnique({ where: { id: "pol_demo_1" } })
  console.log(`seeded merchant=${merchant?.id} policy=${policy?.id} categories=${categories.join(",")}`)
}

main()
  .catch((err) => {
    console.error("seed failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
