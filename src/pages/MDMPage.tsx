import { useEffect, useState } from 'react'
import type { AppNotification } from '../App'
import { makeNotif } from '../App'

// ---- GET /api/mdm/records: rows of the MDM review table ----------------
// (LLM_MDM_LH.mdm.mdm_preview_ui_table, read through the Fabric SQL
// endpoint; see server/components/mdm/routes.py).
type MdmRow = Record<string, unknown>

interface MdmRecords {
  source: string
  columns: string[]
  rows: MdmRow[]
  truncated: boolean
}

// mdm_preview_ui_table columns used by this page.
const COL = {
  id: 'EXCEPTION_ID',
  reason: 'REASON_CODE',
  entityType: 'ENTITY_TYPE',
  status: 'STATUS',
  nameA: 'NAME_A',
  nameB: 'NAME_B',
  keyA: 'KEY_A',
  keyB: 'KEY_B',
  fieldsA: 'RECORD_A_FIELDS',
  fieldsB: 'RECORD_B_FIELDS',
  matchScore: 'MATCH_SCORE',
  llmReason: 'LLM_REASON',
} as const

const PAGE_SIZE = 10

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ---- Status --------------------------------------------------------------
// STATUS values from the table (PENDING, APPROVED, ...) shown as labels; a
// decision made on this page overrides the row's status in the table.
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PENDING_REVIEW: 'Pending',
  APPROVED: 'Approved',
  MERGED: 'Approved',
  REJECTED: 'Rejected',
}

function statusLabel(raw: unknown): string {
  const s = formatCell(raw)
  if (s === '—') return 'Pending'
  const key = s.trim().toUpperCase().replace(/\s+/g, '_')
  return STATUS_LABELS[key] ?? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  Pending: { background: '#493715', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' },
  Approved: { background: '#103E3A', color: '#18C7A0', border: '1px solid rgba(24,199,160,0.3)' },
  Rejected: { background: '#492431', color: '#FF647C', border: '1px solid rgba(255,100,124,0.3)' },
}
const OTHER_STATUS_STYLE: React.CSSProperties = { background: '#103B70', color: '#2DA8FF', border: '1px solid rgba(45,168,255,0.3)' }

// ---- Record fields (JSON) -----------------------------------------------
// RECORD_*_FIELDS hold a JSON object whose keys vary by entity type (and can
// differ between A and B), e.g. {"Name": ..., "City": ...}. Accepts the JSON
// text or an already-parsed object; anything else is treated as empty.
function parseFields(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

interface FieldRow {
  field: string
  a: string
  b: string
  differs: boolean
}

// One row per field found in either record: A's fields in A's order, then
// any only B has. A field missing on one side shows "—" and counts as a
// difference; otherwise values differ if they differ ignoring case/spacing.
function compareFields(rawA: unknown, rawB: unknown): FieldRow[] {
  const a = parseFields(rawA)
  const b = parseFields(rawB)
  const fields = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))]
  const norm = (v: unknown) => formatCell(v).trim().replace(/\s+/g, ' ').toLowerCase()
  return fields.map((field) => ({
    field,
    a: formatCell(a[field]),
    b: formatCell(b[field]),
    differs: !(field in a) || !(field in b) || norm(a[field]) !== norm(b[field]),
  }))
}

// ---- Match score -----------------------------------------------------------
// MATCH_SCORE is 0–100 (e.g. 64.5); a 0–1 value is also accepted. Shown like
// the Schema Drift confidence score: a bar plus the value, green from 90%,
// amber from 75%, red below.
function scoreView(raw: unknown): { pct: number; text: string; color: string } | null {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''))
  if (!Number.isFinite(n)) return null
  const pct = Math.max(0, Math.min(100, n <= 1 ? n * 100 : n))
  const text = n <= 1 ? n.toFixed(2) : n.toFixed(1)
  const color = pct >= 90 ? '#18C7A0' : pct >= 75 ? '#F5A623' : '#FF647C'
  return { pct, text, color }
}

