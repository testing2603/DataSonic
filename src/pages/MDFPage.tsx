import { useEffect, useState } from 'react'

type IngestionStatus = 'Y' | 'N'

interface IngestionObject {
  name: string
  status: IngestionStatus
  initialStatus: IngestionStatus
}

type AuditStatus = 'Success' | 'Failed' | 'Processing'

interface AuditRecord {
  auditId: string
  pipelineRunId: string
  pipelineId: string
  objectId: string
  sourceId: string
  runStatus: AuditStatus
  startTime: string
  endTime: string
  recordsExtracted: string
  recordsWritten: string
  failures: string
  failureReason: string
  sourceName: string
  targetPath: string
  dateCreated: string
  retryCount: string
  functionInstanceId: string
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

interface SourceConfigForm {
  sourceId: string
  sourceName: string
  sourceType: string
  connectionDetailsJson: string
  loadType: string
  connectionKv: string
  maxRetryAttemptsSource: string
  isActive: IngestionStatus
  ownedByTeam: string
}

const emptySourceConfigForm: SourceConfigForm = {
  sourceId: '',
  sourceName: '',
  sourceType: '',
  connectionDetailsJson: '',
  loadType: '',
  connectionKv: '',
  maxRetryAttemptsSource: '',
  isActive: 'Y',
  ownedByTeam: 'data engineering',
}

interface PipelineConfigForm {
  pipelineId: string
  pipelineName: string
  maxConcurrentRuns: string
  activeFlag: IngestionStatus
  notificationEmail: string
  alertOnEmpty: IngestionStatus
  iterateOverAllObjects: IngestionStatus
}

const emptyPipelineConfigForm: PipelineConfigForm = {
  pipelineId: '',
  pipelineName: '',
  maxConcurrentRuns: '',
  activeFlag: 'Y',
  notificationEmail: '',
  alertOnEmpty: 'N',
  iterateOverAllObjects: 'N',
}

type AddTableTab = 'object' | 'source' | 'pipeline'

const AUDIT_COLS: { key: string; label: string; mono?: boolean }[] = [
  { key: 'auditId', label: 'Audit ID', mono: true },
  { key: 'pipelineRunId', label: 'Pipeline Run ID', mono: true },
  { key: 'pipelineId', label: 'Pipeline ID' },
  { key: 'objectId', label: 'Object ID' },
  { key: 'sourceId', label: 'Source ID' },
  { key: 'runStatus', label: 'Status' },
  { key: 'startTime', label: 'Start Time' },
  { key: 'endTime', label: 'End Time' },
  { key: 'recordsExtracted', label: 'Records Extracted' },
  { key: 'recordsWritten', label: 'Records Written' },
  { key: 'failureReason', label: 'Failure Reason' },
  { key: 'sourceName', label: 'Source Name' },
  { key: 'targetPath', label: 'Target Path' },
  { key: 'dateCreated', label: 'Date Created' },
  { key: 'retryCount', label: 'Retry Count' },
  { key: 'functionInstanceId', label: 'Function Instance ID', mono: true },
]

const frameworkAreas = [
  {
    label: 'Execution History',
    description: 'Review framework runs, statuses, and execution details.',
  },
  {
    label: 'Add Record',
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

function str(val: unknown): string {
  if (val === null || val === undefined) return '—'
  return String(val)
}

function normalizeAuditRecord(row: Record<string, unknown>): AuditRecord {
  const rawStatus = String(row.run_status ?? row.RUN_STATUS ?? '').toUpperCase()
  const runStatus: AuditStatus =
    rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETED')
      ? 'Success'
      : rawStatus.includes('FAIL') || rawStatus.includes('ERROR')
        ? 'Failed'
        : 'Processing'

  return {
    auditId: str(row.AUDIT_ID ?? row.audit_id),
    pipelineRunId: str(row.pipeline_run_id ?? row.PIPELINE_RUN_ID),
    pipelineId: str(row.pipeline_id ?? row.PIPELINE_ID),
    objectId: str(row.object_id ?? row.OBJECT_ID),
    sourceId: str(row.source_id ?? row.SOURCE_ID),
    runStatus,
    startTime: str(row.start_time ?? row.START_TIME),
    endTime: str(row.end_time ?? row.END_TIME),
    recordsExtracted: str(row.records_extracted ?? row.RECORDS_EXTRACTED),
    recordsWritten: str(row.records_written ?? row.RECORDS_WRITTEN),
    failures: str(row.Failures ?? row.failures ?? row.FAILURES),
    failureReason: str(row.FailureReason ?? row.failureReason ?? row.FAILUREREASON),
    sourceName: str(row.source_name ?? row.SOURCE_NAME),
    targetPath: str(row.target_path ?? row.TARGET_PATH),
    dateCreated: str(row.date_created ?? row.DATE_CREATED),
    retryCount: str(row.retry_count ?? row.RETRY_COUNT),
    functionInstanceId: str(row.function_instance_id ?? row.FUNCTION_INSTANCE_ID),
  }
}

function formatAuditDate(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function MDFPage() {
  const [showPipelineDialog, setShowPipelineDialog] = useState(false)
  const [pipelineForm, setPipelineForm] = useState({ pipelineId: 'PL_Full_Load', pipelineRetry: '3' })
  const [executingPipeline, setExecutingPipeline] = useState(false)
  const [pipelineExecutionMessage, setPipelineExecutionMessage] = useState('')
  const [pipelineExecutionError, setPipelineExecutionError] = useState('')
  const [showExecutionHistory, setShowExecutionHistory] = useState(false)
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [showAddTable, setShowAddTable] = useState(false)
  const [addTableTab, setAddTableTab] = useState<AddTableTab>('object')
  const [addTableForm, setAddTableForm] =
    useState<AddTableForm>(emptyAddTableForm)
  const [sourceConfigForm, setSourceConfigForm] =
    useState<SourceConfigForm>(emptySourceConfigForm)
  const [pipelineConfigForm, setPipelineConfigForm] =
    useState<PipelineConfigForm>(emptyPipelineConfigForm)
  const [addingTable, setAddingTable] = useState(false)
  const [addTableError, setAddTableError] = useState('')
  const [addTableSuccess, setAddTableSuccess] = useState('')
  const [availableSources, setAvailableSources] = useState<{ source_id: string; source_name: string }[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [showUpdateIngestion, setShowUpdateIngestion] = useState(false)
  const [objects, setObjects] = useState<IngestionObject[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const changedObjects = objects.filter(
    (object) => object.status !== object.initialStatus,
  )

  function openPipelineDialog() {
    setPipelineForm({ pipelineId: 'PL_Full_Load', pipelineRetry: '3' })
    setPipelineExecutionMessage('')
    setPipelineExecutionError('')
    setShowPipelineDialog(true)
  }

  async function executePipeline() {
    if (executingPipeline) return
    setExecutingPipeline(true)
    setPipelineExecutionMessage('')
    setPipelineExecutionError('')

    try {
      const response = await fetch('/api/mdf/execute-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_id: pipelineForm.pipelineId,
          pipeline_retry: parseInt(pipelineForm.pipelineRetry, 10) || 3,
        }),
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
      setShowPipelineDialog(false)
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
        .map((row, _i) => normalizeAuditRecord(row))
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

  async function loadSources() {
    setSourcesLoading(true)
    try {
      const response = await fetch('/api/mdf/sources')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.json()
      setAvailableSources(body.sources ?? [])
    } catch {
      setAvailableSources([])
    } finally {
      setSourcesLoading(false)
    }
  }

  function openAddTable() {
    setAddTableTab('object')
    setAddTableForm(emptyAddTableForm)
    setSourceConfigForm(emptySourceConfigForm)
    setPipelineConfigForm(emptyPipelineConfigForm)
    setAddTableError('')
    setAddTableSuccess('')
    setShowAddTable(true)
    void loadSources()
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

  function updateSourceConfigField<K extends keyof SourceConfigForm>(
    field: K,
    value: SourceConfigForm[K],
  ) {
    setSourceConfigForm((current) => ({ ...current, [field]: value }))
    setAddTableError('')
    setAddTableSuccess('')
  }

  async function submitSourceConfig(event: React.FormEvent<HTMLFormElement>) {
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
      const response = await fetch('/api/mdf/source-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: nullable(sourceConfigForm.sourceId),
          source_name: nullable(sourceConfigForm.sourceName),
          source_type: nullable(sourceConfigForm.sourceType),
          connection_details_json: nullable(sourceConfigForm.connectionDetailsJson),
          load_type: nullable(sourceConfigForm.loadType),
          connection_kv: nullable(sourceConfigForm.connectionKv),
          max_retry_attempts_source: sourceConfigForm.maxRetryAttemptsSource.trim()
            ? Number(sourceConfigForm.maxRetryAttemptsSource)
            : null,
          is_active: sourceConfigForm.isActive,
          owned_by_team: sourceConfigForm.ownedByTeam.trim() || 'data engineering',
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not add the source config (HTTP ${response.status}).`,
        )
      }

      setAddTableSuccess(
        `${sourceConfigForm.sourceName.trim() || sourceConfigForm.sourceId.trim()} was added successfully.`,
      )
      setSourceConfigForm(emptySourceConfigForm)
    } catch (submitError) {
      setAddTableError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not add the source config to Fabric.',
      )
    } finally {
      setAddingTable(false)
    }
  }

  function updatePipelineConfigField<K extends keyof PipelineConfigForm>(
    field: K,
    value: PipelineConfigForm[K],
  ) {
    setPipelineConfigForm((current) => ({ ...current, [field]: value }))
    setAddTableError('')
    setAddTableSuccess('')
  }

  async function submitPipelineConfig(event: React.FormEvent<HTMLFormElement>) {
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
      const response = await fetch('/api/mdf/pipeline-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_id: nullable(pipelineConfigForm.pipelineId),
          pipeline_name: nullable(pipelineConfigForm.pipelineName),
          max_concurrent_runs: pipelineConfigForm.maxConcurrentRuns.trim()
            ? Number(pipelineConfigForm.maxConcurrentRuns)
            : null,
          active_flag: pipelineConfigForm.activeFlag,
          notification_email: nullable(pipelineConfigForm.notificationEmail),
          alert_on_empty: pipelineConfigForm.alertOnEmpty,
          iterate_over_all_objects: pipelineConfigForm.iterateOverAllObjects,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error ??
            body?.message ??
            `Could not add the pipeline config (HTTP ${response.status}).`,
        )
      }

      setAddTableSuccess(
        `${pipelineConfigForm.pipelineName.trim() || pipelineConfigForm.pipelineId.trim()} was added successfully.`,
      )
      setPipelineConfigForm(emptyPipelineConfigForm)
    } catch (submitError) {
      setAddTableError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not add the pipeline config to Fabric.',
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
    if (!showExecutionHistory && !showUpdateIngestion && !showAddTable && !showPipelineDialog) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showPipelineDialog && !executingPipeline) setShowPipelineDialog(false)
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
              onClick={openPipelineDialog}
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
            const isAddTable = area.label === 'Add Record'
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

      {showPipelineDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020A14]/80 p-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !executingPipeline) setShowPipelineDialog(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[#214260] bg-[#0A1B31] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-start justify-between border-b border-[#18334F] px-6 py-5">
              <div>
                <div className="text-[17px] font-semibold text-[#F4F8FC]">Execute Pipeline</div>
                <p className="mt-1 text-[12px] text-[#8FA7BF]">
                  Configure and run DA_Orch_PL_Parent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPipelineDialog(false)}
                disabled={executingPipeline}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#214260] text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 p-6">
              {pipelineExecutionError && (
                <div className="rounded-lg border border-[#FF647C]/30 bg-[#492431]/70 px-4 py-3 text-[12px] text-[#FF8A9C]">
                  {pipelineExecutionError}
                </div>
              )}

              <div>
                <label htmlFor="pl-pipeline-id" className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                  Pipeline ID <span className="ml-1 text-[#2DA8FF]">*</span>
                </label>
                <select
                  id="pl-pipeline-id"
                  value={pipelineForm.pipelineId}
                  onChange={(e) => setPipelineForm((f) => ({ ...f, pipelineId: e.target.value }))}
                  disabled={executingPipeline}
                  className="h-10 w-full rounded-lg border border-[#214260] bg-[#07182B] px-3 text-[12px] text-[#F4F8FC] outline-none transition-colors focus:border-[#1683FF] appearance-none disabled:opacity-50"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238FA7BF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="PL_Full_Load">PL_Full_Load</option>
                  <option value="PL_Incremental_Load">PL_Incremental_Load</option>
                </select>
              </div>

              <div>
                <label htmlFor="pl-retry" className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                  Pipeline Retry <span className="ml-1 text-[#2DA8FF]">*</span>
                </label>
                <input
                  id="pl-retry"
                  type="number"
                  min={0}
                  max={10}
                  value={pipelineForm.pipelineRetry}
                  onChange={(e) => setPipelineForm((f) => ({ ...f, pipelineRetry: e.target.value }))}
                  disabled={executingPipeline}
                  className="h-10 w-full rounded-lg border border-[#214260] bg-[#07182B] px-3 text-[12px] text-[#F4F8FC] outline-none transition-colors focus:border-[#1683FF] disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#18334F] bg-[#07182B]/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowPipelineDialog(false)}
                disabled={executingPipeline}
                className="rounded-lg border border-[#214260] px-4 py-2 text-[12px] font-semibold text-[#8FA7BF] transition-colors hover:bg-[#102B48] hover:text-[#F4F8FC] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executePipeline()}
                disabled={executingPipeline}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1683FF] px-5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#2D91FF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {executingPipeline ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2.5l7 4.5-7 4.5v-9z" />
                  </svg>
                )}
                {executingPipeline ? 'Executing…' : 'Execute'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            className="flex max-h-[90vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[#214260] bg-[#0A1B31] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
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

              <div className="overflow-x-auto rounded-xl border border-[#214260]">
                <table className="w-full min-w-[1400px]">
                  <thead className="sticky top-0 z-10 bg-[#07182B]">
                    <tr className="border-b border-[#214260]">
                      {AUDIT_COLS.map((col) => (
                        <th
                          key={col.key}
                          className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[#8FA7BF]"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-[#102B48]/60">
                    {auditLoading ? (
                      <tr>
                        <td
                          colSpan={AUDIT_COLS.length}
                          className="px-5 py-14 text-center text-[12px] text-[#8FA7BF]"
                        >
                          Loading audit logs from Fabric…
                        </td>
                      </tr>
                    ) : auditRecords.length === 0 ? (
                      <tr>
                        <td
                          colSpan={AUDIT_COLS.length}
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
                          key={`${record.auditId}-${index}`}
                          className="border-b border-[#18334F] last:border-b-0 hover:bg-[#1683FF]/5"
                        >
                          {AUDIT_COLS.map((col) => {
                            const value = record[col.key as keyof AuditRecord]
                            if (col.key === 'runStatus') {
                              return (
                                <td key={col.key} className="px-3 py-3">
                                  <AuditStatusBadge status={record.runStatus} />
                                </td>
                              )
                            }
                            if (col.key === 'startTime' || col.key === 'endTime' || col.key === 'dateCreated') {
                              return (
                                <td key={col.key} className="whitespace-nowrap px-3 py-3 text-[11px] text-[#8FA7BF]">
                                  {formatAuditDate(value)}
                                </td>
                              )
                            }
                            return (
                              <td
                                key={col.key}
                                className={`max-w-48 truncate px-3 py-3 text-[11px] ${col.mono ? 'font-mono font-medium text-[#2DA8FF]' : 'text-[#E6EEF7]'}`}
                                title={value}
                              >
                                {value}
                              </td>
                            )
                          })}
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
            <div className="border-b border-[#18334F]">
              <div className="flex items-start justify-between px-6 pt-5 pb-4">
                <div>
                  <div
                    id="add-table-title"
                    className="text-[17px] font-semibold text-[#F4F8FC]"
                  >
                    Add Record
                  </div>
                  <p className="mt-1 text-[12px] text-[#8FA7BF]">
                    Register a new record in the Fabric metadata store.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
              </div>
              <div className="flex gap-0 px-6">
                {([
                  { id: 'object' as AddTableTab, label: 'Object Config' },
                  { id: 'source' as AddTableTab, label: 'Source Config' },
                  { id: 'pipeline' as AddTableTab, label: 'Pipeline Config' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setAddTableTab(tab.id)
                      setAddTableError('')
                      setAddTableSuccess('')
                    }}
                    className={`relative px-4 py-2.5 text-[12px] font-semibold transition-colors ${
                      addTableTab === tab.id
                        ? 'text-[#2DA8FF]'
                        : 'text-[#8FA7BF] hover:text-[#C4D4E5]'
                    }`}
                  >
                    {tab.label}
                    {addTableTab === tab.id && (
                      <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#1683FF]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {addTableTab === 'object' && (
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
                  <div>
                    <label
                      htmlFor="add-table-source-id"
                      className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]"
                    >
                      Source ID
                      <span className="ml-1 text-[#2DA8FF]">*</span>
                    </label>
                    <select
                      id="add-table-source-id"
                      value={addTableForm.sourceId}
                      onChange={(event) =>
                        updateAddTableField('sourceId', event.target.value)
                      }
                      required
                      disabled={sourcesLoading}
                      className="h-10 w-full rounded-lg border border-[#214260] bg-[#07182B] px-3 text-[12px] text-[#F4F8FC] outline-none transition-colors focus:border-[#1683FF] appearance-none disabled:opacity-50"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238FA7BF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                    >
                      <option value="" disabled className="text-[#526B84]">
                        {sourcesLoading ? 'Loading sources…' : 'Select a source'}
                      </option>
                      {availableSources.map((src) => (
                        <option key={src.source_id} value={src.source_id}>
                          {src.source_id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="add-table-pipeline-id"
                      className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]"
                    >
                      Pipeline ID
                      <span className="ml-1 text-[#2DA8FF]">*</span>
                    </label>
                    <select
                      id="add-table-pipeline-id"
                      value={addTableForm.pipelineId}
                      onChange={(event) =>
                        updateAddTableField('pipelineId', event.target.value)
                      }
                      required
                      className="h-10 w-full rounded-lg border border-[#214260] bg-[#07182B] px-3 text-[12px] text-[#F4F8FC] outline-none transition-colors focus:border-[#1683FF] appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238FA7BF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                    >
                      <option value="" disabled className="text-[#526B84]">
                        Select pipeline type
                      </option>
                      <option value="PL_Full_Load">PL_Full_Load</option>
                      <option value="PL_Incremental_Load">PL_Incremental_Load</option>
                    </select>
                  </div>
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
            )}

            {addTableTab === 'source' && (
            <form
              onSubmit={(event) => void submitSourceConfig(event)}
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
                    label="Source ID"
                    value={sourceConfigForm.sourceId}
                    onChange={(value) => updateSourceConfigField('sourceId', value)}
                    placeholder="e.g. SRC-001"
                    required
                  />
                  <FormField
                    label="Source Name"
                    value={sourceConfigForm.sourceName}
                    onChange={(value) => updateSourceConfigField('sourceName', value)}
                    placeholder="e.g. Marine Policy System"
                    required
                  />
                  <FormField
                    label="Source Type"
                    value={sourceConfigForm.sourceType}
                    onChange={(value) => updateSourceConfigField('sourceType', value)}
                    placeholder="e.g. SQL Server, API, File"
                  />
                  <FormField
                    label="Load Type"
                    value={sourceConfigForm.loadType}
                    onChange={(value) => updateSourceConfigField('loadType', value)}
                    placeholder="e.g. Full, Incremental"
                  />
                  <FormField
                    label="Connection KV"
                    value={sourceConfigForm.connectionKv}
                    onChange={(value) => updateSourceConfigField('connectionKv', value)}
                    placeholder="Key Vault reference"
                  />
                  <FormField
                    label="Max Retry Attempts"
                    value={sourceConfigForm.maxRetryAttemptsSource}
                    onChange={(value) => updateSourceConfigField('maxRetryAttemptsSource', value)}
                    placeholder="e.g. 3"
                    type="number"
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
                          onClick={() => updateSourceConfigField('isActive', value)}
                          className={`rounded-md px-4 text-[11px] font-semibold transition-colors ${
                            sourceConfigForm.isActive === value
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
                    label="Owned By Team"
                    value={sourceConfigForm.ownedByTeam}
                    onChange={(value) => updateSourceConfigField('ownedByTeam', value)}
                    placeholder="data engineering"
                  />
                  <div className="md:col-span-2">
                    <label
                      htmlFor="src-connection-details"
                      className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]"
                    >
                      Connection Details JSON
                    </label>
                    <textarea
                      id="src-connection-details"
                      value={sourceConfigForm.connectionDetailsJson}
                      onChange={(event) =>
                        updateSourceConfigField('connectionDetailsJson', event.target.value)
                      }
                      rows={3}
                      placeholder='{"host":"...","port":1433,"database":"..."}'
                      className="w-full resize-none rounded-lg border border-[#214260] bg-[#07182B] px-3 py-2.5 text-[12px] text-[#F4F8FC] outline-none transition-colors placeholder:text-[#526B84] focus:border-[#1683FF]"
                    />
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-[#214260] bg-[#07182B]/60 px-4 py-3 text-[11px] leading-5 text-[#8FA7BF]">
                  <span className="font-semibold text-[#16C7D9]">CREATED_DATE</span> and{' '}
                  <span className="font-semibold text-[#16C7D9]">MODIFIED_DATE</span>{' '}
                  are set automatically. <span className="font-semibold text-[#16C7D9]">OWNED_BY_TEAM</span>{' '}
                  defaults to &ldquo;data engineering&rdquo;.
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
            )}

            {addTableTab === 'pipeline' && (
            <form
              onSubmit={(event) => void submitPipelineConfig(event)}
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
                    label="Pipeline ID"
                    value={pipelineConfigForm.pipelineId}
                    onChange={(value) => updatePipelineConfigField('pipelineId', value)}
                    placeholder="e.g. PL_Full_Load"
                    required
                  />
                  <FormField
                    label="Pipeline Name"
                    value={pipelineConfigForm.pipelineName}
                    onChange={(value) => updatePipelineConfigField('pipelineName', value)}
                    placeholder="e.g. Full Load Pipeline"
                    required
                  />
                  <FormField
                    label="Max Concurrent Runs"
                    value={pipelineConfigForm.maxConcurrentRuns}
                    onChange={(value) => updatePipelineConfigField('maxConcurrentRuns', value)}
                    placeholder="e.g. 5"
                    type="number"
                  />
                  <FormField
                    label="Notification Email"
                    value={pipelineConfigForm.notificationEmail}
                    onChange={(value) => updatePipelineConfigField('notificationEmail', value)}
                    placeholder="e.g. team@example.com"
                  />
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                      Active Flag
                      <span className="ml-1 text-[#2DA8FF]">*</span>
                    </label>
                    <div className="inline-flex h-10 rounded-lg border border-[#214260] bg-[#07182B] p-1">
                      {(['Y', 'N'] as IngestionStatus[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updatePipelineConfigField('activeFlag', value)}
                          className={`rounded-md px-4 text-[11px] font-semibold transition-colors ${
                            pipelineConfigForm.activeFlag === value
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
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                      Alert On Empty
                    </label>
                    <div className="inline-flex h-10 rounded-lg border border-[#214260] bg-[#07182B] p-1">
                      {(['Y', 'N'] as IngestionStatus[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updatePipelineConfigField('alertOnEmpty', value)}
                          className={`rounded-md px-4 text-[11px] font-semibold transition-colors ${
                            pipelineConfigForm.alertOnEmpty === value
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
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold text-[#B8C8D9]">
                      Iterate Over All Objects
                    </label>
                    <div className="inline-flex h-10 rounded-lg border border-[#214260] bg-[#07182B] p-1">
                      {(['Y', 'N'] as IngestionStatus[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updatePipelineConfigField('iterateOverAllObjects', value)}
                          className={`rounded-md px-4 text-[11px] font-semibold transition-colors ${
                            pipelineConfigForm.iterateOverAllObjects === value
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
                </div>

                <div className="mt-5 rounded-lg border border-[#214260] bg-[#07182B]/60 px-4 py-3 text-[11px] leading-5 text-[#8FA7BF]">
                  <span className="font-semibold text-[#16C7D9]">CREATED_DATE</span> is set automatically.{' '}
                  <span className="font-semibold text-[#16C7D9]">LAST_MODIFIED</span> is set to the current
                  timestamp on insert (or <span className="font-mono font-semibold text-[#16C7D9]">NULL</span> if not applicable).
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
            )}
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
