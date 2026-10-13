import { useState, useRef, useEffect, useCallback } from 'react'
import type { Page, AppNotification } from '../App'
import { makeNotif } from '../App'

interface Props {
  onNavigate: (page: Page) => void
  onNotify: (n: AppNotification) => void
}

// ---- Types ------------------------------------------------------------------

interface HistoryRow {
  DOC_ID: string
  FILENAME: string
  FILE_TYPE: string | null
  LOB: string | null
  CLASSIFICATION: string | null
  STATUS: string
  CREATED_AT: string
  ERROR: string | null
  BLOB_URL?: string | null
  IMAGE_IDS?: string[] | null
  EXTRACTED_FIELDS?: Record<string, any> | null
  FINAL_FIELDS?: Record<string, any> | null
}

interface DocDetail {
  doc: HistoryRow
  images: { image_id: string; content_type: string; data: string; filename?: string }[]
}

// ---- Helpers ----------------------------------------------------------------

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

function humanStatus(s: string) {
  const map: Record<string, string> = {
    UPLOADING: 'Processing',
    EXTRACTING: 'Processing',
    VALIDATION: 'Schema Review',
    COMPLETED: 'Completed',
    FAILED: 'Validation Failed',
  }
  return map[s] || s
}

function fieldLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const statusColor: Record<string, string> = {
  Completed: 'bg-[#103E3A] text-[#18C7A0] border border-[#18C7A0]/30',
  'Schema Review': 'bg-[#493715] text-[#F5A623] border border-[#F5A623]/30',
  'Validation Failed': 'bg-[#492431] text-[#FF647C] border border-[#FF647C]/30',
  Processing: 'bg-[#103B70] text-[#2DA8FF] border border-[#2DA8FF]/30',
}

// ---- JSON Preview & Approval Modal ------------------------------------------

const HIDDEN_PREVIEW_FIELDS = new Set(['id', 'doc_id', 'created_at', 'updated_at', 'image_ids'])

