import { useState, useEffect, useRef } from 'react'
import type { Page, AppNotification } from '../App'

interface Props {
  onNavigate: (page: Page) => void
  onNotify: (n: AppNotification) => void
}

// Ordered pipeline flow
const pipeline: {
  id: Page; label: string; sublabel: string; color: string; bg: string; short: string; desc: string; detail: string
  icon: React.ReactNode
}[] = [
  {
    id: 'ingestion',
    label: 'Document Ingestion',
    sublabel: 'Ingest',
    short: 'Ingest',
    color: '#2DA8FF',
    bg: '#0D2E52',
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 15V7M11 7l-3 3M11 7l3 3" /><path d="M4 18h14" />
        <rect x="2" y="2" width="18" height="18" rx="3" opacity="0.25" />
      </svg>
    ),
    desc: 'Upload PDFs, spreadsheets, and emails from brokers and MGAs.',
    detail: 'AI classifies and routes every document to the correct line of business automatically — zero manual triage.',
  },
  {
    id: 'stewardship',
    label: 'Stewardship Review',
    sublabel: 'Schema / MDM',
    short: 'Stewardship',
    color: '#F5A623',
    bg: '#3D2A0A',
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 3l8 4v5c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V7l8-4z" />
        <path d="M8 11l2 2 4-4" />
      </svg>
    ),
    desc: 'Review schema changes and master data governance before data moves downstream.',
    detail: 'Full audit trail with CDR compliance tagging, multi-stage approvals, and MDM entity resolution.',
  },
  {
    id: 'data-engineering',
    label: 'Data Engineering',
    sublabel: 'Bronze → Gold',
    short: 'Bronze→Gold',
    color: '#18C7A0',
    bg: '#0A3530',
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="11" cy="6" rx="8" ry="3" />
        <path d="M3 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M3 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" />
      </svg>
    ),
    desc: 'Transform raw ingested data through Bronze, Silver, and Gold medallion layers.',
    detail: 'Structured pipelines ensure clean, validated, and analytics-ready datasets across all LOBs.',
  },
  {
    id: 'reporting',
    label: 'Insights & Reporting',
    sublabel: 'Analytics',
    short: 'Insights',
    color: '#A875FF',
    bg: '#251845',
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17V11l4-4 4 4 4-6 4 4v8H3z" strokeLinejoin="round" />
      </svg>
    ),
    desc: 'Embedded dashboards deliver live insurance analytics, KPIs, and trend views.',
    detail: 'Slice by LOB, broker, date range — from loss ratios to premium trends in one click.',
  },
  {
    id: 'ai-chat',
    label: 'AI Data Assistant',
    sublabel: 'Ask AI',
    short: 'Ask AI',
    color: '#16C7D9',
    bg: '#082B32',
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="11" y1="2" x2="11" y2="5" /><circle cx="11" cy="1.5" r="1.2" fill="currentColor" stroke="none" />
        <rect x="3" y="5" width="16" height="10" rx="3" />
        <circle cx="8" cy="10" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="14" cy="10" r="1.4" fill="currentColor" stroke="none" />
        <path d="M8 13.5h6" strokeWidth="1.3" />
        <line x1="3" y1="9.5" x2="1.5" y2="9.5" strokeWidth="1.8" />
        <line x1="19" y1="9.5" x2="20.5" y2="9.5" strokeWidth="1.8" />
      </svg>
    ),
    desc: 'Query your entire data engine in plain English — no SQL required.',
    detail: 'Powered by Claude. Ask about ingestion status, quality scores, schema history, or anomalies.',
  },
]

// ── Hex flow helpers ──────────────────
const CX = 300, CY = 300, R = 205
const HEX_ANGLES = [-90, -18, 54, 126, 198]
function hexPt(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}
type PipelineStep = { id: Page; label: string; sublabel: string; color: string; bg: string; short: string; desc: string; detail: string; icon: React.ReactNode }

