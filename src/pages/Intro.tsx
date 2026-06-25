import { useEffect, useRef } from 'react'
import { createField, type FieldHandle } from '../lib/threeField'

const PORTAL = '/portal'

const dataNodes: Array<{ pos: React.CSSProperties; text: string; dot: string; right?: boolean }> = [
  { pos: { top: '30%', left: '16%' }, text: '체지방률 20.0%', dot: '#67D7DF' },
  { pos: { top: '63%', left: '22%' }, text: '골격근 31.9kg', dot: '#67D7DF' },
  { pos: { top: '38%', right: '15%' }, text: '인바디 78점', dot: '#E0B86A', right: true },
  { pos: { top: '71%', right: '20%' }, text: '내장지방 Lv.5', dot: '#E0B86A', right: true },
  { pos: { top: '52%', left: '44%' }, text: '체수분 41.4L', dot: '#67D7DF' },
]

export default function Intro() {
  const heroRef = useRef<HTMLElement | null>(null)
  const fieldMount = useRef<HTMLDivElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
  const ringsRef = useRef<HTMLDivElement | null>(null)
  const glowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let field: FieldHandle | null = null
    if (fieldMount.current) field = createField(fieldMount.current)

    const hero = heroRef.current
    if (!hero) return
    const cw = hero.clientWidth || window.innerWidth
    const ch = hero.clientHeight || window.innerHeight
    const mouse = { x: cw * 0.5, y: ch * 0.64 }
    const smooth = { x: cw * 0.5, y: ch * 0.64 }

    const onMove = (e: MouseEvent) => {
      const r = hero.getBoundingClientRect()
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
    }
    const onTouch = (e: TouchEvent) => {
      if (!e.touches[0]) return
      const r = hero.getBoundingClientRect()
      mouse.x = e.touches[0].clientX - r.left; mouse.y = e.touches[0].clientY - r.top
    }
    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('touchmove', onTouch, { passive: true })

    const R = 250
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      smooth.x += (mouse.x - smooth.x) * 0.1
      smooth.y += (mouse.y - smooth.y) * 0.1
      const x = smooth.x.toFixed(1); const y = smooth.y.toFixed(1)
      if (revealRef.current) {
        const m = `radial-gradient(circle ${R}px at ${x}px ${y}px,#000 0%,rgba(0,0,0,.55) 55%,transparent 100%)`
        revealRef.current.style.webkitMaskImage = m
        revealRef.current.style.maskImage = m
      }
      if (ringsRef.current) {
        ringsRef.current.style.backgroundImage =
          `repeating-radial-gradient(circle at ${x}px ${y}px,rgba(103,215,223,.55) 0 1.5px,transparent 1.5px 22px)`
      }
      if (glowRef.current) {
        glowRef.current.style.background =
          `radial-gradient(circle 360px at ${x}px ${y}px,rgba(22,192,206,.2),transparent 60%)`
      }
      if (field) field.follow(smooth.x / cw, smooth.y / ch)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('touchmove', onTouch)
      field?.dispose()
    }
  }, [])

  return (
    <div style={{ fontFamily: "'Pretendard',system-ui,sans-serif", color: '#EAF3F1', height: '100vh', overflow: 'hidden', background: '#060A16' }}>
      <section
        ref={heroRef}
        style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'radial-gradient(130% 110% at 50% 30%,#0E1A33 0%,#081026 55%,#05091A 100%)', cursor: 'crosshair' }}
      >
        {/* BASE: dim immersive 3D field */}
        <div ref={fieldMount} style={{ position: 'absolute', inset: 0, zIndex: 10 }} />

        {/* REVEAL: body-data map, shown only under the cursor spotlight */}
        <div
          ref={revealRef}
          style={{
            position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', mixBlendMode: 'screen',
            WebkitMaskImage: 'radial-gradient(circle 250px at 50% 64%,#000 0%,rgba(0,0,0,.55) 55%,transparent 100%)',
            maskImage: 'radial-gradient(circle 250px at 50% 64%,#000 0%,rgba(0,0,0,.55) 55%,transparent 100%)',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 55% at 50% 45%,rgba(22,140,150,.4),transparent 75%)' }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.6, backgroundImage: 'radial-gradient(rgba(103,215,223,.55) 1px,transparent 1.4px)', backgroundSize: '26px 26px' }} />
          <div ref={ringsRef} style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-radial-gradient(circle at 50% 64%,rgba(103,215,223,.55) 0 1.5px,transparent 1.5px 22px)' }} />
          {dataNodes.map((n, i) => (
            <div key={i} style={{ position: 'absolute', ...n.pos, display: 'flex', alignItems: 'center', gap: 8 }}>
              {!n.right && <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.dot, boxShadow: `0 0 12px ${n.dot}` }} />}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: '#CFF6F8' }}>{n.text}</span>
              {n.right && <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.dot, boxShadow: `0 0 12px ${n.dot}` }} />}
            </div>
          ))}
        </div>

        {/* cursor glow */}
        <div ref={glowRef} style={{ position: 'absolute', inset: 0, zIndex: 24, pointerEvents: 'none', mixBlendMode: 'screen', background: 'radial-gradient(circle 360px at 50% 64%,rgba(22,192,206,.2),transparent 60%)' }} />

        {/* vignette + heading scrim */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 26, pointerEvents: 'none', background: 'radial-gradient(58% 90% at 50% 36%,rgba(6,9,20,.72) 0%,rgba(6,9,20,.2) 48%,transparent 72%),linear-gradient(180deg,rgba(6,9,20,.5) 0%,transparent 24%,transparent 52%,rgba(6,9,20,.85) 100%)' }} />

        {/* NAV */}
        <nav style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '18px clamp(18px,4vw,40px)' }}>
          <a href={PORTAL} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 11, flex: 'none' }}>
            <img src="/assets/logo-mark.png" alt="로고" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 19, letterSpacing: '.4px', color: '#fff' }}>Haneul Wellness Lab</span>
          </a>
          <div className="hwl-pill" style={{ marginLeft: 'auto', marginRight: 'auto', alignItems: 'center', gap: 2, background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 30, padding: 6 }}>
            <span style={{ padding: '8px 16px', borderRadius: 22, fontSize: 13.5, fontWeight: 600, color: '#060A16', background: '#EAF3F1' }}>소개</span>
            <span style={{ padding: '8px 16px', borderRadius: 22, fontSize: 13.5, fontWeight: 500, color: 'rgba(234,243,241,.8)' }}>서비스</span>
            <span style={{ padding: '8px 16px', borderRadius: 22, fontSize: 13.5, fontWeight: 500, color: 'rgba(234,243,241,.8)' }}>데이터</span>
            <span style={{ padding: '8px 16px', borderRadius: 22, fontSize: 13.5, fontWeight: 500, color: 'rgba(234,243,241,.8)' }}>커뮤니티</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href={PORTAL} className="hwl-glass-hover" style={{ textDecoration: 'none', fontSize: 13.5, fontWeight: 600, color: '#EAF3F1', padding: '11px 18px', borderRadius: 24, background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.15)' }}>회원 로그인</a>
            <a href={PORTAL} className="hwl-bright-hover" style={{ textDecoration: 'none', fontSize: 13.5, fontWeight: 700, color: '#060A16', background: 'linear-gradient(110deg,#67D7DF,#16C0CE)', padding: '11px 20px', borderRadius: 24, boxShadow: '0 12px 28px -12px rgba(22,192,206,.9)' }}>시작하기</a>
          </div>
        </nav>

        {/* HEADING */}
        <div style={{ position: 'absolute', top: 'clamp(15%,16vh,18%)', left: 0, right: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px', pointerEvents: 'none' }}>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 600, fontSize: 'clamp(12px,1.4vw,15px)', color: '#9FE9EF', marginBottom: 18, letterSpacing: 4, textTransform: 'uppercase' }}>Illuminate your data</div>
          <h1 style={{ margin: 0, color: '#fff', lineHeight: 1.08, fontFamily: "'Pretendard',sans-serif", fontWeight: 800, textShadow: '0 2px 34px rgba(6,9,20,.72)' }}>
            <span style={{ display: 'block', fontSize: 'clamp(38px,7vw,86px)', letterSpacing: '-2px' }}>비추면 보이는</span>
            <span style={{ display: 'block', fontSize: 'clamp(38px,7vw,86px)', letterSpacing: '-2px', background: 'linear-gradient(100deg,#EAFEFF 0%,#86E6EE 48%,#FFFFFF 82%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>내 몸의 지도</span>
          </h1>
          <div style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'rgba(234,243,241,.72)', background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 22, padding: '8px 16px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#67D7DF" strokeWidth="1.8"><path d="M5 3l4 18 3-7 7-3z" strokeLinejoin="round" /></svg>
            커서를 움직여 당신의 데이터를 비춰보세요
          </div>
        </div>

        {/* bottom-left */}
        <div className="hwl-bl" style={{ position: 'absolute', bottom: 'clamp(80px,11vh,116px)', left: 'clamp(20px,4vw,56px)', zIndex: 50, maxWidth: 280 }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(234,243,241,.78)', margin: 0 }}>매번의 인바디 측정은 당신의 한 시절을 기록합니다. 흩어진 숫자가 아닌, 빛으로 이어지는 변화의 지도로.</p>
        </div>

        {/* bottom-right */}
        <div className="hwl-br" style={{ position: 'absolute', bottom: 'clamp(74px,10vh,104px)', left: 20, right: 20, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 18 }}>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'rgba(234,243,241,.78)', margin: 0, maxWidth: 300 }}>부위별 3D 분석과 코치의 코멘트, 그리고 함께하는 커뮤니티까지 — 하늘 웰니스 랩에서 만나보세요.</p>
          <a href={PORTAL} className="hwl-bright-hover" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, color: '#060A16', background: 'linear-gradient(110deg,#67D7DF,#16C0CE)', padding: '15px 30px', borderRadius: 30, boxShadow: '0 18px 40px -16px rgba(22,192,206,.9)', animation: 'hwl-pulse 3.2s ease-in-out infinite' }}>포털 입장하기 →</a>
        </div>

        {/* scroll/scan cue */}
        <div style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, pointerEvents: 'none' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: 2, color: 'rgba(234,243,241,.5)' }}>SCAN</span>
          <span style={{ width: 1, height: 24, background: 'linear-gradient(180deg,rgba(103,215,223,.8),transparent)', animation: 'hwl-cue 1.8s ease-in-out infinite' }} />
        </div>
      </section>
    </div>
  )
}
