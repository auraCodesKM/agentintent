import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const generateContentMock = vi.fn()

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
}))

process.env.GEMINI_API_KEY = "test-key-not-real"
process.env.GOOGLE_GENAI_USE_VERTEXAI = "false"
process.env.GEMINI_MODEL = "gemini-3.8-flash"
process.env.GEMINI_FALLBACK_MODEL = "gemini-3.6-flash"

const { generateJson, LlmInvalidOutputError } = await import("@/lib/gemini")

const schema = z.object({ value: z.number() }).strict()

describe("generateJson fail-closed retry", () => {
  beforeEach(() => generateContentMock.mockReset())

  it("returns parsed value on first valid response", async () => {
    generateContentMock.mockResolvedValueOnce({ text: '{"value": 7}' })
    await expect(generateJson(schema, "sys", "prompt")).resolves.toEqual({ value: 7 })
    expect(generateContentMock).toHaveBeenCalledTimes(1)
  })

  it("retries once on invalid JSON, then succeeds", async () => {
    generateContentMock
      .mockResolvedValueOnce({ text: "not json at all" })
      .mockResolvedValueOnce({ text: '{"value": 42}' })
    await expect(generateJson(schema, "sys", "prompt")).resolves.toEqual({ value: 42 })
    expect(generateContentMock).toHaveBeenCalledTimes(2)
  })

  it("throws LlmInvalidOutputError after retry also fails (never defaults open)", async () => {
    generateContentMock
      .mockResolvedValueOnce({ text: '{"wrong": true}' })
      .mockResolvedValueOnce({ text: '{"still": "wrong"}' })
    await expect(generateJson(schema, "sys", "prompt")).rejects.toBeInstanceOf(LlmInvalidOutputError)
    expect(generateContentMock).toHaveBeenCalledTimes(2)
  })

  it("falls back to secondary model on primary API error", async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error("primary model permanently gone (404 NOT_FOUND)"))
      .mockResolvedValueOnce({ text: '{"value": 1}' })
    await expect(generateJson(schema, "sys", "prompt")).resolves.toEqual({ value: 1 })
    const models = generateContentMock.mock.calls.map((c) => (c[0] as { model: string }).model)
    expect(models[0]).toBe("gemini-3.8-flash")
    expect(models[1]).toBe("gemini-3.6-flash")
  })
})
