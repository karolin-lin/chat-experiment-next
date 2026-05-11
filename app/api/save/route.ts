import { NextRequest, NextResponse } from 'next/server'

const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz1_rMhDNcMkF7LOfZ3bF_RcLLGUhNR3RJikxVRaIdACf8GxmBIzhWZavfpRT6DzCCdaA/exec'

export async function POST(req: NextRequest) {
  const data = await req.json()
  console.log('saving:', JSON.stringify(data).slice(0, 100))
  try {
    const res = await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow',
    })
    console.log('sheets status:', res.status)
    const text = await res.text()
    console.log('sheets body:', text)
  } catch (err) {
    console.error('sheets error:', err)
  }
  return NextResponse.json({ ok: true })
}