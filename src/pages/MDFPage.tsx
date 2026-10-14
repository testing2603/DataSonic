import { useEffect, useState } from 'react'

type IngestionStatus = 'Y' | 'N'

interface IngestionObject {
  name: string
  status: IngestionStatus
  initialStatus: IngestionStatus
}

type AuditStatus = 'Success' | 'Failed' | 'Processing'

interface AuditRecord {
  id: string
  objectName: string
  startedAt: string
  status: AuditStatus
  message: string
}

interface AddTableForm {
  objectId: string
  sourceId: string
  pipelineId: string
  objectName: string
  connectionDetail: string
  schedulePriority: string
  rawLakePath: string
  isActive: IngestionStatus
  cdrConcept: string
}

const emptyAddTableForm: AddTableForm = {
  objectId: '',
  sourceId: '',
  pipelineId: '',
  objectName: '',
  connectionDetail: '',
  schedulePriority: '',
  rawLakePath: '',
  isActive: 'Y',
  cdrConcept: '',
}

const frameworkAreas = [
  {
    label: 'Execution History',
    description: 'Review framework runs, statuses, and execution details.',
  },
  {
    label: 'Add Tables',
    description: 'Register new source tables and their metadata configuration.',
  },
  {
    label: 'Update Ingestion',
    description: 'Manage ingestion settings and extraction behavior.',
  },
]

function readObjects(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const body = payload as Record<string, unknown>
  for (const key of ['objects', 'records', 'data', 'value', 'logs', 'audit_logs']) {
    if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[]
  }
  return []
}

function normalizeObject(row: Record<string, unknown>): IngestionObject | null {
  const rawName =
    row.object_name ??
    row.OBJECT_NAME ??
    row.objectName ??
    row.Object_Name ??
    row.name
  if (typeof rawName !== 'string' || !rawName.trim()) return null

  const rawStatus = String(
    row.status ??
    row.STATUS ??
    row.is_active ??
    row.IS_ACTIVE ??
    row.enabled ??
    'N',
  ).toUpperCase()
  const status: IngestionStatus =
    rawStatus === 'Y' || rawStatus === 'ENABLED' || rawStatus === 'TRUE'
      ? 'Y'
      : 'N'

  return { name: rawName.trim(), status, initialStatus: status }
}

function normalizeAuditRecord(
  row: Record<string, unknown>,
  index: number,
): AuditRecord {
  const rawStatus = String(
    row.status ??
      row.STATUS ??
      row.run_status ??
      row.RUN_STATUS ??
      row.execution_status ??
      '',
  ).toUpperCase()
  const status: AuditStatus =
    rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETED')
      ? 'Success'
      : rawStatus.includes('FAIL') || rawStatus.includes('ERROR')
        ? 'Failed'
        : 'Processing'

  return {
    id: String(
      row.run_id ??
        row.RUN_ID ??
        row.audit_id ??
        row.AUDIT_ID ??
        row.execution_id ??
        `RUN-${index + 1}`,
    ),
    objectName: String(
      row.object_name ??
        row.OBJECT_NAME ??
        row.pipeline_name ??
        row.PIPELINE_NAME ??
        '—',
    ),
    startedAt: String(
      row.started_at ??
        row.STARTED_AT ??
        row.start_time ??
        row.START_TIME ??
        row.created_at ??
        row.CREATED_AT ??
        '',
    ),
    status,
    message: String(
      row.message ??
        row.MESSAGE ??
        row.error_message ??
        row.ERROR_MESSAGE ??
        row.details ??
        '—',
    ),
  }
}

function formatAuditDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function MDFPage() {
  const [executingPipeline, setExecutingPipeline] = useState(false)
  const [pipelineExecutionMessage, setPipelineExecutionMessage] = useState('')
  const [pipelineExecutionError, setPipelineExecutionError] = useState('')
  const [showExecutionHistory, setShowExecutionHistory] = useState(false)
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [showAddTable, setShowAddTable] = useState(false)
  const [addTableForm, setAddTableForm] =
    useState<AddTableForm>(emptyAddTableForm)
  const [addingTable, setAddingTable] = useState(false)
  const [addTableError, setAddTableError] = useState('')
  const [addTableSuccess, setAddTableSuccess] = useState('')
  const [showUpdateIngestion, setShowUpdateIngestion] = useState(false)
  const [objects, setObjects] = useState<IngestionObject[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const changedObjects = objects.filter(
    (object) => object.status !== object.initialStatus,
  )

  async function executePipeline() {
    if (executingPipeline) return
    setExecutingPipeline(true)
    setPipelineExecutionMessage('')
    setPipelineExecutionError('')

    try {
      const response = await fetch('/api/mdf/execute-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not execute the pipeline (HTTP ${response.status}).`,
        )
      }
      setPipelineExecutionMessage(
        body?.message ?? 'Pipeline execution started successfully.',
      )
    } catch (executionError) {
      setPipelineExecutionError(
        executionError instanceof Error
          ? executionError.message
          : 'Could not start the pipeline execution.',
      )
    } finally {
      setExecutingPipeline(false)
    }
  }

  async function loadExecutionHistory() {
    setAuditLoading(true)
    setAuditError('')
    try {
      const response = await fetch('/api/mdf/execution-history')
      if (!response.ok) {
        throw new Error(`Could not fetch Fabric audit logs (HTTP ${response.status}).`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error('The Fabric audit service returned an unexpected response.')
      }

      const normalized = readObjects(await response.json())
        .map(normalizeAuditRecord)
        .sort((a, b) => {
          const aTime = new Date(a.startedAt).getTime()
          const bTime = new Date(b.startedAt).getTime()
          return (Number.isNaN(bTime) ? 0 : bTime) -
            (Number.isNaN(aTime) ? 0 : aTime)
        })
      setAuditRecords(normalized)
    } catch (loadError) {
      setAuditRecords([])
      setAuditError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load execution history from Fabric.',
      )
    } finally {
      setAuditLoading(false)
    }
  }

  function openExecutionHistory() {
    setShowExecutionHistory(true)
    void loadExecutionHistory()
  }

  function closeExecutionHistory() {
    setShowExecutionHistory(false)
  }

  function openAddTable() {
    setAddTableForm(emptyAddTableForm)
    setAddTableError('')
    setAddTableSuccess('')
    setShowAddTable(true)
  }

  function closeAddTable() {
    if (addingTable) return
    setShowAddTable(false)
  }

  function updateAddTableField<K extends keyof AddTableForm>(
    field: K,
    value: AddTableForm[K],
  ) {
    setAddTableForm((current) => ({ ...current, [field]: value }))
    setAddTableError('')
    setAddTableSuccess('')
  }

  async function submitAddTable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (addingTable) return

    setAddingTable(true)
    setAddTableError('')
    setAddTableSuccess('')

    const nullable = (value: string) => {
      const normalized = value.trim()
      return normalized || null
    }

    try {
      const response = await fetch('/api/mdf/ingestion-objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          object_id: nullable(addTableForm.objectId),
          source_id: nullable(addTableForm.sourceId),
          pipeline_id: nullable(addTableForm.pipelineId),
          object_name: nullable(addTableForm.objectName),
          connection_detail: nullable(addTableForm.connectionDetail),
          schedule_priority: addTableForm.schedulePriority.trim()
            ? Number(addTableForm.schedulePriority)
            : null,
          raw_lake_path: nullable(addTableForm.rawLakePath),
          is_active: addTableForm.isActive,
          cdr_concept: nullable(addTableForm.cdrConcept),
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not add the Fabric table (HTTP ${response.status}).`,
        )
      }

      setAddTableSuccess(
        `${addTableForm.objectName.trim()} was added successfully.`,
      )
      setAddTableForm(emptyAddTableForm)
    } catch (submitError) {
      setAddTableError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not add the table to Fabric.',
      )
    } finally {
      setAddingTable(false)
    }
  }

  async function loadIngestionObjects() {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/mdf/ingestion-objects')
      if (!response.ok) {
        throw new Error(`Could not fetch Fabric objects (HTTP ${response.status}).`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error('The Fabric service returned an unexpected response.')
      }
      const rows = readObjects(await response.json())
      const normalized = rows
        .map(normalizeObject)
        .filter((object): object is IngestionObject => object !== null)
      setObjects(normalized)
    } catch (loadError) {
      setObjects([])
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load ingestion objects from Fabric.',
      )
    } finally {
      setLoading(false)
    }
  }

  function openUpdateIngestion() {
    setShowUpdateIngestion(true)
    void loadIngestionObjects()
  }

  function closeUpdateIngestion() {
    if (saving) return
    setShowUpdateIngestion(false)
  }

  function setObjectStatus(name: string, status: IngestionStatus) {
    setObjects((current) =>
      current.map((object) =>
        object.name === name ? { ...object, status } : object,
      ),
    )
    setSuccess('')
  }

  async function updateIngestion() {
    if (changedObjects.length === 0 || saving) return

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await fetch('/api/mdf/ingestion-objects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objects: changedObjects.map((object) => ({
            object_name: object.name,
            status: object.status,
          })),
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not update Fabric objects (HTTP ${response.status}).`,
        )
      }

      const updatedNames = new Set(changedObjects.map((object) => object.name))
      setObjects((current) =>
        current.map((object) =>
          updatedNames.has(object.name)
            ? { ...object, initialStatus: object.status }
            : object,
        ),
      )
      setSuccess(
        `${changedObjects.length} ingestion ${
          changedObjects.length === 1 ? 'object was' : 'objects were'
        } updated successfully.`,
      )
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update ingestion settings.',
      )
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!showExecutionHistory && !showUpdateIngestion && !showAddTable) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showExecutionHistory) closeExecutionHistory()
      if (showAddTable) closeAddTable()
      if (showUpdateIngestion) closeUpdateIngestion()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [
    showExecutionHistory,
    showAddTable,
    showUpdateIngestion,
    addingTable,
    saving,
  ])

  return (
    <div className="min-h-full px-8 py-8 animate-fade-in">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-2xl font-semibold text-[#F4F8FC]">
                Metadata-Driven Framework
              </div>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#8FA7BF]">
                Configure and govern the shared metadata that powers ingestion,
                orchestration, and the service layer across every line of business.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void executePipeline()}
              disabled={executingPipeline}
              className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#1683FF]/50 bg-[#1683FF] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(22,131,255,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#2D91FF] hover:shadow-[0_12px_30px_rgba(22,131,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {executingPipeline ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 2.5l7 4.5-7 4.5v-9z" />
                </svg>
              )}
              {executingPipeline ? 'Executing…' : 'Execute Pipeline'}
            </button>
          </div>
          {pipelineExecutionMessage && (
            <div className="mt-4 rounded-lg border border-[#18C7A0]/30 bg-[#103E3A]/70 px-4 py-3 text-[12px] text-[#55E0BF]">
              {pipelineExecutionMessage}
            </div>
          )}
          {pipelineExecutionError && (
            <div className="mt-4 rounded-lg border border-[#FF647C]/30 bg-[#492431]/70 px-4 py-3 text-[12px] text-[#FF8A9C]">
              {pipelineExecutionError}
            </div>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {frameworkAreas.map((area, index) => {
            const isExecutionHistory = area.label === 'Execution History'
            const isAddTable = area.label === 'Add Tables'
            const isUpdateIngestion = area.label === 'Update Ingestion'
            const isInteractive =
              isExecutionHistory || isAddTable || isUpdateIngestion
            const accent =
              index === 0
                ? {
                    icon: 'border-[#16C7D9]/35 bg-[#16C7D9]/10 text-[#43DCEB]',
                    line: 'from-[#16C7D9] to-[#1683FF]',
                    glow: 'bg-[#16C7D9]/10',
                    label: 'Monitoring',
                  }
                : index === 1
                  ? {
                      icon: 'border-[#1683FF]/35 bg-[#1683FF]/10 text-[#5BA7FF]',
                      line: 'from-[#1683FF] to-[#745CFF]',
                      glow: 'bg-[#1683FF]/10',
                      label: 'Registration',
                    }
                  : {
                      icon: 'border-[#18C7A0]/35 bg-[#18C7A0]/10 text-[#55E0BF]',
                      line: 'from-[#18C7A0] to-[#16C7D9]',
                      glow: 'bg-[#18C7A0]/10',
                      label: 'Controls',
                    }
            return (
              <button
                key={area.label}
                type="button"
                onClick={
                  isExecutionHistory
                    ? openExecutionHistory
                    : isAddTable
                      ? openAddTable
                      : isUpdateIngestion
                        ? openUpdateIngestion
                        : undefined
                }
                className={`group relative flex min-h-56 overflow-hidden rounded-2xl border border-[#214260] bg-[#0C233D]/90 p-5 text-left shadow-[0_12px_32px_rgba(0,0,0,0.16)] transition-all duration-300 hover:-translate-y-1 hover:border-[#2D5A82] hover:shadow-[0_20px_44px_rgba(0,0,0,0.28)] ${
                  isInteractive ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent.line}`}
                />
                <span
                  className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100 ${accent.glow}`}
                />

                <div className="relative z-10 flex w-full flex-col">
                  <div className="mb-6 flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${accent.icon}`}
                    >
                      <MDFCardIcon index={index} />
                    </div>
                    <span className="font-mono text-[11px] font-medium tracking-widest text-[#526B84]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <span className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6F8BA7]">
                    {accent.label}
                  </span>
                  <div className="text-[16px] font-semibold text-[#F4F8FC]">
                    {area.label}
                  </div>
                  <p className="mt-2 flex-1 text-[12px] leading-5 text-[#8FA7BF]">
                    {area.description}
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-[#214260]/80 pt-4">
                    <span className="text-[11px] font-medium text-[#8FA7BF] transition-colors group-hover:text-[#C4D4E5]">
                      {isInteractive ? 'Open workspace' : 'Operational overview'}
                    </span>
                    {isInteractive && (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#214260] bg-[#07182B] text-[#2DA8FF] transition-all duration-300 group-hover:translate-x-0.5 group-hover:border-[#1683FF]/50 group-hover:bg-[#1683FF]/10">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 6h7M6.5 3l3 3-3 3" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {showExecutionHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020A14]/80 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExecutionHistory()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="execution-history-title"
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#214260] bg-[#0A1B31] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start justify-between border-b border-[#18334F] px-6 py-5">
              <div>
                <div
                  id="execution-history-title"
                  className="text-[17px] font-semibold text-[#F4F8FC]"
                >
                  Execution History
                </div>
                <p className="mt-1 text-[12px] text-[#8FA7BF]">
                  Fabric audit log records ordered from newest to oldest.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadExecutionHistory()}
                  disabled={auditLoading}
                  className="rounded-lg border border-[#214260] px-3 py-2 text-[11px] font-semibold text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
                >
                  {auditLoading ? 'Refreshing…' : 'Refresh'}
                </button>
                <button
                  type="button"
                  onClick={closeExecutionHistory}
                  aria-label="Close execution history"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#214260] text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC]"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M2 2l10 10M12 2L2 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-6">
              {auditError && (
                <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-[#FF647C]/30 bg-[#492431]/70 px-4 py-3 text-[12px] text-[#FF8A9C]">
                  <span>{auditError}</span>
                  <button
                    type="button"
                    onClick={() => void loadExecutionHistory()}
                    className="shrink-0 font-semibold text-[#F4F8FC] hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-[#214260]">
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-[#07182B]">
                    <tr className="border-b border-[#214260]">
                      {['Run ID', 'Object / Pipeline', 'Started At', 'Status', 'Details'].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#8FA7BF]"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-[#102B48]/60">
                    {auditLoading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-14 text-center text-[12px] text-[#8FA7BF]"
                        >
                          Loading audit logs from Fabric…
                        </td>
                      </tr>
                    ) : auditRecords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-14 text-center text-[12px] text-[#8FA7BF]"
                        >
                          {auditError
                            ? 'No audit records loaded.'
                            : 'No execution history was found.'}
                        </td>
                      </tr>
                    ) : (
                      auditRecords.map((record, index) => (
                        <tr
                          key={`${record.id}-${index}`}
                          className="border-b border-[#18334F] last:border-b-0 hover:bg-[#1683FF]/5"
                        >
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-[11px] font-medium text-[#2DA8FF]">
                            {record.id}
                          </td>
                          <td className="px-4 py-3.5 text-[12px] font-medium text-[#E6EEF7]">
                            {record.objectName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-[11px] text-[#8FA7BF]">
                            {formatAuditDate(record.startedAt)}
                          </td>
                          <td className="px-4 py-3.5">
                            <AuditStatusBadge status={record.status} />
                          </td>
                          <td
                            className="max-w-64 truncate px-4 py-3.5 text-[11px] text-[#8FA7BF]"
                            title={record.message}
                          >
                            {record.message}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020A14]/80 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddTable()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-table-title"
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#214260] bg-[#0A1B31] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start justify-between border-b border-[#18334F] px-6 py-5">
              <div>
                <div
                  id="add-table-title"
                  className="text-[17px] font-semibold text-[#F4F8FC]"
                >
                  Add Table
                </div>
                <p className="mt-1 text-[12px] text-[#8FA7BF]">
                  Register a new object in the Fabric metadata table.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddTable}
                disabled={addingTable}
                aria-label="Close add table"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#214260] text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={(event) => void submitAddTable(event)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {addTableError && (
                  <div className="mb-5 rounded-lg border border-[#FF647C]/30 bg-[#492431]/70 px-4 py-3 text-[12px] text-[#FF8A9C]">
                    {addTableError}
                  </div>
                )}
                {addTableSuccess && (
                  <div className="mb-5 rounded-lg border border-[#18C7A0]/30 bg-[#103E3A]/70 px-4 py-3 text-[12px] text-[#55E0BF]">
                    {addTableSuccess}
                  </div>
                )}

                <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                  <FormField
                    label="Object ID"
                    value={addTableForm.objectId}
                    onChange={(value) =>
                      updateAddTableField('objectId', value)
                    }
                    placeholder="e.g. OBJ-001"
                    required
                  />
                  <FormField
                    label="Source ID"
                    value={addTableForm.sourceId}
                    onChange={(value) =>
                      updateAddTableField('sourceId', value)
                    }
                    placeholder="e.g. SRC-001"
                    required
                  />
                  <FormField
                    label="Pipeline ID"
                    value={addTableForm.pipelineId}
                    onChange={(value) =>
                      updateAddTableField('pipelineId', value)
                    }
                    placeholder="e.g. PL-001"
                    required
                  />
                  <FormField
                    label="Object Name"
                    value={addTableForm.objectName}
                    onChange={(value) =>
                      updateAddTableField('objectName', value)
                    }
                    placeholder="e.g. POLICY_HEADER"
                    required
                  />
                  <FormField
                    label="Schedule Priority"
                    value={addTableForm.schedulePriority}
                    onChange={(value) =>
                      updateAddTableField('schedulePriority', value)
                    }
                    placeholder="e.g. 10"
                    type="number"
                    required
                  />
                  <FormField
                    label="Raw Lake Path"
                    value={addTableForm.rawLakePath}
                    onChange={(value) =>
                      updateAddTableField('rawLakePath', value)
                    }
                    placeholder="/bronze/source/object"
                    required
                  />
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                      Is Active
                      <span className="ml-1 text-[#2DA8FF]">*</span>
                    </label>
                    <div className="inline-flex h-10 rounded-lg border border-[#214260] bg-[#07182B] p-1">
                      {(['Y', 'N'] as IngestionStatus[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            updateAddTableField('isActive', value)
                          }
                          className={`rounded-md px-4 text-[11px] font-semibold transition-colors ${
                            addTableForm.isActive === value
                              ? value === 'Y'
                                ? 'bg-[#18C7A0]/20 text-[#55E0BF]'
                                : 'bg-[#FF647C]/20 text-[#FF8A9C]'
                              : 'text-[#8FA7BF] hover:text-[#F4F8FC]'
                          }`}
                        >
                          {value === 'Y' ? 'Yes (Y)' : 'No (N)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <FormField
                    label="CDR Concept"
                    value={addTableForm.cdrConcept}
                    onChange={(value) =>
                      updateAddTableField('cdrConcept', value)
                    }
                    placeholder="e.g. Policy"
                    required
                  />
                  <div className="md:col-span-2">
                    <label
                      htmlFor="connection-detail"
                      className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]"
                    >
                      Connection Detail
                      <span className="ml-1 text-[#2DA8FF]">*</span>
                    </label>
                    <textarea
                      id="connection-detail"
                      value={addTableForm.connectionDetail}
                      onChange={(event) =>
                        updateAddTableField(
                          'connectionDetail',
                          event.target.value,
                        )
                      }
                      rows={3}
                      placeholder="Enter the connection or source path details"
                      required
                      className="w-full resize-none rounded-lg border border-[#214260] bg-[#07182B] px-3 py-2.5 text-[12px] text-[#F4F8FC] outline-none transition-colors placeholder:text-[#526B84] focus:border-[#1683FF]"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-[#214260] bg-[#07182B]/60 px-4 py-3 text-[11px] leading-5 text-[#8FA7BF]">
                  All form fields are mandatory. Any additional database
                  columns not represented by this form must default to{' '}
                  <span className="font-mono font-semibold text-[#16C7D9]">
                    NULL
                  </span>
                  {' '}in the backend insert operation.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[#18334F] bg-[#07182B]/50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeAddTable}
                  disabled={addingTable}
                  className="rounded-lg border border-[#214260] px-4 py-2 text-[12px] font-semibold text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingTable}
                  className="rounded-lg bg-[#1683FF] px-5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2D91FF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingTable ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUpdateIngestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020A14]/80 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeUpdateIngestion()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-ingestion-title"
            className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#214260] bg-[#0A1B31] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start justify-between border-b border-[#18334F] px-6 py-5">
              <div>
                <div
                  id="update-ingestion-title"
                  className="text-[17px] font-semibold text-[#F4F8FC]"
                >
                  Update Ingestion
                </div>
                <p className="mt-1 text-[12px] text-[#8FA7BF]">
                  Enable or disable Fabric objects for ingestion.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUpdateIngestion}
                disabled={saving}
                aria-label="Close update ingestion"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#214260] text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-6">
              {error && (
                <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-[#FF647C]/30 bg-[#492431]/70 px-4 py-3 text-[12px] text-[#FF8A9C]">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void loadIngestionObjects()}
                    className="shrink-0 font-semibold text-[#F4F8FC] hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg border border-[#18C7A0]/30 bg-[#103E3A]/70 px-4 py-3 text-[12px] text-[#55E0BF]">
                  {success}
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-[#214260]">
                <table className="w-full">
                  <thead className="bg-[#07182B]">
                    <tr className="border-b border-[#214260]">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#8FA7BF]">
                        Object Name
                      </th>
                      <th className="w-56 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#8FA7BF]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#102B48]/60">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-5 py-12 text-center text-[12px] text-[#8FA7BF]"
                        >
                          Loading objects from Fabric…
                        </td>
                      </tr>
                    ) : objects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-5 py-12 text-center text-[12px] text-[#8FA7BF]"
                        >
                          {error
                            ? 'No objects loaded.'
                            : 'No ingestion objects were found.'}
                        </td>
                      </tr>
                    ) : (
                      objects.map((object) => (
                        <tr
                          key={object.name}
                          className="border-b border-[#18334F] last:border-b-0"
                        >
                          <td className="px-5 py-3.5 font-mono text-[12px] font-medium text-[#E6EEF7]">
                            {object.name}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="inline-flex rounded-lg border border-[#214260] bg-[#07182B] p-1">
                              {(['Y', 'N'] as IngestionStatus[]).map((value) => {
                                const active = object.status === value
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() =>
                                      setObjectStatus(object.name, value)
                                    }
                                    className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                      active
                                        ? value === 'Y'
                                          ? 'bg-[#18C7A0]/20 text-[#55E0BF]'
                                          : 'bg-[#FF647C]/20 text-[#FF8A9C]'
                                        : 'text-[#8FA7BF] hover:text-[#F4F8FC]'
                                    }`}
                                  >
                                    {value === 'Y' ? 'Enable' : 'Disable'}
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#18334F] bg-[#07182B]/50 px-6 py-4">
              <span className="text-[11px] text-[#8FA7BF]">
                {changedObjects.length === 0
                  ? 'No pending changes'
                  : `${changedObjects.length} pending ${
                      changedObjects.length === 1 ? 'change' : 'changes'
                    }`}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeUpdateIngestion}
                  disabled={saving}
                  className="rounded-lg border border-[#214260] px-4 py-2 text-[12px] font-semibold text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void updateIngestion()}
                  disabled={
                    saving || loading || changedObjects.length === 0
                  }
                  className="rounded-lg bg-[#1683FF] px-5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2D91FF] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Updating…' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: 'text' | 'number'
  required?: boolean
}) {
  const id = `add-table-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]"
      >
        {label}
        {required && <span className="ml-1 text-[#2DA8FF]">*</span>}
      </label>
      <input
        id={id}
        type={type}
        min={type === 'number' ? 0 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-10 w-full rounded-lg border border-[#214260] bg-[#07182B] px-3 text-[12px] text-[#F4F8FC] outline-none transition-colors placeholder:text-[#526B84] focus:border-[#1683FF]"
      />
    </div>
  )
}

function MDFCardIcon({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg
        width="21"
        height="21"
        viewBox="0 0 21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 5.5h14M3.5 10.5h14M3.5 15.5h14" />
        <circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="13" cy="10.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="9" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (index === 1) {
    return (
      <svg
        width="21"
        height="21"
        viewBox="0 0 21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse cx="10.5" cy="5" rx="6" ry="2.5" />
        <path d="M4.5 5v5c0 1.4 2.7 2.5 6 2.5M4.5 10v5c0 1.4 2.7 2.5 6 2.5" />
        <path d="M15.5 12v6M12.5 15h6" />
      </svg>
    )
  }
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 21 21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6.5h13M4 14.5h13" />
      <circle cx="8" cy="6.5" r="2.5" fill="#0C233D" />
      <circle cx="13" cy="14.5" r="2.5" fill="#0C233D" />
    </svg>
  )
}

function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const treatment =
    status === 'Success'
      ? 'border-[#18C7A0]/30 bg-[#18C7A0]/10 text-[#55E0BF]'
      : status === 'Failed'
        ? 'border-[#FF647C]/30 bg-[#FF647C]/10 text-[#FF8A9C]'
        : 'border-[#F5A623]/30 bg-[#F5A623]/10 text-[#FFD166]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${treatment}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}
