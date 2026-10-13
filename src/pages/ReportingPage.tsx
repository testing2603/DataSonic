import { useEffect, useRef, useState } from 'react'

type LOB = 'marine' | 'automobile' | 'aviation' | 'property'

const LOB_META: Record<LOB, { label: string; icon: React.ReactNode; description: string }> = {
  marine: { label: 'Marine', icon: <AnchorIcon />, description: 'Hull, Cargo, P&I, and Offshore sub-classes' },
  automobile: { label: 'Automobile', icon: <CarIcon />, description: 'Motor fleet, personal auto, and commercial vehicle' },
  aviation: { label: 'Aviation', icon: <PlaneIcon />, description: 'Aviation hull, liability, and cargo' },
  property: { label: 'Property', icon: <BuildingIcon />, description: 'Commercial property, residential, and specialty' },
}
const LOBS = Object.keys(LOB_META) as LOB[]

const EXAMPLE_PROMPTS: Record<LOB, string[]> = {
  // Phrased with terms the Marine ontology supports (loss ratio, for example, isn't in the model).
  marine: [
    'Claims overview: incurred, paid and outstanding by loss year, and the brokers with the most outstanding',
    'Broker performance page comparing claims, payment ratio and commission %',
    'Policy portfolio: premium and limit by product and vessel type, with policy counts by year of account',
  ],
  automobile: [
    'Monthly premium trend and claims ratio by vehicle type',
    'Fleet size distribution and average premium per vehicle',
    'Top brokers by GWP with claims frequency comparison',
  ],
  aviation: [
    'Premium split by aircraft type and cargo vs hull liability',
    'Claims severity trend over the last 12 months',
    'KPI cards for active policies, total reserves, and loss ratio',
  ],
  property: [
    'GWP by region as a map chart and claims by property type',
    'Monthly submission volume trend with approval rate overlay',
    'Top 5 insureds by premium with open claims breakdown',
  ],
}

interface Plan {
  title: string
  summary: string
  pages: { name: string; title: string; visuals: string[] }[]
  layout?: string
  assumptions?: string[]
  not_available?: string[]
}
interface Result { title: string; pages: number; validation: string; notes?: string[] }

type Status = 'planning' | 'awaiting_approval' | 'building' | 'ready' | 'error' | 'rejected'

interface ReportJob {
  id: string
  status: Status
  prompt: string
  lob: LOB
  steps: string[]
  plan?: Plan
  result?: Result
  openUrl?: string
  publishUrl?: string
  downloadUrl?: string
  message?: string
  canRetry?: boolean
  seconds?: number
  costUsd?: number
  startedAt: number
}

type ServerEvent = { type: string; job_id: string; [k: string]: any }

const BUSY: Status[] = ['planning', 'building']

