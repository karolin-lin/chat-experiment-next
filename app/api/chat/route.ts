import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { buildSystemPrompt, splitParentAndTranslation } from '@/lib/prompts'

const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const FALLBACKS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-flash']
const MAX_ATTEMPTS = 4

// Tell Vercel to allow up to 30s for this function
export const maxDuration = 30

type Message = { role: 'user' | 'model'; text: string }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const { userMessage, history, topic } = (await req.json()) as {
    userMessage: string
    history: Message[]
    topic: string
  }

  const ai = new GoogleGenAI({ apiKey })
  const systemPrompt = buildSystemPrompt(topic || '日常生活價值觀')

  const contents = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ]

  const primary = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim()
  const candidates = Array.from(new Set([primary, ...FALLBACKS]))

  let lastError = ''

  for (const model of candidates) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction: systemPrompt },
        })

        const raw = (response.text ?? '').trim()
        const [parent, translation] = splitParentAndTranslation(raw)

        if (!parent) {
          await sleep(800)
          continue
        }

        return NextResponse.json({ parent, translation })
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string }
        const status = e.status ?? 0
        lastError = String(err)

        if (status === 503 || status === 429) {
          // exponential backoff: 1s → 2s → 4s
          await sleep(Math.min(1000 * 2 ** attempt, 6000))
          continue
        }

        if (status === 404) break // try next model

        return NextResponse.json({ error: lastError }, { status: status || 500 })
      }
    }
  }

  return NextResponse.json({ error: lastError || 'Service unavailable' }, { status: 503 })
}