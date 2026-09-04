import { GoogleGenAI } from "@google/genai"
import type { z } from "zod"

// User-directed model choice (Sep 2026): stable flash tier, low thinking, no Pro.
const PRIMARY_MODEL = "gemini-3.8-flash"
const FALLBACK_MODEL = "gemini-2.5-flash"
const TIMEOUT_MS = 20_000

let client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (client) return client
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true") {
    const project = process.env.GOOGLE_CLOUD_PROJECT
    const location = process.env.GOOGLE_CLOUD_LOCATION
    if (!project || !location) {
      throw new Error("Vertex mode: set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION in .env")
    }
    client = new GoogleGenAI({ vertexai: true, project, location })
    return client
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("Gemini credentials missing: set GEMINI_API_KEY in .env")
  }
  client = new GoogleGenAI({ apiKey })
  return client
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ])
}

async function generateRaw(model: string, systemInstruction: string, prompt: string): Promise<string> {
  const ai = getClient()
  const res = await withTimeout(
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0,
        // Keep token/quota usage low: minimal thinking on flash tier.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    `gemini ${model}`,
  )
  const text = res.text
  if (!text) throw new Error(`gemini ${model} returned empty response`)
  return text
}

export class LlmInvalidOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LlmInvalidOutputError"
  }
}

/**
 * Call Gemini expecting JSON matching `schema`.
 * Invalid JSON/schema → exactly one retry → LlmInvalidOutputError (caller fails closed).
 * Primary model API errors fall back to FALLBACK_MODEL once.
 */
export async function generateJson<S extends z.ZodTypeAny>(
  schema: S,
  systemInstruction: string,
  prompt: string,
): Promise<z.infer<S>> {
  let text: string
  try {
    text = await generateRaw(PRIMARY_MODEL, systemInstruction, prompt)
  } catch {
    text = await generateRaw(FALLBACK_MODEL, systemInstruction, prompt)
  }

  const first = tryParse(schema, text)
  if (first.ok) return first.value

  // One retry with the parse error appended, then fail closed.
  const retryText = await generateRaw(
    PRIMARY_MODEL,
    systemInstruction,
    `${prompt}\n\nYour previous response was invalid JSON for the required schema (${first.error}). Respond again with ONLY valid JSON.`,
  ).catch(() => generateRaw(FALLBACK_MODEL, systemInstruction, prompt))

  const second = tryParse(schema, retryText)
  if (second.ok) return second.value
  throw new LlmInvalidOutputError(`model output failed schema validation after retry: ${second.error}`)
}

function tryParse<S extends z.ZodTypeAny>(
  schema: S,
  text: string,
): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(text)
    const result = schema.safeParse(parsed)
    if (result.success) return { ok: true, value: result.data }
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unparseable JSON" }
  }
}
