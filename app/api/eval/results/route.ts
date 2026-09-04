import { NextResponse } from "next/server"
import { readFileSync } from "node:fs"

export async function GET(): Promise<NextResponse> {
  try {
    const raw = readFileSync("data/eval_results.json", "utf8")
    const data = JSON.parse(raw) as { generated_at: string; metrics: unknown[] }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: "NOT_RUN" }, { status: 404 })
  }
}
