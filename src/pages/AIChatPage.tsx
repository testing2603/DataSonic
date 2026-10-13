import { useState, useRef, useEffect } from 'react'

type MsgRole = 'user' | 'assistant' | 'system'

interface Msg {
  id: number
  role: MsgRole
  text: string
  sql?: string[]
  table?: { headers: string[]; rows: string[][] }
  error?: boolean
}

let msgId = 0

function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return null
  const parse = (line: string) =>
    line.split('|').map(c => c.trim()).filter(Boolean)
  const headers = parse(lines[0])
  if (headers.length === 0) return null
  const sepIdx = lines.findIndex(l => /^\|[\s\-:|]+\|$/.test(l.trim()))
  const dataStart = sepIdx >= 0 ? sepIdx + 1 : 1
  const rows = lines.slice(dataStart).map(parse).filter(r => r.length === headers.length)
  if (rows.length === 0) return null
  return { headers, rows }
}

function stripTableFromText(text: string): string {
  const lines = text.split('\n')
  const filtered: string[] = []
  let inTable = false
  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true
      continue
    }
    if (inTable && line.trim() === '') continue
    inTable = false
    filtered.push(line)
  }
  return filtered.join('\n').trim()
}

const SUGGESTIONS = [
  'What data is available?',
  'Show me top 10 policies',
  'How many claims are open?',
  'Show recent transactions',
]

