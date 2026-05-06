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
function Timer({ startTime, onEnd }: { startTime: number; onEnd: () => void }) {
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

  const cls = remaining < 60 ? 'danger' : remaining < 180 ? 'warning' : ''

  return (
    <div className="timer">
      <span className="timer-label">剩餘</span>
      <span className={`timer-digits ${cls}`}>
        {pad(Math.floor(remaining / 60))}:{pad(Math.floor(remaining % 60))}
      </span>
    </div>
  )
}

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
      <div className={`timer-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
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

// ── Participant ID screen ─────────────────────────────────────────
function ParticipantScreen({ onStart }: { onStart: (id: string) => void }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const id = value.trim()
    if (!id) return
    onStart(id)
  }

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">👨‍👩‍👧</div>
        <h1 className="participant-title">亞洲家長對話實驗</h1>
        <p className="participant-desc">
          你將與一個模擬台灣父母溝通風格的 AI 進行對話。<br />
          每次 AI 回覆後，你可以選擇查看話語背後真正的情感。
        </p>
        <div className="participant-form">
          <label className="participant-label" htmlFor="pid">
            受試者編號
          </label>
          <input
            ref={inputRef}
            id="pid"
            className="participant-input"
            type="text"
            placeholder="請輸入你的受試者編號"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
          />
          <button
            className="participant-btn"
            onClick={handleSubmit}
            disabled={!value.trim()}
          >
            開始對話
          </button>
        </div>
        <p className="participant-note">
          對話時間為 10 分鐘，結束後可下載對話記錄。
        </p>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function Page() {
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const startTime = useRef(Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEnd = useCallback(() => setSessionEnded(true), [])

  const handleStart = (id: string) => {
    startTime.current = Date.now()
    setParticipantId(id)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: data.parent,
          translation: data.translation,
          ts: nowTs(),
        },
      ])
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
      ['participant_id', 'timestamp', 'role', 'content', 'translation'],
      ...messages.map((m) => [
        participantId ?? '',
        m.ts,
        m.role,
        m.text,
        m.translation ?? '',
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${participantId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Not started yet ───────────────────────────────────────────
  if (!participantId) {
    return <ParticipantScreen onStart={handleStart} />
  }

  // ── Chat ──────────────────────────────────────────────────────
  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <div className="header-title">👨‍👩‍👧 亞洲家長對話實驗</div>
            <div className="header-subtitle">受試者：{participantId}</div>
          </div>
          <Timer startTime={startTime.current} onEnd={handleEnd} />
        </div>
        <TimerBar startTime={startTime.current} />
      </header>

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
              <div className="avatar">{msg.role === 'assistant' ? '👨' : '🧑'}</div>
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

      {sessionEnded ? (
        <div className="session-ended">
          <h2>⏰ 對話時間已結束</h2>
          <p>感謝您參與本實驗，請下載對話記錄交給研究人員。</p>
          <button className="download-btn" onClick={downloadCSV}>
            📥 下載對話記錄（{participantId}.csv）
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