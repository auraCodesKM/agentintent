// P5 proof: session + intent persistence + expiry blocking + replay key uniqueness.
// One Gemini call (intent compile).
process.loadEnvFile(".env")

import { prisma } from "../src/lib/db"
import {
  createIntent,
  createSession,
  getIntent,
  proposeCart,
} from "../src/gateway/session"
import { makeReplayKey, replayKeyExists, reserveReplayKey } from "../src/gateway/replay"

async function main(): Promise<void> {
  const { sessionId } = await createSession()
  console.log("session:", sessionId)

  const contract = await createIntent(
    sessionId,
    "Buy me a pair of good noise-cancelling headphones under ₹8,000. One pair only.",
  )
  console.log("intent:", contract.intent_id, "max:", contract.constraints.max_amount)

  const persisted = await getIntent(contract.intent_id)
  if (!persisted) throw new Error("intent not persisted")
  console.log("persisted round-trip ok, expires:", persisted.expires_at)

  const cart = await proposeCart(contract.intent_id, [{ sku: "HP-004", quantity: 1 }])
  console.log("cart:", cart.cartId, "subtotal:", cart.subtotal)

  // Expired-intent block: force expiry in DB, then try proposing again.
  await prisma.intentContract.update({
    where: { id: contract.intent_id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  try {
    await proposeCart(contract.intent_id, [{ sku: "HP-004", quantity: 1 }])
    throw new Error("EXPECTED expiry block, got success")
  } catch (err) {
    console.log("expiry blocked:", err instanceof Error ? err.message : err)
  }

  // Replay key behavior.
  const key = makeReplayKey(contract.intent_id, [{ sku: "HP-004", quantity: 1 }])
  console.log("replay exists before reserve:", await replayKeyExists(key))
  await reserveReplayKey(key, contract.intent_id)
  console.log("replay exists after reserve:", await replayKeyExists(key))

  const audits = await prisma.auditLog.count({ where: { intentId: contract.intent_id } })
  console.log("audit rows for intent:", audits)
}

main()
  .catch((err) => {
    console.error("p5 smoke failed:", err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
