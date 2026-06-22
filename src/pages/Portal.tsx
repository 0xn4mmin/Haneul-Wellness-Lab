import { useEffect, useMemo, useRef, useState } from 'react'
import {
  dates, metrics, segData, research, goals, conditionLog, challenge,
  me as ME, coach as COACH, segColor, buildSpark, buildTrend, buildGauges, buildRadar,
  type MetricKey,
} from '../data/portalData'
import { initialState, type PortalState, type View } from '../data/portalState'
import { createFigure, type FigureHandle } from '../lib/threeFigure'

const CTA = 'linear-gradient(110deg,#67D7DF,#2E9BA6)'
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)',
  backdropFilter: 'blur(7px)', borderRadius: 24,
  boxShadow: '0 1px 0 rgba(255,255,255,.06) inset,0 30px 60px -42px rgba(0,0,0,.75)',
}
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A24B' }
const cardTitle: React.CSSProperties = { fontFamily: "'Gowun Batang',serif", fontSize: 21, marginTop: 3, color: '#F2F7F3' }
const ringCirc = 2 * Math.PI * 34

function Avatar({ initials, color, size, photo, fontSize, ring }: { initials: string; color: string; size: number; photo?: string | null; fontSize: number; ring?: string }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize, flex: 'none', boxShadow: ring }}>
      <span>{initials}</span>
      {photo && <img src={photo} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  )
}

