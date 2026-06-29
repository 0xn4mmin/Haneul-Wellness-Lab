import { useEffect, useState } from 'react'

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/**
 * Floating "앱으로 설치" helper. On Android/Chrome it fires the native install
 * prompt; on iOS Safari it shows the manual "공유 → 홈 화면에 추가" steps.
 * Hidden when already installed (standalone), inside the Capacitor shell, or
 * once dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [iosHelp, setIosHelp] = useState(false)
  // X just hides for this visit (session) — reappears on the next URL load.
  // Only "다시 보지 않기" persists. (If installed, the platform suppresses it:
  // Android stops firing beforeinstallprompt; the app runs in standalone.)
  const [closed, setClosed] = useState(false)
  const [never, setNever] = useState(() => {
    try { return localStorage.getItem('hwl-install-never') === '1' } catch { return false }
  })

  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const touch = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0
  // iPadOS reports a "Macintosh" UA — detect it via touch points
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)
  const isMacDesktop = /Macintosh/i.test(ua) && touch <= 1
  // on iOS every browser is WebKit, but only Safari can "Add to Home Screen"
  const isSafari = /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser/i.test(ua)

  useEffect(() => {
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  // Android/Chromium → native prompt; iOS/iPadOS Safari & Mac Safari → manual steps
  const manual = isSafari && (isIOS || isMacDesktop)
  useEffect(() => { if (manual) setIosHelp(true) }, [manual])

  if (standalone || isNative || never || closed) return null
  const canShow = !!deferred || manual
  if (!canShow) return null

  const close = () => setClosed(true)                                  // this visit only
  const dontShow = () => { setNever(true); try { localStorage.setItem('hwl-install-never', '1') } catch { /* ignore */ } }
  const install = async () => {
    if (deferred) { await deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') dontShow(); setDeferred(null) }
    else setIosHelp((v) => !v)
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 300, display: 'flex', justifyContent: 'center', padding: '0 12px calc(12px + env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 460, background: 'rgba(14,24,52,.92)', backdropFilter: 'blur(14px)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '13px 15px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>📲</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#EAF3F1' }}>앱으로 설치</div>
            <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.6)' }}>홈 화면에 추가하면 전체화면 앱으로 써요 · <button onClick={dontShow} style={{ all: 'unset', cursor: 'pointer', color: 'rgba(231,239,234,.45)', textDecoration: 'underline' }}>다시 보지 않기</button></div>
          </div>
          <button onClick={install} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#060B17', background: 'linear-gradient(110deg,#67D7DF,#16C0CE)', padding: '9px 16px', borderRadius: 20 }}>{deferred ? '설치' : '설치 방법'}</button>
          <button onClick={close} aria-label="닫기" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(231,239,234,.5)', fontSize: 16 }}>✕</button>
        </div>
        {iosHelp && (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 12.5, color: 'rgba(231,239,234,.8)', lineHeight: 1.7 }}>
            {isMacDesktop
              ? <><b style={{ color: '#9FE2E8' }}>Mac Safari</b>에서 ① 상단 <b>공유</b> 버튼 → ② <b>“Dock에 추가”</b>. (없으면 <b>파일</b> 메뉴 → Dock에 추가)</>
              : <><b style={{ color: '#9FE2E8' }}>Safari</b>에서 ① 하단(또는 상단) <b>공유</b> 버튼 → ② <b>“홈 화면에 추가”</b> → ③ <b>추가</b>. <span style={{ color: 'rgba(231,239,234,.5)' }}>※ Chrome 등 다른 iOS 브라우저에선 안 돼요 — 꼭 Safari에서.</span></>}
          </div>
        )}
      </div>
    </div>
  )
}
