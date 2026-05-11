'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SESSION_DURATION, TOPIC_MAP, PARTICIPANT_MAP } from '@/lib/prompts'

const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwmKMxGsD7ZBaVQ4DUeacA0UL8P5bGFDTWGq2KW2KQqqMRKCACO1yjNF6bjeKx1Jb8AAA/exec'
const QUALTRICS_URL_EXP = 'https://tassel.syd1.qualtrics.com/jfe/form/SV_bNkhDODhyY8lxbw'
const QUALTRICS_URL_CTRL = 'https://tassel.syd1.qualtrics.com/jfe/form/SV_0pl4i9CUoJNCcOq'
const COOLDOWN_DURATION = 120 // 2 minutes

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

// ── Context hint ─────────────────────────────────────────────────
function ContextHint({ nickname }: { nickname: string }) {
  return (
    <div className="context-hint">
      💡 每則 <strong>{nickname}</strong> 的訊息下方都有「查看脈絡補充」，點開可以看到他說這句話背後的心情
    </div>
  )
}

// ── Step 1: Participant info screen ──────────────────────────────
function ParticipantScreen({
  onNext,
  prefillId,
  prefillTopic,
}: {
  onNext: (id: string, topic: string, nickname: string, opening: string, condition: 'experimental' | 'control', pretestQuestion: string) => void
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
      onNext(prefillId, entry.topic, '', entry.opening, entry.condition, entry.pretestQuestion)
      return
    }
    idRef.current?.focus()
  }, [prefillId, prefillTopic, onNext])

  const handleSubmit = () => {
    if (!id.trim() || !code.trim() || !nickname.trim()) return
    const expectedCode = PARTICIPANT_MAP[id.trim()]
    if (!expectedCode || expectedCode !== code.trim().toUpperCase()) {
      setCodeError(true)
      return
    }
    const entry = TOPIC_MAP[code.trim().toUpperCase()]
    if (!entry) {
      setCodeError(true)
      return
    }
    setCodeError(false)
    onNext(id.trim(), entry.topic, nickname.trim(), entry.opening, entry.condition, entry.pretestQuestion)
  }

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">👨‍👩‍👧</div>
        <h1 className="participant-title">親子對話實驗</h1>
        <p className="participant-desc">你將與一個模擬台灣父母的 AI 進行對話。</p>
        <div className="participant-instructions">
          <p>📌 <strong>請注意：</strong></p>
          <p>請把這次對話當作你真實和父母的對話情境。想像這個話題是你們最近真的有在討論的事情，並盡可能像平常傳訊息一樣，認真表達你的想法。</p>
          <p>你的每一句話都很重要，將用於分析親子溝通模式。</p>
        </div>
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
          <label className="participant-label" htmlFor="code" style={{ marginTop: '0.5rem' }}>話題代碼</label>
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
              受試者編號與話題代碼不符，請確認後再試
            </p>
          )}
          <label className="participant-label" htmlFor="nickname" style={{ marginTop: '0.5rem' }}>父母在 LINE 的暱稱</label>
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
            下一步
          </button>
        </div>
        <p className="participant-note">對話時間為 10 分鐘，結束後將自動跳轉至後測問卷。</p>
      </div>
    </div>
  )
}

// ── Step 2: Pretest question screen ──────────────────────────────
function PretestScreen({
  pretestQuestion,
  onSubmit,
}: {
  pretestQuestion: string
  onSubmit: (answer: string) => void
}) {
  const [answer, setAnswer] = useState('')

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">💬</div>
        <h1 className="participant-title">對話前問題</h1>
        <p className="participant-desc">在開始對話之前，請先回答以下問題。請用自己的話回答，不需要標準答案。</p>
        <div className="participant-form">
          <label className="participant-label">{pretestQuestion}</label>
          <textarea
            className="participant-input"
            style={{ minHeight: '120px', resize: 'vertical', marginTop: '0.5rem' }}
            placeholder="請在這裡輸入你的回答..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button
            className="participant-btn"
            onClick={() => onSubmit(answer.trim())}
            disabled={!answer.trim()}
          >
            開始對話
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 4: Cooldown screen ───────────────────────────────────────
function CooldownScreen({ onEnd }: { onEnd: () => void }) {
  const [remaining, setRemaining] = useState(COOLDOWN_DURATION)

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id)
          onEnd()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [onEnd])

  const pct = (remaining / COOLDOWN_DURATION) * 100

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">☕</div>
        <h1 className="participant-title">感謝你完成這次對話</h1>
        <p className="participant-desc">
          請先休息一下，稍後將有一個簡短的問題請你回答。
        </p>
        <div style={{ margin: '1.5rem 0', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '0.05em' }}>
            {pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}
          </div>
        </div>
        <div className="timer-bar-track">
          <div className="timer-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '1rem' }}>
          時間結束後將自動進入下一步
        </p>
      </div>
    </div>
  )
}