export default function Portal() {
  const [s, setS] = useState<PortalState>(initialState)
  const set = (p: Partial<PortalState>) => setS((prev) => ({ ...prev, ...p }))
  const setFn = (fn: (prev: PortalState) => Partial<PortalState>) => setS((prev) => ({ ...prev, ...fn(prev) }))

  const mount3d = useRef<HTMLDivElement | null>(null)
  const figure = useRef<FigureHandle | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)

  // 3D figure lifecycle
  useEffect(() => {
    if (mount3d.current && !figure.current) {
      figure.current = createFigure(mount3d.current, (seg) => set({ selectedSegment: seg }))
    }
    return () => { figure.current?.dispose(); figure.current = null }
  }, [])
  useEffect(() => { figure.current?.setSelected(s.selectedSegment) }, [s.selectedSegment])

  // chat auto-scroll
  useEffect(() => {
    if (s.view === 'chat' && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [s.view, s.messages])

  // ---- handlers -----------------------------------------------------------
  const go = (v: View) => set({ view: v, activeMember: null })
  const togglePrivacy = (key: string) => setFn((p) => ({ privacy: { ...p.privacy, [key]: p.privacy[key] === 'public' ? 'private' : 'public' } }))
  const onProfileField = (k: keyof PortalState['profile'], v: string) => setFn((p) => ({ profile: { ...p.profile, [k]: v } }))
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = () => setFn((p) => ({ profile: { ...p.profile, photo: r.result as string } }))
    r.readAsDataURL(f)
  }
  const submitComment = () => {
    const t = s.newComment.trim(); if (!t) return
    const key = s.selectedMetric
    const entry = { author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, text: t, time: '방금' }
    setFn((p) => ({ newComment: '', commentsByMetric: { ...p.commentsByMetric, [key]: [...(p.commentsByMetric[key] || []), entry] } }))
  }
  const submitPost = () => {
    const t = s.newPost.trim(); if (!t) return
    const post = { id: Date.now(), author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, time: '방금', text: t, likes: 0, liked: false, open: false, comments: [], draft: '' }
    setFn((p) => ({ newPost: '', posts: [post, ...p.posts] }))
  }
  const toggleLike = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x) }))
  const toggleComments = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, open: !x.open } : x) }))
  const setPostDraft = (id: number, v: string) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, draft: v } : x) }))
  const submitPostComment = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => {
    if (x.id !== id) return x
    const t = (x.draft || '').trim(); if (!t) return x
    return { ...x, comments: [...x.comments, { author: ME.name, initials: ME.initials, color: ME.color, text: t }], draft: '' }
  }) }))
  const sendMsg = () => {
    const t = s.newMsg.trim(); if (!t) return
    const msg = { id: Date.now(), author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, time: '방금', text: t }
    setFn((p) => ({ newMsg: '', messages: [...p.messages, msg] }))
  }
  const openMember = (id: string) => set({ activeMember: id })
  const submitMemberComment = () => {
    const t = s.memberDraft.trim(); const id = s.activeMember; if (!t || !id) return
    setFn((p) => ({ memberDraft: '', memberComments: { ...p.memberComments, [id]: [...(p.memberComments[id] || []), { author: ME.name, initials: ME.initials, color: ME.color, text: t }] } }))
  }
  const sendCoachNote = () => {
    const t = s.coachNote.trim(); if (!t) return
    const target = s.members.find((m) => m.id === s.coachTargetId)
    set({ coachNote: '', coachConfirm: '✓ ' + (target ? target.name : '회원') + '님의 ' + metrics[s.selectedMetric].label + ' 차트에 노트를 전달했어요.' })
  }
  const createChallenge = () => {
    const t = (s.chTitle || '').trim() || '새 챌린지'
    set({ showChallengeForm: false, chDone: '✓ “' + t + '” 챌린지가 생성되었어요.' })
  }

  // ---- derived values (mirror of renderVals) ------------------------------
  const isTrainer = s.role === 'trainer'
  const isClient = !isTrainer
  const navColor = (k: View) => { const a = s.view === k; return { bg: a ? 'linear-gradient(110deg,#2E9BA6,#247E88)' : 'transparent', fg: a ? '#06110F' : '#9FBCB5' } }

  const meDisp = {
    name: isTrainer ? COACH.name : s.profile.name,
    initials: isTrainer ? COACH.initials : ME.initials,
    color: isTrainer ? COACH.color : ME.color,
    role: isTrainer ? '트레이너 · 관리자' : ME.role,
  }

  const trend = useMemo(() => {
    const base = buildTrend(s.selectedMetric)
    const h = s.hoverIdx
    const pts = base.pts.map((p, i) => ({ ...p, r: h === i ? 6 : 4.2, idx: i }))
    let tip
    if (h >= 0 && pts[h]) {
      const p = pts[h]
      const rx = Math.max(4, Math.min(456, p.x - 50))
      const ry = (p.y - 56 < 6) ? p.y + 16 : p.y - 56
      tip = { show: true, x: p.x, cx: +(rx + 50).toFixed(1), rx: +rx.toFixed(1), ry: +ry.toFixed(1), t1: +(ry + 17).toFixed(1), t2: +(ry + 34).toFixed(1), date: p.full, val: p.disp }
    } else {
      tip = { show: false, x: 0, cx: 0, rx: 0, ry: 0, t1: 0, t2: 0, date: '', val: '' }
    }
    return { ...base, pts, tip }
  }, [s.selectedMetric, s.hoverIdx])

  const gauges = buildGauges()
  const radar = useMemo(() => {
    const base = buildRadar()
    const rh = s.radarHover
    const rd = base.curDots[rh]
    const tip = (rh >= 0 && rd)
      ? { show: true, cx: rd.x, rx: +Math.max(2, Math.min(142, rd.x - 48)).toFixed(1), ry: +(rd.y - 34).toFixed(1), t1: +(rd.y - 20).toFixed(1), t2: +(rd.y - 6).toFixed(1), k: rd.k, raw: rd.raw }
      : { show: false, cx: 0, rx: 0, ry: 0, t1: 0, t2: 0, k: '', raw: '' }
    return { ...base, tip }
  }, [s.radarHover])

  const sel = s.selectedMetric
  const pub = s.privacy[sel] === 'public'
  const shareInfo = pub
    ? { text: '공개 · 다른 회원이 보고 코멘트할 수 있어요', color: '#67D7DF', bg: 'rgba(46,155,166,.16)', dot: '#2E9BA6' }
    : { text: '비공개 · 나와 코치만 볼 수 있어요', color: 'rgba(231,239,234,.6)', bg: 'rgba(255,255,255,.06)', dot: 'rgba(231,239,234,.4)' }

  // brief
  const _f = (k: MetricKey, i: number) => metrics[k].series[i]
  const _l5 = metrics.smm.series.length - 1
  const dPbf = +(_f('pbf', _l5) - _f('pbf', 0)).toFixed(1)
  const dSmm = +(_f('smm', _l5) - _f('smm', 0)).toFixed(1)
  const dScore = _f('score', _l5) - _f('score', 0)
  const avgSleep = +(conditionLog.reduce((a, c) => a + c.sleep, 0) / conditionLog.length).toFixed(1)
  const gapPbf = +(_f('pbf', _l5) - goals.pbf).toFixed(1)
  const gapSmm = +(goals.smm - _f('smm', _l5)).toFixed(1)
  const gapScore = goals.score - _f('score', _l5)
  const briefVariants = [
    { focus: '종합 진행', summary: '지난 6개월간 체지방률은 ' + dPbf + '%p, 골격근량은 +' + dSmm + 'kg 변했고 인바디 점수는 ' + (dScore > 0 ? '+' : '') + dScore + '점 올랐어요. 목표까지 체지방률 ' + gapPbf + '%p · 골격근 ' + gapSmm + 'kg · 점수 ' + gapScore + '점 남았습니다.', actions: ['단백질 체중당 1.6g 유지', '주 4회 근력 + 존2 30분', '측정 조건 동일하게 유지'] },
    { focus: '취약 구간', summary: '팔·다리 균형은 좋지만 몸통(트렁크)이 상대적으로 낮습니다. 남은 목표 중 골격근 +' + gapSmm + 'kg가 핵심이고, 여기서 인바디 점수 ' + gapScore + '점을 끌어올릴 여지가 큽니다.', actions: ['데드리프트·바벨로우 주 2회', '복부·코어 10분 루틴', '점진적 과부하로 중량 +2.5kg'] },
    { focus: '생활 습관', summary: '최근 평균 수면은 ' + avgSleep + '시간이에요. 수면이 7시간을 넘은 주에 체지방 감소 폭이 가장 컸습니다. 수면·수분을 고정하면 지금 흐름이 더 빨라져요.', actions: [(avgSleep < 7 ? '취침 24시 이전으로 당겨 7시간 확보' : '수면 7시간 이상 유지'), '하루 물 2.5L 채우기', '주말 액티브 리커버리 1회'] },
  ]
  const brief = briefVariants[s.briefIdx % briefVariants.length]

  const mkRing = (label: string, cur: number, goal: number, start: number, unit: string, down: boolean, color: string) => {
    let p = down ? (start - cur) / ((start - goal) || 1) : cur / (goal || 1)
    p = Math.max(0, Math.min(1, p))
    return { label, value: cur + unit, goal: '목표 ' + goal + unit, pct: Math.round(p * 100), dashArray: (ringCirc * p).toFixed(1) + ' ' + ringCirc.toFixed(1), color }
  }
  const rings = [
    mkRing('인바디 점수', 78, 90, 70, '점', false, '#67D7DF'),
    mkRing('골격근량', 31.9, 34, 29.4, 'kg', false, '#8FD89E'),
    mkRing('체지방률', 20.0, 15, 26.5, '%', true, '#E0B86A'),
    mkRing('내장지방', 5, 4, 8, '', true, '#E0A06A'),
  ]

  const cmpKeys: MetricKey[] = ['weight', 'smm', 'pbf', 'bmi', 'tbw', 'score']
  const compare = cmpKeys.map((k) => {
    const m = metrics[k]; const a = m.series[s.cmpFrom]; const b = m.series[s.cmpTo]; const d = +(b - a).toFixed(1)
    const improved = (m.good === 'up') ? d >= 0 : d <= 0
    return { label: m.label, unit: m.unit, before: a, after: b, delta: (d > 0 ? '+' : '') + d, deltaColor: improved ? '#67D7DF' : '#E0A06A', deltaBg: improved ? 'rgba(46,155,166,.16)' : 'rgba(224,138,94,.18)' }
  })
  const condition = conditionLog.map((c) => ({ w: c.w, sleep: c.sleep, workouts: c.workouts, sleepPct: Math.min(100, Math.round((c.sleep / 9) * 100)) }))
  const board = challenge.board.map((b, i) => ({ handle: b.handle, rank: i + 1, chgText: (b.chg > 0 ? '+' : '') + b.chg + '%p', rowBg: b.me ? 'rgba(46,155,166,.16)' : 'transparent', rowBorder: b.me ? 'rgba(103,215,223,.35)' : 'rgba(255,255,255,.07)' }))

  const metricKeysForCard: MetricKey[] = ['score', 'weight', 'smm', 'pbf', 'bmi', 'tbw']
  const membersDisp = s.members.map((m) => ({ ...m, publicCount: m.pub.length, lockedCount: metricKeysForCard.length - m.pub.filter((k) => metricKeysForCard.includes(k as MetricKey)).length }))
  let activeMember: (typeof membersDisp[number] & { metrics: { label: string; unit: string; locked: boolean; shown: boolean; value: number; spark: string }[]; comments: { author: string; initials: string; color: string; text: string }[] }) | null = null
  if (s.activeMember) {
    const m = s.members.find((x) => x.id === s.activeMember)!
    const mc = metricKeysForCard.map((k) => { const open = m.pub.includes(k); const met = metrics[k]; return { label: met.label, unit: met.unit, locked: !open, shown: open, value: met.series[met.series.length - 1], spark: buildSpark(met.series) } })
    activeMember = { ...m, publicCount: m.pub.length, lockedCount: metricKeysForCard.length - m.pub.filter((k) => metricKeysForCard.includes(k as MetricKey)).length, metrics: mc, comments: s.memberComments[m.id] || [] }
  }

  const statusOf = (score: number) => score >= 85 ? { t: '순조', fg: '#67D7DF', bg: 'rgba(46,155,166,.18)' } : score >= 78 ? { t: '유지', fg: '#D9B45A', bg: 'rgba(214,178,90,.2)' } : { t: '점검 필요', fg: '#E0A06A', bg: 'rgba(224,138,94,.2)' }
  const rosterSrc = [
    { id: 'jiwoo', name: '박지우', initials: '지우', color: '#6E9B8E', score: 78, pbf: 20.0, smm: 31.9, last: '6월 14일' },
    ...s.members.map((m, i) => ({ id: m.id, name: m.name, initials: m.initials, color: m.color, score: m.score, pbf: metrics.pbf.series[5] + (m.score - 80) * -0.3, smm: metrics.smm.series[5] + (m.score - 80) * 0.1, last: ['6월 12일', '6월 13일', '6월 11일'][i] || '6월 10일' })),
  ]
  const roster = rosterSrc.map((r) => { const st = statusOf(r.score); const tsel = s.coachTargetId === r.id; return { ...r, pbf: r.pbf.toFixed(1), smm: r.smm.toFixed(1), status: st.t, statusFg: st.fg, statusBg: st.bg, selBg: tsel ? CTA : 'rgba(255,255,255,.06)', selFg: tsel ? '#06110F' : '#BFD8D2', selBorder: tsel ? 'transparent' : 'rgba(255,255,255,.16)' } })
  const coachTargetMember = s.members.find((m) => m.id === s.coachTargetId)

  const messages = s.messages.map((m) => { const isMe = m.role === 'me'; return { ...m, dir: (isMe ? 'row-reverse' : 'row') as React.CSSProperties['flexDirection'], justify: isMe ? 'flex-end' : 'flex-start', radius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px', bubbleBg: isMe ? 'linear-gradient(135deg,#2E9BA6,#1E6E78)' : (m.role === 'trainer' ? 'rgba(46,155,166,.14)' : 'rgba(255,255,255,.06)'), bubbleFg: isMe ? '#06110F' : '#E7EFEA', bubbleBorder: isMe ? 'transparent' : (m.role === 'trainer' ? 'rgba(103,215,223,.25)' : 'rgba(255,255,255,.1)'), ring: m.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none' } })
  const onlineMembers = [
    { name: '코치 하늘', initials: '하늘', color: '#234B47', role: '트레이너', statusColor: '#2E9BA6' },
    { name: '이민서', initials: '민서', color: '#BE7A57', role: '회원', statusColor: '#2E9BA6' },
    { name: '조다온', initials: '다온', color: '#C29A4B', role: '회원', statusColor: '#2E9BA6' },
    { name: '박지우 (나)', initials: '지우', color: '#6E9B8E', role: '회원', statusColor: '#2E9BA6' },
    { name: '김아리', initials: '아리', color: '#5E97A0', role: '회원', statusColor: '#D6B25A' },
  ]

  const segs = segData.map((seg) => { const c = segColor(seg.pct); const selS = s.selectedSegment === seg.key; return { ...seg, color: c, border: selS ? c : 'rgba(255,255,255,.12)', chipBg: selS ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.04)' } })
  const selSeg = (() => { const ss = segData.find((x) => x.key === s.selectedSegment) || segData[2]; const st = ss.pct >= 100 ? '표준 이상 · 우수' : (ss.pct >= 95 ? '표준 범위' : '표준 이하'); return { name: ss.name, pct: ss.pct, kg: ss.kg, color: segColor(ss.pct), status: st } })()

  const metricChips = (Object.keys(metrics) as MetricKey[]).map((k) => { const a = s.selectedMetric === k; return { key: k, label: metrics[k].short || metrics[k].label, bg: a ? CTA : 'rgba(255,255,255,.05)', fg: a ? '#06110F' : '#9FBCB5', border: a ? 'transparent' : 'rgba(255,255,255,.12)' } })

  const comments = (s.commentsByMetric[sel] || []).map((c) => ({ ...c, tag: c.role === 'trainer' ? '코치' : (c.role === 'me' ? '나' : '회원'), tagBg: c.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF' }))
  const postsDisp = s.posts.map((p) => ({ ...p, tag: p.role === 'trainer' ? '코치' : (p.role === 'me' ? '나' : '회원'), tagBg: p.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF', ring: p.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none', likeColor: p.liked ? '#E0A06A' : 'rgba(231,239,234,.6)', likeFill: p.liked ? '#E0A06A' : 'none', commentCount: p.comments.length }))

  const P = s.profile
  const genders = ['남성', '여성', '기타'].map((g) => ({ label: g, bg: P.gender === g ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: P.gender === g ? '#06110F' : '#9FBCB5', border: P.gender === g ? 'transparent' : 'rgba(255,255,255,.12)' }))
  const chMetrics = ['체지방률', '골격근량', '체중', '인바디 점수'].map((m) => ({ label: m, bg: s.chMetric === m ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chMetric === m ? '#06110F' : '#9FBCB5' }))
  const chPeriods = ['2주', '4주', '8주'].map((pp) => ({ label: pp, bg: s.chPeriod === pp ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chPeriod === pp ? '#06110F' : '#9FBCB5' }))
  const chScopes = ['전체 공개', '비공개'].map((pp) => ({ label: pp, bg: s.chScope === pp ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chScope === pp ? '#06110F' : '#9FBCB5' }))
  const fromChips = dates.map((dt, i) => ({ label: dt.split(' ')[0], bg: i === s.cmpFrom ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: i === s.cmpFrom ? '#06110F' : '#9FBCB5' }))
  const toChips = dates.map((dt, i) => ({ label: dt.split(' ')[0], bg: i === s.cmpTo ? '#67D7DF' : 'rgba(255,255,255,.05)', fg: i === s.cmpTo ? '#06110F' : '#9FBCB5' }))

  const titles: Record<View, [string, string]> = {
    profile: ['프로필 설정', '사진·생년월일·성별·연락처를 관리하세요'],
    health: ['나의 건강', '시간에 따른 나의 체성분 변화'],
    community: ['커뮤니티', '하늘 랩 회원들의 기록과 응원'],
    chat: ['그룹 채팅', '회원과 코치가 함께하는 실시간 대화'],
    members: ['멤버', '다른 회원이 공개한 기록을 둘러보세요'],
    trainer: ['트레이너 스튜디오', '모든 회원을 한 곳에서 관리하세요'],
  }
  const score = metrics.score.series[5]
  const dateLatest = dates[5]
  const scans = [
    { date: '2026 · 6월 14일', has: true }, { date: '2026 · 5월 10일', has: false },
    { date: '2026 · 4월 12일', has: false }, { date: '2026 · 3월 15일', has: false },
  ].map((r) => ({ date: r.date, label: r.has ? '결과지 보기' : '미첨부', cursor: r.has ? 'pointer' : 'default', chipBg: r.has ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.05)', chipFg: r.has ? '#67D7DF' : 'rgba(231,239,234,.35)', has: r.has }))

  const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 14, padding: '12px 15px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 7, display: 'block' }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', fontFamily: "'Pretendard',system-ui,sans-serif", color: '#E7EFEA', background: 'radial-gradient(120% 90% at 82% -8%,#0F302D 0%,#0A1B18 52%,#06110F 100%)' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.4, backgroundImage: 'radial-gradient(rgba(255,255,255,.025) 1px,transparent 1.4px)', backgroundSize: '32px 32px' }} />

      {/* LOGIN GATE */}
      {!s.authed && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'radial-gradient(120% 90% at 50% 18%,#11302D 0%,#0A1B18 55%,#06110F 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)', width: '60%', maxWidth: 520, height: 300, background: 'radial-gradient(circle,rgba(46,155,166,.22),transparent 60%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.11)', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '36px 30px', boxShadow: '0 40px 90px -50px rgba(0,0,0,.9)' }}>
            <img src="/assets/logo-mark.png" alt="로고" style={{ width: 56, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 14px' }} />
            <div style={{ textAlign: 'center', fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#F2F7F3' }}>하늘 웰니스 랩</div>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(231,239,234,.5)', margin: '5px 0 26px' }}>회원 전용 포털에 로그인하세요</div>
            <input value={s.loginEmail} onChange={(e) => set({ loginEmail: e.target.value })} placeholder="이메일" style={{ ...inputStyle, padding: '13px 16px', fontSize: 14, marginBottom: 10 }} />
            <input value={s.loginPw} onChange={(e) => set({ loginPw: e.target.value })} type="password" placeholder="비밀번호" style={{ ...inputStyle, padding: '13px 16px', fontSize: 14, marginBottom: 18 }} />
            <button onClick={() => set({ authed: true })} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', fontSize: 15, fontWeight: 700, color: '#06110F', background: CTA, padding: 14, borderRadius: 24, boxShadow: '0 16px 34px -16px rgba(22,192,206,.9)' }}>로그인</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 12, color: 'rgba(231,239,234,.5)' }}>
              <span style={{ cursor: 'pointer' }}>비밀번호 찾기</span>
              <span onClick={() => set({ authed: true })} style={{ cursor: 'pointer', color: '#67D7DF', fontWeight: 600 }}>회원가입</span>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside style={{ position: 'sticky', top: 0, zIndex: 3, width: 248, flex: 'none', height: '100vh', display: 'flex', flexDirection: 'column', gap: 6, padding: '26px 18px', background: 'linear-gradient(176deg,#11302C 0%,#0B221E 52%,#081915 100%)', borderRight: '1px solid rgba(184,148,85,.2)', color: '#E7EFEA', boxShadow: '18px 0 50px -40px rgba(0,0,0,.9)' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 22px' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', overflow: 'hidden', boxShadow: '0 8px 18px -10px rgba(0,0,0,.7)' }}>
            <img src="/assets/logo-mark.png" alt="로고" style={{ width: '118%', height: '118%', objectFit: 'contain' }} />
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 18, letterSpacing: '.2px' }}>하늘 웰니스 랩</div>
            <div style={{ fontSize: 9, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#8FB0AA', marginTop: 2 }}>Haneul Wellness Lab</div>
          </div>
        </a>

        {(['health', 'community', 'chat', 'members'] as View[]).map((k) => {
          const ns = navColor(k)
          const labels: Record<string, string> = { health: '나의 건강', community: '커뮤니티', chat: '그룹 채팅', members: '멤버' }
          const icons: Record<string, React.ReactNode> = {
            health: <><circle cx="12" cy="12" r="8.5" /><path d="M5 12h3l2-4 3 8 2-4h4" strokeLinecap="round" strokeLinejoin="round" /></>,
            community: <><rect x="3.5" y="4.5" width="17" height="6" rx="2.5" /><rect x="3.5" y="13.5" width="11" height="6" rx="2.5" /></>,
            chat: <path d="M4.5 5.5h15v10h-9l-4 4v-4h-2z" strokeLinejoin="round" />,
            members: <><circle cx="8.5" cy="9" r="3.2" /><circle cx="16" cy="10.5" r="2.7" /><path d="M3.5 19c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6" strokeLinecap="round" /></>,
          }
          return (
            <button key={k} onClick={() => go(k)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 13, fontSize: 14.5, fontWeight: 500, transition: 'background .2s', background: ns.bg, color: ns.fg }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={ns.fg} strokeWidth="1.8">{icons[k]}</svg>
              {labels[k]}
              {k === 'chat' && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", background: '#2E9BA6', color: '#06110F', borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>4</span>}
            </button>
          )
        })}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#6F8E86', padding: '0 6px' }}>보기 모드</div>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,.3)', borderRadius: 12, padding: 4 }}>
            <button onClick={() => set({ role: 'client', view: s.view === 'trainer' ? 'health' : s.view })} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12.5, fontWeight: 600, borderRadius: 9, transition: 'all .2s', background: isClient ? '#C9A24B' : 'transparent', color: isClient ? '#06110F' : '#8FB0AA' }}>회원</button>
            <button onClick={() => set({ role: 'trainer', view: 'trainer' })} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12.5, fontWeight: 600, borderRadius: 9, transition: 'all .2s', background: isTrainer ? '#C9A24B' : 'transparent', color: isTrainer ? '#06110F' : '#8FB0AA' }}>트레이너</button>
          </div>
          <button onClick={() => go('profile')} className="hwl-soft-hover" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12 }}>
            <Avatar initials={meDisp.initials} color={meDisp.color} size={34} photo={isTrainer ? null : P.photo} fontSize={12} />
            <div style={{ lineHeight: 1.2, overflow: 'hidden', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: '#EAF3F1' }}>{meDisp.name}</div>
              <div style={{ fontSize: 10.5, color: '#8FB0AA' }}>{meDisp.role} · 프로필 설정</div>
            </div>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px', background: 'rgba(8,22,19,.66)', backdropFilter: 'blur(18px) saturate(1.2)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 25, letterSpacing: '.2px', color: '#F2F7F3' }}>{titles[s.view][0]}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', marginTop: 3 }}>{titles[s.view][1]}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9FE2E8', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 11, padding: '8px 13px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 3px rgba(46,155,166,.25)' }} />다음 측정까지 19일
            </div>
          </div>
        </header>

        <div style={{ flex: 1, minWidth: 0, padding: '26px 34px 60px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          {/* ============ 나의 건강 ============ */}
          <div style={{ display: s.view === 'health' ? 'block' : 'none', animation: 'hwl-rise .4s ease both' }}>
            {/* HERO BAND */}
            <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg,#1B413B 0%,#102D28 55%,#1A463F 100%)', border: '1px solid rgba(184,148,85,.18)', borderRadius: 26, padding: '24px 30px', marginBottom: 20, boxShadow: '0 30px 64px -44px rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ position: 'absolute', top: '-55%', right: '7%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle,rgba(46,155,166,.45),transparent 65%)', filter: 'blur(38px)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '-65%', left: '28%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(184,148,85,.34),transparent 68%)', filter: 'blur(36px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', flex: 'none', background: meDisp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, boxShadow: '0 0 0 2px rgba(184,148,85,.6),0 10px 24px -10px rgba(0,0,0,.6)' }}>{meDisp.initials}</div>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A24B' }}>My Wellness</div>
                  <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 25, color: '#F3EFE6', marginTop: 2 }}>{meDisp.name}</div>
                  <div style={{ fontSize: 12.5, color: '#9FBCB5', marginTop: 3 }}>171cm · 26세 · 남성 · {dateLatest} 측정</div>
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 2, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 22 }}>
                  <div><div style={{ fontSize: 11, color: '#9FBCB5' }}>체지방률</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 23, color: '#fff', marginTop: 1 }}>20.0<span style={{ fontSize: 12, color: '#C9A24B' }}> %</span></div></div>
                  <div><div style={{ fontSize: 11, color: '#9FBCB5' }}>골격근량</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 23, color: '#fff', marginTop: 1 }}>31.9<span style={{ fontSize: 12, color: '#C9A24B' }}> kg</span></div></div>
                </div>
                <div style={{ position: 'relative', width: 98, height: 98, flex: 'none' }}>
                  <svg viewBox="0 0 120 120" style={{ width: 98, height: 98, transform: 'rotate(-90deg)' }}>
                    <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#67D7DF" /><stop offset="100%" stopColor="#2E9BA6" /></linearGradient></defs>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="9" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#scoreGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray="254.8 326.7" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 29, color: '#fff', lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: 9, color: '#9FBCB5', letterSpacing: '1px', marginTop: 2 }}>인바디 점수</div>
                  </div>
                </div>
              </div>
            </section>

            {/* BRIEFING + GOAL RINGS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
              <section style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div><div style={eyebrow}>AI Coach Briefing</div><div style={cardTitle}>이번 달 코치 브리핑</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#C9A24B', background: 'rgba(201,162,75,.14)', border: '1px solid rgba(201,162,75,.3)', borderRadius: 14, padding: '4px 10px' }}>{brief.focus}</span>
                    <button onClick={() => setFn((p) => ({ briefIdx: (p.briefIdx + 1) % briefVariants.length }))} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '6px 12px' }}>다시 생성</button>
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(231,239,234,.82)', margin: '14px 0 16px' }}>{brief.summary}</p>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 9 }}>다음 2주 액션</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {brief.actions.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#EAF3F1', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '11px 14px' }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', flex: 'none', background: 'rgba(46,155,166,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#67D7DF" strokeWidth="2.6"><path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" /></svg></span>{a}
                    </div>
                  ))}
                </div>
              </section>
              <section style={{ ...card, padding: 22 }}>
                <div style={eyebrow}>Goal Rings</div><div style={cardTitle}>목표 달성률</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  {rings.map((r, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <div style={{ position: 'relative', width: 82, height: 82 }}>
                        <svg viewBox="0 0 80 80" style={{ width: 82, height: 82, transform: 'rotate(-90deg)' }}>
                          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7" />
                          <circle cx="40" cy="40" r="34" fill="none" stroke={r.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={r.dashArray} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Gowun Batang',serif", fontSize: 18, color: '#F2F7F3' }}>{r.pct}<span style={{ fontSize: 10, marginTop: 4 }}>%</span></div>
                      </div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#EAF3F1', fontWeight: 600 }}>{r.label}</div><div style={{ fontSize: 10, color: 'rgba(231,239,234,.45)', marginTop: 1 }}>{r.value} · {r.goal}</div></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* 3D MODEL + GAUGES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 20, alignItems: 'stretch' }}>
              <section style={{ ...card, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 22px 4px', position: 'relative', zIndex: 2 }}>
                  <div>
                    <div style={eyebrow}>Segmental Lean</div>
                    <div style={cardTitle}>부위별 근육 모델</div>
                    <div style={{ fontSize: 12, color: 'rgba(231,239,234,.5)', marginTop: 5 }}>드래그하여 회전 · 부위를 탭하세요</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B' }}>Segment</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: selSeg.color, boxShadow: `0 0 12px ${selSeg.color}` }} /><span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 20, color: '#EAF3F1' }}>{selSeg.name}</span></div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#67D7DF', marginTop: 4 }}>근육 {selSeg.kg}kg · 균형 {selSeg.pct}%</div>
                    <div style={{ fontSize: 11, color: 'rgba(231,239,234,.45)', marginTop: 2 }}>{selSeg.status}</div>
                  </div>
                </div>
                <div ref={mount3d} style={{ flex: 1, minHeight: 340, width: '100%', cursor: 'grab', position: 'relative', zIndex: 1 }} />
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '6px 20px 18px', position: 'relative', zIndex: 2 }}>
                  {segs.map((sg) => (
                    <button key={sg.key} onClick={() => set({ selectedSegment: sg.key })} onMouseEnter={() => set({ selectedSegment: sg.key })} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 11, fontSize: 12.5, fontWeight: 600, border: `1.5px solid ${sg.border}`, background: sg.chipBg, color: '#EAF3F1', transition: 'all .18s' }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: sg.color }} />{sg.name}<span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'rgba(231,239,234,.5)', fontWeight: 500 }}>{sg.pct}%</span>
                    </button>
                  ))}
                </div>
              </section>

              <section style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div><div style={eyebrow}>Latest Scan</div><div style={cardTitle}>체성분 · {dateLatest}</div></div>
                  <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: '#8FB0AA' }}>측정 6회</div>
                </div>
                {gauges.map((g) => {
                  const gp = s.privacy[g.key]; const gpub = gp === 'public'
                  return (
                    <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 7, animation: 'hwl-rise .4s ease both' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EAF3F1' }}>{g.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: g.statusColor, fontFamily: "'IBM Plex Mono',monospace" }}>{g.status}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 18, color: '#F2F7F3' }}>{g.value}<span style={{ fontSize: 11, color: 'rgba(231,239,234,.45)', fontFamily: "'Pretendard'" }}> {g.unit}</span></span>
                          <button onClick={() => togglePrivacy(g.key)} title="공개 설정" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, border: `1px solid ${gpub ? 'rgba(103,215,223,.4)' : 'rgba(255,255,255,.12)'}`, background: gpub ? 'rgba(46,155,166,.16)' : 'rgba(255,255,255,.05)', color: gpub ? '#67D7DF' : 'rgba(231,239,234,.5)' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: gpub ? '#2E9BA6' : 'rgba(231,239,234,.4)' }} />{gpub ? '공개' : '비공개'}
                          </button>
                        </div>
                      </div>
                      <div style={{ position: 'relative', height: 13, borderRadius: 8, overflow: 'visible', display: 'flex', background: 'rgba(255,255,255,.08)' }}>
                        <div style={{ height: '100%', width: `${g.underW}%`, background: 'rgba(224,138,94,.4)', borderRadius: '8px 0 0 8px' }} />
                        <div style={{ height: '100%', width: `${g.normW}%`, background: 'linear-gradient(90deg,#2E9BA6,#67D7DF)' }} />
                        <div style={{ height: '100%', width: `${g.overW}%`, background: 'rgba(201,162,75,.45)', borderRadius: '0 8px 8px 0' }} />
                        <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${g.markerPct}%`, width: 3, background: '#fff', borderRadius: 3, boxShadow: '0 0 8px rgba(255,255,255,.6)' }} />
                      </div>
                    </div>
                  )
                })}
              </section>
            </div>

            {/* TREND + RADAR */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
              <section style={{ ...card, padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div><div style={eyebrow}>Trend</div><div style={cardTitle}>{trend.title} 추이</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 28, color: '#67D7DF' }}>{trend.latest}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: trend.deltaColor, background: trend.deltaBg, padding: '3px 9px', borderRadius: 20 }}>{trend.deltaText}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '15px 0 6px' }}>
                  {metricChips.map((c) => (
                    <button key={c.key} onClick={() => set({ selectedMetric: c.key })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 9, transition: 'all .18s', border: `1px solid ${c.border}`, background: c.bg, color: c.fg }}>{c.label}</button>
                  ))}
                </div>
                <svg viewBox="0 0 560 260" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
                  <defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2E9BA6" stopOpacity="0.42" /><stop offset="100%" stopColor="#2E9BA6" stopOpacity="0" /></linearGradient></defs>
                  {trend.grid.map((gl, i) => (
                    <g key={i}>
                      <line x1="44" y1={gl.y} x2="540" y2={gl.y} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
                      <text x="38" y={gl.ty} textAnchor="end" fontSize="10" fill="rgba(231,239,234,.4)" fontFamily="IBM Plex Mono">{gl.label}</text>
                    </g>
                  ))}
                  <path d={trend.area} fill="url(#trendArea)" />
                  <path d={trend.line} fill="none" stroke="#67D7DF" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
                  {trend.tip.show && <line x1={trend.tip.x} y1="24" x2={trend.tip.x} y2="218" stroke="rgba(103,215,223,.55)" strokeWidth="1" strokeDasharray="3 3" />}
                  {trend.pts.map((p, i) => (
                    <g key={i}>
                      <text x={p.x} y="252" textAnchor="middle" fontSize="10" fill="rgba(231,239,234,.4)" fontFamily="IBM Plex Mono">{p.label}</text>
                      <circle cx={p.x} cy={p.y} r={p.r} fill="#0A1B18" stroke="#67D7DF" strokeWidth="2.4" />
                      <circle cx={p.x} cy={p.y} r="17" fill="transparent" onMouseEnter={() => set({ hoverIdx: i })} onMouseLeave={() => set({ hoverIdx: -1 })} style={{ cursor: 'pointer' }} />
                    </g>
                  ))}
                  {trend.tip.show && <>
                    <rect x={trend.tip.rx} y={trend.tip.ry} width="100" height="42" rx="10" fill="#0C2A26" stroke="rgba(103,215,223,.45)" />
                    <text x={trend.tip.cx} y={trend.tip.t1} textAnchor="middle" fontSize="10" fill="#9FBCB5" fontFamily="IBM Plex Mono">{trend.tip.date}</text>
                    <text x={trend.tip.cx} y={trend.tip.t2} textAnchor="middle" fontSize="15" fontWeight="700" fill="#EAF3F1" fontFamily="IBM Plex Mono">{trend.tip.val}</text>
                  </>}
                </svg>
              </section>

              <section style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={eyebrow}>Balance</div>
                <div style={{ ...cardTitle, margin: '3px 0 4px' }}>종합 밸런스</div>
                <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: 300, margin: '6px auto 0', height: 'auto', overflow: 'visible' }}>
                  {radar.rings.map((r, i) => <polygon key={i} points={r.points} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />)}
                  {radar.spokes.map((sp, i) => <line key={i} x1="120" y1="120" x2={sp.x} y2={sp.y} stroke="rgba(255,255,255,.08)" strokeWidth="1" />)}
                  <polygon points={radar.prevPoints} fill="none" stroke="#C9A24B" strokeWidth="1.6" strokeDasharray="4 4" />
                  <polygon points={radar.curPoints} fill="rgba(46,155,166,.28)" stroke="#67D7DF" strokeWidth="2.4" strokeLinejoin="round" />
                  {radar.curDots.map((d, i) => (
                    <g key={i}>
                      <circle cx={d.x} cy={d.y} r="3.4" fill="#67D7DF" />
                      <circle cx={d.x} cy={d.y} r="13" fill="transparent" onMouseEnter={() => set({ radarHover: i })} onMouseLeave={() => set({ radarHover: -1 })} style={{ cursor: 'pointer' }} />
                    </g>
                  ))}
                  {radar.labels.map((l, i) => <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize="10.5" fontWeight="600" fill="rgba(231,239,234,.6)" fontFamily="Pretendard">{l.k}</text>)}
                  {radar.tip.show && <>
                    <rect x={radar.tip.rx} y={radar.tip.ry} width="96" height="30" rx="8" fill="#0C2A26" stroke="rgba(103,215,223,.45)" />
                    <text x={radar.tip.cx} y={radar.tip.t1} textAnchor="middle" fontSize="9" fill="#9FBCB5" fontFamily="Pretendard">{radar.tip.k}</text>
                    <text x={radar.tip.cx} y={radar.tip.t2} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#EAF3F1" fontFamily="IBM Plex Mono">{radar.tip.raw}</text>
                  </>}
                </svg>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11, color: 'rgba(231,239,234,.5)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, background: '#67D7DF', borderRadius: 2 }} />현재</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed #C9A24B' }} />1월</span>
                </div>
                <button onClick={() => setFn((p) => ({ showBalInfo: !p.showBalInfo }))} style={{ all: 'unset', cursor: 'pointer', marginTop: 14, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: '#9FE2E8' }}><span style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid #9FE2E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>i</span>밸런스는 어떻게 계산되나요?</button>
                {s.showBalInfo && (
                  <div style={{ marginTop: 11, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', fontSize: 12.5, lineHeight: 1.7, color: 'rgba(231,239,234,.72)' }}>6개의 축(근육·체지방·수분·점수·BMI·내장지방)을 각각 건강 권장 범위에 대해 <b style={{ color: '#9FE2E8' }}>0~100%로 정규화</b>해 그린 그래프예요. 바깥에 가까울수록 좋고, 모든 축이 <b style={{ color: '#9FE2E8' }}>고르게 크고 둥근 육각형</b>일수록 이상적입니다. 한쪽만 튀거나 안쪽으로 찌그러지면 그 영역에 개선 여지가 있다는 뜻이에요. 점에 마우스를 올리면 실제 수치를 볼 수 있어요.</div>
                )}
              </section>
            </div>

            {/* RESEARCH + RECORDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
              <section style={{ ...card, padding: 22 }}>
                <div style={eyebrow}>Research</div>
                <div style={{ ...cardTitle, margin: '3px 0 16px' }}>측정 상세값</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 13 }}>
                  {research.map((r, i) => (
                    <div key={i} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '14px 15px' }}>
                      <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)', fontWeight: 500 }}>{r.k}</div>
                      <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#67D7DF', marginTop: 3 }}>{r.v}<span style={{ fontSize: 11, color: 'rgba(231,239,234,.4)', fontFamily: "'Pretendard'" }}> {r.u}</span></div>
                    </div>
                  ))}
                </div>
              </section>
              <section style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div style={eyebrow}>Records</div>
                <div style={{ ...cardTitle, margin: '3px 0 14px' }}>측정 기록</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {scans.map((r, i) => (
                    <button key={i} onClick={() => { if (r.has) set({ scanOpen: true }) }} className="hwl-row-hover" style={{ all: 'unset', cursor: r.cursor, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 15px', borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8FB0AA" strokeWidth="1.7"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
                        <span style={{ fontSize: 13.5, color: '#EAF3F1', fontWeight: 500 }}>{r.date}</span>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: r.chipFg, background: r.chipBg, padding: '5px 11px', borderRadius: 18 }}>{r.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* COMPARE + LIFESTYLE */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
              <section style={{ ...card, padding: 22 }}>
                <div style={eyebrow}>Compare</div><div style={cardTitle}>변화 비교</div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0 16px' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(231,239,234,.5)', marginBottom: 6 }}>기준 · {dates[s.cmpFrom]}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{fromChips.map((c, i) => <button key={i} onClick={() => set({ cmpFrom: i })} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 8, background: c.bg, color: c.fg }}>{c.label}</button>)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(231,239,234,.5)', marginBottom: 6 }}>비교 · {dates[s.cmpTo]}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{toChips.map((c, i) => <button key={i} onClick={() => set({ cmpTo: i })} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 8, background: c.bg, color: c.fg }}>{c.label}</button>)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {compare.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', borderRadius: 12, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
                      <span style={{ fontSize: 13, color: '#EAF3F1', fontWeight: 600 }}>{c.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }}>
                        <span style={{ color: 'rgba(231,239,234,.5)' }}>{c.before}</span><span style={{ color: 'rgba(231,239,234,.3)' }}>→</span><span style={{ color: '#F2F7F3' }}>{c.after}{c.unit}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: c.deltaColor, background: c.deltaBg, padding: '3px 8px', borderRadius: 14 }}>{c.delta}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section style={{ ...card, padding: 22 }}>
                <div style={eyebrow}>Lifestyle</div><div style={cardTitle}>컨디션 로그</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(231,239,234,.6)', margin: '12px 0 14px' }}>수면이 7시간을 넘는 주에 체지방 감소 폭이 가장 컸어요. 수분 섭취도 함께 늘려보세요.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {condition.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ fontSize: 11.5, color: 'rgba(231,239,234,.55)', width: 46, flex: 'none' }}>{c.w}</span>
                      <div style={{ flex: 1, height: 9, borderRadius: 6, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${c.sleepPct}%`, background: 'linear-gradient(90deg,#2E9BA6,#67D7DF)' }} /></div>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: '#9FE2E8', width: 58, textAlign: 'right' }}>수면 {c.sleep}h</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'rgba(231,239,234,.45)', width: 32, textAlign: 'right' }}>{c.workouts}회</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* CHART COMMENTS */}
            <section style={{ ...card, padding: 22, marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 20, color: '#F2F7F3' }}>“{trend.title}” 코멘트</div>
                <div style={{ fontSize: 12, color: shareInfo.color, display: 'flex', alignItems: 'center', gap: 7, background: shareInfo.bg, padding: '5px 11px', borderRadius: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: shareInfo.dot }} />{shareInfo.text}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '18px 0' }}>
                {comments.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, animation: 'hwl-rise .35s ease both' }}>
                    <Avatar initials={c.initials} color={c.color} size={36} fontSize={11.5} />
                    <div style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: '4px 16px 16px 16px', padding: '12px 15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#EAF3F1' }}>{c.author}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: c.tagFg, background: c.tagBg, padding: '1px 7px', borderRadius: 10 }}>{c.tag}</span>
                        <span style={{ fontSize: 11, color: 'rgba(231,239,234,.4)', marginLeft: 'auto' }}>{c.time}</span>
                      </div>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(231,239,234,.8)' }}>{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <Avatar initials={meDisp.initials} color={meDisp.color} size={36} fontSize={11.5} />
                <input value={s.newComment} onChange={(e) => set({ newComment: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment() } }} placeholder="이 차트에 코멘트를 남겨보세요…" style={{ flex: 1, fontFamily: 'inherit', fontSize: 14, padding: '12px 16px', borderRadius: 22, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                <button onClick={submitComment} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#06110F', background: CTA, padding: '11px 20px', borderRadius: 22 }}>등록</button>
              </div>
            </section>
          </div>

          {/* ============ 커뮤니티 ============ */}
          {s.view === 'community' && (
            <div style={{ maxWidth: 720, margin: '0 auto', animation: 'hwl-rise .4s ease both' }}>
              <section style={{ ...card, position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 22, marginBottom: 20 }}>
                <div style={{ position: 'absolute', top: '-50%', right: '-5%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(46,155,166,.3),transparent 65%)', filter: 'blur(34px)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div><div style={eyebrow}>Challenge</div><div style={cardTitle}>{challenge.title}</div><div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.6)', marginTop: 4 }}>목표 {challenge.goal} · {challenge.metric}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 26, color: '#67D7DF' }}>D-{challenge.daysLeft}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.45)' }}>남은 기간</div></div>
                </div>
                <div style={{ position: 'relative', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {board.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', borderRadius: 12, background: b.rowBg, border: `1px solid ${b.rowBorder}` }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: '#C9A24B', width: 18 }}>{b.rank}</span>
                      <span style={{ fontSize: 13.5, color: '#EAF3F1', fontWeight: 600, flex: 1 }}>{b.handle}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: '#67D7DF' }}>{b.chgText}</span>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'relative', fontSize: 11.5, color: 'rgba(231,239,234,.4)', marginTop: 11 }}>닉네임은 익명으로 표시되며, 공개 설정한 지표만 집계돼요.</div>
              </section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
                <button onClick={() => set({ showChallengeForm: true, chDone: '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#06110F', background: CTA, padding: '11px 20px', borderRadius: 22 }}>+ 챌린지 만들기</button>
                <span style={{ fontSize: 12, color: '#67D7DF' }}>{s.chDone}</span>
              </div>

              {s.showChallengeForm && (
                <div onClick={() => set({ showChallengeForm: false })} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,12,10,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'hwl-fade .25s ease both' }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#0C2622', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                    <div style={eyebrow}>New Challenge</div><div style={cardTitle}>챌린지 만들기</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 18 }}>
                      <div><label style={labelStyle}>제목</label><input value={s.chTitle} onChange={(e) => set({ chTitle: e.target.value })} placeholder="예) 6월 체지방 챌린지" style={inputStyle} /></div>
                      <div><label style={labelStyle}>지표</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{chMetrics.map((c, i) => <button key={i} onClick={() => set({ chMetric: c.label })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: c.bg, color: c.fg }}>{c.label}</button>)}</div></div>
                      <div><label style={labelStyle}>목표</label><input value={s.chGoal} onChange={(e) => set({ chGoal: e.target.value })} placeholder="예) -2.0%p" style={inputStyle} /></div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <div><label style={labelStyle}>기간</label><div style={{ display: 'flex', gap: 7 }}>{chPeriods.map((c, i) => <button key={i} onClick={() => set({ chPeriod: c.label })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: c.bg, color: c.fg }}>{c.label}</button>)}</div></div>
                        <div><label style={labelStyle}>공개 범위</label><div style={{ display: 'flex', gap: 7 }}>{chScopes.map((c, i) => <button key={i} onClick={() => set({ chScope: c.label })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: c.bg, color: c.fg }}>{c.label}</button>)}</div></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                      <button onClick={() => set({ showChallengeForm: false })} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9FBCB5', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                      <button onClick={createChallenge} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#06110F', background: CTA, padding: 13, borderRadius: 22 }}>만들기</button>
                    </div>
                  </div>
                </div>
              )}

              <section style={{ ...card, borderRadius: 22, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Avatar initials={meDisp.initials} color={meDisp.color} size={42} fontSize={13} />
                  <textarea value={s.newPost} onChange={(e) => set({ newPost: e.target.value })} placeholder="오늘의 성과나 궁금한 점을 나눠보세요…" style={{ flex: 1, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.5, padding: '11px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', resize: 'none', minHeight: 54, color: '#EAF3F1' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
                  <button onClick={submitPost} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#06110F', background: CTA, padding: '10px 22px', borderRadius: 22 }}>피드에 올리기</button>
                </div>
              </section>

              {postsDisp.map((p) => (
                <article key={p.id} style={{ ...card, borderRadius: 22, padding: 20, marginBottom: 18, animation: 'hwl-rise .4s ease both' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar initials={p.initials} color={p.color} size={44} fontSize={13} ring={p.ring} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 700, fontSize: 14.5, color: '#EAF3F1' }}>{p.author}</span><span style={{ fontSize: 10, fontWeight: 600, color: p.tagFg, background: p.tagBg, padding: '1px 8px', borderRadius: 10 }}>{p.tag}</span></div>
                      <div style={{ fontSize: 12, color: 'rgba(231,239,234,.4)' }}>{p.time}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(231,239,234,.85)', margin: '14px 2px 4px', whiteSpace: 'pre-wrap' }}>{p.text}</div>
                  {p.hasMetric && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'rgba(46,155,166,.12)', border: '1px solid rgba(103,215,223,.25)', borderRadius: 14, padding: '13px 15px', margin: '6px 0 2px' }}>
                      <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 30, color: '#67D7DF' }}>{p.metricVal}</div>
                      <div><div style={{ fontSize: 12.5, fontWeight: 600, color: '#EAF3F1' }}>{p.metricLabel}</div><div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)' }}>{p.metricSub}</div></div>
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#67D7DF', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9BA6' }} />공유된 차트</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <button onClick={() => toggleLike(p.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: p.likeColor }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill={p.likeFill} stroke={p.likeColor} strokeWidth="1.8"><path d="M12 20s-7-4.5-9.2-8.6C1.2 8.5 2.6 5.5 5.6 5.5c1.9 0 3.1 1.1 3.9 2.3.8-1.2 2-2.3 3.9-2.3 3 0 4.4 3 2.8 5.9C19 15.5 12 20 12 20z" strokeLinejoin="round" /></svg>{p.likes}
                    </button>
                    <button onClick={() => toggleComments(p.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(231,239,234,.6)' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(231,239,234,.6)" strokeWidth="1.8"><path d="M4 5h16v10H9l-4 4v-4H4z" strokeLinejoin="round" /></svg>댓글 {p.commentCount}
                    </button>
                  </div>
                  {p.open && (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {p.comments.map((cm, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10 }}>
                          <Avatar initials={cm.initials} color={cm.color} size={30} fontSize={10.5} />
                          <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: '3px 13px 13px 13px', padding: '9px 13px', flex: 1 }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{cm.author}</span> <span style={{ fontSize: 13, color: 'rgba(231,239,234,.78)' }}>{cm.text}</span></div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 2 }}>
                        <Avatar initials={meDisp.initials} color={meDisp.color} size={30} fontSize={10.5} />
                        <input value={p.draft} onChange={(e) => setPostDraft(p.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitPostComment(p.id) } }} placeholder="댓글을 입력하세요…" style={{ flex: 1, fontFamily: 'inherit', fontSize: 13, padding: '9px 14px', borderRadius: 18, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={() => submitPostComment(p.id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#67D7DF' }}>댓글</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* ============ 그룹 채팅 ============ */}
          {s.view === 'chat' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 224px', gap: 20, animation: 'hwl-rise .4s ease both' }}>
              <section style={{ ...card, borderRadius: 22, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 168px)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 4px rgba(46,155,166,.25)' }} />
                  <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 19, color: '#F2F7F3' }}>하늘 라운지 · 그룹 채팅</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(231,239,234,.45)', fontFamily: "'IBM Plex Mono',monospace" }}>5명 접속</div>
                </div>
                <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {messages.map((m) => (
                    <div key={m.id} style={{ display: 'flex', gap: 11, flexDirection: m.dir, animation: 'hwl-rise .3s ease both' }}>
                      <Avatar initials={m.initials} color={m.color} size={34} fontSize={11} ring={m.ring} />
                      <div style={{ maxWidth: '74%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, justifyContent: m.justify }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{m.author}</span><span style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)' }}>{m.time}</span></div>
                        <div style={{ fontSize: 14, lineHeight: 1.5, padding: '10px 14px', borderRadius: m.radius, background: m.bubbleBg, color: m.bubbleFg, border: `1px solid ${m.bubbleBorder}` }}>{m.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 11, alignItems: 'center' }}>
                  <input value={s.newMsg} onChange={(e) => set({ newMsg: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg() } }} placeholder="메시지를 입력하세요…" style={{ flex: 1, fontFamily: 'inherit', fontSize: 14.5, padding: '13px 18px', borderRadius: 24, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                  <button onClick={sendMsg} style={{ all: 'unset', cursor: 'pointer', width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#67D7DF,#2E9BA6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06110F" strokeWidth="2"><path d="M4 12l16-7-7 16-2-7z" strokeLinejoin="round" /></svg></button>
                </div>
              </section>
              <aside style={{ ...card, borderRadius: 22, padding: 18, height: 'fit-content' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 13 }}>접속 중</div>
                {onlineMembers.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                    <div style={{ position: 'relative', flex: 'none' }}><div style={{ width: 34, height: 34, borderRadius: '50%', background: o.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11 }}>{o.initials}</div><span style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: o.statusColor, border: '2.5px solid #0C2622' }} /></div>
                    <div style={{ lineHeight: 1.2 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#EAF3F1' }}>{o.name}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>{o.role}</div></div>
                  </div>
                ))}
              </aside>
            </div>
          )}

          {/* ============ 멤버 ============ */}
          {s.view === 'members' && (
            <div style={{ animation: 'hwl-rise .4s ease both' }}>
              {activeMember ? (
                <div>
                  <button onClick={() => set({ activeMember: null })} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 16 }}>‹ 멤버 목록으로</button>
                  <section style={{ ...card, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 6 }}>
                      <Avatar initials={activeMember.initials} color={activeMember.color} size={58} fontSize={17} />
                      <div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#F2F7F3' }}>{activeMember.name}</div><div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)' }}>{activeMember.bio2}</div></div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B' }}>점수</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 30, color: '#67D7DF' }}>{activeMember.score}</div></div>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', margin: '14px 0 6px' }}>{activeMember.name}님이 공개한 차트</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 13 }}>
                      {activeMember.metrics.map((mm, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 15, padding: 15, position: 'relative', overflow: 'hidden' }}>
                          {mm.locked ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: 74, color: 'rgba(231,239,234,.4)' }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(231,239,234,.4)" strokeWidth="1.8"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                              <span style={{ fontSize: 11.5, fontWeight: 600 }}>비공개</span>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(231,239,234,.6)' }}>{mm.label}</div>
                              <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 26, color: '#F2F7F3', margin: '2px 0' }}>{mm.value}<span style={{ fontSize: 12, color: 'rgba(231,239,234,.4)' }}> {mm.unit}</span></div>
                              <svg viewBox="0 0 120 34" style={{ width: '100%', height: 30 }}><path d={mm.spark} fill="none" stroke="#67D7DF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#EAF3F1' }}>{activeMember.name}님 응원하기</div>
                      {activeMember.comments.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}><Avatar initials={c.initials} color={c.color} size={30} fontSize={10.5} /><div style={{ background: 'rgba(255,255,255,.05)', borderRadius: '3px 13px 13px 13px', padding: '9px 13px', flex: 1 }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{c.author}</span> <span style={{ fontSize: 13, color: 'rgba(231,239,234,.78)' }}>{c.text}</span></div></div>
                      ))}
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 6 }}>
                        <input value={s.memberDraft} onChange={(e) => set({ memberDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitMemberComment() } }} placeholder="따뜻한 한마디를 남겨보세요…" style={{ flex: 1, fontFamily: 'inherit', fontSize: 13.5, padding: '11px 15px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={submitMemberComment} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#06110F', background: CTA, padding: '10px 18px', borderRadius: 20 }}>보내기</button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(248px,1fr))', gap: 18 }}>
                  {membersDisp.map((m) => (
                    <button key={m.id} onClick={() => openMember(m.id)} className="hwl-card-hover" style={{ all: 'unset', cursor: 'pointer', ...card, borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar initials={m.initials} color={m.color} size={48} fontSize={15} />
                        <div><div style={{ fontWeight: 700, fontSize: 15, color: '#EAF3F1' }}>{m.name}</div><div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)' }}>{m.bio}</div></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div><div style={{ fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>점수</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 26, color: '#67D7DF' }}>{m.score}</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#67D7DF', fontWeight: 600 }}>공개 {m.publicCount}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>비공개 {m.lockedCount}</div></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============ 프로필 설정 ============ */}
          {s.view === 'profile' && (
            <div style={{ maxWidth: 600, margin: '0 auto', animation: 'hwl-rise .4s ease both' }}>
              <section style={{ ...card, padding: 28 }}>
                <div style={eyebrow}>Profile</div><div style={cardTitle}>프로필 설정</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '22px 0 24px' }}>
                  <Avatar initials={meDisp.initials} color={meDisp.color} size={84} photo={P.photo} fontSize={24} />
                  <label style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '9px 16px' }}>프로필 사진 변경<input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} /></label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><label style={labelStyle}>이름</label><input value={P.name} onChange={(e) => onProfileField('name', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>생년월일</label><input type="date" value={P.birth} onChange={(e) => onProfileField('birth', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>성별</label><div style={{ display: 'flex', gap: 8 }}>{genders.map((g, i) => <button key={i} onClick={() => onProfileField('gender', g.label)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 600, border: `1px solid ${g.border}`, background: g.bg, color: g.fg }}>{g.label}</button>)}</div></div>
                  <div><label style={labelStyle}>핸드폰 번호</label><input value={P.phone} onChange={(e) => onProfileField('phone', e.target.value)} placeholder="010-0000-0000" style={inputStyle} /></div>
                </div>
                <button onClick={() => { set({ profileSaved: '✓ 저장되었습니다.' }); go('health') }} style={{ all: 'unset', cursor: 'pointer', marginTop: 24, textAlign: 'center', display: 'block', width: '100%', fontSize: 15, fontWeight: 700, color: '#06110F', background: CTA, padding: 14, borderRadius: 24 }}>저장하기</button>
                <div style={{ textAlign: 'center', fontSize: 12, color: '#67D7DF', marginTop: 10 }}>{s.profileSaved}</div>
              </section>
            </div>
          )}

          {/* ============ 트레이너 ============ */}
          {s.view === 'trainer' && (
            <div style={{ animation: 'hwl-rise .4s ease both' }}>
              <section style={{ ...card, padding: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.3fr', gap: 8, padding: '14px 18px', fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>
                  <div>회원</div><div>인바디</div><div>체지방률</div><div>골격근</div><div>상태</div>
                </div>
                {roster.map((r) => (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.3fr', gap: 8, alignItems: 'center', padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Avatar initials={r.initials} color={r.color} size={38} fontSize={12} /><div><div style={{ fontWeight: 600, fontSize: 14, color: '#EAF3F1' }}>{r.name}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>최근 측정 {r.last}</div></div></div>
                    <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 19, color: '#67D7DF' }}>{r.score}</div>
                    <div style={{ fontSize: 14, fontFamily: "'IBM Plex Mono',monospace", color: '#EAF3F1' }}>{r.pbf}<span style={{ color: 'rgba(231,239,234,.4)' }}>%</span></div>
                    <div style={{ fontSize: 14, fontFamily: "'IBM Plex Mono',monospace", color: '#EAF3F1' }}>{r.smm}<span style={{ color: 'rgba(231,239,234,.4)' }}>kg</span></div>
                    <div><span style={{ fontSize: 11.5, fontWeight: 600, color: r.statusFg, background: r.statusBg, padding: '4px 11px', borderRadius: 20 }}>{r.status}</span></div>
                  </div>
                ))}
              </section>
              <section style={{ background: 'linear-gradient(165deg,#15403A,#0E2A26)', border: '1px solid rgba(184,148,85,.18)', color: '#EAF3F1', borderRadius: 24, padding: 24, marginTop: 20, boxShadow: '0 26px 52px -40px rgba(0,0,0,.8)' }}>
                <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 21, marginBottom: 4, color: '#F2F7F3' }}>코칭 노트 보내기</div>
                <div style={{ fontSize: 13, color: '#9FBCB5', marginBottom: 16 }}>선택한 회원의 “{trend.title}” 차트에 코치 하늘 이름으로 등록됩니다.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                  {roster.map((r) => (
                    <button key={r.id} onClick={() => set({ coachTargetId: r.id === 'jiwoo' ? 'minseo' : r.id, coachConfirm: '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20, border: `1px solid ${r.selBorder}`, background: r.selBg, color: r.selFg }}>{r.name}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                  <input value={s.coachNote} onChange={(e) => set({ coachNote: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendCoachNote() } }} placeholder={`${coachTargetMember ? coachTargetMember.name : '회원'}님에게 피드백을 작성하세요…`} style={{ flex: 1, fontFamily: 'inherit', fontSize: 14, padding: '13px 17px', borderRadius: 24, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.07)', outline: 'none', color: '#fff' }} />
                  <button onClick={sendCoachNote} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#06110F', background: CTA, padding: '12px 22px', borderRadius: 24 }}>노트 보내기</button>
                </div>
                <div style={{ fontSize: 12, color: '#7FB8B0', marginTop: 11 }}>{s.coachConfirm}</div>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* 결과지 라이트박스 */}
      {s.scanOpen && (
        <div onClick={() => set({ scanOpen: false })} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,12,10,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 34, animation: 'hwl-fade .25s ease both' }}>
          <div style={{ position: 'relative', maxHeight: '92vh', overflow: 'auto', borderRadius: 16, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
            <img src="/assets/inbody-result.jpg" alt="인바디 결과지 원본" style={{ display: 'block', width: 'auto', maxWidth: '88vw', maxHeight: 'none' }} />
          </div>
          <button onClick={() => set({ scanOpen: false })} style={{ all: 'unset', cursor: 'pointer', position: 'fixed', top: 24, right: 28, width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#0A1B18', boxShadow: '0 8px 20px -8px rgba(0,0,0,.6)' }}>×</button>
        </div>
      )}
    </div>
  )
}
