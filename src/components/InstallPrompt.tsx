import { useEffect, useState } from 'react'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/**
 * Centered "앱으로 설치" popup. On Android/Chrome the 설치하기 button fires the
 * native install prompt (auto-adds to the home screen). On iOS/Mac Safari there
 * is no install API, so it shows friendly step-by-step instructions. Hidden when
 * already installed (standalone), inside the Capacitor shell, or once dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  // X just hides for this visit (session); only "다시 보지 않기" / accepting persists.
  const [closed, setClosed] = useState(false)
  const [never, setNever] = useState(() => {
    try { return localStorage.getItem('hwl-install-never') === '1' } catch { return false }
  })

  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const touch = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1) // iPadOS reports a Mac UA
  const isMacDesktop = /Macintosh/i.test(ua) && touch <= 1
  const isSafari = /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser/i.test(ua)

  useEffect(() => {
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  const manual = isSafari && (isIOS || isMacDesktop)
  if (standalone || isNative || never || closed) return null
  if (!deferred && !manual) return null

  const close = () => setClosed(true)
  const dontShow = () => { setNever(true); try { localStorage.setItem('hwl-install-never', '1') } catch { /* ignore */ } }
  const install = async () => { if (deferred) { await deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') dontShow(); setDeferred(null) } }

  const shareIcon = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" style={{ verticalAlign: '-3px' }}><path d="M12 3v12M8.5 6.5 12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" strokeLinecap="round" /></svg>
  const steps: { n: string; body: React.ReactNode }[] = isMacDesktop
    ? [
      { n: '1', body: <>상단 메뉴바의 <b style={{ color: '#9FE2E8' }}>공유 {shareIcon}</b> 버튼을 누르세요</> },
      { n: '2', body: <>목록에서 <b style={{ color: '#9FE2E8' }}>“Dock에 추가”</b> 를 선택하면 끝!</> },
    ]
    : [
      { n: '1', body: <>화면 하단(또는 상단)의 <b style={{ color: '#9FE2E8' }}>공유 {shareIcon}</b> 버튼을 누르세요</> },
      { n: '2', body: <>스크롤해서 <b style={{ color: '#9FE2E8' }}>“홈 화면에 추가”</b> 를 선택</> },
      { n: '3', body: <>오른쪽 위 <b style={{ color: '#9FE2E8' }}>“추가”</b> 를 누르면 완료돼요 🎉</> },
    ]

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(20px,env(safe-area-inset-top)) 20px max(20px,env(safe-area-inset-bottom))', background: 'rgba(4,9,18,.72)', backdropFilter: 'blur(8px)', animation: 'hwl-fade .25s ease both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'linear-gradient(180deg,#11203f,#0C1730)', border: '1px solid rgba(103,215,223,.28)', borderRadius: 26, padding: '30px 26px 24px', boxShadow: '0 50px 110px -40px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.04) inset', textAlign: 'center', animation: 'hwl-rise .3s ease both' }}>
        <button onClick={close} aria-label="닫기" style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 14, right: 16, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(231,239,234,.5)', fontSize: 18 }}>✕</button>

        <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18, background: 'linear-gradient(135deg,#67D7DF,#16C0CE)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, boxShadow: '0 16px 36px -14px rgba(22,192,206,.8)' }}>📲</div>
        <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 22, color: '#F2F7F3', marginBottom: 7 }}>앱으로 설치하기</div>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(231,239,234,.65)', marginBottom: 22 }}>
          홈 화면에 추가하면 <b style={{ color: '#9FE2E8' }}>주소창 없는 전체화면 앱</b>으로<br />더 빠르고 편하게 쓸 수 있어요.
        </div>

        {deferred ? (
          <>
            <button onClick={install} style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', display: 'block', width: '100%', textAlign: 'center', fontSize: 15.5, fontWeight: 700, color: '#060B17', background: 'linear-gradient(110deg,#67D7DF,#16C0CE)', padding: '14px 0', borderRadius: 16, boxShadow: '0 14px 30px -12px rgba(22,192,206,.85)' }}>설치하기</button>
            <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.4)', marginTop: 11 }}>‘설치하기’를 누르면 자동으로 홈 화면에 추가돼요.</div>
          </>
        ) : (
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(46,155,166,.08)', border: '1px solid rgba(103,215,223,.18)', borderRadius: 16, padding: '18px 16px' }}>
            {steps.map((s) => (
              <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#2E9BA6', color: '#06222A', fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(231,239,234,.85)' }}>{s.body}</span>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.4)', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 11 }}>※ {isMacDesktop ? 'Safari' : '아이폰·아이패드는 꼭 Safari'}에서만 추가할 수 있어요.</div>
          </div>
        )}

        <button onClick={dontShow} style={{ all: 'unset', cursor: 'pointer', marginTop: 16, fontSize: 12, color: 'rgba(231,239,234,.4)', textDecoration: 'underline' }}>다시 보지 않기</button>
      </div>
    </div>
  )
}
