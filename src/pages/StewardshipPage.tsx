import SchemaDriftPage from './SchemaDriftPage'
import MDMPage from './MDMPage'
import type { AppNotification } from '../App'

export type StewardTab = 'schema-drift' | 'mdm'

interface Props {
  tab: StewardTab
  onTabChange: (t: StewardTab) => void
  onNotify: (n: AppNotification) => void
}

export default function StewardshipPage({ tab, onTabChange, onNotify }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="px-6 flex-shrink-0 flex items-end gap-0" style={{ background: '#081A2E', borderBottom: '1px solid #18334F' }}>
        {([
          { id: 'schema-drift' as StewardTab, label: 'Schema Drift' },
          { id: 'mdm' as StewardTab, label: 'MDM' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors"
            style={tab === t.id
              ? { borderColor: '#1683FF', color: '#2DA8FF' }
              : { borderColor: 'transparent', color: '#8FA7BF' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'schema-drift' ? <SchemaDriftPage onNotify={onNotify} /> : <MDMPage onNotify={onNotify} />}
      </div>
    </div>
  )
}