export default function AIChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: msgId++,
      role: 'assistant',
      text: 'Hello! I\'m your AI Data Assistant powered by Microsoft Fabric. I can query your lakehouse data using natural language — ask me about policies, claims, premiums, or any data in the system.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentReady, setAgentReady] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    fetch('/api/ai-chat/status')
      .then(r => r.json())
      .then(d => setAgentReady(d.configured))
      .catch(() => setAgentReady(false))
  }, [])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { id: msgId++, role: 'user', text: q }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages(m => [...m, {
          id: msgId++, role: 'assistant',
          text: data.error || 'Something went wrong.',
          error: true,
        }])
      } else {
        const answer: string = data.answer || 'No response.'
        const table = parseMarkdownTable(answer)
        const cleanText = table ? stripTableFromText(answer) : answer

        setMessages(m => [...m, {
          id: msgId++,
          role: 'assistant',
          text: cleanText || (table ? 'Here are the results:' : answer),
          sql: data.sql_queries?.length ? data.sql_queries : undefined,
          table: table || undefined,
        }])
      }
    } catch (err: any) {
      setMessages(m => [...m, {
        id: msgId++, role: 'assistant',
        text: `Connection error: ${err.message}`,
        error: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 flex-shrink-0" style={{ background: '#081A2E', borderBottom: '1px solid #18334F' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#F4F8FC' }}>AI Data Assistant</h1>
            <p className="text-[12px] mt-0.5" style={{ color: '#8FA7BF' }}>
              Powered by Microsoft Fabric Data Agent — query your lakehouse with natural language
            </p>
          </div>
          <StatusBadge ready={agentReady} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {messages.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {m.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: '#1683FF' }}>
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="10" y1="2" x2="10" y2="5" />
                    <circle cx="10" cy="1.5" r="1" fill="white" stroke="none" />
                    <rect x="3" y="5" width="14" height="9" rx="2.5" />
                    <circle cx="7.5" cy="9" r="1.2" fill="white" stroke="none" />
                    <circle cx="12.5" cy="9" r="1.2" fill="white" stroke="none" />
                    <path d="M7.5 12h5" strokeWidth="1.2" />
                    <line x1="3" y1="8.5" x2="1.5" y2="8.5" strokeWidth="1.6" />
                    <line x1="17" y1="8.5" x2="18.5" y2="8.5" strokeWidth="1.6" />
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-[11px] font-bold text-white">AM</div>
              )}

              <div className={`flex flex-col gap-2 max-w-[80%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {/* Text bubble */}
                <div
                  className="px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={
                    m.role === 'user'
                      ? { background: '#1683FF', color: '#FFFFFF', borderRadius: '18px 4px 18px 18px' }
                      : {
                          background: m.error ? '#2D1520' : '#102B48',
                          border: `1px solid ${m.error ? '#5C2030' : '#214260'}`,
                          color: m.error ? '#F4A0A0' : '#E6EEF7',
                          borderRadius: '4px 18px 18px 18px',
                        }
                  }
                >
                  {renderText(m.text)}
                </div>

                {/* Table */}
                {m.table && <DataTable table={m.table} />}

                {/* SQL queries (collapsible) */}
                {m.sql && m.sql.length > 0 && <SqlBlock queries={m.sql} />}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1683FF' }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="10" y1="2" x2="10" y2="5" />
                  <circle cx="10" cy="1.5" r="1" fill="white" stroke="none" />
                  <rect x="3" y="5" width="14" height="9" rx="2.5" />
                  <circle cx="7.5" cy="9" r="1.2" fill="white" stroke="none" />
                  <circle cx="12.5" cy="9" r="1.2" fill="white" stroke="none" />
                  <path d="M7.5 12h5" strokeWidth="1.2" />
                  <line x1="3" y1="8.5" x2="1.5" y2="8.5" strokeWidth="1.6" />
                  <line x1="17" y1="8.5" x2="18.5" y2="8.5" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: '#102B48', border: '1px solid #214260', borderRadius: '4px 18px 18px 18px' }}>
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DA8FF', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DA8FF', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#2DA8FF', animationDelay: '300ms' }} />
                </div>
                <span className="text-[11px]" style={{ color: '#8FA7BF' }}>Querying Fabric Data Agent...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Suggestions + input */}
      <div className="px-8 py-4 flex-shrink-0" style={{ background: '#081A2E', borderTop: '1px solid #18334F' }}>
        <div className="max-w-3xl mx-auto">
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
                  style={{ background: '#103B70', color: '#2DA8FF', border: '1px solid rgba(45,168,255,0.3)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask anything about your data in natural language..."
              disabled={loading}
              className="flex-1 rounded-xl px-4 py-3 text-[13px] focus:outline-none disabled:opacity-60"
              style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="px-5 py-3 text-white rounded-xl text-[13px] font-semibold disabled:opacity-40 transition-colors flex items-center gap-2"
              style={{ background: '#1683FF' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2">
                <path d="M12 7H2M8 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ ready }: { ready: boolean | null }) {
  if (ready === null) return null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: ready ? '#0A2E1A' : '#2D1520', border: `1px solid ${ready ? '#1A5C30' : '#5C2030'}` }}>
      <div className="w-2 h-2 rounded-full" style={{ background: ready ? '#34D399' : '#F87171' }} />
      <span className="text-[11px] font-medium" style={{ color: ready ? '#6EE7B7' : '#FCA5A5' }}>
        {ready ? 'Agent Connected' : 'Agent Not Configured'}
      </span>
    </div>
  )
}

function renderText(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function DataTable({ table }: { table: { headers: string[]; rows: string[][] } }) {
  return (
    <div className="rounded-xl overflow-hidden w-full" style={{ background: '#102B48', border: '1px solid #214260' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: '#0A1B31', borderBottom: '1px solid #18334F' }}>
              {table.headers.map(h => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wide px-4 py-2.5 whitespace-nowrap" style={{ color: '#8FA7BF' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #18334F' }}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-[12px] whitespace-nowrap" style={{ color: j === 0 ? '#2DA8FF' : '#E6EEF7' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-right" style={{ borderTop: '1px solid #18334F' }}>
        <span className="text-[10px]" style={{ color: '#8FA7BF' }}>{table.rows.length} row{table.rows.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

function SqlBlock({ queries }: { queries: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full rounded-lg overflow-hidden" style={{ background: '#091A2D', border: '1px solid #1A3350' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ color: '#8FA7BF' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <path d="M3 1l4 4-4 4" />
        </svg>
        <span className="text-[11px] font-medium">SQL {queries.length > 1 ? `(${queries.length} queries)` : 'Query'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {queries.map((q, i) => (
            <pre key={i} className="text-[11px] leading-relaxed p-3 rounded-md overflow-x-auto mt-1" style={{ background: '#061426', color: '#7DD3FC', fontFamily: 'monospace' }}>
              {q}
            </pre>
          ))}
        </div>
      )}
    </div>
  )
}
