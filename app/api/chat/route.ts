import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { buildSystemPrompt, splitParentAndTranslation } from '@/lib/prompts'

const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const FALLBACKS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

type Message = { role: 'user' | 'model'; text: string }

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

  for (const model of candidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction: systemPrompt },
      })

      const raw = response.text ?? ''
      const [parent, translation] = splitParentAndTranslation(raw)
      return NextResponse.json({ parent, translation })
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 429 || status === 404) continue
      return NextResponse.json({ error: String(err) }, { status: status ?? 500 })
    }
  }

  return NextResponse.json(
    { error: 'All Gemini models exhausted (429 / quota)' },
    { status: 429 }
  )
}