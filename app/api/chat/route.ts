import { NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt } from '@/lib/prompts'

export const maxDuration = 30

const MODEL = 'gpt-4o-mini'

type Message = { role: 'user' | 'model'; text: string }

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  const { userMessage, history, topic } = (await req.json()) as {
    userMessage: string
    history: Message[]
    topic: string
  }

  const systemPrompt = buildSystemPrompt(topic || '日常生活價值觀')

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: userMessage },
  ]

  const body = {
    model: MODEL,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'parent_reply',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            parent: {
              type: 'string',
              description: '家長的回話，繁體中文，80字以內，只說對白',
            },
            analysis: {
              type: 'string',
              description: '親子溝通分析，繁體中文，80到100字，一個連貫段落',
            },
          },
          required: ['parent', 'analysis'],
          additionalProperties: false,
        },
      },
    },
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''

  try {
    const parsed = JSON.parse(content)
    return NextResponse.json({
      parent: parsed.parent ?? '',
      translation: parsed.analysis ?? '',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}