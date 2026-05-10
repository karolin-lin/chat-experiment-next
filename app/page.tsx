'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SESSION_DURATION, TOPIC_MAP } from '@/lib/prompts'

const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwmKMxGsD7ZBaVQ4DUeacA0UL8P5bGFDTWGq2KW2KQqqMRKCACO1yjNF6bjeKx1Jb8AAA/exec'
const QUALTRICS_URL = 'https://tassel.syd1.qualtrics.com/jfe/form/SV_bNFXuzINoN3nM46'

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

// ── Translation panel（只有實驗組看得到）────────────────────────
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
function TypingIndicator({ nickname }: { nickname: string }) {
  return (
    <div className="msg-row assistant">
      <div className="bubble-wrap">
        <div className="avatar">{nickname}</div>
        <div className="typing-bubble">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  )
}

// ── Context hint（只有實驗組看得到）─────────────────────────────
function ContextHint({ nickname }: { nickname: string }) {
  return (
    <div className="context-hint">
      💡 每則 <strong>{nickname}</strong> 的訊息下方都有「查看脈絡補充」，點開可以看到他說這句話背後的心情
    </div>
  )
}

// ── Participant ID screen ─────────────────────────────────────────
function ParticipantScreen({
  onStart,
  prefillId,
  prefillTopic,
}: {
  onStart: (id: string, topic: string, nickname: string, opening: string, condition: 'experimental' | 'control') => void
  prefillId: string
  prefillTopic: string
}) {
  const [id, setId] = useState(prefillId)
  const [code, setCode] = useState(prefillTopic)
  const [nickname, setNickname] = useState('')
  const [codeError, setCodeError] = useState(false)
  const idRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prefillId && prefillTopic && TOPIC_MAP[prefillTopic]) {
      const entry = TOPIC_MAP[prefillTopic]
      onStart(prefillId, entry.topic, '', entry.opening, entry.condition)
      return
    }
    idRef.current?.focus()
  }, [prefillId, prefillTopic, onStart])

  const handleSubmit = () => {
    if (!id.trim() || !code.trim() || !nickname.trim()) return
    const entry = TOPIC_MAP[code.trim().toUpperCase()]
    if (!entry) {
      setCodeError(true)
      return
    }
    setCodeError(false)
    onStart(id.trim(), entry.topic, nickname.trim(), entry.opening, entry.condition)
  }

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">👨‍👩‍👧</div>
        <h1 className="participant-title">親子對話實驗</h1>
        <p className="participant-desc">
          你將與一個模擬台灣父母的 AI 進行價值觀爭論。<br />
          請輸入你的受試者資訊以開始對話。
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

          <label className="participant-label" htmlFor="code" style={{ marginTop: '0.5rem' }}>
            話題代碼
          </label>
          <input
            id="code"
            className="participant-input"
            type="text"
            placeholder="請輸入話題代碼"
            value={code}
            onChange={(e) => { setCode(e.target.value); setCodeError(false) }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
          />
          {codeError && (
            <p style={{ color: 'red', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              話題代碼不正確，請確認後再試
            </p>
          )}

          <label className="participant-label" htmlFor="nickname" style={{ marginTop: '0.5rem' }}>
            父母在 LINE 的暱稱
          </label>
          <input
            id="nickname"
            className="participant-input"
            type="text"
            placeholder="例如：媽媽、老爸、阿母"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="off"
          />

          <button
            className="participant-btn"
            onClick={handleSubmit}
            disabled={!id.trim() || !code.trim() || !nickname.trim()}
          >
            開始對話
          </button>
        </div>
        <p className="participant-note">
          對話時間為 10 分鐘，結束後將自動跳轉至後測問卷。
        </p>
      </div>
    </div>
  )
}

// ── Inner app ───────────────────────────────────────────────────
function ChatApp() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get('id') ?? ''
  const urlTopic = searchParams.get('topic') ?? ''

  const [participantId, setParticipantId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [condition, setCondition] = useState<'experimental' | 'control' | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const startTime = useRef(Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<Message[]>([])
  const participantIdRef = useRef<string | null>(null)
  const topicRef = useRef<string | null>(null)
  const nicknameRef = useRef<string | null>(null)
  const conditionRef = useRef<'experimental' | 'control' | null>(null)
  const sessionEndedRef = useRef(false)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { participantIdRef.current = participantId }, [participantId])
  useEffect(() => { topicRef.current = topic }, [topic])
  useEffect(() => { nicknameRef.current = nickname }, [nickname])
  useEffect(() => { conditionRef.current = condition }, [condition])

  const uploadToSheets = useCallback(async (msgs: Message[], pid: string, t: string, nick: string, cond: string) => {
    const rows = msgs.map((m) => [
      pid, t, nick, cond, m.ts, m.role, m.text,
      m.translation ?? '',
      m.role === 'assistant' ? (m.contextRevealed ? '1' : '0') : '',
    ])
    await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    })
  }, [])

  const handleEnd = useCallback(async () => {
    if (sessionEndedRef.current) return
    sessionEndedRef.current = true
    setSessionEnded(true)
    setUploading(true)

    const seen = new Set<string>()
    const msgs = messagesRef.current.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    const pid = participantIdRef.current ?? 'unknown'
    const t = topicRef.current ?? ''
    const nick = nicknameRef.current ?? ''
    const cond = conditionRef.current ?? ''

    try {
      await uploadToSheets(msgs, pid, t, nick, cond)
    } catch {
      // 上傳失敗不影響跳轉
    }

    setUploading(false)
    window.location.href = `${QUALTRICS_URL}?participant_id=${encodeURIComponent(pid)}`
  }, [uploadToSheets])

  const handleStart = useCallback((id: string, t: string, nick: string, opening: string, cond: 'experimental' | 'control') => {
    startTime.current = Date.now()
    setParticipantId(id)
    setTopic(t)
    setNickname(nick)
    setCondition(cond)
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      text: opening,
      ts: nowTs(),
      contextRevealed: false,
    }])
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

    const history = messagesRef.current.map((m) => ({
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
      if (!data.parent?.trim()) throw new Error('收到空白回應，請再試一次')

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

  const isExperimental = condition === 'experimental'

  if (!participantId || !topic || !nickname || !condition) {
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
            <div className="header-title">{nickname}</div>
            <div className="header-subtitle">受試者：{participantId}</div>
          </div>
          <Timer startTime={startTime.current} onEnd={handleEnd} />
        </div>
        <TimerBar startTime={startTime.current} />
      </header>

      <div className="chat-area">
        {/* 只有實驗組看到提示 */}
        {isExperimental && <ContextHint nickname={nickname} />}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row ${msg.role}`}>
            <div className="bubble-wrap">
              <div className="avatar">
                {msg.role === 'assistant' ? nickname : '🧑'}
              </div>
              <div className="bubble">{msg.text}</div>
            </div>
            <div className="bubble-ts">{msg.ts}</div>
            {/* 只有實驗組看到脈絡補充按鈕 */}
            {isExperimental && msg.role === 'assistant' && msg.translation && (
              <TranslationSection
                translation={msg.translation}
                onReveal={() => handleContextReveal(msg.id)}
              />
            )}
          </div>
        ))}

        {loading && <TypingIndicator nickname={nickname} />}
        {error && <div className="error-bar">⚠️ {error}</div>}
        {uploading && <div className="error-bar">⏳ 正在儲存對話記錄，請稍候...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <div className="input-form">
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder="說說你的想法…（Enter 送出，Shift+Enter 換行）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || sessionEnded}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={send}
            disabled={!input.trim() || loading || sessionEnded}
            aria-label="送出"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.5l13 6.5-13 6.5V9.5l9-1.5-9-1.5V1.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <ChatApp />
    </Suspense>
  )
}