'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SESSION_DURATION } from '@/lib/prompts'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text: string
  translation?: string
  ts: string
  contextRevealed?: boolean
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
function TranslationSection({
  translation,
  onReveal,
}: {
  translation: string
  onReveal: () => void
}) {
  const [open, setOpen] = useState(false)
  if (!translation) return null

  const handleReveal = () => {
    setOpen(true)
    onReveal()
  }

  return (
    <div className="translation-wrap">
      {open ? (
        <div className="translation-panel">
          <div className="translation-label">脈絡補充</div>
          {translation}
        </div>
      ) : (
        <button className="translation-btn" onClick={handleReveal}>
          🔍 查看脈絡補充
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
function ParticipantScreen({
  onStart,
  prefillId,
  prefillTopic,
}: {
  onStart: (id: string, topic: string) => void
  prefillId: string
  prefillTopic: string
}) {
  const [id, setId] = useState(prefillId)
  const [topic, setTopic] = useState(prefillTopic)
  const idRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // If both are prefilled via URL, auto-start
    if (prefillId && prefillTopic) {
      onStart(prefillId, prefillTopic)
      return
    }
    idRef.current?.focus()
  }, [prefillId, prefillTopic, onStart])

  const handleSubmit = () => {
    if (!id.trim() || !topic.trim()) return
    onStart(id.trim(), topic.trim())
  }

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">👨‍👩‍👧</div>
        <h1 className="participant-title">亞洲家長對話實驗</h1>
        <p className="participant-desc">
          你將與一個模擬台灣父母的 AI 進行價值觀爭論。<br />
          每次 AI 回覆後，你可以選擇查看脈絡補充。
        </p>
        <div className="participant-form">
          <label className="participant-label" htmlFor="pid">受試者編號</label>
          <input
            ref={idRef}
            id="pid"
            className="participant-input"
            type="text"
            placeholder="請輸入受試者編號"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
          />
          <label className="participant-label" htmlFor="topic" style={{ marginTop: '0.5rem' }}>
            爭論話題
          </label>
          <input
            id="topic"
            className="participant-input"
            type="text"
            placeholder="例如：花四千燙頭髮"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
          />
          <button
            className="participant-btn"
            onClick={handleSubmit}
            disabled={!id.trim() || !topic.trim()}
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

// ── Inner app (needs useSearchParams) ───────────────────────────
function ChatApp() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get('id') ?? ''
  const urlTopic = searchParams.get('topic') ?? ''

  const [participantId, setParticipantId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const startTime = useRef(Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEnd = useCallback(() => setSessionEnded(true), [])

  const handleStart = useCallback((id: string, t: string) => {
    startTime.current = Date.now()
    setParticipantId(id)
    setTopic(t)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  // mark context revealed for a message
  const handleContextReveal = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, contextRevealed: true } : m))
    )
  }

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
        body: JSON.stringify({ userMessage: text, history, topic }),
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
          contextRevealed: false,
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
      ['participant_id', 'topic', 'timestamp', 'role', 'content', 'translation', 'context_revealed'],
      ...messages.map((m) => [
        participantId ?? '',
        topic ?? '',
        m.ts,
        m.role,
        m.text,
        m.translation ?? '',
        m.role === 'assistant' ? (m.contextRevealed ? '1' : '0') : '',
      ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${participantId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!participantId || !topic) {
    return (
      <ParticipantScreen
        onStart={handleStart}
        prefillId={urlId}
        prefillTopic={urlTopic}
      />
    )
  }

  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <div className="header-title">👨‍👩‍👧 亞洲家長對話實驗</div>
            <div className="header-subtitle">
              受試者：{participantId}　｜　話題：{topic}
            </div>
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
                話題：<strong>{topic}</strong><br /><br />
                跟家長說說你的想法吧<br />
                他一定有話要反駁
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
              <TranslationSection
                translation={msg.translation}
                onReveal={() => handleContextReveal(msg.id)}
              />
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
              placeholder="說說你的想法…（Enter 送出，Shift+Enter 換行）"
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

// ── Page wrapper (Suspense for useSearchParams) ──────────────────
export default function Page() {
  return (
    <Suspense>
      <ChatApp />
    </Suspense>
  )
}