function HexFlow({ pipeline, tooltip, setTooltip, onNavigate }: {
  pipeline: PipelineStep[]; tooltip: string | null
  setTooltip: (v: string | null) => void; onNavigate: (p: Page) => void
}) {
  return (
    <div className="relative" style={{ width: 600, height: 600 }}>
      <svg width="600" height="600" viewBox="0 0 600 600" className="absolute inset-0 pointer-events-none">
        <defs>
          <radialGradient id="hexCenterGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1683FF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1683FF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R + 18} fill="none" stroke="#1683FF" strokeWidth="0.5" opacity="0.12" />
        <circle cx={CX} cy={CY} r="78" fill="none" stroke="#1683FF" strokeWidth="0.6"
          strokeDasharray="4 7" opacity="0.35" style={{ animation: 'dashFlow 8s linear infinite' }} />
        {HEX_ANGLES.map((ang, i) => {
          const p = hexPt(ang)
          return <line key={`spoke-${i}`} x1={CX} y1={CY} x2={p.x} y2={p.y}
            stroke={pipeline[i].color} strokeWidth="0.7" strokeDasharray="3 6" opacity="0.18" />
        })}
        {HEX_ANGLES.map((ang, i) => {
          const p1 = hexPt(ang), p2 = hexPt(HEX_ANGLES[(i + 1) % HEX_ANGLES.length])
          return <line key={`edge-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={pipeline[i].color} strokeWidth="1.3" strokeDasharray="6 8" opacity="0.4"
            style={{ animation: `dashFlow ${1.4 + i * 0.18}s linear infinite` }} />
        })}
        <circle cx={CX} cy={CY} r="98" fill="url(#hexCenterGlow)" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center rounded-full"
        style={{ left: CX - 62, top: CY - 62, width: 124, height: 124, background: 'radial-gradient(circle, #0D2040 0%, #061426 100%)', border: '1.5px solid #1683FF44', boxShadow: '0 0 28px #1683FF22' }}>
        <div className="text-[16px] font-extrabold tracking-widest text-center leading-tight" style={{ color: '#2DA8FF' }}>IDP</div>
      </div>
      {pipeline.map((step, i) => {
        const ang = HEX_ANGLES[i]
        const { x, y } = hexPt(ang)
        const isActive = tooltip === step.id
        const ttAngle = ang * Math.PI / 180
        const ttRight = Math.cos(ttAngle) > 0.3
        const ttLeft  = Math.cos(ttAngle) < -0.3
        const ttBelow = Math.sin(ttAngle) > 0.3
        return (
          <div key={step.id} className="absolute flex flex-col items-center cursor-pointer"
            style={{ left: x, top: y, transform: 'translate(-50%, -50%)', zIndex: 10 }}
            onMouseEnter={() => setTooltip(step.id)}
            onMouseLeave={() => setTooltip(null)}
            onClick={() => onNavigate(step.id)}
          >
            {isActive && (
              <div className="absolute rounded-full pointer-events-none"
                style={{ width: 72, height: 72, border: `2px solid ${step.color}`, animation: 'pulseRing 1s ease-out infinite' }} />
            )}
            <div className="rounded-full flex items-center justify-center transition-all duration-200"
              style={{ width: 64, height: 64, background: isActive ? step.bg : '#091C30', border: `2px solid ${isActive ? step.color : step.color + '50'}`, color: step.color, boxShadow: isActive ? `0 0 20px ${step.color}55` : 'none', transform: isActive ? 'scale(1.12)' : 'scale(1)' }}>
              {step.icon}
            </div>
            <div className="mt-1.5 text-center" style={{ width: 90 }}>
              <div className="text-[10px] font-bold leading-tight text-center" style={{ color: isActive ? '#F4F8FC' : '#8FA7BF', transition: 'color 0.2s' }}>{step.short}</div>
            </div>
            {isActive && (
              <div className="absolute z-30 rounded-xl px-3 py-2.5 pointer-events-none text-left"
                style={{ width: 186, background: '#0D2040', border: `1px solid ${step.color}55`, boxShadow: `0 8px 32px #00000077, 0 0 12px ${step.color}22`, animation: 'scaleIn 0.15s ease',
                  ...(ttBelow ? { top: 66, left: '50%', transform: 'translateX(-50%)' }
                    : ttRight ? { left: 62, top: '50%', transform: 'translateY(-50%)' }
                    : ttLeft  ? { right: 62, top: '50%', transform: 'translateY(-50%)' }
                    : { bottom: 66, left: '50%', transform: 'translateX(-50%)' }) }}>
                <div className="text-[11px] font-bold mb-1" style={{ color: step.color }}>{step.label}</div>
                <div className="text-[10px] leading-relaxed" style={{ color: '#8FA7BF' }}>{step.desc}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

export default function LandingPage({ onNavigate }: Props) {
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [heroVisible, setHeroVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const flowSection = useInView()
  const cardsSection = useInView()

  useEffect(() => { const t = setTimeout(() => setHeroVisible(true), 80); return () => clearTimeout(t) }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 300)
    el.addEventListener('scroll', onScroll); return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  const scrollTop = () => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div ref={containerRef} className="relative overflow-y-auto h-full">

      {/* Sticky in-page nav */}
      <nav className="sticky top-0 z-20 flex items-center justify-center gap-1 py-2 px-4"
        style={{ background: 'rgba(6,20,38,0.88)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #18334F' }}>
        {[{ label: 'Overview', id: 'hero' }, { label: 'Engine Flow', id: 'flow' }, { label: 'Modules', id: 'modules' }].map(s => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            className="px-4 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
            style={{ color: '#8FA7BF' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F4F8FC')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8FA7BF')}
          >{s.label}</button>
        ))}
      </nav>

      {/* ── Hero ── */}
      <section id="hero" className="px-10 pt-14 pb-10 text-center">
        <div style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
          <h1 className="text-[38px] font-extrabold leading-tight mb-4"
            style={{
              background: 'linear-gradient(135deg, #F4F8FC 0%, #2DA8FF 40%, #16C7D9 70%, #18C7A0 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'gradientShift 5s ease infinite',
            }}>
            Adrosonic Intelligent Data Engine
          </h1>
          <p className="text-[15px] max-w-2xl mx-auto mb-8" style={{ color: '#8FA7BF', lineHeight: '1.85', letterSpacing: '0.01em' }}>
            An end-to-end data ecosystem that transforms raw, fragmented data into{' '}
            <span style={{ color: '#2DA8FF', fontWeight: 500 }}>trusted, governed, and analytics-ready insights</span>
            {' '}— unifying ingestion, schema governance, MDM, data engineering, AI, and reporting in one intelligent engine.
          </p>
          <div className="flex items-center justify-center gap-3 mb-10">
            <button onClick={() => onNavigate('ingestion')}
              className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #1683FF, #16C7D9)', boxShadow: '0 4px 20px #1683FF44' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
            >Start Ingesting →</button>
            <button onClick={() => scrollToSection('flow')}
              className="px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
              style={{ border: '1px solid #214260', color: '#8FA7BF' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#F4F8FC')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8FA7BF')}
            >Explore Engine</button>
          </div>
        </div>
      </section>

      {/* ── Hexagonal Flow ── */}
      <section id="flow" ref={flowSection.ref} className="px-8 py-10">
        <div className="text-center mb-8"
          style={{ opacity: flowSection.visible ? 1 : 0, transform: flowSection.visible ? 'none' : 'translateY(16px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}>
          <h2 className="text-[22px] font-bold mb-2" style={{ color: '#F4F8FC' }}>Engine Data Flow</h2>
          <p className="text-[13px]" style={{ color: '#8FA7BF' }}>Click any node to navigate — hover for details</p>
        </div>

        <div className="flex justify-center"
          style={{ opacity: flowSection.visible ? 1 : 0, transform: flowSection.visible ? 'none' : 'scale(0.92)', transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s' }}>
          <HexFlow pipeline={pipeline} tooltip={tooltip} setTooltip={setTooltip} onNavigate={onNavigate} />
        </div>

      </section>

      {/* ── Module Cards ── */}
      <section id="modules" ref={cardsSection.ref} className="px-8 pb-16">
        <div className="text-center mb-8"
          style={{ opacity: cardsSection.visible ? 1 : 0, transform: cardsSection.visible ? 'none' : 'translateY(16px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}>
          <h2 className="text-[22px] font-bold mb-2" style={{ color: '#F4F8FC' }}>Engine Modules</h2>
          <p className="text-[13px]" style={{ color: '#8FA7BF' }}>Five integrated modules — one unified insurance data engine</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {pipeline.map((m, i) => (
            <div key={m.id}
              className="rounded-xl p-5 border cursor-pointer"
              style={{
                background: '#0C1F35', borderColor: '#1A3050',
                opacity: cardsSection.visible ? 1 : 0,
                transform: cardsSection.visible ? 'none' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${0.07 * i}s, transform 0.5s ease ${0.07 * i}s, border-color 0.2s, box-shadow 0.2s`,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = m.color + '55'; e.currentTarget.style.boxShadow = `0 4px 24px ${m.color}1A`; e.currentTarget.style.transform = 'translateY(-3px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1A3050'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
              onClick={() => onNavigate(m.id)}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold" style={{ color: '#4A6580' }}>0{i + 1}</span>
                    <div className="text-[13px] font-bold" style={{ color: '#F4F8FC' }}>{m.label}</div>
                  </div>
                  <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block" style={{ background: m.bg, color: m.color }}>{m.sublabel}</div>
                </div>
              </div>
              <p className="text-[12px] leading-relaxed mb-1" style={{ color: '#C4D8EE' }}>{m.desc}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: '#6A87A0' }}>{m.detail}</p>
              <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold" style={{ color: m.color }}>
                Open module
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6h7M7 3.5L9.5 6 7 8.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Scroll to top */}
      {showScrollTop && (
        <button onClick={scrollTop}
          className="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center z-50"
          style={{ background: '#1683FF', boxShadow: '0 4px 16px #1683FF55', animation: 'scaleIn 0.2s ease' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 12V4M4 8l4-4 4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}