function JsonPreviewModal({ result, onApprove, onCancel, saving }: {
  result: { doc_id: string; table: string; subcategory: string; row: Record<string, any>; missing_required: string[]; missing_recommended: string[] }
  onApprove: (allFields: Record<string, string>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const [k, v] of Object.entries(result.row)) {
      if (!HIDDEN_PREVIEW_FIELDS.has(k)) {
        init[k] = v != null ? String(v) : ''
      }
    }
    return init
  })

  function set(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onApprove(values)
  }

  const missingSet = new Set(result.missing_required)
  const recommendedSet = new Set(result.missing_recommended)
  const allFields = Object.keys(values)

  const populatedFields = allFields.filter(f => !missingSet.has(f) && !recommendedSet.has(f) && values[f])
  const emptyOptional = allFields.filter(f => !missingSet.has(f) && !recommendedSet.has(f) && !values[f])

  const policyNumber = values.policy_number || values.claim_number || '—'
  const guidShort = result.doc_id.slice(0, 8).toUpperCase()
  const hasMissing = result.missing_required.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-2xl border w-[680px] max-h-[88vh] flex flex-col" style={{ background: '#0D2040', borderColor: '#214260' }}>
        {/* Header */}
        <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #18334F' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-bold" style={{ color: '#F4F8FC' }}>Review Extracted Data</h3>
            <button onClick={onCancel} className="text-[18px] w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: '#8FA7BF' }}>x</button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: '#103B70', color: '#2DA8FF' }}>{result.table.startsWith('claims') ? 'CLAIM' : 'POLICY'}</span>
              <span className="text-[12px] font-mono" style={{ color: '#F4F8FC' }}>{policyNumber}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: '#493715', color: '#F5A623' }}>ID</span>
              <span className="text-[12px] font-mono" style={{ color: '#F4F8FC' }}>{guidShort}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: '#0C5248', color: '#22EFC0' }}>TABLE</span>
              <span className="text-[12px] font-mono" style={{ color: '#F4F8FC' }}>{result.subcategory}</span>
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: '#8FA7BF' }}>
            {hasMissing
              ? `Review the extracted data below. ${result.missing_required.length} required field(s) need to be filled. All values are editable.`
              : 'Review the extracted data below. All values are editable — modify anything before approving.'}
          </p>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">

            {/* Missing required fields — highlighted at top */}
            {result.missing_required.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#FF647C' }}>Required — Missing</div>
                {result.missing_required.map(field => (
                  <div key={field} className="rounded-lg px-4 py-2.5 mb-1.5" style={{ background: '#1A1425', border: '1px solid #FF647C44' }}>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: '#F4F8FC' }}>
                      {fieldLabel(field)}
                      <span className="ml-1.5 text-[10px]" style={{ color: '#FF647C' }}>Required</span>
                    </label>
                    <input
                      value={values[field] ?? ''}
                      onChange={e => set(field, e.target.value)}
                      placeholder={`Enter ${field.replace(/_/g, ' ')}...`}
                      className="w-full rounded-md px-3 py-1.5 text-[13px] focus:outline-none"
                      style={{ background: '#0D2040', border: '1px solid #FF647C44', color: '#E6EEF7' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Missing recommended fields */}
            {result.missing_recommended.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#F5A623' }}>Recommended — Missing</div>
                {result.missing_recommended.map(field => (
                  <div key={field} className="rounded-lg px-4 py-2.5 mb-1.5" style={{ background: '#091C30', border: '1px solid #F5A62322' }}>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: '#8FA7BF' }}>{fieldLabel(field)}</label>
                    <input
                      value={values[field] ?? ''}
                      onChange={e => set(field, e.target.value)}
                      placeholder={`Enter ${field.replace(/_/g, ' ')}...`}
                      className="w-full rounded-md px-3 py-1.5 text-[13px] focus:outline-none"
                      style={{ background: '#0D2040', border: '1px solid #294863', color: '#E6EEF7' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Populated fields — editable */}
            {populatedFields.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: '#22EFC0' }}>Extracted Fields</div>
                {populatedFields.map(field => (
                  <div key={field} className="flex items-center gap-3 rounded-lg px-4 py-2 mb-1" style={{ background: '#091C30', border: '1px solid #18334F' }}>
                    <label className="text-[11px] font-medium w-[38%] flex-shrink-0 truncate" style={{ color: '#8FA7BF' }}>{fieldLabel(field)}</label>
                    <input
                      value={values[field] ?? ''}
                      onChange={e => set(field, e.target.value)}
                      className="flex-1 rounded-md px-3 py-1.5 text-[13px] focus:outline-none"
                      style={{ background: '#0D2040', border: '1px solid #294863', color: '#E6EEF7' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Empty optional fields — collapsed by default */}
            {emptyOptional.length > 0 && (
              <details className="mb-3">
                <summary className="text-[10px] font-semibold uppercase tracking-wide cursor-pointer select-none mb-2" style={{ color: '#607A94' }}>
                  Optional — Empty ({emptyOptional.length})
                </summary>
                {emptyOptional.map(field => (
                  <div key={field} className="flex items-center gap-3 rounded-lg px-4 py-2 mb-1" style={{ background: '#091C30', border: '1px solid #18334F22' }}>
                    <label className="text-[11px] font-medium w-[38%] flex-shrink-0 truncate" style={{ color: '#607A94' }}>{fieldLabel(field)}</label>
                    <input
                      value={values[field] ?? ''}
                      onChange={e => set(field, e.target.value)}
                      placeholder="—"
                      className="flex-1 rounded-md px-3 py-1.5 text-[13px] focus:outline-none"
                      style={{ background: '#0D2040', border: '1px solid #294863', color: '#E6EEF7' }}
                    />
                  </div>
                ))}
              </details>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #18334F' }}>
            <span className="text-[11px]" style={{ color: '#8FA7BF' }}>
              {allFields.length} fields &middot; {populatedFields.length} populated
              {hasMissing ? ` · ${result.missing_required.length} required missing` : ''}
            </span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onCancel} className="px-4 py-2 text-[12px] font-semibold rounded-lg"
                style={{ color: '#8FA7BF', border: '1px solid #214260' }}>Cancel</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 text-[12px] font-semibold rounded-lg text-white disabled:opacity-50"
                style={{ background: '#22C55E' }}>
                {saving ? 'Inserting...' : 'Approve & Insert'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Upload Progress Toast --------------------------------------------------

type UploadStage = 'uploading' | 'extracting' | 'inserting' | 'complete' | 'failed'

const STAGE_LABELS: Record<UploadStage, string> = {
  uploading: 'Uploading document...',
  extracting: 'Creating structured JSON...',
  inserting: 'Finishing off...',
  complete: 'Done',
  failed: 'Ingestion failed',
}

function UploadProgressToast({ stage, filename, error, onDismiss }: {
  stage: UploadStage
  filename: string
  error?: string
  onDismiss: () => void
}) {
  const stages: UploadStage[] = ['uploading', 'extracting', 'inserting']
  const currentIdx = stage === 'complete' ? stages.length : stages.indexOf(stage)
  const isFailed = stage === 'failed'

  useEffect(() => {
    if (stage === 'complete') {
      onDismiss()
    }
  }, [stage, onDismiss])

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-[slideDown_0.3s_ease-out]">
      <div className="rounded-xl px-5 py-4 shadow-2xl min-w-[380px]" style={{ background: '#0D2040', border: '1px solid #214260' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-semibold truncate max-w-[280px]" style={{ color: '#F4F8FC' }}>{filename}</span>
          <button onClick={onDismiss} className="text-[14px] w-6 h-6 rounded flex items-center justify-center ml-2" style={{ color: '#8FA7BF' }}>x</button>
        </div>
        <div className="space-y-2">
          {stages.map((s, i) => {
            const done = !isFailed && currentIdx > i
            const active = !isFailed && currentIdx === i
            const failed = isFailed && currentIdx === i
            return (
              <div key={s} className="flex items-center gap-2.5">
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22EFC0" strokeWidth="2"><path d="M3 7l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : active ? (
                  <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2DA8FF', borderTopColor: 'transparent' }} />
                ) : failed ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#FF647C" strokeWidth="2"><path d="M4 4l6 6M10 4l-6 6" strokeLinecap="round" /></svg>
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full" style={{ background: '#294863' }} />
                )}
                <span className="text-[12px]" style={{
                  color: done ? '#22EFC0' : active ? '#F4F8FC' : failed ? '#FF647C' : '#556B80',
                }}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
            )
          })}
        </div>
        {isFailed && error && (
          <div className="mt-2 text-[11px] px-3 py-1.5 rounded" style={{ background: '#492431', color: '#FF647C' }}>{error}</div>
        )}
      </div>
    </div>
  )
}

// ---- Success Popup ----------------------------------------------------------

function SuccessPopup({ filename, onDismiss }: { filename: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-[slideDown_0.3s_ease-out]">
      <div className="rounded-xl px-5 py-4 shadow-2xl flex items-center gap-3 min-w-[360px]" style={{ background: '#0C5248', border: '1px solid #22EFC044' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#22EFC020' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#22EFC0" strokeWidth="2.5"><path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: '#22EFC0' }}>Document uploaded successfully</p>
          <p className="text-[11px] truncate" style={{ color: '#8FA7BF' }}>{filename}</p>
        </div>
        <button onClick={onDismiss} className="text-[14px] w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ color: '#8FA7BF' }}>x</button>
      </div>
    </div>
  )
}

// ---- Main Page --------------------------------------------------------------

export default function IngestionPage({ onNavigate, onNotify }: Props) {
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadMode, setUploadMode] = useState<'document' | 'email'>('document')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emailFileRef = useRef<HTMLInputElement>(null)
  const [emailFiles, setEmailFiles] = useState<File[]>([])
  const [threadName, setThreadName] = useState('')
  const [showThreadNamePrompt, setShowThreadNamePrompt] = useState(false)

  // Upload progress toast state
  const [uploadStage, setUploadStage] = useState<UploadStage | null>(null)
  const [uploadFilename, setUploadFilename] = useState('')
  const [uploadStageError, setUploadStageError] = useState<string | undefined>()
  const [successFilename, setSuccessFilename] = useState<string | null>(null)
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null)
  const highlightedRowRef = useRef<HTMLTableRowElement>(null)
  const [viewDoc, setViewDoc] = useState<DocDetail | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewTab, setViewTab] = useState<'json' | 'images'>('json')

  // Structured extraction state (used by upload flow + missing fields modal)
  const [jsonValidation, setJsonValidation] = useState<{
    table: string
    subcategory: string
    row: Record<string, any>
    missing_required: string[]
    missing_recommended: string[]
  } | null>(null)
  const [jsonInsertResult, setJsonInsertResult] = useState<{
    doc_id: string
    table: string
    subcategory: string
    row: Record<string, any>
  } | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [showJsonFieldsModal, setShowJsonFieldsModal] = useState(false)
  const jsonBlobRef = useRef<any>(null)
  const uploadDocIdRef = useRef<string | null>(null)
  const insertRouteRef = useRef<string>('/api/ingest/extract-json')

  const filtered = history
    .filter(r => !search.trim() || r.DOC_ID.toLowerCase().includes(search.toLowerCase()) || r.FILENAME.toLowerCase().includes(search.toLowerCase()))

  // ---- Load history ---------------------------------------------------------

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/ingest/history')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setHistory(data)
          setHistoryLoading(false)
          return
        }
      }
    } catch { /* backend unreachable */ }
    setHistory([])
    setHistoryLoading(false)
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (!highlightedRowId || !highlightedRowRef.current) return

    const frame = requestAnimationFrame(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    const timer = window.setTimeout(() => setHighlightedRowId(null), 1800)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [highlightedRowId, history])

  async function revealHistoryRow(docId: string | null | undefined) {
    setSearch('')
    await loadHistory()
    if (docId) setHighlightedRowId(docId)
  }

  // ---- View document detail ---------------------------------------------------

  async function openDocView(row: HistoryRow) {
    setViewLoading(true)
    setViewTab('json')
    try {
      // If the history row doesn't have extracted fields, fetch full doc
      let doc = row
      if (!doc.EXTRACTED_FIELDS && !doc.FINAL_FIELDS) {
        const res = await fetch(`/api/ingest/history?limit=1&doc_id=${encodeURIComponent(row.DOC_ID)}`)
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) doc = data[0]
        }
      }

      // Fetch images if any
      const images: DocDetail['images'] = []
      const imageIds = doc.IMAGE_IDS || []
      for (const imgId of imageIds) {
        try {
          const imgRes = await fetch(`/api/ingest/images/${encodeURIComponent(imgId)}`)
          if (imgRes.ok) {
            const imgData = await imgRes.json()
            images.push(imgData)
          }
        } catch { /* skip failed image fetches */ }
      }

      setViewDoc({ doc, images })
    } catch {
      onNotify(makeNotif('ingestion', 'Error', 'Failed to load document details.'))
    } finally {
      setViewLoading(false)
    }
  }

  // ---- Structured insert (used by upload flow + missing fields modal) -------

  async function insertJson(jsonBlob: any, extraFields: Record<string, string>) {
    setSaving(true)
    try {
      const res = await fetch(insertRouteRef.current, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json_blob: jsonBlob, extra_fields: extraFields, upload_doc_id: uploadDocIdRef.current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Insert failed')
      setJsonInsertResult(data)
      setJsonValidation(prev => prev ? { ...prev, missing_required: [], missing_recommended: [] } : null)
      setShowJsonFieldsModal(false)
      if (uploadStage === 'inserting') setUploadStage('complete')
      onNotify(makeNotif('ingestion', 'Row Inserted', `Complete row added to ${data.table}.`))
      await revealHistoryRow(uploadDocIdRef.current ?? data.doc_id)
    } catch (e: any) {
      setJsonError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function submitApprovedFields(allFields: Record<string, string>) {
    if (!jsonBlobRef.current) return
    await insertJson(jsonBlobRef.current, allFields)
  }

  // ---- Upload flow ----------------------------------------------------------

  async function uploadFiles(files: File[]) {
    setUploadError(null)
    setUploading(true)
    let succeeded = true

    for (const file of files) {
      setUploadFilename(file.name)
      setUploadStageError(undefined)
      setUploadStage('uploading')

      const form = new FormData()
      form.append('document', file)

      try {
        const res = await fetch('/api/ingest/upload', { method: 'POST', body: form })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          throw new Error(err.error || `Upload failed: ${res.status}`)
        }

        setUploadStage('extracting')
        const data = await res.json()

        setUploadStage('inserting')

        insertRouteRef.current = data.insert_route || '/api/ingest/extract-json'
        uploadDocIdRef.current = data.docId ?? null
        let processingComplete = false

        // Preserve image_ids in the json_blob so they flow through to insert
        if (data.image_ids?.length && data.json_blob) {
          data.json_blob.image_ids = data.image_ids
        }

        if (data.structured) {
          jsonBlobRef.current = data.json_blob
          uploadDocIdRef.current = data.docId
          setJsonValidation({
            table: data.table,
            subcategory: data.subcategory,
            row: data.row,
            missing_required: data.missing_required || [],
            missing_recommended: data.missing_recommended || [],
          })
          setShowJsonFieldsModal(true)
          setUploadStage(null)
          if (data.image_ids?.length) {
            onNotify(makeNotif('ingestion', 'Images Stored', `${data.image_ids.length} image(s) extracted and saved.`))
          }
        } else {
          setUploadStage('complete')
          processingComplete = true
        }

        if (processingComplete) {
          await revealHistoryRow(data.docId)
        } else {
          await loadHistory()
        }
      } catch (e: any) {
        succeeded = false
        setUploadStageError(e.message || 'Upload failed')
        setUploadStage('failed')
        setUploadError(e.message || 'Upload failed')
      }
    }

    setUploading(false)
    return succeeded
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (!uploading) uploadFiles(Array.from(e.dataTransfer.files))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploading) uploadFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  function addEmailFiles(files: File[]) {
    const validFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.eml') && file.size <= 50 * 1024 * 1024
    )

    if (validFiles.length !== files.length) {
      setUploadError('Only .eml files up to 50 MB can be added to a thread.')
    } else {
      setUploadError(null)
    }

    setEmailFiles(current => {
      const existing = new Set(current.map(file => `${file.name}-${file.size}-${file.lastModified}`))
      return [...current, ...validFiles.filter(file => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))]
    })
  }

  function handleEmailDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (!uploading) addEmailFiles(Array.from(e.dataTransfer.files))
  }

  function handleEmailFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addEmailFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  function handleSubmitEmailClick() {
    if (!emailFiles.length || uploading) return
    setShowThreadNamePrompt(true)
  }

  async function submitEmailThread(name: string) {
    if (!emailFiles.length || uploading) return
    setShowThreadNamePrompt(false)
    setUploadError(null)
    setUploading(true)

    const displayName = name.trim() || `Email thread (${emailFiles.length} messages)`
    setUploadFilename(displayName)
    setUploadStageError(undefined)
    setUploadStage('uploading')

    const form = new FormData()
    form.append('thread_name', displayName)
    for (const file of emailFiles) {
      form.append('documents', file)
    }

    try {
      const res = await fetch('/api/ingest/upload-thread', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(err.error || `Upload failed: ${res.status}`)
      }

      setUploadStage('extracting')
      const data = await res.json()
      setUploadStage('inserting')

      insertRouteRef.current = data.insert_route || '/api/ingest/extract-json'
      uploadDocIdRef.current = data.docId ?? null

      if (data.image_ids?.length && data.json_blob) {
        data.json_blob.image_ids = data.image_ids
      }

      if (data.structured) {
        jsonBlobRef.current = data.json_blob
        uploadDocIdRef.current = data.docId
        setJsonValidation({
          table: data.table,
          subcategory: data.subcategory,
          row: data.row,
          missing_required: data.missing_required || [],
          missing_recommended: data.missing_recommended || [],
        })
        setShowJsonFieldsModal(true)
        setUploadStage(null)
        if (data.image_ids?.length) {
          onNotify(makeNotif('ingestion', 'Images Stored', `${data.image_ids.length} image(s) extracted and saved.`))
        }
        await loadHistory()
      } else {
        setUploadStage('complete')
        await revealHistoryRow(data.docId)
      }

      setEmailFiles([])
      setThreadName('')
    } catch (e: any) {
      setUploadStageError(e.message || 'Upload failed')
      setUploadStage('failed')
      setUploadError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      ref={pageRef}
      className="h-full overflow-y-auto scroll-smooth p-8"
      onScroll={(event) => setShowScrollTop(event.currentTarget.scrollTop > 300)}
    >
      {/* Upload progress toast */}
      {uploadStage && (
        <UploadProgressToast
          stage={uploadStage}
          filename={uploadFilename}
          error={uploadStageError}
          onDismiss={() => {
            const wasComplete = uploadStage === 'complete'
            setUploadStage(null)
            if (wasComplete) setSuccessFilename(uploadFilename)
          }}
        />
      )}

      {/* Success popup */}
      {successFilename && !uploadStage && (
        <SuccessPopup filename={successFilename} onDismiss={() => setSuccessFilename(null)} />
      )}

      {/* JSON preview & approval modal (triggered after upload extraction) */}
      {showJsonFieldsModal && jsonValidation && (
        <JsonPreviewModal
          result={{ ...jsonValidation, doc_id: uploadDocIdRef.current ?? crypto.randomUUID().slice(0, 8) }}
          onApprove={submitApprovedFields}
          onCancel={() => setShowJsonFieldsModal(false)}
          saving={saving}
        />
      )}

      {/* Thread name prompt */}
      {showThreadNamePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl border w-[440px]" style={{ background: '#0D2040', borderColor: '#214260' }}>
            <div className="px-6 py-4" style={{ borderBottom: '1px solid #18334F' }}>
              <h3 className="text-[15px] font-bold" style={{ color: '#F4F8FC' }}>Name this email thread</h3>
              <p className="text-[11px] mt-1" style={{ color: '#8FA7BF' }}>
                Give a name so you can identify this thread in the history.
              </p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); submitEmailThread(threadName) }} className="p-6 space-y-4">
              <input
                autoFocus
                value={threadName}
                onChange={(e) => setThreadName(e.target.value)}
                placeholder={`e.g. Claim #4521 — broker correspondence`}
                className="w-full rounded-lg px-4 py-2.5 text-[13px] focus:outline-none"
                style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
              />
              <p className="text-[10px]" style={{ color: '#607A94' }}>
                {emailFiles.length} file{emailFiles.length !== 1 ? 's' : ''} will be combined into a single ingestion entry.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowThreadNamePrompt(false)}
                  className="px-4 py-2 text-[12px] font-semibold rounded-lg" style={{ color: '#8FA7BF', border: '1px solid #214260' }}>
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 text-[12px] font-semibold rounded-lg text-white" style={{ background: '#1683FF' }}>
                  Upload &amp; Extract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#F4F8FC' }}>Document Ingestion</h1>
        <p className="text-[13px] max-w-2xl" style={{ color: '#8FA7BF', lineHeight: '1.75' }}>
          Drop in broker bordereaux, claims reports, or policy schedules — the platform classifies, parses, and routes each file automatically.
          Every upload gets a run ID for end-to-end traceability, with real-time status tracking from receipt through schema validation and downstream processing.
        </p>
      </div>

      {/* Upload area */}
      <div className="rounded-xl border mb-6" style={{ background: '#102B48', borderColor: '#214260' }}>
        <div className="p-5" style={{ borderBottom: '1px solid #18334F' }}>
          <div className="flex items-center gap-4">
            <span className="text-[13px] font-semibold" style={{ color: '#F4F8FC' }}>Ingestion Type</span>
            <div className="flex rounded-lg p-0.5" style={{ background: '#0A1B31' }}>
              {(['document', 'email'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setUploadMode(m)}
                  className="px-4 py-1.5 rounded-md text-[12px] font-medium transition-all"
                  style={uploadMode === m ? { background: '#14385C', color: '#F4F8FC' } : { color: '#8FA7BF' }}
                >
                  {m === 'document' ? '\u{1F4C4} Document / File' : '\u{1F4E7} Email Ingestion'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6">
          {uploadMode === 'document' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && fileRef.current?.click()}
              className="relative overflow-hidden border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300"
              style={{
                ...(isDragging
                  ? { borderColor: '#2DA8FF', background: 'radial-gradient(circle at 50% 45%, #1683FF30 0%, #0D3970 48%, #0A1B31 100%)', boxShadow: '0 0 0 1px #1683FF55, 0 0 32px #1683FF40, inset 0 0 28px #1683FF18' }
                  : { borderColor: '#214260', background: '#0A1B31' }),
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              <input ref={fileRef} type="file" className="hidden" multiple accept=".pdf,.xlsx,.xls,.csv,.docx,.eml,.msg" onChange={handleFileChange} />
              {uploading ? (
                <>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#103B70' }}>
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2DA8FF', borderTopColor: 'transparent' }} />
                  </div>
                  <p className="text-[14px] font-semibold mb-1" style={{ color: '#F4F8FC' }}>Uploading & extracting...</p>
                  <p className="text-[12px]" style={{ color: '#8FA7BF' }}>This may take a moment for large documents</p>
                </>
              ) : (
                <>
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all duration-300 ${isDragging ? 'animate-[floatY_1.2s_ease-in-out_infinite]' : successFilename ? 'animate-scale-in' : ''}`}
                    style={{
                      background: successFilename ? '#0C5248' : '#103B70',
                      boxShadow: isDragging ? '0 8px 28px #1683FF66' : successFilename ? '0 8px 24px #18C7A044' : 'none',
                    }}
                  >
                    {successFilename ? (
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#22EFC0" strokeWidth="2.4">
                        <path d="m6 13 4.5 4.5L20 8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#2DA8FF" strokeWidth="1.8"
                        className="transition-transform duration-300"
                        style={{ transform: isDragging ? 'translateY(-2px) scale(1.08)' : 'none' }}>
                        <path d="M14 19V9M14 9l-4 4M14 9l4 4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 22h18" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <p className="text-[14px] font-semibold mb-1" style={{ color: successFilename ? '#22EFC0' : isDragging ? '#FFFFFF' : '#F4F8FC' }}>
                    {successFilename ? 'Upload complete' : isDragging ? 'Release to upload' : 'Drop files here or click to upload'}
                  </p>
                  <p className="text-[12px]" style={{ color: '#8FA7BF' }}>
                    {successFilename ? successFilename : 'PDF, Excel, DOCX, CSV, EML — up to 50 MB per file'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-[14px] font-semibold mb-1" style={{ color: '#F4F8FC' }}>Upload email thread</h3>
                <p className="text-[12px]" style={{ color: '#8FA7BF' }}>
                  Add all .eml messages in the thread, review the queue, then submit them for JSON extraction.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleEmailDrop}
                onClick={() => !uploading && emailFileRef.current?.click()}
                className="border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all duration-200"
                style={{
                  ...(isDragging ? { borderColor: '#1683FF', background: '#0D3970' } : { borderColor: '#214260', background: '#0A1B31' }),
                  cursor: uploading ? 'wait' : 'pointer',
                  opacity: uploading ? 0.6 : 1,
                }}
              >
                <input ref={emailFileRef} type="file" className="hidden" multiple accept=".eml,message/rfc822" onChange={handleEmailFileChange} />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: '#103B70' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2DA8FF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                </div>
                <p className="text-[14px] font-semibold mb-1" style={{ color: '#F4F8FC' }}>Drop .eml files here or click to browse</p>
                <p className="text-[12px]" style={{ color: '#8FA7BF' }}>Select multiple messages from the same thread · 50 MB max per file</p>
              </div>

              {emailFiles.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #214260' }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ background: '#0D2742', borderBottom: '1px solid #18334F' }}>
                    <div>
                      <p className="text-[12px] font-semibold" style={{ color: '#F4F8FC' }}>Email thread</p>
                      <p className="text-[11px]" style={{ color: '#8FA7BF' }}>{emailFiles.length} {emailFiles.length === 1 ? 'message' : 'messages'} ready</p>
                    </div>
                    <button onClick={() => setEmailFiles([])} disabled={uploading} className="text-[11px] font-medium disabled:opacity-40" style={{ color: '#8FA7BF' }}>Clear all</button>
                  </div>
                  <div className="divide-y max-h-52 overflow-y-auto" style={{ background: '#091C30' }}>
                    {emailFiles.map((file, index) => (
                      <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: '#18334F' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: '#103B70', color: '#2DA8FF' }}>EML</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate" style={{ color: '#E6EEF7' }}>{file.name}</p>
                          <p className="text-[10px]" style={{ color: '#8FA7BF' }}>Message {index + 1} · {(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEmailFiles(current => current.filter(item => item !== file)) }}
                          disabled={uploading}
                          aria-label={`Remove ${file.name}`}
                          className="w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-40"
                          style={{ color: '#8FA7BF', border: '1px solid #214260' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m3 3 6 6M9 3 3 9" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px]" style={{ color: '#8FA7BF' }}>All messages will be combined into a single ingestion entry.</p>
                <button
                  onClick={handleSubmitEmailClick}
                  disabled={!emailFiles.length || uploading}
                  className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#1683FF' }}
                >
                  {uploading ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Generating JSON...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 3 2 7l3 4M9 3l3 4-3 4" />
                      </svg>
                      Upload Threads
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between" style={{ background: '#492431', border: '1px solid #FF647C44' }}>
          <span className="text-[12px]" style={{ color: '#FF647C' }}>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-[12px] font-semibold px-2" style={{ color: '#FF647C' }}>Dismiss</button>
        </div>
      )}

      {/* History header */}
      <div className="mb-4">
        <h2 className="text-[16px] font-bold mb-0.5" style={{ color: '#F4F8FC' }}>Ingestion History</h2>
        <p className="text-[12px]" style={{ color: '#8FA7BF' }}>All ingestion runs — structured and unstructured sources.</p>
      </div>

      {/* Filter + table */}
      <div className="rounded-xl border" style={{ background: '#102B48', borderColor: '#214260' }}>
        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderBottom: '1px solid #18334F' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID or file..."
            className="rounded-lg px-3 py-1.5 text-[12px] focus:outline-none w-52"
            style={{ background: '#091C30', border: '1px solid #294863', color: '#E6EEF7' }}
          />
          <button onClick={loadHistory} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{ color: '#2DA8FF', border: '1px solid #214260', background: '#103B70' }}>Refresh</button>
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-left" style={{ borderBottom: '1px solid #18334F' }}>
              {['Doc ID', 'File', 'LOB', 'Classification', 'Status', 'Time', 'View'].map((h) => (
                <th key={h} className="text-[11px] font-semibold uppercase tracking-wide px-5 py-3" style={{ color: '#8FA7BF' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historyLoading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px]" style={{ color: '#8FA7BF' }}>Loading history...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[13px]" style={{ color: '#8FA7BF' }}>No ingestion records found.</td></tr>
            ) : (
              filtered.map((row) => {
                const status = humanStatus(row.STATUS)
                return (
                  <tr
                    key={row.DOC_ID}
                    ref={row.DOC_ID === highlightedRowId ? highlightedRowRef : undefined}
                    className={`transition-colors ${row.DOC_ID === highlightedRowId ? 'ingestion-row-highlight' : ''}`}
                    style={{ borderBottom: '1px solid #18334F' }}
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-[10px] font-medium" style={{ color: '#2DA8FF', wordBreak: 'break-all' }}>{row.DOC_ID.slice(0, 12)}...</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-medium max-w-xs truncate" style={{ color: '#F4F8FC' }}>{row.FILENAME}</div>
                      <div className="text-[11px]" style={{ color: '#8FA7BF' }}>{row.FILE_TYPE ?? 'File'}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: '#8FA7BF' }}>{row.LOB ?? '—'}</td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: '#8FA7BF' }}>{row.CLASSIFICATION ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[status] ?? ''}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[11px]" style={{ color: '#8FA7BF' }}>{formatTime(row.CREATED_AT)}</td>
                    <td className="px-5 py-3.5">
                      {row.STATUS === 'COMPLETED' || row.STATUS === 'VALIDATION' ? (
                        <button
                          onClick={() => openDocView(row)}
                          disabled={viewLoading}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-md transition-colors disabled:opacity-50"
                          style={{ color: '#2DA8FF', border: '1px solid #214260', background: '#103B70' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="2" />
                            <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4" />
                          </svg>
                          View
                        </button>
                      ) : (
                        <span className="text-[11px]" style={{ color: '#607A94' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Document view modal */}
      {viewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(5,8,18,0.85)' }}
          onClick={() => setViewDoc(null)}
        >
          <div
            className="rounded-xl flex flex-col overflow-hidden w-[90vw] max-w-[1100px] max-h-[80vh]"
            style={{ background: '#0f1729', border: '1px solid #1a2744' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a2744' }}>
              <div className="flex items-center gap-3">
                {viewDoc.doc.LOB && (
                  <span className="text-[11px] font-semibold px-3 py-0.5 rounded"
                    style={{ color: '#F5A623', background: '#493715', border: '1px solid #F5A62344' }}>
                    {viewDoc.doc.LOB}
                  </span>
                )}
                {viewDoc.doc.CLASSIFICATION && (
                  <span className="text-[11px] font-semibold px-3 py-0.5 rounded"
                    style={{ color: '#22EFC0', background: '#0C5248', border: '1px solid #22EFC044' }}>
                    {viewDoc.doc.CLASSIFICATION}
                  </span>
                )}
                <span className="text-[15px] font-semibold" style={{ color: '#F4F8FC' }}>
                  {viewDoc.doc.FILENAME}
                </span>
              </div>
              <button
                onClick={() => setViewDoc(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md"
                style={{ color: '#8FA7BF' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m3 3 8 8M11 3 3 11" /></svg>
              </button>
            </div>

            {/* Modal meta */}
            <div className="flex gap-6 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a2744' }}>
              {[
                { label: 'Doc ID', value: viewDoc.doc.DOC_ID.slice(0, 12) + '...' },
                { label: 'Type', value: viewDoc.doc.FILE_TYPE ?? '—' },
                { label: 'Status', value: humanStatus(viewDoc.doc.STATUS) },
                { label: 'Uploaded', value: formatTime(viewDoc.doc.CREATED_AT) },
              ].map((m) => (
                <div key={m.label} className="text-[11px] flex items-center gap-1.5" style={{ color: '#8FA7BF' }}>
                  {m.label}: <span style={{ color: '#F4F8FC', fontWeight: 500 }}>{m.value}</span>
                </div>
              ))}
            </div>

            {/* Tab bar (only show images tab when images exist) */}
            <div className="flex gap-1 px-5 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a2744' }}>
              {(['json', ...(viewDoc.images.length > 0 ? ['images'] : [])] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab as 'json' | 'images')}
                  className="px-4 py-1.5 rounded-md text-[12px] font-medium transition-all"
                  style={viewTab === tab
                    ? { background: '#14385C', color: '#F4F8FC' }
                    : { color: '#8FA7BF' }}
                >
                  {tab === 'json' ? 'Extracted Data' : `Images (${viewDoc.images.length})`}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto">
              {viewTab === 'json' ? (
                <>
                  <table className="w-full">
                    <thead>
                      <tr>
                        {['Field', 'Value'].map((col) => (
                          <th key={col} className="text-left text-[10px] font-medium px-5 py-2.5 sticky top-0"
                            style={{ color: '#8FA7BF', borderBottom: '1px solid #1a2744', background: '#0f1729' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const fields = viewDoc.doc.FINAL_FIELDS || viewDoc.doc.EXTRACTED_FIELDS || {}
                        const entries = Object.entries(fields)
                        if (entries.length === 0) {
                          return (
                            <tr><td colSpan={2} className="px-5 py-8 text-center text-[13px]" style={{ color: '#8FA7BF' }}>No extracted data available.</td></tr>
                          )
                        }
                        return entries.map(([key, val]) => {
                          const displayVal = typeof val === 'object' && val !== null
                            ? (val.value !== undefined ? String(val.value) : JSON.stringify(val))
                            : String(val ?? '—')
                          return (
                            <tr key={key} style={{ borderBottom: '1px solid rgba(26,39,68,0.4)' }}>
                              <td className="px-5 py-2.5 text-[11px] font-medium" style={{ color: '#8FA7BF', width: '35%' }}>
                                {fieldLabel(key)}
                              </td>
                              <td className="px-5 py-2.5 font-mono text-[11px]" style={{ color: displayVal === '—' ? '#5a6a85' : '#e1e7ef' }}>
                                {displayVal}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                  {/* Show images inline below the JSON when they exist */}
                  {viewDoc.images.length > 0 && (
                    <div className="px-5 pt-4 pb-5">
                      <p className="text-[12px] font-semibold mb-3" style={{ color: '#F4F8FC' }}>
                        Attached Images ({viewDoc.images.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {viewDoc.images.map((img) => (
                          <div key={img.image_id} className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a2744', background: '#0A1B31' }}>
                            <img
                              src={`data:${img.content_type};base64,${img.data}`}
                              alt={img.filename || 'Extracted image'}
                              className="w-full h-auto max-h-[400px] object-contain"
                              style={{ background: '#fff' }}
                            />
                            {img.filename && (
                              <div className="px-3 py-2 text-[11px]" style={{ color: '#8FA7BF', borderTop: '1px solid #1a2744' }}>
                                {img.filename}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {viewDoc.images.map((img) => (
                    <div key={img.image_id} className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a2744', background: '#0A1B31' }}>
                      <img
                        src={`data:${img.content_type};base64,${img.data}`}
                        alt={img.filename || 'Extracted image'}
                        className="w-full h-auto max-h-[400px] object-contain"
                        style={{ background: '#fff' }}
                      />
                      {img.filename && (
                        <div className="px-3 py-2 text-[11px]" style={{ color: '#8FA7BF', borderTop: '1px solid #1a2744' }}>
                          {img.filename}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #1a2744' }}>
              <span className="text-[11px]" style={{ color: '#8FA7BF' }}>
                {viewTab === 'json'
                  ? `${Object.keys(viewDoc.doc.FINAL_FIELDS || viewDoc.doc.EXTRACTED_FIELDS || {}).length} fields`
                  : `${viewDoc.images.length} image(s)`}
              </span>
              <button
                onClick={() => setViewDoc(null)}
                className="px-4 py-2 text-[12px] font-semibold rounded-lg"
                style={{ color: '#8FA7BF', border: '1px solid #214260' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button
          type="button"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="group fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#1683FF] text-white shadow-[0_4px_16px_#1683FF55] transition-all duration-200 hover:-translate-y-1 hover:bg-[#2DA8FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16C7D9] animate-[scaleIn_0.2s_ease]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className="transition-transform duration-200 group-hover:-translate-y-0.5">
            <path d="M8 12V4M4 8l4-4 4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}