// ── Step 5: Posttest question screen ─────────────────────────────
function PosttestScreen({
  pretestQuestion,
  onSubmit,
}: {
  pretestQuestion: string
  onSubmit: (answer: string) => void
}) {
  const [answer, setAnswer] = useState('')

  // 把前測問題的「為什麼」部分保留，改成現在式
  const posttestQuestion = pretestQuestion.replace('你覺得', '現在你覺得')

  return (
    <div className="participant-screen">
      <div className="participant-card">
        <div className="participant-icon">📝</div>
        <h1 className="participant-title">對話後問題</h1>
        <p className="participant-desc">請根據剛才的對話經驗回答以下問題。</p>
        <div className="participant-form">
          <label className="participant-label">{posttestQuestion}</label>
          <textarea
            className="participant-input"
            style={{ minHeight: '120px', resize: 'vertical', marginTop: '0.5rem' }}
            placeholder="請在這裡輸入你的回答..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button
            className="participant-btn"
            onClick={() => onSubmit(answer.trim())}
            disabled={!answer.trim()}
          >
            繼續
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inner app ───────────────────────────────────────────────────
function ChatApp() {
  const searchParams = useSearchParams()
  const urlId = searchParams.get('id') ?? ''
  const urlTopic = searchParams.get('topic') ?? ''

  const [step, setStep] = useState<'info' | 'pretest' | 'chat' | 'cooldown' | 'posttest'>('info')

  const [participantId, setParticipantId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [condition, setCondition] = useState<'experimental' | 'control' | null>(null)
  const [pretestQuestion, setPretestQuestion] = useState<string>('')
  const [opening, setOpening] = useState<string>('')

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

  const postToSheets = useCallback(async (data: object) => {
    await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  }, [])

  // Step 1 → Step 2
  const handleInfoNext = useCallback((id: string, t: string, nick: string, op: string, cond: 'experimental' | 'control', pq: string) => {
    setParticipantId(id)
    setTopic(t)
    setNickname(nick)
    setCondition(cond)
    setPretestQuestion(pq)
    setOpening(op)
    setStep('pretest')
  }, [])

  // Step 2 → Step 3
  const handlePretestSubmit = useCallback(async (answer: string) => {
    const pid = participantId ?? 'unknown'
    const t = topic ?? ''
    const cond = condition ?? 'control'

    try {
      await postToSheets({
        type: 'pretest',
        participant_id: pid,
        topic: t,
        condition: cond,
        pretest_answer: answer,
        timestamp: nowTs(),
      })
    } catch { /* 上傳失敗不影響繼續 */ }

    startTime.current = Date.now()
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      text: opening,
      ts: nowTs(),
      contextRevealed: false,
    }])
    setStep('chat')
  }, [participantId, topic, condition, opening, postToSheets])

  // Step 3 → Step 4（對話結束，上傳對話記錄，進入 cooldown）
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
    const cond = conditionRef.current ?? 'control'

    const rows = msgs.map((m) => [
      pid, t, nick, cond, m.ts, m.role, m.text,
      m.translation ?? '',
      m.role === 'assistant' ? (m.contextRevealed ? '1' : '0') : '',
    ])

    try {
      await postToSheets({ type: 'chat', rows })
    } catch { /* 上傳失敗不影響繼續 */ }

    setUploading(false)
    setStep('cooldown')
  }, [postToSheets])

  // Step 4 → Step 5
  const handleCooldownEnd = useCallback(() => {
    setStep('posttest')
  }, [])

  // Step 5 → 跳轉 Qualtrics
  const handlePosttestSubmit = useCallback(async (answer: string) => {
    const pid = participantIdRef.current ?? 'unknown'
    const t = topicRef.current ?? ''
    const cond = conditionRef.current ?? 'control'

    try {
      await postToSheets({
        type: 'posttest',
        participant_id: pid,
        topic: t,
        condition: cond,
        posttest_answer: answer,
        timestamp: nowTs(),
      })
    } catch { /* 上傳失敗不影響跳轉 */ }

    const qualtricsUrl = cond === 'experimental' ? QUALTRICS_URL_EXP : QUALTRICS_URL_CTRL
    window.location.href = `${qualtricsUrl}?participant_id=${encodeURIComponent(pid)}`
  }, [postToSheets])

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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const isExperimental = condition === 'experimental'

  if (step === 'info') return (
    <ParticipantScreen onNext={handleInfoNext} prefillId={urlId} prefillTopic={urlTopic} />
  )

  if (step === 'pretest') return (
    <PretestScreen pretestQuestion={pretestQuestion} onSubmit={handlePretestSubmit} />
  )

  if (step === 'cooldown') return (
    <CooldownScreen onEnd={handleCooldownEnd} />
  )

  if (step === 'posttest') return (
    <PosttestScreen pretestQuestion={pretestQuestion} onSubmit={handlePosttestSubmit} />
  )

  // step === 'chat'
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
        {isExperimental && nickname && <ContextHint nickname={nickname} />}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg-row ${msg.role}`}>
            <div className="bubble-wrap">
              <div className="avatar">
                {msg.role === 'assistant' ? nickname : '🧑'}
              </div>
              <div className="bubble">{msg.text}</div>
            </div>
            <div className="bubble-ts">{msg.ts}</div>
            {isExperimental && msg.role === 'assistant' && msg.translation && (
              <TranslationSection
                translation={msg.translation}
                onReveal={() => handleContextReveal(msg.id)}
              />
            )}
          </div>
        ))}

        {loading && nickname && <TypingIndicator nickname={nickname} />}
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