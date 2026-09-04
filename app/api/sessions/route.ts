import { NextResponse } from "next/server"
import { createSession } from "@/gateway/session"

export async function POST(): Promise<NextResponse> {
  const { sessionId, expiresAt } = await createSession()
  return NextResponse.json({ session_id: sessionId, expires_at: expiresAt.toISOString() })
}
