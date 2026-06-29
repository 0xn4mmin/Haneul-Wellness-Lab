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
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('hwl-install-dismissed') === '1' } catch { return false }
  })

  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  const isNative = typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)

  useEffect(() => {
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  if (standalone || isNative || dismissed) return null
  const canShow = !!deferred || isSafari
  if (!canShow) return null

  const close = () => { setDismissed(true); try { localStorage.setItem('hwl-install-dismissed', '1') } catch { /* ignore */ } }
  const install = async () => {
    if (deferred) { await deferred.prompt(); const r = await deferred.userChoice; if (r.outcome === 'accepted') close(); setDeferred(null) }
    else setIosHelp((v) => !v)
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 300, display: 'flex', justifyContent: 'center', padding: '0 12px 12px', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 460, background: 'rgba(14,24,52,.92)', backdropFilter: 'blur(14px)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '13px 15px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 22 }}>📲</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#EAF3F1' }}>앱으로 설치</div>
            <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.6)' }}>홈 화면에 추가하면 전체화면 앱으로 써요</div>
          </div>
          <button onClick={install} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#060B17', background: 'linear-gradient(110deg,#67D7DF,#16C0CE)', padding: '9px 16px', borderRadius: 20 }}>{deferred ? '설치' : '설치 방법'}</button>
          <button onClick={close} aria-label="닫기" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(231,239,234,.5)', fontSize: 16 }}>✕</button>
        </div>
        {iosHelp && (
          <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 12.5, color: 'rgba(231,239,234,.8)', lineHeight: 1.7 }}>
            <b style={{ color: '#9FE2E8' }}>Safari</b>에서 ① 하단 <b>공유</b> 버튼 <span style={{ fontSize: 14 }}>􀈂</span> → ② <b>“홈 화면에 추가”</b> → ③ <b>추가</b> 를 누르면 설치돼요.
          </div>
        )}
      </div>
    </div>
  )
}
