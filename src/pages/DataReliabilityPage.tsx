import type React from 'react'

const checks = [
  { id: 'CHK-0881', rule: 'Loss date must not be in the future', lob: 'Marine', status: 'Passing', lastRun: '14 Sep 2025, 10:48', failures: 0, total: 47 },
  { id: 'CHK-0880', rule: 'Policy effective date must precede expiry', lob: 'Property', status: 'Passing', lastRun: '14 Sep 2025, 10:48', failures: 0, total: 312 },
  { id: 'CHK-0879', rule: 'Premium value must be positive', lob: 'Multi-LOB', status: 'Warning', lastRun: '14 Sep 2025, 10:48', failures: 3, total: 572 },
  { id: 'CHK-0878', rule: 'Policy number — CDR mandatory field', lob: 'Aviation', status: 'Failing', lastRun: '14 Sep 2025, 09:00', failures: 12, total: 12 },
  { id: 'CHK-0877', rule: 'Claim reference uniqueness constraint', lob: 'Health', status: 'Passing', lastRun: '14 Sep 2025, 08:55', failures: 0, total: 88 },
]

const statusStyle: Record<string, React.CSSProperties> = {
  Passing: { background: '#103E3A', color: '#18C7A0', border: '1px solid rgba(24,199,160,0.3)' },
  Warning: { background: '#493715', color: '#F5A623', border: '1px solid rgba(245,166,35,0.3)' },
  Failing: { background: '#492431', color: '#FF647C', border: '1px solid rgba(255,100,124,0.3)' },
}

export default function DataReliabilityPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: '#F4F8FC' }}>Data Reliability Agent</h1>
        <p className="text-[13px] max-w-2xl" style={{ color: '#8FA7BF', lineHeight: '1.75' }}>
          Continuously monitors every pipeline stage for data quality anomalies — volume drops, null spikes, schema breaks, and SLA breaches.
          Rules fire automatically; clean passes flow through, while violations surface to the stewardship queue with full context for human review.
          Self-healing routines attempt safe auto-fixes before escalating, keeping downstream consumers uninterrupted.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Checks Passing', value: '94.1%', color: '#18C7A0' },
          { label: 'Active Rules', value: '127', color: '#F4F8FC' },
          { label: 'Warnings', value: '4', color: '#F5A623' },
          { label: 'Failing', value: '2', color: '#FF647C' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ background: '#102B48', borderColor: '#214260' }}>
            <div className="text-2xl font-bold mb-0.5" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[12px]" style={{ color: '#8FA7BF' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border" style={{ background: '#102B48', borderColor: '#214260' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #18334F' }}>
          <h2 className="text-[14px] font-semibold" style={{ color: '#F4F8FC' }}>Validation Rules</h2>
          <span className="text-[11px]" style={{ color: '#8FA7BF' }}>Auto-refresh every 60s</span>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid #18334F' }}>
              {['Check ID', 'Validation Rule', 'LOB', 'Status', 'Failures', 'Records', 'Last Run'].map((h) => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wide px-5 py-3" style={{ color: '#8FA7BF' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id} className="transition-colors" style={{ borderBottom: '1px solid #18334F' }}>
                <td className="px-5 py-3.5 font-mono text-[11px] font-medium" style={{ color: '#2DA8FF' }}>{c.id}</td>
                <td className="px-5 py-3.5 text-[13px]" style={{ color: '#F4F8FC' }}>{c.rule}</td>
                <td className="px-5 py-3.5 text-[12px]" style={{ color: '#8FA7BF' }}>{c.lob}</td>
                <td className="px-5 py-3.5">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={statusStyle[c.status]}>{c.status}</span>
                </td>
                <td className="px-5 py-3.5 font-mono text-[12px] font-bold" style={{ color: c.failures > 0 ? '#FF647C' : '#18C7A0' }}>
                  {c.failures}
                </td>
                <td className="px-5 py-3.5 font-mono text-[12px]" style={{ color: '#8FA7BF' }}>{c.total.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-[11px]" style={{ color: '#8FA7BF' }}>{c.lastRun}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