export default function MDMPage({ onNotify }: { onNotify: (n: AppNotification) => void }) {
  const [records, setRecords] = useState<MdmRecords | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [viewing, setViewing] = useState<MdmRow | null>(null)
  const [note, setNote] = useState('')
  // Decisions made since the page loaded, by EXCEPTION_ID. Earlier ones
  // already arrive in each row's STATUS from the backend.
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/mdm/records')
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
        if (!cancelled) setRecords(body as MdmRecords)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load MDM records:', err)
          setError(`Could not load MDM records from Fabric: ${(err as Error).message}`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = records?.rows ?? []
  const idOf = (row: MdmRow) => formatCell(row[COL.id])
  const effectiveStatus = (row: MdmRow) => decisions[idOf(row)] ?? statusLabel(row[COL.status])

  // Filter options: the usual three, plus any other status in the data.
  const statusOptions = ['All', ...new Set(['Pending', 'Approved', 'Rejected', ...rows.map(effectiveStatus)])]
  const filtered = statusFilter === 'All' ? rows : rows.filter((r) => effectiveStatus(r) === statusFilter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const counts = {
    pending: rows.filter((r) => effectiveStatus(r) === 'Pending').length,
    approved: rows.filter((r) => effectiveStatus(r) === 'Approved').length,
    rejected: rows.filter((r) => effectiveStatus(r) === 'Rejected').length,
  }

  function openRecord(row: MdmRow) {
    setViewing(row)
    setNote('')
  }

  function closeRecord() {
    setViewing(null)
    setNote('')
  }

  // Saved by the backend (POST /api/mdm/decision), which applies it to the
  // rows on every load, so the status sticks across refreshes. The row's
  // status changes only once the save succeeds.
  async function decide(status: 'Approved' | 'Rejected') {
    if (!viewing || saving) return
    const row = viewing
    const id = idOf(row)
    setSaving(true)
    try {
      const res = await fetch('/api/mdm/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exceptionId: id, status: status === 'Approved' ? 'APPROVED' : 'REJECTED', note }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      setDecisions((d) => ({ ...d, [id]: status }))
      const names = `${formatCell(row[COL.nameA])} / ${formatCell(row[COL.nameB])}`
      onNotify(makeNotif(
        'mdm',
        `MDM: ${status === 'Approved' ? 'Merge Approved' : 'Merge Rejected'}`,
        `Exception ${id} (${names}) — ${status === 'Approved' ? 'records merged.' : 'merge rejected, records kept separate.'}`,
      ))
      closeRecord()
    } catch (err) {
      console.error('Failed to save MDM decision:', err)
      onNotify(makeNotif('mdm', 'MDM: decision not saved', `Could not save the decision for ${id}: ${(err as Error).message}`))
    } finally {
      setSaving(false)
    }
  }

  // Esc closes the pop-up.
  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRecord() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-8 py-5 flex-shrink-0" style={{ background: '#081A2E', borderBottom: '1px solid #18334F' }}>
        <h1 className="text-xl font-bold" style={{ color: '#F4F8FC' }}>Master Data Management</h1>
        <p className="text-[13px] mt-1" style={{ color: '#8FA7BF' }}>
          Review duplicate and conflicting records, and merge or reject them.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="mb-5 rounded-lg px-4 py-3 text-[12px]" style={{ background: '#492431', border: '1px solid rgba(255,100,124,0.3)', color: '#FF647C' }}>
            {error}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard value={counts.pending} label="Pending" color="#F5A623" />
          <StatCard value={counts.approved} label="Approved" color="#18C7A0" />
          <StatCard value={counts.rejected} label="Rejected" color="#FF647C" />
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-x-auto" style={{ background: '#102B48', borderColor: '#214260' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #18334F' }}>
                {['Exception ID', 'Reason', 'Entity Type'].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold px-5 py-3 whitespace-nowrap" style={{ color: '#8FA7BF' }}>{h}</th>
                ))}
                <th className="text-left text-[11px] font-semibold px-5 py-3" style={{ color: '#8FA7BF' }}>
                  <div className="flex items-center gap-1.5">
                    <span>Status</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                      className="text-[10px] font-semibold rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer"
                      style={{ background: '#0D3970', border: '1px solid #214260', color: '#2DA8FF' }}
                    >
                      {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </th>
                <th className="text-left text-[11px] font-semibold px-5 py-3" style={{ color: '#8FA7BF' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[12px]" style={{ color: '#8FA7BF' }}>
                    Loading MDM records from Fabric…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[12px]" style={{ color: '#8FA7BF' }}>
                    {error ? 'No records loaded.' : statusFilter === 'All' ? 'No MDM records found.' : `No records with status "${statusFilter}".`}
                  </td>
                </tr>
              ) : (
                pageRows.map((row, i) => {
                  const status = effectiveStatus(row)
                  return (
                    <tr key={`${idOf(row)}-${(current - 1) * PAGE_SIZE + i}`} style={{ borderBottom: '1px solid #18334F' }}>
                      <td className="px-5 py-3 font-mono text-[12px] font-medium" style={{ color: '#2DA8FF' }}>{idOf(row)}</td>
                      <td className="px-5 py-3 text-[13px]" style={{ color: '#E6EEF7' }}>{formatCell(row[COL.reason])}</td>
                      <td className="px-5 py-3 text-[13px]" style={{ color: '#E6EEF7' }}>{formatCell(row[COL.entityType])}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={STATUS_STYLE[status] ?? OTHER_STATUS_STYLE}>{status}</span>
                      </td>
                      <td className="px-5 py-3">
                        {status === 'Pending' ? (
                          <button
                            onClick={() => openRecord(row)}
                            className="text-[12px] font-medium px-3 py-1 rounded-md transition-colors"
                            style={{ color: '#2DA8FF', border: '1px solid #214260', background: '#103B70' }}
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-[11px]" style={{ color: '#5a7a9a' }}>—</span>
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
              {filtered.length === 0
                ? 'No records'
                : `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, filtered.length)} of ${filtered.length} record${filtered.length === 1 ? '' : 's'}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(current - 1, 1))}
                disabled={current === 1}
                className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid #214260', color: '#8FA7BF' }}
              >‹</button>
              <span className="px-2 text-[12px]" style={{ color: '#8FA7BF' }}>{current} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(current + 1, totalPages))}
                disabled={current === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded text-[12px] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid #214260', color: '#8FA7BF' }}
              >›</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Record pop-up: fixed header and actions, scrollable body ── */}
      {viewing && (
        <RecordPopup
          row={viewing}
          status={effectiveStatus(viewing)}
          note={note}
          saving={saving}
          onNote={setNote}
          onClose={closeRecord}
          onDecide={decide}
        />
      )}
    </div>
  )
}

function RecordPopup({ row, status, note, saving, onNote, onClose, onDecide }: {
  row: MdmRow
  status: string
  note: string
  saving: boolean
  onNote: (v: string) => void
  onClose: () => void
  onDecide: (status: 'Approved' | 'Rejected') => void
}) {
  const id = formatCell(row[COL.id])
  const fields = compareFields(row[COL.fieldsA], row[COL.fieldsB])
  const differing = fields.filter((f) => f.differs).length
  const score = scoreView(row[COL.matchScore])
  const llmReason = formatCell(row[COL.llmReason])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Exception ${id}`}
        className="rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col"
        style={{ background: '#0A1B31', border: '1px solid #214260' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0" style={{ borderBottom: '1px solid #18334F' }}>
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-[15px] font-bold" style={{ color: '#F4F8FC' }}>Exception</h2>
            <span className="font-mono text-[13px] truncate" style={{ color: '#2DA8FF' }} title={id}>{id}</span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={STATUS_STYLE[status] ?? OTHER_STATUS_STYLE}>{status}</span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: '#8FA7BF' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Match score (shown like the Schema Drift confidence score) */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#8FA7BF' }}>Match Score</div>
            {score == null ? (
              <div className="text-[12px]" style={{ color: '#8FA7BF' }}>Not yet scored</div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-full h-1.5" style={{ background: '#214260' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${score.pct}%`, background: score.color }} />
                </div>
                <span className="text-[15px] font-bold" style={{ color: score.color }}>{score.text}</span>
              </div>
            )}
          </div>

          {/* LLM reason (empty for now: placeholder until the LLM step fills it) */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#8FA7BF' }}>LLM Reason</div>
            <div className="rounded-lg px-4 py-3 text-[12px] leading-relaxed" style={{ background: '#091C30', border: '1px solid #214260', color: llmReason === '—' ? '#5a7a9a' : '#E6EEF7' }}>
              {llmReason === '—' ? <span className="italic">No LLM reasoning available for this record yet.</span> : llmReason}
            </div>
          </div>

          {/* Record A / Record B: the two names, then every field from the
              RECORD_A_FIELDS / RECORD_B_FIELDS JSON (keys vary per row) */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[12px] font-semibold" style={{ color: '#F4F8FC' }}>Record details</div>
              {fields.length > 0 && (
                <div className="text-[11px]" style={{ color: '#8FA7BF' }}>
                  {differing} of {fields.length} field{fields.length === 1 ? '' : 's'} differ
                </div>
              )}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #214260' }}>
              <table className="w-full table-fixed">
                <thead>
                  <tr style={{ borderBottom: '1px solid #214260', background: '#0D2440' }}>
                    <th className="text-left px-4 py-3 w-[26%] text-[11px] font-semibold uppercase tracking-wide align-top" style={{ color: '#8FA7BF' }}>Field</th>
                    {(['A', 'B'] as const).map((side) => (
                      <th key={side} className="text-left px-4 py-3 align-top">
                        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#8FA7BF' }}>
                          Record {side}{side === 'A' && <span style={{ color: '#18C7A0' }}> (Golden)</span>}
                        </div>
                        <div className="text-[13px] font-bold break-words" style={{ color: '#F4F8FC' }}>
                          {formatCell(row[side === 'A' ? COL.nameA : COL.nameB])}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-[12px]" style={{ color: '#8FA7BF' }}>
                        No field details for this record.
                      </td>
                    </tr>
                  ) : (
                    fields.map((f) => {
                      const color = f.differs ? '#F5A623' : '#E6EEF7'
                      const weight = f.differs ? 500 : 400
                      return (
                        <tr key={f.field} style={{ borderBottom: '1px solid #18334F', background: f.differs ? 'rgba(245,166,35,0.06)' : undefined }}>
                          <td className="px-4 py-2.5 text-[12px] break-words" style={{ color: f.differs ? '#F5A623' : '#8FA7BF', fontWeight: weight }}>{f.field}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] break-words" style={{ color, fontWeight: weight }}>{f.a}</td>
                          <td className="px-4 py-2.5 font-mono text-[12px] break-words" style={{ color, fontWeight: weight }}>{f.b}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0 rounded-b-2xl" style={{ borderTop: '1px solid #18334F', background: '#061426' }}>
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="flex-1 max-w-xs rounded-lg px-4 py-2 text-[13px] focus:outline-none"
            style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
            >
              Skip
            </button>
            <button
              onClick={() => onDecide('Rejected')}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ border: '1px solid rgba(255,100,124,0.4)', color: '#FF647C' }}
            >
              Reject
            </button>
            <button
              onClick={() => onDecide('Approved')}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#1683FF' }}
            >
              Approve merge
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-xl border px-4 py-4" style={{ background: '#102B48', borderColor: '#214260' }}>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] font-medium" style={{ color: '#8FA7BF' }}>{label}</div>
    </div>
  )
}
