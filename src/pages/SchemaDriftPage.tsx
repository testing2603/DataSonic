import { useEffect, useRef, useState } from 'react'
import type { AppNotification } from '../App'
import { makeNotif } from '../App'

// ---- Shape of a row as it comes back from GET /api/approval-logs -------
// Mirrors the columns of drift_ui_review in the Bronze_Data Lakehouse
// (see server/components/schema_drift/routes.py).
interface ApprovalLogRow {
  DRIFT_ID: string
  OBJECT_ID: string
  PIPELINE_ID: string
  SOURCE_ID: string
  SOURCE_LOCATION: string
  CDR_CONCEPT: string | null
  DRIFT_TYPE: string
  OLD_FIELD_NAME: string | null
  NEW_FIELD_NAME: string | null
  OLD_DATA_TYPE: string | null
  NEW_DATA_TYPE: string | null
  PROCESS_STATUS: string | null
  CREATED_TIME: string
  LLM_SCORE: number | null
  REASONING: string | null
  DECISION: string | null
  STATUS: string
  TAG_TYPE: string | null
  TAG_FIELD: string | null
  TAG_FIELD_ENABLED: boolean | null
  TAG_FIELD_OPTIONS: string | null
  STEWARD_ID: string | null
  STEWARD_COMMENT: string | null
  REVIEW_TIMESTAMP: string | null
}

type Status = 'Pending Review' | 'Approved' | 'Rejected' | 'Auto Approved'

// DECISION values in the Lakehouse schema_registry table.
type Decision = 'ACCEPT' | 'REJECT'

const DECISION_STATUS: Record<Decision, Status> = {
  ACCEPT: 'Approved',
  REJECT: 'Rejected',
}

type Action = 'REJECT_DRIFT' | 'ACCEPT_DRIFT'

const ACTION_DECISION: Record<Action, Decision> = {
  REJECT_DRIFT: 'REJECT',
  ACCEPT_DRIFT: 'ACCEPT',
}

const ACTION_MESSAGES: Record<Action, (id: string, summary: string) => string> = {
  REJECT_DRIFT: (id, s) => `Schema change ${id} rejected — "${s}"`,
  ACCEPT_DRIFT: (id, s) => `Schema change ${id} accepted — "${s}"`,
}

// Shape of a row from GET /api/drift-decisions (latest decision per drift).
interface FeedbackRow {
  DRIFT_ID: string
  DECISION: Decision
  SYNC_STATUS: string | null
  SYNCED_TIME: string | null
}

// drift_ui_review now records each decision's STATUS itself, so Fabric is the
// source of truth. A local decision only overrides a row's Fabric status
// while Fabric can't show it yet: not written yet (queued / writing / failed
// / local only), or written within the last few minutes (the SQL endpoint
// lags the notebook's write). Older local decisions are ignored, so a drift
// that comes back as PENDING_REVIEW (e.g. re-inserted with the same id)
// shows as pending again.
const SQL_ENDPOINT_LAG_MS = 5 * 60 * 1000

function overridesFabric(f: FeedbackRow, now = Date.now()): boolean {
  if (f.SYNC_STATUS !== 'SYNCED') return true
  const synced = f.SYNCED_TIME ? Date.parse(f.SYNCED_TIME) : NaN
  return !Number.isNaN(synced) && now - synced < SQL_ENDPOINT_LAG_MS
}

// GET /api/decision-counts: counts from the Lakehouse schema_registry.
interface DecisionCounts {
  autoApproved: number
  manuallyApproved: number
  rejected: number
  total: number
}

// GET /api/drift-sync: where decisions are in the write-back to the
// lakehouse (a Fabric notebook run started by the backend).
interface SyncSummary {
  enabled: boolean
  delaySeconds: number
  queued: number
  syncing: number
  synced: number
  failed: number
  localOnly: number
  lastError: string | null
}