function useReportSocket(onEvent: (ev: ServerEvent) => void, activeJobIds: () => string[]) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    let closed = false
    let retry: number | undefined
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/report/ws`)
      wsRef.current = ws
      ws.onopen = () => {
        setConnected(true)
        activeJobIds().forEach(id => ws.send(JSON.stringify({ type: 'subscribe', job_id: id })))
      }
      ws.onmessage = e => handler.current(JSON.parse(e.data))
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retry = window.setTimeout(connect, 2000)
      }
    }
    connect()
    return () => { closed = true; window.clearTimeout(retry); wsRef.current?.close() }
  }, [])

  const send = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify(msg)); return true }
    return false
  }
  return { send, connected }
}

export default function ReportingPage() {
  const [activeLob, setActiveLob] = useState<LOB>('marine')
  const [prompt, setPrompt] = useState('')
  const [jobs, setJobs] = useState<ReportJob[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const pendingLob = useRef<LOB>('marine')
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const update = (id: string, f: (j: ReportJob) => ReportJob) => setJobs(prev => prev.map(j => (j.id === id ? f(j) : j)))

  const { send, connected } = useReportSocket(ev => {
    const id = ev.job_id
    switch (ev.type) {
      case 'job':
        setJobs(prev => prev.some(j => j.id === id) ? prev : [
          { id, status: 'planning', prompt: ev.prompt, lob: (ev.lob as LOB) ?? pendingLob.current, steps: [], startedAt: Date.now() },
          ...prev,
        ])
        break
      case 'step':
        update(id, j => (j.steps.at(-1) === ev.text ? j : { ...j, steps: [...j.steps, ev.text] }))
        break
      case 'plan':
        update(id, j => ({ ...j, status: 'awaiting_approval' as const, plan: ev.plan, seconds: ev.seconds, costUsd: ev.cost_usd }))
        break
      case 'ready':
        update(id, j => ({ ...j, status: (ev.result?.validation === 'succeeded' ? 'ready' : 'error') as Status, result: ev.result,
          openUrl: ev.openUrl, publishUrl: ev.publishUrl, downloadUrl: ev.downloadUrl, seconds: ev.seconds, costUsd: ev.cost_usd, canRetry: !!ev.can_retry,
          message: ev.result?.validation === 'succeeded' ? undefined : (ev.message || 'The report did not pass validation.') }))
        break
      case 'rejected':
      case 'error':
        if (id) {
          update(id, j => ({ ...j, status: ev.type as Status, message: ev.message, canRetry: !!ev.can_retry }))
        } else {
          setGlobalError(ev.message || 'Connection to the report agent failed.')
        }
        break
    }
  }, () => jobsRef.current.filter(j => j.status !== 'ready' && j.status !== 'rejected' && (j.status !== 'error' || j.canRetry)).map(j => j.id))

  // Surface setup problems (e.g. Foundry keys still placeholders) before the user types a request.
  useEffect(() => {
    if (!connected) return
    fetch('/api/report/health').then(r => r.json()).then(h => {
      if (h && h.agent_available === false) setGlobalError(`Report agent unavailable: ${h.agent_detail ?? 'not configured'}`)
    }).catch(() => {})
  }, [connected])

  const generating = jobs.some(j => BUSY.includes(j.status))

  function generateReport() {
    const text = prompt.trim()
    if (!text || generating) return
    setGlobalError(null)
    pendingLob.current = activeLob
    if (send({ type: 'generate', lob: activeLob, prompt: text })) setPrompt('')
  }

  const approve = (id: string) => { update(id, j => ({ ...j, status: 'building' as const, message: undefined })); send({ type: 'approve', job_id: id }) }
  const revise = (id: string, feedback: string) => {
    update(id, j => ({ ...j, status: 'planning' as const, plan: undefined, message: undefined }))
    send({ type: 'revise', job_id: id, feedback })
  }

  const meta = LOB_META[activeLob]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 flex-shrink-0 flex items-start justify-between" style={{ background: '#081A2E', borderBottom: '1px solid #18334F' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F4F8FC' }}>Reporting & Analytics</h1>
          <p className="text-[12px] mt-0.5" style={{ color: '#8FA7BF' }}>
            Generate Power BI reports from natural language — pick a line of business and describe what you need.
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5" style={{ background: '#102B48', color: connected ? '#18C7A0' : '#FF647C' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? '#18C7A0' : '#FF647C' }} />
          {connected ? 'Agent connected' : 'Connecting…'}
        </span>
      </div>

      {globalError && (
        <div className="px-8 py-3 flex items-center justify-between" style={{ background: '#492431', borderBottom: '1px solid #5A2E3E' }}>
          <div className="flex items-center gap-2">
            <ErrorCircle />
            <span className="text-[12px]" style={{ color: '#FF647C' }}>{globalError}</span>
          </div>
          <button onClick={() => setGlobalError(null)} className="text-[11px] px-2 py-1 rounded" style={{ color: '#8FA7BF' }}>Dismiss</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* LOB tabs */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#8FA7BF' }}>Line of Business</div>
            <div className="grid grid-cols-4 gap-3">
              {LOBS.map(lob => {
                const m = LOB_META[lob]
                const active = activeLob === lob
                return (
                  <button key={lob} onClick={() => setActiveLob(lob)} className="rounded-xl p-4 text-left transition-all"
                    style={{ background: active ? '#0D3970' : '#102B48', border: `1.5px solid ${active ? '#1683FF' : '#214260'}`,
                      boxShadow: active ? '0 0 0 1px rgba(22,131,255,0.3)' : undefined }}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: active ? '#1683FF' : '#1A3A5C', color: active ? '#fff' : '#8FA7BF' }}>{m.icon}</div>
                      <span className="text-[13px] font-semibold" style={{ color: active ? '#F4F8FC' : '#8FA7BF' }}>{m.label}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: active ? '#8FA7BF' : '#5A7A9A' }}>{m.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prompt section */}
          <div className="rounded-xl p-5" style={{ background: '#102B48', border: '1px solid #214260' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#1683FF' }}><SparkleIcon /></div>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: '#F4F8FC' }}>Describe your report — {meta.label}</div>
                <div className="text-[11px]" style={{ color: '#8FA7BF' }}>
                  Tell us what charts, KPIs, or tables you want. You'll review a plan before the Power BI report is built on your gold data.
                </div>
              </div>
            </div>

            <textarea value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 1000))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateReport() } }}
              placeholder={`e.g. "${EXAMPLE_PROMPTS[activeLob][0]}"`} rows={3}
              className="w-full rounded-lg p-3 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-[#1683FF]"
              style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }} />

            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px]" style={{ color: '#5A7A9A' }}>{prompt.length}/1000 · Enter to generate</span>
              <button onClick={generateReport} disabled={!prompt.trim() || generating || !connected}
                className="px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#1683FF' }}>
                {generating ? (<><Spinner />Working…</>) : (<><SparkleIcon />Generate Report</>)}
              </button>
            </div>

            <div className="mt-4 pt-3" style={{ borderTop: '1px solid #18334F' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#5A7A9A' }}>Try these</div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS[activeLob].map(ex => (
                  <button key={ex} onClick={() => setPrompt(ex)} className="text-[11px] px-3 py-1.5 rounded-full transition-colors"
                    style={{ background: '#0D3970', color: '#2DA8FF', border: '1px solid rgba(45,168,255,0.2)' }}>
                    {ex.length > 55 ? ex.slice(0, 52) + '…' : ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Jobs */}
          {jobs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: '#8FA7BF' }}>Generated Reports</div>
              <div className="space-y-3">
                {jobs.map(job => <JobCard key={job.id} job={job} onApprove={approve} onRevise={revise} />)}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

function JobCard({ job, onApprove, onRevise }: { job: ReportJob; onApprove: (id: string) => void; onRevise: (id: string, f: string) => void }) {
  const [feedback, setFeedback] = useState('')
  const [revising, setRevising] = useState(false)
  const [openMsg, setOpenMsg] = useState<string>()
  const busy = BUSY.includes(job.status)
  const canAct = job.status === 'awaiting_approval' || (job.status === 'error' && !!job.canRetry && !!job.plan)
  const lastStep = job.steps.at(-1)
  const signIn = busy && lastStep?.startsWith('Power BI sign-in needed') ? lastStep : undefined
  const tone = job.status === 'ready' ? ['#103E3A', '#18C7A0'] : job.status === 'error' || job.status === 'rejected' ? ['#492431', '#FF647C']
    : job.status === 'awaiting_approval' ? ['#3D3214', '#F5B841'] : ['#0D3970', '#2DA8FF']
  const label: Record<Status, string> = { planning: 'Planning…', awaiting_approval: 'Plan ready: review and approve', building: 'Building report…',
    ready: 'Report ready', error: 'Failed', rejected: 'Not available' }

  const [publishing, setPublishing] = useState(false)
  const [webUrl, setWebUrl] = useState<string>()

  // Publishes once (the server reuses the same Power BI report on later clicks), then opens it in a new tab.
  async function openWeb() {
    if (webUrl) { window.open(webUrl, '_blank', 'noopener'); return }
    const publishUrl = job.publishUrl ?? `/api/report/${job.id}/publish`
    if (publishing) return
    // Open the tab now: browsers block pop-ups opened after an await.
    const win = window.open('', '_blank')
    if (win) { win.opener = null; win.document.title = 'Publishing to Power BI…'; win.document.body.innerText = 'Publishing the report to Power BI…' }
    setPublishing(true)
    setOpenMsg('Publishing to Power BI… this can take up to a minute the first time.')
    try {
      const r = await fetch(publishUrl, { method: 'POST' })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body?.url) {
        win?.close()
        // FastAPI's bare "Not Found" means the route itself is missing: the report server predates this feature.
        setOpenMsg(r.status === 404 && body?.detail === 'Not Found'
          ? 'The report server is running an older version without publishing. Restart it (pnpm dev:report) and try again.'
          : body?.detail ?? `Could not publish (HTTP ${r.status}).`)
        return
      }
      setWebUrl(body.url)
      setOpenMsg(`Published to Power BI as “${body.displayName}”.`)
      if (win) win.location.href = body.url
      else window.open(body.url, '_blank', 'noopener')
    } catch {
      win?.close()
      setOpenMsg('Could not reach the report server.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="rounded-xl p-4 flex items-start gap-4" style={{ background: '#102B48', border: '1px solid #214260' }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: tone[0], color: tone[1] }}>
        {busy ? <Spinner /> : job.status === 'ready' ? <CheckCircle /> : job.status === 'awaiting_approval' ? <SparkleIcon /> : <ErrorCircle />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#1A3A5C', color: '#8FA7BF' }}>{LOB_META[job.lob]?.label ?? job.lob}</span>
          <span className="text-[10px]" style={{ color: '#5A7A9A' }}>{new Date(job.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="text-[10px] font-semibold" style={{ color: tone[1] }}>{label[job.status]}</span>
          {job.seconds !== undefined && <span className="text-[10px]" style={{ color: '#5A7A9A' }}>· {job.seconds}s · ${job.costUsd?.toFixed(2)}</span>}
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: '#E6EEF7' }}>{job.prompt}</p>

        {/* Live progress steps */}
        {busy && (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#214260' }}>
                <div className="h-full rounded-full animate-pulse" style={{ background: '#1683FF', width: job.status === 'building' ? '85%' : '45%' }} />
              </div>
              <span className="text-[10px]" style={{ color: '#2DA8FF' }}>{signIn ? 'Waiting for Power BI sign-in' : lastStep ?? 'Starting…'}</span>
            </div>
            {signIn && (
              <p className="mt-2 rounded-lg p-2 text-[11px] leading-relaxed" style={{ background: '#3D3214', color: '#F5B841' }}>{signIn}</p>
            )}
            {job.steps.length > 1 && (
              <ul className="mt-2 space-y-0.5">
                {job.steps.slice(-6, -1).map((s, i) => <li key={i} className="text-[10px]" style={{ color: '#5A7A9A' }}>✓ {s}</li>)}
              </ul>
            )}
          </div>
        )}

        {/* Plan review card */}
        {job.plan && job.status !== 'ready' && (
          <div className="mt-3 rounded-lg p-3 space-y-3" style={{ background: '#091C30', border: '1px solid #294863' }}>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#F4F8FC' }}>{job.plan.title}</div>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: '#8FA7BF' }}>{job.plan.summary}</p>
            </div>
            {job.plan.pages.map(p => (
              <div key={p.name}>
                <div className="text-[11px] font-semibold" style={{ color: '#E6EEF7' }}>{p.name}: <span style={{ color: '#8FA7BF', fontWeight: 400 }}>{p.title}</span></div>
                <ul className="mt-1 space-y-0.5 list-disc pl-4">
                  {p.visuals.map((v, i) => <li key={i} className="text-[11px]" style={{ color: '#B8C9DB' }}>{v}</li>)}
                </ul>
              </div>
            ))}
            {job.plan.layout && (
              <pre className="text-[10px] leading-tight overflow-x-auto p-2 rounded" style={{ background: '#06121F', color: '#8FA7BF' }}>{job.plan.layout}</pre>
            )}
            {!!job.plan.not_available?.length && (
              <Notes title="Not available in the data" items={job.plan.not_available} color="#FF9F6E" />
            )}
            {!!job.plan.assumptions?.length && <Notes title="Assumptions" items={job.plan.assumptions} color="#F5B841" />}

            {canAct && (
              revising ? (
                <div className="space-y-2">
                  <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="What should change?"
                    className="w-full rounded-lg p-2 text-[12px] resize-none focus:outline-none" style={{ background: '#06121F', border: '1px solid #294863', color: '#E6EEF7' }} />
                  <div className="flex gap-2">
                    <button disabled={!feedback.trim()} onClick={() => { onRevise(job.id, feedback); setRevising(false); setFeedback('') }}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: '#1683FF' }}>Send changes</button>
                    <button onClick={() => setRevising(false)} className="px-3 py-1.5 rounded-lg text-[12px]" style={{ color: '#8FA7BF' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onApprove(job.id)} className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5" style={{ background: '#18C7A0' }}>
                    <CheckCircle /> {job.status === 'error' ? 'Retry build' : 'Approve & build'}
                  </button>
                  <button onClick={() => setRevising(true)} className="px-4 py-2 rounded-lg text-[12px] font-semibold" style={{ background: '#1A3A5C', color: '#E6EEF7' }}>Request changes</button>
                </div>
              )
            )}
          </div>
        )}

        {/* Ready — download/open */}
        {job.status === 'ready' && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button onClick={openWeb} disabled={publishing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60" style={{ background: '#18C7A0', color: '#FFFFFF' }}>
                {publishing ? <><Spinner /> Publishing…</> : <><ExternalLinkIcon /> Open in Power BI (web)</>}
              </button>
              {job.downloadUrl && (
                <a href={job.downloadUrl} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold" style={{ background: '#1A3A5C', color: '#E6EEF7' }}>
                  Download project (.zip)
                </a>
              )}
            </div>
            <p className="text-[10px]" style={{ color: '#5A7A9A' }}>Downloaded? Extract the zip first (right-click → Extract All), then open the .pbip from the extracted folder.</p>
            {openMsg && (
              <p className="text-[11px]" style={{ color: '#8FA7BF' }}>
                {openMsg}{webUrl && <> <a href={webUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2DA8FF' }}>Open report</a></>}
              </p>
            )}
            {job.result?.notes?.length ? <Notes title={`${job.result.title} · ${job.result.pages} page(s) · validation ${job.result.validation}`} items={job.result.notes} color="#18C7A0" /> : null}
          </div>
        )}

        {(job.status === 'error' || job.status === 'rejected') && job.message && (
          <p className="mt-1.5 text-[11px]" style={{ color: '#FF647C' }}>{job.message}</p>
        )}
      </div>
    </div>
  )
}

function Notes({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{title}</div>
      <ul className="mt-1 space-y-0.5 list-disc pl-4">
        {items.map((a, i) => <li key={i} className="text-[11px]" style={{ color: '#B8C9DB' }}>{a}</li>)}
      </ul>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────

function AnchorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="4" r="2" />
      <path d="M8 6v8M4 10c0 2.2 1.8 4 4 4s4-1.8 4-4" />
      <path d="M2 8h3M11 8h3" />
    </svg>
  )
}

function CarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10V8l1.5-4h9L14 8v2" />
      <rect x="1" y="10" width="14" height="3" rx="1" />
      <circle cx="4.5" cy="13" r="1" />
      <circle cx="11.5" cy="13" r="1" />
    </svg>
  )
}

function PlaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2L7 9M14 2l-3 12-4-4M14 2L2 5l4 4" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path d="M6 5h1M9 5h1M6 8h1M9 8h1M6 11h4" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1v3M7 10v3M1 7h3M10 7h3M3 3l2 2M9 9l2 2M11 3l-2 2M5 9l-2 2" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7" cy="7" r="5" strokeOpacity="0.3" />
      <path d="M12 7a5 5 0 00-5-5" strokeLinecap="round" />
    </svg>
  )
}

function CheckCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8l2 2 3.5-3.5" />
    </svg>
  )
}

function ErrorCircle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 10.5v.5" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6.5v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-5a1 1 0 011-1h3M7 2h3v3M5.5 6.5L10 2" />
    </svg>
  )
}
