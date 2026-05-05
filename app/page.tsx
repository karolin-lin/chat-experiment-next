'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { SESSION_DURATION } from '@/lib/prompts'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  translation?: string
  ts: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function nowTs() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ── Timer ────────────────────────────────────────────────────────
function Timer({
  startTime,
  onEnd,
}: {
  startTime: number
  onEnd: () => void
}) {
  const [remaining, setRemaining] = useState(SESSION_DURATION)

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000
      const left = Math.max(0, SESSION_DURATION - elapsed)
      setRemaining(left)
      if (left <= 0) onEnd()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime, onEnd])

  const m = Math.floor(remaining / 60)
  const s = Math.floor(remaining % 60)
  const pct = (remaining / SESSION_DURATION) * 100
  const cls = remaining < 60 ? 'danger' : remaining < 180 ? 'warning' : ''

  return (
    <div className="timer">
      <span className="timer-label">剩餘</span>
      <span className={`timer-digits ${cls}`}>
        {pad(m)}:{pad(s)}
      </span>
    </div>
  )
}

// ── Translation panel ────────────────────────────────────────────
function TranslationSection({ translation }: { translation: string }) {
  const [open, setOpen] = useState(false)
  if (!translation) return null
  return (
    <div className="translation-wrap">
      {open ? (
        <div className="translation-panel">
          <div className="translation-label">話語背後的意思</div>
          {translation}
        </div>
      ) : (
        <button className="translation-btn" onClick={() => setOpen(true)}>
          🔍 查看話語背後的意思
        </button>
      )}
    </div>
  )
}

// ── Typing indicator ─────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="msg-row assistant">
      <div className="bubble-wrap">
        <div className="avatar">👨</div>
        <div className="typing-bubble">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const startTime = useRef(Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEnd = useCallback(() => setSessionEnded(true), [])

  // auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  const send = async () => {
    const text = input.trim()
    if (!text || loading || sessionEnded) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      ts: nowTs(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    // build history for API (only role + text)
    const history = messages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      text: m.text,
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: text, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '發生錯誤')

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.parent,
        translation: data.translation,
        ts: nowTs(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const downloadCSV = () => {
    const rows = [
      ['timestamp', 'role', 'content', 'translation'],
      ...messages.map((m) => [m.ts, m.role, m.text, m.translation ?? '']),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-top">
          <div>
            <div className="header-title">👨‍👩‍👧 亞洲家長對話實驗</div>
            <div className="header-subtitle">與模擬台灣父母的 AI 對話，理解話語背後的真實情感</div>
          </div>
          <Timer startTime={startTime.current} onEnd={handleEnd} />
        </div>
        {/* Timer progress bar */}
        <TimerBar startTime={startTime.current} />
      </header>

      {/* ── Chat area ── */}
      <div className="chat-area">
        {messages.length === 0 && !loading && (
          <div className="empty-state">
            <div>
              <div className="empty-icon">💬</div>
              <div className="empty-text">
                跟家長說點什麼吧<br />
                不管你說什麼，他都有話要說
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row ${msg.role}`}>
            <div className="bubble-wrap">
              {msg.role === 'assistant' && <div className="avatar">👨</div>}
              {msg.role === 'user' && <div className="avatar">🧑</div>}
              <div className="bubble">{msg.text}</div>
            </div>
            <div className="bubble-ts">{msg.ts}</div>
            {msg.role === 'assistant' && msg.translation && (
              <TranslationSection translation={msg.translation} />
            )}
          </div>
        ))}

        {loading && <TypingIndicator />}
        {error && <div className="error-bar">⚠️ {error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* ── Input / Session ended ── */}
      {sessionEnded ? (
        <div className="session-ended">
          <h2>⏰ 對話時間已結束</h2>
          <p>感謝您參與本實驗</p>
          <button className="download-btn" onClick={downloadCSV}>
            📥 下載對話記錄 (CSV)
          </button>
        </div>
      ) : (
        <div className="input-area">
          <div className="input-form">
            <textarea
              ref={textareaRef}
              className="input-field"
              placeholder="說點什麼…（Enter 送出，Shift+Enter 換行）"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              rows={1}
            />
            <button
              className="send-btn"
              onClick={send}
              disabled={!input.trim() || loading}
              aria-label="送出"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1.5l13 6.5-13 6.5V9.5l9-1.5-9-1.5V1.5z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// separate tiny component to avoid re-rendering whole page every second
function TimerBar({ startTime }: { startTime: number }) {
  const [pct, setPct] = useState(100)
  const [cls, setCls] = useState('')

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - startTime) / 1000
      const left = Math.max(0, SESSION_DURATION - elapsed)
      setPct((left / SESSION_DURATION) * 100)
      setCls(left < 60 ? 'danger' : left < 180 ? 'warning' : '')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])

  return (
    <div className="timer-bar-track">
      <div
        className={`timer-bar-fill ${cls}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