const statusStyle: Record<Status, string> = {
  'Pending Review': 'bg-[#493715] text-[#F5A623] border border-[#F5A623]/30',
  'Approved': 'bg-[#103E3A] text-[#18C7A0] border border-[#18C7A0]/30',
  'Rejected': 'bg-[#492431] text-[#FF647C] border border-[#FF647C]/30',
  'Auto Approved': 'bg-[#30204E] text-[#A875FF] border border-[#A875FF]/30',
}

const STATUS_LABELS: Record<string, Status> = {
  PENDING: 'Pending Review',
  PENDING_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  ACCEPTED: 'Approved',
  REJECTED: 'Rejected',
  AUTO_APPROVED: 'Auto Approved',
}

const DRIFT_TYPE_LABELS: Record<string, string> = {
  NEW_COLUMN: 'Column Added',
  COLUMN_RENAMED: 'Column Renamed',
  TYPE_CHANGED: 'Data Type Changed',
  DATA_TYPE_CHANGED: 'Data Type Changed',
  COLUMN_DELETED: 'Column Deleted',
  DELETED_COLUMN: 'Column Deleted',
}

function humanizeDriftType(raw: string): string {
  return (
    DRIFT_TYPE_LABELS[raw] ??
    raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function humanizeStatus(raw: string): Status {
  return STATUS_LABELS[raw?.toUpperCase()] ?? 'Pending Review'
}

function buildSummary(row: ApprovalLogRow): string {
  switch (row.DRIFT_TYPE) {
    case 'NEW_COLUMN':
      return `Added column: ${row.NEW_FIELD_NAME ?? row.OLD_FIELD_NAME ?? 'unknown'}`
    case 'COLUMN_RENAMED':
      return `Renamed column: ${row.OLD_FIELD_NAME ?? '?'} → ${row.NEW_FIELD_NAME ?? '?'}`
    case 'TYPE_CHANGED':
    case 'DATA_TYPE_CHANGED':
      return `Type change: ${row.OLD_FIELD_NAME ?? '?'} (${row.OLD_DATA_TYPE ?? '?'} → ${row.NEW_DATA_TYPE ?? '?'})`
    case 'COLUMN_DELETED':
    case 'DELETED_COLUMN':
      return `Removed column: ${row.OLD_FIELD_NAME ?? 'unknown'}`
    default:
      return `${humanizeDriftType(row.DRIFT_TYPE)}: ${row.NEW_FIELD_NAME ?? row.OLD_FIELD_NAME ?? ''}`
  }
}

function formatDetected(raw: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---- Display-ready shape the rest of this component works with --------
interface DriftLog {
  id: string
  summary: string
  status: Status
  driftType: string
  rawDriftType: string
  column: string
  // NEW_FIELD_NAME exactly as in drift_ui_review (saved as FIELD_NAME).
  newFieldName: string | null
  // Column name as it arrived in the incoming data.
  incomingColumn: string | null
  // Column name in the defined schema, when the drift names one (renames).
  definedColumn: string | null
  currentType: string | null
  newType: string | null
  // drift_ui_review has no schema version yet; shown as "—" until it does.
  schemaVersion: string | null
  pipelineId: string
  cdrConcept: string | null
  confidence: number | null // 0–1, or null when the row hasn't been scored yet
  detected: string
}

function toDriftLog(row: ApprovalLogRow): DriftLog {
  return {
    id: row.DRIFT_ID,
    summary: buildSummary(row),
    status: row.DECISION === 'AUTO_APPROVED' ? 'Auto Approved' : humanizeStatus(row.STATUS),
    driftType: humanizeDriftType(row.DRIFT_TYPE),
    rawDriftType: row.DRIFT_TYPE,
    column: row.NEW_FIELD_NAME ?? row.OLD_FIELD_NAME ?? '—',
    newFieldName: row.NEW_FIELD_NAME,
    incomingColumn: row.NEW_FIELD_NAME ?? row.OLD_FIELD_NAME,
    definedColumn: row.NEW_FIELD_NAME && row.OLD_FIELD_NAME ? row.OLD_FIELD_NAME : null,
    currentType: row.DRIFT_TYPE === 'NEW_COLUMN' ? null : row.OLD_DATA_TYPE,
    newType: row.NEW_DATA_TYPE,
    schemaVersion: null,
    pipelineId: row.PIPELINE_ID,
    cdrConcept: row.CDR_CONCEPT,
    confidence: row.LLM_SCORE != null ? Number(row.LLM_SCORE) : null,
    detected: formatDetected(row.CREATED_TIME),
  }
}

// Drift ids are UUIDs; the table shows the first 8 characters.
const shortId = (id: string) => id.slice(0, 8)

const PAGE_SIZE = 10

function paginationRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) pages.push('...')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('...')
  pages.push(total)
  return pages
}

const TAG_TYPE_OPTIONS = ['Mandatory', 'Optional', 'Conditional', 'Derived']
// Tag types whose tag field is derived from other columns. For the others
// (Mandatory, Optional) the Tag Field doesn't apply and is disabled.
const TAG_TYPES_WITH_FIELD = new Set(['Conditional', 'Derived'])
// Value of the "None" choice: no tag field selected.
const NO_TAG_FIELD = ''
// Columns offered for Conditional/Derived tags. Placeholder list: these will
// come from the incoming dataset's structure once that is available.
const TAG_FIELD_OPTIONS = [
  '(Re)Insurer Unique Identifier',
  'Policy Reference',
  'Claim Number',
  'Inception Date',
  'Premium Amount',
  'Broker Name',
]

export default function SchemaDriftPage({ onNotify }: { onNotify: (n: AppNotification) => void }) {
  const [driftLogs, setDriftLogs] = useState<DriftLog[]>([])
  const [decisionCounts, setDecisionCounts] = useState<DecisionCounts>({ autoApproved: 0, manuallyApproved: 0, rejected: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<DriftLog | null>(null)
  const [page, setPage] = useState(1)
  const [justification, setJustification] = useState('')
  const [tagType, setTagType] = useState('Mandatory')
  const [tagField, setTagField] = useState(NO_TAG_FIELD)
  const tagFieldEnabled = TAG_TYPES_WITH_FIELD.has(tagType)
  const [decisions, setDecisions] = useState<Record<string, Status>>({})
  const [sync, setSync] = useState<SyncSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All')
  const tableRef = useRef<HTMLDivElement>(null)

  function goToPage(p: number | ((prev: number) => number)) {
    setPage(p)
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function changeTagType(next: string) {
    setTagType(next)
    // Mandatory/Optional have no tag field; clear any earlier choice.
    if (!TAG_TYPES_WITH_FIELD.has(next)) setTagField(NO_TAG_FIELD)
  }

  async function refreshSync() {
    try {
      const res = await fetch('/api/drift-sync')
      if (res.ok) setSync(await res.json())
    } catch {
      // backend unreachable; the page's own error banner covers that
    }
  }


  useEffect(() => {
    refreshSync()
  }, [])

  // Approved / Rejected / Auto Approved are loaded once with the page (from
  // /api/decision-counts); after that each saved decision bumps its card
  // directly, so the cards never wait on Fabric's SQL endpoint to catch up.
  function countDecision(decision: Decision) {
    setDecisionCounts((c) =>
      decision === 'REJECT'
        ? { ...c, rejected: c.rejected + 1, total: c.total + 1 }
        : { ...c, manuallyApproved: c.manuallyApproved + 1, total: c.total + 1 },
    )
  }

  // Poll only while decisions are waiting for or inside a notebook run.
  const syncActive = !!sync && sync.queued + sync.syncing > 0
  useEffect(() => {
    if (!syncActive) return
    const timer = setInterval(refreshSync, 5000)
    return () => clearInterval(timer)
  }, [syncActive])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [logsRes, countRes, decisionsRes] = await Promise.all([
          fetch('/api/approval-logs'),
          fetch('/api/decision-counts'),
          fetch('/api/drift-decisions'),
        ])

        if (!logsRes.ok) throw new Error(`approval-logs: ${logsRes.status}`)
        if (!countRes.ok) throw new Error(`decision-counts: ${countRes.status}`)

        const logsJson: ApprovalLogRow[] = await logsRes.json()
        const countsJson: DecisionCounts = await countRes.json()
        // Saved decisions are secondary: if they can't be loaded, still show
        // the Fabric drift logs (all rows then appear as pending).
        let decisionsJson: FeedbackRow[] = []
        if (decisionsRes.ok) {
          decisionsJson = await decisionsRes.json()
        } else {
          console.warn(`drift-decisions: ${decisionsRes.status}; showing drift logs without saved decisions`)
        }

        if (cancelled) return
        setDriftLogs(logsJson.map(toDriftLog))
        setDecisionCounts(countsJson)
        setDecisions(
          Object.fromEntries(
            decisionsJson.filter((f) => overridesFabric(f)).map((f) => [f.DRIFT_ID, DECISION_STATUS[f.DECISION]]),
          ),
        )
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load schema drift data:', err)
        setError('Could not reach the Fabric-backed API. Is the backend running (pnpm dev:api)?')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => { setPage(1) }, [statusFilter])

  const effectiveStatus = (r: DriftLog): Status => decisions[r.id] ?? r.status
  const filteredLogs = statusFilter === 'All'
    ? [...driftLogs]
    : driftLogs.filter(r => effectiveStatus(r) === statusFilter)
  const pendingLogs = driftLogs.filter((r) => effectiveStatus(r) === 'Pending Review')
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const displayPage = Math.min(page, totalPages)
  const pageRows = filteredLogs.slice((displayPage - 1) * PAGE_SIZE, displayPage * PAGE_SIZE)

  // Pending comes from drift_ui_review (rows not yet decided); approved,
  // rejected and auto approved from /api/decision-counts plus this session.
  const counts = {
    pending: pendingLogs.length,
    approved: decisionCounts.manuallyApproved,
    rejected: decisionCounts.rejected,
    auto: decisionCounts.autoApproved,
  }

  // Called only when the steward clicks one of the three action buttons.
  // Sends their choice to the backend, which records it locally and writes
  // it to the lakehouse through the Fabric notebook. The row's status
  // changes only after the save succeeds.
  //   REJECT_DRIFT - reject the schema drift.
  //   ACCEPT_DRIFT - accept the schema drift.
  async function decide(action: Action) {
    if (!selected || saving) return
    const row = selected
    const decision = ACTION_DECISION[action]
    setSaving(true)
    try {
      const res = await fetch('/api/drift-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driftId: row.id,
          decision,
          action,
          cdrConcept: row.cdrConcept,
          fieldName: row.newFieldName,
          driftType: row.rawDriftType,
          oldFieldName: row.definedColumn,
          newFieldName: row.incomingColumn,
          oldDataType: row.currentType,
          newDataType: row.newType,
          justification,
          tagType,
          tagField: tagFieldEnabled && tagField !== NO_TAG_FIELD ? tagField : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const status = DECISION_STATUS[decision]
      setDecisions((d) => ({ ...d, [row.id]: status }))
      setDriftLogs((prev) => prev.map((r) => r.id === row.id ? { ...r, status } : r))
      onNotify(makeNotif('schema', `Schema Drift: ${status}`, ACTION_MESSAGES[action](row.id, row.summary)))
      setJustification('')
      setSelected(null)
      countDecision(decision)
      refreshSync()
    } catch (err) {
      console.error('Failed to save drift decision:', err)
      onNotify(
        makeNotif('schema', 'Schema Drift: decision not saved', `Could not save the decision for ${row.id}: ${(err as Error).message}`),
      )
    } finally {
      setSaving(false)
    }
  }

  function openDetail(row: DriftLog) {
    setSelected(row)
    setJustification('')
    // Each drift starts untagged: Mandatory, with no tag field ("None").
    setTagType(TAG_TYPE_OPTIONS[0])
    setTagField(NO_TAG_FIELD)
  }


  return (
    <div className="p-6 min-h-full">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F4F8FC' }}>Schema Drift – Stewardship Review</h1>
          <p className="text-[12px] mt-0.5" style={{ color: '#8FA7BF' }}>Review and take action on individual schema changes detected in incoming data.</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg px-4 py-3 text-[12px]" style={{ background: '#492431', border: '1px solid rgba(255,100,124,0.3)', color: '#FF647C' }}>
          {error}
        </div>
      )}

      {sync && <SyncBanner sync={sync} />}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard icon={<GearIcon />} value={counts.auto} label="Auto Approved" color="text-purple-600" ring="ring-purple-200" bg="bg-purple-50" />
        <StatCard icon={<CheckIcon />} value={counts.approved} label="Approved" color="text-emerald-600" ring="ring-emerald-200" bg="bg-emerald-50" />
        <StatCard icon={<ClockIcon />} value={counts.pending} label="Pending Review" color="text-amber-600" ring="ring-amber-200" bg="bg-amber-50" />
        <StatCard icon={<XIcon />} value={counts.rejected} label="Rejected" color="text-red-600" ring="ring-red-200" bg="bg-red-50" />
      </div>

      {/* Table */}
      <div ref={tableRef} className="rounded-xl border" style={{ background: '#102B48', borderColor: '#214260' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid #18334F' }}>
              {['Schema Drift ID', 'Drift Summary'].map(h => (
                <th key={h} className="text-left text-[11px] font-semibold px-5 py-3" style={{ color: '#8FA7BF' }}>{h}</th>
              ))}
              <th className="text-left text-[11px] font-semibold px-5 py-3" style={{ color: '#8FA7BF' }}>
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value as Status | 'All'); goToPage(1) }}
                    className="text-[10px] font-semibold rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer"
                    style={{ background: '#0D3970', border: '1px solid #214260', color: '#2DA8FF' }}
                  >
                    <option value="All">All</option>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Auto Approved">Auto Approved</option>
                  </select>
                </div>
              </th>
              <th className="text-left text-[11px] font-semibold px-5 py-3" style={{ color: '#8FA7BF' }}>Actions</th>
            </tr>
          </thead>
          <tbody key={statusFilter}>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[12px]" style={{ color: '#8FA7BF' }}>
                  Loading drift logs from Fabric…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[12px]" style={{ color: '#8FA7BF' }}>
                  {statusFilter === 'All' ? 'No drift logs found.' : `No drift logs with status "${statusFilter}".`}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => {
                const status = effectiveStatus(row)
                const isSelected = selected?.id === row.id
                return (
                  // A DRIFT_ID can appear on several rows (re-inserted drifts),
                  // so the key also uses the row's position.
                  <tr key={`${row.id}-${(displayPage - 1) * PAGE_SIZE + i}`} className="transition-colors" style={{ background: isSelected ? '#0D3970' : undefined, borderBottom: '1px solid #18334F' }}>
                    <td className="px-5 py-3 font-mono text-[11px] font-medium" style={{ color: '#2DA8FF', wordBreak: 'break-all' }}>{row.id}</td>
                    <td className="px-5 py-3 text-[13px] max-w-xs" style={{ color: '#E6EEF7' }}>{row.summary}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${statusStyle[status]}`}>{status}</span>
                    </td>
                    <td className="px-5 py-3">
                      {status === 'Pending Review' && (
                        <button
                          onClick={() => openDetail(row)}
                          className="text-[12px] font-medium px-3 py-1 rounded-md transition-colors"
                          style={{ color: '#2DA8FF', border: '1px solid #214260', background: '#103B70' }}
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #18334F' }}>
          <span className="text-[12px]" style={{ color: '#8FA7BF' }}>
            {filteredLogs.length === 0
              ? 'No drift logs'
              : `Showing ${(displayPage - 1) * PAGE_SIZE + 1}–${Math.min(displayPage * PAGE_SIZE, filteredLogs.length)} of ${filteredLogs.length} drift logs`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={displayPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
            >«</button>
            <button
              onClick={() => goToPage(p => Math.max(p - 1, 1))}
              disabled={displayPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
            >‹</button>
            {paginationRange(displayPage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-[12px]" style={{ color: '#8FA7BF' }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p as number)}
                  className="w-7 h-7 flex items-center justify-center rounded text-[12px] font-medium transition-colors"
                  style={displayPage === p ? { background: '#1683FF', color: '#FFFFFF' } : { border: '1px solid #214260', color: '#8FA7BF' }}
                >{p}</button>
              )
            )}
            <button
              onClick={() => goToPage(p => Math.min(p + 1, totalPages))}
              disabled={displayPage === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
            >›</button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={displayPage === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
            >»</button>
          </div>
        </div>
      </div>


      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-end" onClick={() => setSelected(null)}>
          <div
            className="w-[520px] h-full overflow-y-auto shadow-2xl flex flex-col"
            style={{ background: '#0A1B31', borderLeft: '1px solid #214260' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #18334F' }}>
              <h2 className="text-[15px] font-bold" style={{ color: '#F4F8FC' }}>Schema Change Details</h2>
              <button onClick={() => setSelected(null)} style={{ color: '#8FA7BF' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 flex-1 overflow-y-auto space-y-5">
              {/* ID + status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[14px] font-bold" style={{ color: '#F4F8FC' }} title={selected.id}>{shortId(selected.id)}</span>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${statusStyle[effectiveStatus(selected)]}`}>
                    {effectiveStatus(selected)}
                  </span>
                </div>
                <span className="text-[11px]" style={{ color: '#8FA7BF' }}>Detected On: {selected.detected}</span>
              </div>

              {/* Drift type grid */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA7BF' }}>Drift Type</div>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: '#103B70', color: '#2DA8FF' }}>{selected.driftType}</span>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA7BF' }}>Column Name</div>
                  <div className="text-[12px] font-medium leading-snug" style={{ color: '#F4F8FC' }}>{selected.column}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA7BF' }}>Current Data Type</div>
                  <div className="text-[12px] font-mono" style={{ color: '#E6EEF7' }}>{selected.currentType ?? 'NULL'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#8FA7BF' }}>New Data Type</div>
                  <div className="text-[12px] font-mono" style={{ color: '#E6EEF7' }}>{selected.newType ?? 'NULL'}</div>
                </div>
              </div>

              {/* Schema version + CDR */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#8FA7BF' }}>Detected in Schema Version</div>
                  <div className="text-[12px] font-mono font-medium" style={{ color: '#F4F8FC' }}>{selected.schemaVersion ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#8FA7BF' }}>CDR Concept (if mapped)</div>
                  <div className="text-[12px]" style={{ color: '#E6EEF7' }}>{selected.cdrConcept ?? '—'}</div>
                </div>
              </div>

              {/* Tags */}
              <div className="rounded-lg p-4" style={{ border: '1px solid #214260' }}>
                <div className="text-[12px] font-semibold mb-3" style={{ color: '#F4F8FC' }}>Tags</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold block mb-1.5" style={{ color: '#8FA7BF' }}>
                      Tag Type <span style={{ color: '#FF647C' }}>*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={tagType}
                        onChange={e => changeTagType(e.target.value)}
                        className="w-full appearance-none rounded-lg px-3 py-2 text-[12px] focus:outline-none cursor-pointer pr-8"
                        style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
                      >
                        {TAG_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#8FA7BF' }} />
                    </div>
                  </div>
                  <div className={tagFieldEnabled ? '' : 'opacity-50'}>
                    <label className="text-[11px] font-semibold block mb-1.5" style={{ color: '#8FA7BF' }}>
                      Tag Field {tagFieldEnabled && <span style={{ color: '#FF647C' }}>*</span>}
                    </label>
                    <div className="relative">
                      <select
                        value={tagFieldEnabled ? tagField : NO_TAG_FIELD}
                        onChange={e => setTagField(e.target.value)}
                        disabled={!tagFieldEnabled}
                        title={tagFieldEnabled ? undefined : `Not used for ${tagType} tags`}
                        className="w-full appearance-none rounded-lg px-3 py-2 text-[12px] focus:outline-none cursor-pointer pr-8 disabled:cursor-not-allowed"
                        style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
                      >
                        <option value={NO_TAG_FIELD}>None</option>
                        {TAG_FIELD_OPTIONS.map(o => <option key={o}>{o}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#8FA7BF' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Field Details */}
              <div>
                <div className="text-[12px] font-semibold mb-3" style={{ color: '#F4F8FC' }}>Field Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <SchemaBox label="Current Schema" col={selected.column} type={selected.currentType} shade="slate" />
                  <SchemaBox label="New Schema" col={selected.column} type={selected.newType} shade="blue" />
                </div>
              </div>

              {/* Confidence */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#8FA7BF' }}>Confidence Score</div>
                {selected.confidence == null ? (
                  <div className="text-[12px]" style={{ color: '#8FA7BF' }}>Not yet scored</div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-full h-1.5" style={{ background: '#214260' }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${selected.confidence * 100}%`, background: selected.confidence >= 0.9 ? '#18C7A0' : selected.confidence >= 0.75 ? '#F5A623' : '#FF647C' }}
                      />
                    </div>
                    <span className="text-[15px] font-bold" style={{ color: selected.confidence >= 0.9 ? '#18C7A0' : selected.confidence >= 0.75 ? '#F5A623' : '#FF647C' }}>
                      {selected.confidence.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Justification */}
              <div>
                <div className="text-[12px] font-semibold mb-2" style={{ color: '#F4F8FC' }}>Steward Decision Justification</div>
                <textarea
                  value={justification}
                  onChange={e => setJustification(e.target.value.slice(0, 500))}
                  placeholder="Add your comments for this decision..."
                  maxLength={500}
                  className="w-full rounded-lg p-3 text-[12px] resize-none focus:outline-none h-24"
                  style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
                />
                <div className="text-right text-[10px] mt-1" style={{ color: '#8FA7BF' }}>{justification.length}/500</div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex items-center gap-2 flex-shrink-0" style={{ borderTop: '1px solid #18334F', background: '#061426' }}>
              <button
                onClick={() => decide('REJECT_DRIFT')}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: '1px solid #FF647C', color: '#FF647C' }}
              >
                Reject the drift
              </button>
              <button
                onClick={() => decide('ACCEPT_DRIFT')}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-colors ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#18C7A0' }}
              >
                Accept the drift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// One line on where steward decisions are in the write-back to the
// lakehouse. Hidden when there is nothing to report.
function SyncBanner({ sync }: { sync: SyncSummary }) {
  const plural = (n: number) => `${n} decision${n === 1 ? '' : 's'}`
  const base = 'mb-5 rounded-lg px-4 py-2.5 text-[12px] flex items-center gap-3'
  const tone = {
    neutral: { background: '#102B48', border: '1px solid #214260', color: '#8FA7BF' },
    syncing: { background: '#103B70', border: '1px solid #214260', color: '#2DA8FF' },
    queued: { background: '#493715', border: '1px solid rgba(245,166,35,0.3)', color: '#F5A623' },
    synced: { background: '#103E3A', border: '1px solid rgba(24,199,160,0.3)', color: '#18C7A0' },
    failed: { background: '#492431', border: '1px solid rgba(255,100,124,0.3)', color: '#FF647C' },
  }

  if (!sync.enabled) {
    if (sync.localOnly === 0) return null
    return (
      <div className={base} style={tone.neutral}>
        Decisions are saved on this PC only: Fabric write-back isn't configured (FABRIC_WORKSPACE_ID and
        FABRIC_DECISION_NOTEBOOK_ID in .env).
      </div>
    )
  }

  if (sync.failed > 0 || sync.lastError) {
    return (
      <div className={base} style={tone.failed}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#FF647C' }} />
        <span>
          Fabric notebook did not write back {sync.failed > 0 ? plural(sync.failed) : ''}.
          {sync.lastError && <span className="opacity-80"> — {sync.lastError}</span>}
        </span>
      </div>
    )
  }

  if (sync.syncing > 0) {
    return (
      <div className={base} style={tone.syncing}>
        <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: '#2DA8FF' }} />
        Writing {plural(sync.syncing)} to Fabric…
      </div>
    )
  }
  if (sync.queued > 0) {
    return (
      <div className={base} style={tone.queued}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#F5A623' }} />
        {plural(sync.queued)}{' '}
        {sync.delaySeconds > 0
          ? `will be written to Fabric about ${sync.delaySeconds}s after your last decision`
          : 'will be written to Fabric as soon as the current run finishes'}.
      </div>
    )
  }
  if (sync.synced > 0) {
    return (
      <div className={base} style={tone.synced}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#18C7A0' }} />
        All decisions are written to Fabric.
      </div>
    )
  }
  return null
}

function StatCard({ icon, value, label, color, bg }: { icon: React.ReactNode; value: number; label: string; color: string; ring: string; bg: string }) {
  const iconStyle = bg === 'bg-amber-50' ? { background: '#493715', color: '#F5A623' }
    : bg === 'bg-emerald-50' ? { background: '#103E3A', color: '#18C7A0' }
    : bg === 'bg-red-50' ? { background: '#492431', color: '#FF647C' }
    : { background: '#30204E', color: '#A875FF' }
  const textColor = color === 'text-amber-600' ? '#F5A623'
    : color === 'text-emerald-600' ? '#18C7A0'
    : color === 'text-red-600' ? '#FF647C'
    : '#A875FF'
  return (
    <div className="rounded-xl border px-4 py-4 flex items-center gap-3" style={{ background: '#102B48', borderColor: '#214260' }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={iconStyle}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: textColor }}>{value}</div>
        <div className="text-[11px] font-medium" style={{ color: '#8FA7BF' }}>{label}</div>
      </div>
    </div>
  )
}

function SchemaBox({ label, col, type, shade }: { label: string; col: string; type: string | null; shade: 'slate' | 'blue' }) {
  const headerColor = shade === 'blue' ? '#2DA8FF' : '#8FA7BF'
  const borderColor = shade === 'blue' ? '#103B70' : '#214260'
  return (
    <div className="rounded-lg p-3" style={{ background: '#061426', border: `1px solid ${borderColor}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: headerColor }}>{label}</div>
      <table className="w-full">
        <tbody>
          {[['Column Name', col], ['Data Type', type ?? 'NULL']].map(([k, v]) => (
            <tr key={k}>
              <td className="text-[11px] pr-2 py-0.5" style={{ color: '#8FA7BF' }}>{k}</td>
              <td className="text-[11px] font-medium font-mono py-0.5" style={{ color: '#F4F8FC' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="7.5" />
      <path d="M9 5v4l2.5 2" strokeLinecap="round" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="7.5" />
      <path d="M5.5 9l2.5 2.5 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="7.5" />
      <path d="M6 6l6 6M12 6l-6 6" strokeLinecap="round" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.1 4.1l1.4 1.4M12.5 12.5l1.4 1.4M4.1 13.9l1.4-1.4M12.5 5.5l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDown({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} style={style}>
      <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
