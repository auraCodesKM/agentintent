import { GoogleGenAI } from "@google/genai"
import type { z } from "zod"

// Model selection is env-driven: switch by editing GEMINI_MODEL in .env, nothing else.
// Defaults: stable flash tier, low thinking, no Pro (gemini-2.5-flash is 404 for new
// API users, verified live; its error message directs to gemini-3.6-flash).
const primaryModel = (): string => process.env.GEMINI_MODEL || "gemini-3.8-flash"
const fallbackModel = (): string => process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash"
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

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /"code":\s*(429|500|503)|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand/i.test(msg)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Models that rejected thinkingConfig (400 INVALID_ARGUMENT) — retried without it, then remembered.
const noThinkingConfig = new Set<string>()

async function generateRaw(model: string, systemInstruction: string, prompt: string): Promise<string> {
  try {
    return await generateRawOnce(model, systemInstruction, prompt)
  } catch (err) {
    if (isInvalidArgument(err) && !noThinkingConfig.has(model)) {
      // e.g. gemini-3.6-flash rejects thinkingBudget (verified live). Retry without it.
      noThinkingConfig.add(model)
      return generateRawOnce(model, systemInstruction, prompt)
    }
    if (!isTransient(err)) throw err
    await sleep(2000) // one backoff retry on 429/5xx, then give up (fallback model handles the rest)
    return generateRawOnce(model, systemInstruction, prompt)
  }
}

function isInvalidArgument(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /INVALID_ARGUMENT|"code":\s*400/.test(msg)
}

async function generateRawOnce(model: string, systemInstruction: string, prompt: string): Promise<string> {
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
        ...(noThinkingConfig.has(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
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
    text = await generateRaw(primaryModel(), systemInstruction, prompt)
  } catch {
    text = await generateRaw(fallbackModel(), systemInstruction, prompt)
  }

  const first = tryParse(schema, text)
  if (first.ok) return first.value

  // One retry with the parse error appended, then fail closed.
  const retryText = await generateRaw(
    primaryModel(),
    systemInstruction,
    `${prompt}\n\nYour previous response was invalid JSON for the required schema (${first.error}). Respond again with ONLY valid JSON.`,
  ).catch(() => generateRaw(fallbackModel(), systemInstruction, prompt))

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
