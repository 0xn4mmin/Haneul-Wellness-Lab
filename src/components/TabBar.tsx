import type { View } from '../data/portalState'

const ICONS: Record<string, React.ReactNode> = {
  health: <><circle cx="12" cy="12" r="8.5" /><path d="M5 12h3l2-4 3 8 2-4h4" strokeLinecap="round" strokeLinejoin="round" /></>,
  community: <><rect x="3.5" y="4.5" width="17" height="6" rx="2.5" /><rect x="3.5" y="13.5" width="11" height="6" rx="2.5" /></>,
  chat: <path d="M4.5 5.5h15v10h-9l-4 4v-4h-2z" strokeLinejoin="round" />,
  members: <><circle cx="8.5" cy="9" r="3.2" /><circle cx="16" cy="10.5" r="2.7" /><path d="M3.5 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6" strokeLinecap="round" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.6 3.2-5.5 7-5.5s6.3 1.9 7 5.5" strokeLinecap="round" /></>,
}

const TABS: { key: View; label: string }[] = [
  { key: 'health', label: '나의 건강' },
  { key: 'community', label: '커뮤니티' },
  { key: 'chat', label: '채팅' },
  { key: 'members', label: '멤버' },
  { key: 'profile', label: '프로필' },
]

const STUDIO_ICON = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" strokeLinecap="round" /></>

/** Mobile bottom tab bar (hidden on desktop via CSS). */
export default function TabBar({ view, go, chatBadge, isAdmin }: { view: View; go: (v: View) => void; chatBadge?: number; isAdmin?: boolean }) {
  return (
    <nav className="hwl-tabbar">
      {TABS.map((t) => {
        const studioSlot = t.key === 'health' && isAdmin
        const active = studioSlot ? view === 'trainer' : view === t.key
        const color = active ? '#67D7DF' : '#7C8AAE'
        const label = studioSlot ? '스튜디오' : t.label
        return (
          <button key={t.key} className="hwl-tab" onClick={() => go(t.key)} aria-label={label} style={{ all: 'unset', position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '9px 2px 8px', minHeight: 54, cursor: 'pointer' }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">{studioSlot ? STUDIO_ICON : ICONS[t.key]}</svg>
            <span className="hwl-tab-label" style={{ color }}>{label}</span>
            {t.key === 'chat' && chatBadge ? (
              <span style={{ position: 'absolute', top: 4, right: '50%', marginRight: -22, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#2E9BA6', color: '#06110F', fontSize: 9.5, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{chatBadge}</span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
