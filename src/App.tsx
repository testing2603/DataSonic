import { useState, useRef, useEffect } from 'react'
import React from 'react'
import LandingPage from './pages/LandingPage'
import IngestionPage from './pages/IngestionPage'
import StewardshipPage, { type StewardTab } from './pages/StewardshipPage'
import DataEngineeringPage from './pages/DEComponent'
import DataReliabilityPage from './pages/DataReliabilityPage'
import ReportingPage from './pages/ReportingPage'
import AIChatPage from './pages/AIChatPage'

export type Page =
  | 'home'
  | 'ingestion'
  | 'stewardship'
  | 'data-engineering'
  | 'data-reliability'
  | 'reporting'
  | 'ai-chat'

export interface AppNotification {
  id: number
  type: 'upload' | 'schema' | 'mdm' | 'ingestion'
  title: string
  message: string
  time: Date
  read: boolean
}

let notifId = 0
export function makeNotif(type: AppNotification['type'], title: string, message: string): AppNotification {
  return { id: notifId++, type, title, message, time: new Date(), read: false }
}

type NavItem =
  // `style` is accepted (the nav passes one) but the icons don't apply it.
  | { kind: 'item'; id: Page; label: string; icon: (p: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactElement }
  | { kind: 'group'; label: string; icon: (p: { size?: number; className?: string; style?: React.CSSProperties }) => React.ReactElement; items: { label: string; tab: StewardTab }[] }

const nav: NavItem[] = [
  { kind: 'item', id: 'home', label: 'Home', icon: HomeIcon },
  { kind: 'item', id: 'ingestion', label: 'Ingestion', icon: IngestIcon },
  {
    kind: 'group',
    label: 'Stewardship Review',
    icon: StewardshipIcon,
    items: [
      { label: 'Schema Drift', tab: 'schema-drift' as StewardTab },
      { label: 'MDM', tab: 'mdm' as StewardTab },
    ],
  },
  { kind: 'item', id: 'data-engineering', label: 'Data Engineering', icon: EngineeringIcon },
  { kind: 'item', id: 'reporting', label: 'Reporting & Analytics', icon: ReportingIcon },
  { kind: 'item', id: 'ai-chat', label: 'AI Data Assistant', icon: AIChatIcon },
]

const breadcrumbs: Record<Page, string[]> = {
  home: ['Home'],
  ingestion: ['Ingestion'],
  stewardship: ['Stewardship Review'],
  'data-engineering': ['Data Engineering'],
  'data-reliability': ['Data Reliability Agent'],
  reporting: ['Reporting & Analytics'],
  'ai-chat': ['AI Data Assistant'],
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [stewardTab, setStewardTab] = useState<StewardTab>('schema-drift')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const unread = notifications.filter(n => !n.read).length

  function addNotification(n: AppNotification) {
    setNotifications(prev => [n, ...prev])
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  function handleBellClick() {
    setBellOpen(o => !o)
    if (!bellOpen) markAllRead()
  }

  return (
    <div className="flex h-screen font-sans overflow-hidden">
      <Sidebar page={page} stewardTab={stewardTab} setPage={setPage} setStewardTab={setStewardTab} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col overflow-hidden page-bg relative">
        {/* Decorative stroke overlay — parallel wave arcs anchored top-right */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMaxYMin meet"
          viewBox="0 0 1200 520"
        >
          <defs>
            {/* Radial bloom anchored at top-right */}
            <radialGradient id="arcGlow" cx="100%" cy="0%" r="52%">
              <stop offset="0%"  stopColor="#16C7D9" stopOpacity="0.22" />
              <stop offset="35%" stopColor="#1683FF" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#061426" stopOpacity="0" />
            </radialGradient>
            {/* Clip so arcs don't bleed past the right/top edges */}
            <clipPath id="bgClip">
              <rect width="1200" height="520" />
            </clipPath>
          </defs>

          {/* Bloom fill */}
          <rect width="1200" height="520" fill="url(#arcGlow)" />

          {/*
            Parallel arc family — all share the same cubic-bezier shape,
            each one offset by +55px on y, thinning and fading outward.
            Anchor point (control origin) is top-right corner ~(1280, -60).
            Entry: right edge; exit: left edge mid-height.
          */}
          <g clipPath="url(#bgClip)">
            {/* Arc 1 — innermost, brightest */}
            <path d="M 1200 -10 C 1060 40 880 100 640 180" stroke="#00CCFF" strokeWidth="1.6" fill="none" opacity="0.75" />
            {/* Arc 2 */}
            <path d="M 1200 45  C 1060 95 880 155 640 235" stroke="#16C7D9" strokeWidth="1.4" fill="none" opacity="0.58" />
            {/* Arc 3 */}
            <path d="M 1200 100 C 1060 150 880 210 640 290" stroke="#1683FF" strokeWidth="1.2" fill="none" opacity="0.42" />
            {/* Arc 4 */}
            <path d="M 1200 155 C 1060 205 880 265 640 345" stroke="#1683FF" strokeWidth="1.0" fill="none" opacity="0.28" />
            {/* Arc 5 — outermost, most transparent */}
            <path d="M 1200 210 C 1060 260 880 320 640 400" stroke="#2DA8FF" strokeWidth="0.8" fill="none" opacity="0.16" />
            {/* Arc 6 — faintest tail */}
            <path d="M 1200 265 C 1060 315 880 375 640 455" stroke="#2DA8FF" strokeWidth="0.7" fill="none" opacity="0.09" />
          </g>
        </svg>
        <Topbar
          page={page}
          unread={unread}
          bellOpen={bellOpen}
          onBellClick={handleBellClick}
          onBellClose={() => setBellOpen(false)}
        />
        <main className="flex-1 overflow-auto relative" style={{ zIndex: 1 }}>
          {page === 'home' && <LandingPage onNavigate={(p) => setPage(p as Page)} onNotify={addNotification} />}
          {page === 'ingestion' && <IngestionPage onNavigate={(p) => setPage(p as Page)} onNotify={addNotification} />}
          {page === 'stewardship' && <StewardshipPage tab={stewardTab} onTabChange={setStewardTab} onNotify={addNotification} />}
          {page === 'data-engineering' && <DataEngineeringPage />}
          {page === 'data-reliability' && <DataReliabilityPage />}
          {page === 'reporting' && <ReportingPage />}
          {page === 'ai-chat' && <AIChatPage />}
        </main>
      </div>
      {/* Notification panel rendered at root level to escape header stacking context */}
      {bellOpen && (
        <NotificationPanel
          notifications={notifications}
          onMarkAllRead={markAllRead}
          onClose={() => setBellOpen(false)}
        />
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────
function Sidebar({ page, stewardTab, setPage, setStewardTab, collapsed, onToggle }: {
  page: Page
  stewardTab: StewardTab
  setPage: (p: Page) => void
  setStewardTab: (t: StewardTab) => void
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside
      className="flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out relative"
      style={{ background: '#07182B', width: collapsed ? '56px' : '256px', borderRight: '1px solid #18334F' }}
    >
      <SidebarLogo collapsed={collapsed} />
      <SidebarNav page={page} stewardTab={stewardTab} setPage={setPage} setStewardTab={setStewardTab} collapsed={collapsed} />
      <SidebarBottom collapsed={collapsed} />
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-[60px] w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 shadow-md"
        style={{ background: '#0D3970', border: '1px solid #214260', color: '#8FA7BF' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#14385C'; (e.currentTarget as HTMLButtonElement).style.color = '#F4F8FC' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0D3970'; (e.currentTarget as HTMLButtonElement).style.color = '#8FA7BF' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s' }}>
          <path d="M4 2l3 3-3 3" />
        </svg>
      </button>
    </aside>
  )
}

function SidebarLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`pt-5 pb-4 transition-all duration-300 ${collapsed ? 'px-3' : 'px-4'}`} style={{ borderBottom: '1px solid #18334F' }}>
      <div className="flex items-center gap-2.5">
        <img
          src="/src/assets/adrosonic-logo-new.png"
          alt="Adrosonic logo"
          className="flex-shrink-0 object-contain"
          style={{ width: collapsed ? 32 : 38, height: collapsed ? 32 : 38 }}
        />
        {!collapsed && (
          <div className="overflow-hidden leading-none">
            <div className="flex items-baseline gap-0.5">
              <span className="font-bold text-[15px] tracking-wide uppercase whitespace-nowrap" style={{ fontFamily: 'Poppins, sans-serif', letterSpacing: '0.06em', color: '#F4F8FC' }}>
                ADROSONIC
              </span>
              <span className="text-[8px] align-super" style={{ color: 'rgba(244,248,252,0.4)' }}>®</span>
            </div>
            <div className="text-[8px] font-mono uppercase tracking-widest leading-tight whitespace-nowrap mt-0.5" style={{ color: '#16C7D9', opacity: 0.7 }}>
              Intelligent Data Platform
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


function SidebarNav({ page, stewardTab, setPage, setStewardTab, collapsed }: {
  page: Page
  stewardTab: StewardTab
  setPage: (p: Page) => void
  setStewardTab: (t: StewardTab) => void
  collapsed: boolean
}) {
  return (
    <nav className={`flex-1 py-4 overflow-y-auto transition-all duration-300 ${collapsed ? 'px-1.5' : 'px-3'}`}>
      {!collapsed && (
        <div className="text-xs font-semibold uppercase tracking-widest px-2 mb-3" style={{ color: '#8FA7BF' }}>
          Workspace
        </div>
      )}
      <ul className="space-y-0.5">
        {nav.map((entry, idx) => {
          if (entry.kind === 'group') {
            const groupActive = page === 'stewardship'
            if (collapsed) {
              return (
                <li key={`group-${idx}`}>
                  <button
                    onClick={() => { setPage('stewardship'); setStewardTab(entry.items[0].tab) }}
                    title="Stewardship Review"
                    className="w-full flex items-center justify-center py-2.5 rounded-md transition-all duration-150"
                    style={groupActive ? { background: '#0D3970', borderLeft: '2px solid #1683FF' } : { borderLeft: '2px solid transparent' }}
                  >
                    <entry.icon size={16} style={{ color: groupActive ? '#2DA8FF' : '#8FA7BF' }} />
                  </button>
                </li>
              )
            }
            return (
              <li key={`group-${idx}`}>
                <button
                  onClick={() => { setPage('stewardship'); setStewardTab(entry.items[0].tab) }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all duration-150 group"
                  style={groupActive
                    ? { background: '#0D3970', color: '#F4F8FC', borderLeft: '2px solid #1683FF' }
                    : { color: '#8FA7BF', borderLeft: '2px solid transparent' }}
                >
                  <entry.icon size={15} style={{ color: groupActive ? '#2DA8FF' : '#8FA7BF', flexShrink: 0 }} />
                  <span className="text-[13px] font-medium">{entry.label}</span>
                </button>
                <ul className="space-y-0.5">
                  {entry.items.map((sub) => {
                    const active = groupActive && stewardTab === sub.tab
                    return (
                      <li key={sub.tab}>
                        <button
                          onClick={() => { setPage('stewardship'); setStewardTab(sub.tab) }}
                          className="w-full flex items-center gap-2.5 py-1.5 rounded-md text-left transition-all duration-150"
                          style={active
                            ? { background: '#0D3970', color: '#F4F8FC', borderLeft: '2px solid #1683FF', paddingLeft: '24px' }
                            : { color: '#8FA7BF', borderLeft: '2px solid transparent', paddingLeft: '24px' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#2DA8FF' : '#214260' }} />
                          <span className="text-[13px] font-medium">{sub.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          }
          const active = page === entry.id
          if (collapsed) {
            return (
              <li key={entry.id}>
                <button
                  onClick={() => setPage(entry.id)}
                  title={entry.label}
                  className="w-full flex items-center justify-center py-2.5 rounded-md transition-all duration-150 group"
                  style={active ? { background: '#0D3970', borderLeft: '2px solid #1683FF' } : { borderLeft: '2px solid transparent' }}
                >
                  <entry.icon size={16} style={{ color: active ? '#2DA8FF' : '#8FA7BF' }} />
                </button>
              </li>
            )
          }
          return (
            <li key={entry.id}>
              <button
                onClick={() => setPage(entry.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all duration-150 group"
                style={active
                  ? { background: '#0D3970', color: '#F4F8FC', borderLeft: '2px solid #1683FF' }
                  : { color: '#8FA7BF', borderLeft: '2px solid transparent' }}
              >
                <entry.icon size={15} style={{ color: active ? '#2DA8FF' : '#8FA7BF' }} />
                <span className="text-[13px] font-medium">{entry.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function SidebarBottom({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`pb-4 pt-3 transition-all duration-300 ${collapsed ? 'px-1.5' : 'px-3'}`} style={{ borderTop: '1px solid #18334F' }}>
      {collapsed ? (
        <div className="flex items-center justify-center py-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: '#1683FF' }}>AM</div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: '#1683FF' }}>AM</div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium truncate" style={{ color: '#F4F8FC' }}>Avery Morgan</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Topbar ─────────────────────────────────────────────────────────────
function Topbar({ page, unread, bellOpen, onBellClick, onBellClose }: {
  page: Page
  unread: number
  bellOpen: boolean
  onBellClick: () => void
  onBellClose: () => void
}) {
  return (
    <header
      className="flex-shrink-0 relative"
      style={{ background: 'rgba(6,20,38,0.72)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #18334F', zIndex: 1 }}
    >
      <div className="relative flex items-center px-6 h-11">
        {/* Absolutely centred breadcrumb */}
        <div className="absolute inset-x-0 flex justify-center pointer-events-none">
          <Breadcrumb page={page} />
        </div>
        {/* Right-side icons stay in flow */}
        <div className="ml-auto flex items-center gap-3 relative z-10">
          <BellButton unread={unread} open={bellOpen} onClick={onBellClick} />
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: '#1683FF' }}>AM</div>
        </div>
      </div>
    </header>
  )
}

// ── Bell button (panel now rendered at App root) ─────────────────────
function BellButton({ unread, open, onClick }: { unread: number; open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative transition-colors" style={{ color: '#16C7D9' }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 2-1.5 4-1.5 4h12s-1.5-2-1.5-4c0-2.5-2-4.5-4.5-4.5zM6.5 13.5a1.5 1.5 0 003 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}

function NotificationPanel({ notifications, onMarkAllRead, onClose }: {
  notifications: AppNotification[]
  onMarkAllRead: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="fixed w-80 rounded-xl shadow-2xl overflow-hidden" style={{ top: '52px', right: '16px', zIndex: 9999, background: '#0A1B31', border: '1px solid #214260' }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #18334F' }}>
        <span className="text-[13px] font-semibold" style={{ color: '#F4F8FC' }}>Notifications</span>
        {notifications.length > 0 && (
          <button onClick={onMarkAllRead} className="text-[11px] font-medium" style={{ color: '#2DA8FF' }}>
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-2xl mb-2">🔔</div>
            <div className="text-[12px]" style={{ color: '#8FA7BF' }}>No notifications yet</div>
            <div className="text-[11px] mt-1" style={{ color: '#8FA7BF', opacity: 0.6 }}>Actions you take will appear here</div>
          </div>
        ) : (
          <div style={{ borderTop: 'none' }}>
            {notifications.map(n => <NotificationItem key={n.id} n={n} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function NotificationItem({ n }: { n: AppNotification }) {
  const iconBg = n.type === 'upload' ? '#103B70' : n.type === 'schema' ? '#493715' : n.type === 'mdm' ? '#30204E' : '#103E3A'
  const icon = n.type === 'upload' ? '📄' : n.type === 'schema' ? '⚡' : n.type === 'mdm' ? '🔗' : '✓'
  return (
    <div className="px-4 py-3 flex gap-3" style={{ background: n.read ? 'transparent' : 'rgba(22,131,255,0.08)', borderBottom: '1px solid #18334F' }}>
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[13px]" style={{ background: iconBg }}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold" style={{ color: '#F4F8FC' }}>{n.title}</div>
        <div className="text-[11px] leading-snug mt-0.5" style={{ color: '#8FA7BF' }}>{n.message}</div>
        <div className="text-[10px] mt-1" style={{ color: '#8FA7BF', opacity: 0.6 }}>{formatTime(n.time)}</div>
      </div>
      {!n.read && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#16C7D9' }} />}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────
function formatTime(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

function Breadcrumb({ page }: { page: Page }) {
  const parts = breadcrumbs[page]
  const label = parts[parts.length - 1]
  return (
    <div className="flex items-center justify-center gap-3 select-none" style={{ minWidth: 280 }}>
      <svg width="100" height="10" viewBox="0 0 100 10" fill="none">
        <line x1="96" y1="5" x2="10" y2="5" stroke="url(#arrowL)" strokeWidth="1.3" />
        <path d="M14 2L4 5l10 3" stroke="url(#arrowL)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="arrowL" x1="96" y1="5" x2="4" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1683FF" stopOpacity="0" />
            <stop offset="60%" stopColor="#1E9FDD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#16C7D9" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-[13px] font-semibold tracking-wide whitespace-nowrap"
        style={{
          background: 'linear-gradient(90deg, #2DA8FF, #16C7D9)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
        {label}
      </span>
      <svg width="100" height="10" viewBox="0 0 100 10" fill="none">
        <line x1="4" y1="5" x2="90" y2="5" stroke="url(#arrowR)" strokeWidth="1.3" />
        <path d="M86 2l10 3-10 3" stroke="url(#arrowR)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="arrowR" x1="4" y1="5" x2="96" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1683FF" stopOpacity="0" />
            <stop offset="60%" stopColor="#1E9FDD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#16C7D9" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────
function HomeIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-4V10h-3v4.5H3a.5.5 0 01-.5-.5V6.5z" />
    </svg>
  )
}
function IngestIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M5.5 8H10.5M8 5.5V10.5" strokeLinecap="round" />
    </svg>
  )
}
function EngineeringIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M6.5 2L5 4.5H2l2 3-2 3h3l1.5 2.5L8 11.5l1.5 1.5L11 10.5h3l-2-3 2-3h-3L9.5 2 8 4.5 6.5 2z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  )
}
function ReliabilityIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M8 2L3 4.5v4c0 2.5 2 4.5 5 5.5 3-1 5-3 5-5.5v-4L8 2z" />
      <path d="M5.5 8l2 2 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ReportingIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 13V8l3-3 3 3 3-5 3 5v5H2z" strokeLinejoin="round" />
    </svg>
  )
}
function StewardshipIcon({ size = 16, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} style={style}>
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M10 10l3 3" strokeLinecap="round" />
    </svg>
  )
}
function AIChatIcon({ size = 16, className = '' }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="1" x2="8" y2="3.5" />
      <circle cx="8" cy="0.8" r="0.8" fill="currentColor" stroke="none" />
      <rect x="2" y="3.5" width="12" height="8" rx="2" />
      <circle cx="5.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <path d="M5.5 10h5" strokeWidth="1.2" />
      <line x1="2" y1="7" x2="0.8" y2="7" strokeWidth="1.4" />
      <line x1="14" y1="7" x2="15.2" y2="7" strokeWidth="1.4" />
    </svg>
  )
}
function SettingsIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}
