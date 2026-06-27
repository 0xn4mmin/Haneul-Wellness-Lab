import { useEffect, useMemo, useRef, useState } from 'react'
import {
  dates, metrics, segData, research, goals, conditionLog, challenge,
  me as ME, coach as COACH, segColor, buildSpark, buildTrend, buildGauges, buildRadar,
  type MetricKey,
} from '../data/portalData'
import { initialState, type PortalState, type View } from '../data/portalState'
import { createFigure, type FigureHandle } from '../lib/threeFigure'
import { useBackend } from '../data/useBackend'
import OcrUpload from '../components/OcrUpload'
import TabBar from '../components/TabBar'

const CTA = 'linear-gradient(110deg,#67D7DF,#2E9BA6)'
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)',
  backdropFilter: 'blur(7px)', borderRadius: 24,
  boxShadow: '0 1px 0 rgba(255,255,255,.06) inset,0 30px 60px -42px rgba(0,0,0,.75)',
}
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A24B' }
const cardTitle: React.CSSProperties = { fontFamily: "'Gowun Batang',serif", fontSize: 21, marginTop: 3, color: '#F2F7F3' }
const ringCirc = 2 * Math.PI * 34

// Highlights @멘션 tokens in teal.
function renderMentions(text: string): React.ReactNode {
  return text.split(/(@[가-힣A-Za-z0-9_]+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: '#67D7DF', fontWeight: 600 }}>{part}</span>
      : part,
  )
}

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

  const be = useBackend()

  const [mobileNav, setMobileNav] = useState(false)

  // chat-room UI (backend mode)
  const [chatModal, setChatModal] = useState<'none' | 'create' | 'join'>('none')
  const [roomName, setRoomName] = useState('')
  const [roomPrivate, setRoomPrivate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [chatErr, setChatErr] = useState('')

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
  }, [s.view, s.messages, be.messages])

  // sync the profile-settings form with the loaded backend profile
  useEffect(() => {
    if (be.profile) set({ profile: { name: be.profile.name, birth: be.profile.birth ?? '', gender: be.profile.gender ?? '남성', phone: be.profile.phone ?? '', photo: null } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be.profile])

  // load chart comments for the selected metric from the backend
  useEffect(() => {
    if (be.configured && be.session) be.loadChartComments(s.selectedMetric)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be.configured, be.session, s.selectedMetric])

  // ---- handlers -----------------------------------------------------------
  const go = (v: View) => { set({ view: v, activeMember: null }); setMobileNav(false) }
  const togglePrivacy = (key: string) => setFn((p) => ({ privacy: { ...p.privacy, [key]: p.privacy[key] === 'public' ? 'private' : 'public' } }))
  const onProfileField = (k: keyof PortalState['profile'], v: string) => setFn((p) => ({ profile: { ...p.profile, [k]: v } }))
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]; if (!f) return
    if (be.configured) { void be.uploadAvatar(f); return }
    const r = new FileReader()
    r.onload = () => setFn((p) => ({ profile: { ...p.profile, photo: r.result as string } }))
    r.readAsDataURL(f)
  }
  const submitComment = () => {
    const t = s.newComment.trim(); if (!t) return
    if (be.configured) { void be.addChartComment(s.selectedMetric, t); set({ newComment: '' }); return }
    const key = s.selectedMetric
    const entry = { author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, text: t, time: '방금' }
    setFn((p) => ({ newComment: '', commentsByMetric: { ...p.commentsByMetric, [key]: [...(p.commentsByMetric[key] || []), entry] } }))
  }
  const submitFeedback = () => {
    const t = s.newComment.trim(); if (!t) return
    if (be.configured) { void be.addCoachFeedback(t); set({ newComment: '' }); return }
    const item = { author: meDisp.name, initials: meDisp.initials, color: meDisp.color, isCoach: isTrainer, text: t, time: '방금' }
    setFn((p) => ({ newComment: '', coachFeedback: [...p.coachFeedback, item] }))
  }
  const submitPost = () => {
    const t = s.newPost.trim(); if (!t) return
    if (be.configured) { void be.createPost(t); set({ newPost: '' }); return }
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
  // routed post handlers (backend ids are strings, mock ids are numbers)
  const onPostLike = (id: string | number) => (be.configured ? be.toggleLike(String(id)) : toggleLike(Number(id)))
  const onPostToggle = (id: string | number) => (be.configured ? be.toggleComments(String(id)) : toggleComments(Number(id)))
  const onPostDraftChange = (id: string | number, v: string) => (be.configured ? be.setPostDraft(String(id), v) : setPostDraft(Number(id), v))
  const onPostCommentSubmit = (id: string | number) => (be.configured ? be.submitPostComment(String(id)) : submitPostComment(Number(id)))
  const sendMsg = () => {
    const t = s.newMsg.trim(); if (!t) return
    if (be.configured) { void be.sendMessage(t); set({ newMsg: '' }); return }
    const msg = { id: Date.now(), author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, time: '방금', text: t }
    setFn((p) => ({ newMsg: '', messages: [...p.messages, msg] }))
  }
  const submitCreateRoom = () => {
    setChatErr('')
    void be.createRoom(roomName, roomPrivate).then(() => {
      setChatModal('none'); setRoomName(''); setRoomPrivate(false)
    }).catch((e) => setChatErr(e instanceof Error ? e.message : '생성 실패'))
  }
  const submitJoinRoom = () => {
    setChatErr('')
    void be.joinRoom(joinCode).then((res) => {
      if (res.ok) { setChatModal('none'); setJoinCode('') }
      else setChatErr(res.reason === 'not_found' ? '코드를 찾을 수 없어요.' : (res.reason || '입장 실패'))
    })
  }
  const openMember = (id: string) => { if (be.configured) be.openMember(id); else set({ activeMember: id }) }
  const closeMember = () => { if (be.configured) be.closeMember(); else set({ activeMember: null }) }
  const submitMemberComment = () => {
    const t = s.memberDraft.trim(); if (!t) return
    if (be.configured) { void be.addMemberCheer(t); set({ memberDraft: '' }); return }
    const id = s.activeMember; if (!id) return
    setFn((p) => ({ memberDraft: '', memberComments: { ...p.memberComments, [id]: [...(p.memberComments[id] || []), { author: ME.name, initials: ME.initials, color: ME.color, text: t }] } }))
  }
  const sendCoachNote = () => {
    const t = s.coachNote.trim(); if (!t) return
    const target = (be.configured ? be.roster : null)?.find((m) => m.id === s.coachTargetId) ?? s.members.find((m) => m.id === s.coachTargetId)
    const done = () => set({ coachNote: '', coachConfirm: '✓ ' + (target ? target.name : '회원') + '님의 ' + M[s.selectedMetric].label + ' 차트에 노트를 전달했어요.' })
    if (be.configured) { void be.addCoachNote(s.coachTargetId, s.selectedMetric, t).then((err) => err ? set({ coachConfirm: '⚠ ' + err }) : done()); return }
    done()
  }
  const createChallenge = () => {
    const t = (s.chTitle || '').trim() || '새 챌린지'
    set({ showChallengeForm: false, chDone: '✓ “' + t + '” 챌린지가 생성되었어요.' })
  }

  // auth: real Supabase when configured, else the local mock gate
  const showLogin = be.configured ? !be.session : !s.authed
  const doLogin = () => { if (be.configured) void be.signIn(s.loginEmail, s.loginPw); else set({ authed: true }) }
  const doSignup = () => { if (be.configured) void be.signUp(s.loginEmail, s.loginPw); else set({ authed: true }) }
  const doLogout = () => { void be.signOut() }

  // ---- derived values (mirror of renderVals) ------------------------------
  const isTrainer = s.role === 'trainer'
  const isClient = !isTrainer
  // only accounts whose real role is trainer may use the trainer view (mock mode allows it for the demo)
  const canTrainer = be.configured ? be.profile?.role === 'trainer' : true
  const navColor = (k: View) => { const a = s.view === k; return { bg: a ? 'linear-gradient(110deg,#2E9BA6,#247E88)' : 'transparent', fg: a ? '#060B17' : '#9DAFCB' } }

  // Data source for the OWN dashboard: real (Supabase) when signed in, else mock.
  const M = be.metrics
  const D = be.dates
  const privacyMap = be.privacy ?? s.privacy

  const meDisp = {
    name: isTrainer ? COACH.name : (be.profile?.name ?? s.profile.name),
    initials: isTrainer ? COACH.initials : (be.profile?.initials ?? ME.initials),
    color: isTrainer ? COACH.color : (be.profile?.color ?? ME.color),
    role: isTrainer ? '트레이너 · 관리자' : ME.role,
  }

  const trend = useMemo(() => {
    const base = buildTrend(s.selectedMetric, M, D)
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
  }, [s.selectedMetric, s.hoverIdx, M, D])

  const gauges = buildGauges(M)
  const radar = useMemo(() => {
    const base = buildRadar(M)
    const rh = s.radarHover
    const rd = base.curDots[rh]
    const tip = (rh >= 0 && rd)
      ? { show: true, cx: rd.x, rx: +Math.max(2, Math.min(142, rd.x - 48)).toFixed(1), ry: +(rd.y - 34).toFixed(1), t1: +(rd.y - 20).toFixed(1), t2: +(rd.y - 6).toFixed(1), k: rd.k, raw: rd.raw }
      : { show: false, cx: 0, rx: 0, ry: 0, t1: 0, t2: 0, k: '', raw: '' }
    return { ...base, tip }
  }, [s.radarHover, M])

  const sel = s.selectedMetric
  const pub = privacyMap[sel] === 'public'
  const shareInfo = pub
    ? { text: '공개 · 다른 회원이 보고 코멘트할 수 있어요', color: '#67D7DF', bg: 'rgba(46,155,166,.16)', dot: '#2E9BA6' }
    : { text: '비공개 · 나와 코치만 볼 수 있어요', color: 'rgba(231,239,234,.6)', bg: 'rgba(255,255,255,.06)', dot: 'rgba(231,239,234,.4)' }

  // brief
  const _f = (k: MetricKey, i: number) => M[k].series[i]
  const _l5 = M.smm.series.length - 1
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
  // Prefer the cached AI briefing (generated at measurement time); fall back to
  // the rule-based variants until one exists (or in mock mode).
  const ruleBrief = briefVariants[s.briefIdx % briefVariants.length]
  // In backend mode (configured + signed in) the AI regen button is always
  // available so the user can generate the FIRST briefing; content falls back
  // to the rule-based brief until one exists.
  const briefBackend = be.configured && !!be.session
  const brief = (briefBackend && be.briefing) ? be.briefing : ruleBrief

  const mkRing = (label: string, cur: number, goal: number, start: number, unit: string, down: boolean, color: string) => {
    let p = down ? (start - cur) / ((start - goal) || 1) : cur / (goal || 1)
    p = Math.max(0, Math.min(1, p))
    return { label, value: cur + unit, goal: '목표 ' + goal + unit, pct: Math.round(p * 100), dashArray: (ringCirc * p).toFixed(1) + ' ' + ringCirc.toFixed(1), color }
  }
  const lastV = (k: MetricKey) => M[k].series[M[k].series.length - 1]
  const firstV = (k: MetricKey) => M[k].series[0]
  const rings = [
    mkRing('인바디 점수', lastV('score'), goals.score, firstV('score'), '점', false, '#67D7DF'),
    mkRing('골격근량', lastV('smm'), goals.smm, firstV('smm'), 'kg', false, '#8FD89E'),
    mkRing('체지방률', lastV('pbf'), goals.pbf, firstV('pbf'), '%', true, '#E0B86A'),
    mkRing('내장지방', lastV('visceral'), goals.visceral, firstV('visceral'), '', true, '#E0A06A'),
  ]

  const cmpKeys: MetricKey[] = ['weight', 'smm', 'pbf', 'bmi', 'tbw', 'score']
  // clamp to the actual number of measurements (real data length varies)
  const cmpFromIdx = Math.min(Math.max(0, s.cmpFrom), Math.max(0, D.length - 1))
  const cmpToIdx = Math.min(Math.max(0, s.cmpTo), Math.max(0, D.length - 1))
  const compare = cmpKeys.map((k) => {
    const m = M[k]; const a = m.series[cmpFromIdx]; const b = m.series[cmpToIdx]; const d = +(b - a).toFixed(1)
    const improved = (m.good === 'up') ? d >= 0 : d <= 0
    return { label: m.label, unit: m.unit, before: a, after: b, delta: (d > 0 ? '+' : '') + d, deltaColor: improved ? '#67D7DF' : '#E0A06A', deltaBg: improved ? 'rgba(46,155,166,.16)' : 'rgba(224,138,94,.18)' }
  })
  const condition = conditionLog.map((c) => ({ w: c.w, sleep: c.sleep, workouts: c.workouts, sleepPct: Math.min(100, Math.round((c.sleep / 9) * 100)) }))
  const board = challenge.board.map((b, i) => ({ handle: b.handle, rank: i + 1, chgText: (b.chg > 0 ? '+' : '') + b.chg + '%p', rowBg: b.me ? 'rgba(46,155,166,.16)' : 'transparent', rowBorder: b.me ? 'rgba(103,215,223,.35)' : 'rgba(255,255,255,.07)' }))

  const metricKeysForCard: MetricKey[] = ['score', 'weight', 'smm', 'pbf', 'bmi', 'tbw']
  const membersSource = be.configured ? (be.members ?? []) : s.members
  const membersDisp = membersSource.map((m) => ({ ...m, publicCount: m.pub.length, lockedCount: metricKeysForCard.length - m.pub.filter((k) => metricKeysForCard.includes(k as MetricKey)).length }))
  type ActiveMember = { id: string; name: string; initials: string; color: string; bio2: string; score: number; measureCount?: number; lastDate?: string | null; metrics: { label: string; unit: string; locked: boolean; shown: boolean; value: number; spark: string }[]; comments: { author: string; initials: string; color: string; text: string }[] }
  let activeMember: ActiveMember | null = null
  if (be.configured) {
    activeMember = be.activeMember
  } else if (s.activeMember) {
    const m = s.members.find((x) => x.id === s.activeMember)!
    const mc = metricKeysForCard.map((k) => { const open = m.pub.includes(k); const met = metrics[k]; return { label: met.label, unit: met.unit, locked: !open, shown: open, value: met.series[met.series.length - 1], spark: buildSpark(met.series) } })
    activeMember = { id: m.id, name: m.name, initials: m.initials, color: m.color, bio2: m.bio2, score: m.score, measureCount: dates.length, lastDate: dates[dates.length - 1], metrics: mc, comments: s.memberComments[m.id] || [] }
  }
  const memberOpen = be.configured ? !!be.activeMember : !!s.activeMember

  const statusOf = (score: number) => score >= 85 ? { t: '순조', fg: '#67D7DF', bg: 'rgba(46,155,166,.18)' } : score >= 78 ? { t: '유지', fg: '#D9B45A', bg: 'rgba(214,178,90,.2)' } : { t: '점검 필요', fg: '#E0A06A', bg: 'rgba(224,138,94,.2)' }
  const rosterSrc = be.configured
    ? (be.roster ?? []).map((r) => ({ id: r.id, name: r.name, initials: r.initials, color: r.color, score: r.score, pbf: r.pbf, smm: r.smm, last: D[D.length - 1] }))
    : [
      { id: 'jiwoo', name: '박지우', initials: '지우', color: '#6E9B8E', score: 78, pbf: 20.0, smm: 31.9, last: '6월 14일' },
      ...s.members.map((m, i) => ({ id: m.id, name: m.name, initials: m.initials, color: m.color, score: m.score, pbf: metrics.pbf.series[5] + (m.score - 80) * -0.3, smm: metrics.smm.series[5] + (m.score - 80) * 0.1, last: ['6월 12일', '6월 13일', '6월 11일'][i] || '6월 10일' })),
    ]
  const roster = rosterSrc.map((r) => { const st = statusOf(r.score); const tsel = s.coachTargetId === r.id; return { ...r, pbf: r.pbf.toFixed(1), smm: r.smm.toFixed(1), status: st.t, statusFg: st.fg, statusBg: st.bg, selBg: tsel ? CTA : 'rgba(255,255,255,.06)', selFg: tsel ? '#060B17' : '#BFCCE6', selBorder: tsel ? 'transparent' : 'rgba(255,255,255,.16)' } })
  const coachTargetMember = roster.find((m) => m.id === s.coachTargetId)

  const messagesSource = be.configured ? (be.messages ?? []) : s.messages
  const messages = messagesSource.map((m) => { const isMe = m.role === 'me'; return { ...m, dir: (isMe ? 'row-reverse' : 'row') as React.CSSProperties['flexDirection'], justify: isMe ? 'flex-end' : 'flex-start', radius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px', bubbleBg: isMe ? 'linear-gradient(135deg,#2E9BA6,#1E6E78)' : (m.role === 'trainer' ? 'rgba(46,155,166,.14)' : 'rgba(255,255,255,.06)'), bubbleFg: isMe ? '#060B17' : '#E7EFEA', bubbleBorder: isMe ? 'transparent' : (m.role === 'trainer' ? 'rgba(103,215,223,.25)' : 'rgba(255,255,255,.1)'), ring: m.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none' } })
  const chatRooms = be.configured ? (be.rooms ?? []) : null
  const activeRoom = chatRooms?.find((r) => r.id === be.activeRoomId) ?? null
  const roomTitle = activeRoom ? activeRoom.name : '그룹 채팅'
  const hasRooms = !be.configured || (chatRooms != null && chatRooms.length > 0)
  const mockOnline = [
    { name: '코치 하늘', initials: '하늘', color: '#234B47', role: '트레이너', statusColor: '#2E9BA6' },
    { name: '이민서', initials: '민서', color: '#BE7A57', role: '회원', statusColor: '#2E9BA6' },
    { name: '조다온', initials: '다온', color: '#C29A4B', role: '회원', statusColor: '#2E9BA6' },
    { name: '박지우 (나)', initials: '지우', color: '#6E9B8E', role: '회원', statusColor: '#2E9BA6' },
    { name: '김아리', initials: '아리', color: '#5E97A0', role: '회원', statusColor: '#D6B25A' },
  ]
  const onlineMembers = be.configured
    ? be.roomMembers.map((m) => ({ name: m.name, initials: m.initials, color: m.color, role: m.role === 'trainer' ? '트레이너' : '회원', statusColor: '#2E9BA6' }))
    : mockOnline

  const segs = segData.map((seg) => { const c = segColor(seg.pct); const selS = s.selectedSegment === seg.key; return { ...seg, color: c, border: selS ? c : 'rgba(255,255,255,.12)', chipBg: selS ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.04)' } })
  const selSeg = (() => { const ss = segData.find((x) => x.key === s.selectedSegment) || segData[2]; const st = ss.pct >= 100 ? '표준 이상 · 우수' : (ss.pct >= 95 ? '표준 범위' : '표준 이하'); return { name: ss.name, pct: ss.pct, kg: ss.kg, color: segColor(ss.pct), status: st } })()

  const metricChips = (Object.keys(M) as MetricKey[]).map((k) => { const a = s.selectedMetric === k; return { key: k, label: M[k].short || M[k].label, bg: a ? CTA : 'rgba(255,255,255,.05)', fg: a ? '#060B17' : '#9DAFCB', border: a ? 'transparent' : 'rgba(255,255,255,.12)' } })

  const commentsSource = be.configured ? (be.chartComments ?? []) : (s.commentsByMetric[sel] || [])
  const comments = commentsSource.map((c) => ({ ...c, tag: c.role === 'trainer' ? '코치' : (c.role === 'me' ? '나' : '회원'), tagBg: c.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF' }))
  const feedbackThread = be.configured ? (be.coachFeedback ?? []) : s.coachFeedback
  const mentionNames = [...new Set([...(be.configured ? (be.members ?? []) : s.members).map((m) => m.name), '코치 하늘'])]
  const postsSource = be.configured ? (be.posts ?? []) : s.posts
  const postsDisp = postsSource.map((p) => ({ ...p, tag: p.role === 'trainer' ? '코치' : (p.role === 'me' ? '나' : '회원'), tagBg: p.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF', ring: p.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none', likeColor: p.liked ? '#E0A06A' : 'rgba(231,239,234,.6)', likeFill: p.liked ? '#E0A06A' : 'none', commentCount: p.comments.length }))

  const P = s.profile
  const genders = ['남성', '여성', '기타'].map((g) => ({ label: g, bg: P.gender === g ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: P.gender === g ? '#060B17' : '#9DAFCB', border: P.gender === g ? 'transparent' : 'rgba(255,255,255,.12)' }))
  const chMetrics = ['체지방률', '골격근량', '체중', '인바디 점수'].map((m) => ({ label: m, bg: s.chMetric === m ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chMetric === m ? '#060B17' : '#9DAFCB' }))
  const chPeriods = ['2주', '4주', '8주'].map((pp) => ({ label: pp, bg: s.chPeriod === pp ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chPeriod === pp ? '#060B17' : '#9DAFCB' }))
  const chScopes = ['전체 공개', '비공개'].map((pp) => ({ label: pp, bg: s.chScope === pp ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: s.chScope === pp ? '#060B17' : '#9DAFCB' }))
  // full date labels so multiple measurements within the same month are distinguishable
  const fromChips = D.map((dt, i) => ({ label: dt, bg: i === cmpFromIdx ? '#2E9BA6' : 'rgba(255,255,255,.05)', fg: i === cmpFromIdx ? '#060B17' : '#9DAFCB' }))
  const toChips = D.map((dt, i) => ({ label: dt, bg: i === cmpToIdx ? '#67D7DF' : 'rgba(255,255,255,.05)', fg: i === cmpToIdx ? '#060B17' : '#9DAFCB' }))

  const titles: Record<View, [string, string]> = {
    profile: ['프로필 설정', '사진·생년월일·성별·연락처를 관리하세요'],
    health: ['나의 건강', '시간에 따른 나의 체성분 변화'],
    community: ['커뮤니티', '하늘 랩 회원들의 기록과 응원'],
    chat: ['그룹 채팅', '회원과 코치가 함께하는 실시간 대화'],
    members: ['멤버', '다른 회원이 공개한 기록을 둘러보세요'],
    trainer: ['트레이너 스튜디오', '모든 회원을 한 곳에서 관리하세요'],
  }
  const score = M.score.series[M.score.series.length - 1]
  const dateLatest = D[D.length - 1]
  const scans = [
    { date: '2026 · 6월 14일', has: true }, { date: '2026 · 5월 10일', has: false },
    { date: '2026 · 4월 12일', has: false }, { date: '2026 · 3월 15일', has: false },
  ].map((r) => ({ date: r.date, label: r.has ? '결과지 보기' : '미첨부', cursor: r.has ? 'pointer' : 'default', chipBg: r.has ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.05)', chipFg: r.has ? '#67D7DF' : 'rgba(231,239,234,.35)', has: r.has }))

  const inputStyle: React.CSSProperties = { width: '100%', fontFamily: 'inherit', fontSize: 14, padding: '12px 15px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 7, display: 'block' }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', fontFamily: "'Pretendard',system-ui,sans-serif", color: '#E7EFEA', background: 'radial-gradient(120% 90% at 82% -8%,#0D1A33 0%,#0A1326 52%,#060B17 100%)' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.4, backgroundImage: 'radial-gradient(rgba(255,255,255,.025) 1px,transparent 1.4px)', backgroundSize: '32px 32px' }} />

      {/* LOGIN GATE */}
      {showLogin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'radial-gradient(120% 90% at 50% 18%,#0E1C38 0%,#0A1326 55%,#060B17 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)', width: '60%', maxWidth: 520, height: 300, background: 'radial-gradient(circle,rgba(46,155,166,.22),transparent 60%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
          <div className="hwl-login-card" style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.11)', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '36px 30px', boxShadow: '0 40px 90px -50px rgba(0,0,0,.9)' }}>
            <img src="/assets/logo-mark.png" alt="로고" style={{ width: 56, height: 56, objectFit: 'contain', display: 'block', margin: '0 auto 14px' }} />
            <div style={{ textAlign: 'center', fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#F2F7F3' }}>하늘 웰니스 랩</div>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(231,239,234,.5)', margin: '5px 0 26px' }}>회원 전용 포털에 로그인하세요</div>
            <input value={s.loginEmail} onChange={(e) => set({ loginEmail: e.target.value })} placeholder="이메일" style={{ ...inputStyle, padding: '13px 16px', fontSize: 14, marginBottom: 10 }} />
            <input value={s.loginPw} onChange={(e) => set({ loginPw: e.target.value })} type="password" placeholder="비밀번호" style={{ ...inputStyle, padding: '13px 16px', fontSize: 14, marginBottom: 18 }} />
            <button onClick={doLogin} style={{ all: 'unset', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', fontSize: 15, fontWeight: 700, color: '#060B17', background: CTA, padding: 14, borderRadius: 24, boxShadow: '0 16px 34px -16px rgba(22,192,206,.9)' }}>로그인</button>
            {be.loginError && <div style={{ marginTop: 12, fontSize: 12, color: '#E0A06A', textAlign: 'center', lineHeight: 1.5 }}>{be.loginError}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 12, color: 'rgba(231,239,234,.5)' }}>
              <span style={{ cursor: 'pointer' }}>비밀번호 찾기</span>
              <span onClick={doSignup} style={{ cursor: 'pointer', color: '#67D7DF', fontWeight: 600 }}>회원가입</span>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`hwl-backdrop${mobileNav ? ' show' : ''}`} onClick={() => setMobileNav(false)} />
      <aside className={`hwl-sidebar${mobileNav ? ' open' : ''}`} style={{ position: 'sticky', top: 0, zIndex: 3, width: 248, flex: 'none', height: '100vh', display: 'flex', flexDirection: 'column', gap: 6, padding: '26px 18px', background: 'linear-gradient(176deg,#112146 0%,#0C1733 52%,#080F22 100%)', borderRight: '1px solid rgba(184,148,85,.2)', color: '#E7EFEA', boxShadow: '18px 0 50px -40px rgba(0,0,0,.9)' }}>
        <a href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 22px' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(255,255,255,.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', overflow: 'hidden', boxShadow: '0 8px 18px -10px rgba(0,0,0,.7)' }}>
            <img src="/assets/logo-mark.png" alt="로고" style={{ width: '118%', height: '118%', objectFit: 'contain' }} />
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 18, letterSpacing: '.2px' }}>하늘 웰니스 랩</div>
            <div style={{ fontSize: 9, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#8A9BC0', marginTop: 2 }}>Haneul Wellness Lab</div>
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
              {k === 'chat' && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", background: '#2E9BA6', color: '#060B17', borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>4</span>}
            </button>
          )
        })}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#6E7CA0', padding: '0 6px' }}>보기 모드</div>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,.3)', borderRadius: 12, padding: 4 }}>
            <button onClick={() => set({ role: 'client', view: s.view === 'trainer' ? 'health' : s.view })} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12.5, fontWeight: 600, borderRadius: 9, transition: 'all .2s', background: isClient ? '#C9A24B' : 'transparent', color: isClient ? '#060B17' : '#8A9BC0' }}>회원</button>
            <button onClick={() => { if (canTrainer) set({ role: 'trainer', view: 'trainer' }) }} title={canTrainer ? '' : '트레이너 계정만 사용할 수 있어요'} style={{ all: 'unset', cursor: canTrainer ? 'pointer' : 'not-allowed', flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12.5, fontWeight: 600, borderRadius: 9, transition: 'all .2s', background: isTrainer ? '#C9A24B' : 'transparent', color: isTrainer ? '#060B17' : (canTrainer ? '#8A9BC0' : 'rgba(138,155,192,.4)'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>{!canTrainer && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(138,155,192,.5)" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}트레이너</button>
          </div>
          <button onClick={() => go('profile')} className="hwl-soft-hover" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12 }}>
            <Avatar initials={meDisp.initials} color={meDisp.color} size={34} photo={isTrainer ? null : (be.profile?.photoUrl ?? P.photo)} fontSize={12} />
            <div style={{ lineHeight: 1.2, overflow: 'hidden', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: '#EAF3F1' }}>{meDisp.name}</div>
              <div style={{ fontSize: 10.5, color: '#8A9BC0' }}>{meDisp.role} · 프로필 설정</div>
            </div>
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="hwl-header" style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px', background: 'rgba(8,12,26,.66)', backdropFilter: 'blur(18px) saturate(1.2)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <button className="hwl-hamburger" onClick={() => setMobileNav(true)} aria-label="메뉴" style={{ all: 'unset', cursor: 'pointer', width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flex: 'none', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.12)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9DAFCB" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
          </button>
          <div style={{ lineHeight: 1.15 }}>
            <div className="hwl-page-title" style={{ fontFamily: "'Gowun Batang',serif", fontSize: 25, letterSpacing: '.2px', color: '#F2F7F3' }}>{titles[s.view][0]}</div>
            <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', marginTop: 3 }}>{titles[s.view][1]}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {s.view === 'health' && (
              <div className="hwl-header-chip" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9FE2E8', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 11, padding: '8px 13px', whiteSpace: 'nowrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 3px rgba(46,155,166,.25)' }} />다음 측정까지 19일
              </div>
            )}
          </div>
        </header>

        <div className="hwl-content" style={{ flex: 1, minWidth: 0, padding: '26px 34px 60px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          {/* ============ 나의 건강 ============ */}
          <div style={{ display: s.view === 'health' ? 'block' : 'none', animation: 'hwl-rise .4s ease both' }}>
            {/* HERO BAND */}
            <section className="hwl-hero" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg,#1B2A52 0%,#122046 55%,#1D2E58 100%)', border: '1px solid rgba(184,148,85,.18)', borderRadius: 26, padding: '24px 30px', marginBottom: 20, boxShadow: '0 30px 64px -44px rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ position: 'absolute', top: '-55%', right: '7%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle,rgba(46,155,166,.45),transparent 65%)', filter: 'blur(38px)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '-65%', left: '28%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(184,148,85,.34),transparent 68%)', filter: 'blur(36px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', flex: 'none', background: meDisp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, boxShadow: '0 0 0 2px rgba(184,148,85,.6),0 10px 24px -10px rgba(0,0,0,.6)' }}>{meDisp.initials}</div>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A24B' }}>My Wellness</div>
                  <div className="hwl-hero-name" style={{ fontFamily: "'Gowun Batang',serif", fontSize: 25, color: '#F3EFE6', marginTop: 2 }}>{meDisp.name}</div>
                  <div style={{ fontSize: 12.5, color: '#9DAFCB', marginTop: 3 }}>171cm · 26세 · 남성 · {dateLatest} 측정</div>
                </div>
              </div>
              <div className="hwl-hero-stats" style={{ position: 'relative', zIndex: 2, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 22 }}>
                  <div><div style={{ fontSize: 11, color: '#9DAFCB' }}>체지방률</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 23, color: '#fff', marginTop: 1 }}>{M.pbf.series[M.pbf.series.length - 1].toFixed(1)}<span style={{ fontSize: 12, color: '#C9A24B' }}> %</span></div></div>
                  <div><div style={{ fontSize: 11, color: '#9DAFCB' }}>골격근량</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 23, color: '#fff', marginTop: 1 }}>{M.smm.series[M.smm.series.length - 1].toFixed(1)}<span style={{ fontSize: 12, color: '#C9A24B' }}> kg</span></div></div>
                </div>
                <div style={{ position: 'relative', width: 98, height: 98, flex: 'none' }}>
                  <svg viewBox="0 0 120 120" style={{ width: 98, height: 98, transform: 'rotate(-90deg)' }}>
                    <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#67D7DF" /><stop offset="100%" stopColor="#2E9BA6" /></linearGradient></defs>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="9" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#scoreGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray="254.8 326.7" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 29, color: '#fff', lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: 9, color: '#9DAFCB', letterSpacing: '1px', marginTop: 2 }}>인바디 점수</div>
                  </div>
                </div>
              </div>
            </section>

            {/* BRIEFING + GOAL RINGS */}
            <div className="hwl-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
              <section style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column' }}>
                <div className="hwl-brief-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div><div style={eyebrow}>AI Coach Briefing</div><div style={cardTitle}>이번 달 코치 브리핑</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#C9A24B', background: 'rgba(201,162,75,.14)', border: '1px solid rgba(201,162,75,.3)', borderRadius: 14, padding: '4px 10px' }}>{brief.focus}</span>
                    {briefBackend ? (
                      <button onClick={be.regenBriefing} disabled={be.briefingBusy || be.briefingRemaining <= 0} title={`이번 주 ${be.briefingRemaining}회 남음`} style={{ all: 'unset', cursor: be.briefingBusy || be.briefingRemaining <= 0 ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 600, color: be.briefingRemaining <= 0 ? 'rgba(231,239,234,.4)' : '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '6px 12px', opacity: be.briefingBusy ? 0.7 : 1 }}>{be.briefingBusy ? '생성 중…' : `다시 생성 · ${be.briefingRemaining}/2`}</button>
                    ) : (
                      <button onClick={() => setFn((p) => ({ briefIdx: (p.briefIdx + 1) % briefVariants.length }))} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '6px 12px' }}>다시 생성</button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(231,239,234,.82)', margin: '14px 0 16px' }}>{brief.summary}</p>
                {briefBackend && be.briefingMsg && <div style={{ fontSize: 11.5, color: be.briefingRemaining <= 0 ? '#E0A06A' : '#9FE2E8', margin: '-8px 0 12px' }}>{be.briefingMsg}</div>}
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
            <div className="hwl-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 20, alignItems: 'stretch' }}>
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
                <div className="hwl-chiprow" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '6px 20px 18px', position: 'relative', zIndex: 2 }}>
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
                  <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: '#8A9BC0' }}>측정 6회</div>
                </div>
                {gauges.map((g) => {
                  const gp = privacyMap[g.key]; const gpub = gp === 'public'
                  return (
                    <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 7, animation: 'hwl-rise .4s ease both' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EAF3F1' }}>{g.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: g.statusColor, fontFamily: "'IBM Plex Mono',monospace" }}>{g.status}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 18, color: '#F2F7F3' }}>{g.value}<span style={{ fontSize: 11, color: 'rgba(231,239,234,.45)', fontFamily: "'Pretendard'" }}> {g.unit}</span></span>
                          <button onClick={() => (be.configured ? be.togglePrivacy(g.key) : togglePrivacy(g.key))} title="공개 설정" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, border: `1px solid ${gpub ? 'rgba(103,215,223,.4)' : 'rgba(255,255,255,.12)'}`, background: gpub ? 'rgba(46,155,166,.16)' : 'rgba(255,255,255,.05)', color: gpub ? '#67D7DF' : 'rgba(231,239,234,.5)' }}>
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

                {/* 하늘 코치의 피드백 (이번 측정 전체) */}
                <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid rgba(255,247,232,.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 3px rgba(46,155,166,.25)' }} />
                    <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 17, color: '#F2F7F3' }}>하늘 코치의 피드백</div>
                  </div>
                  {feedbackThread.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', lineHeight: 1.6, marginBottom: 12 }}>{isTrainer ? '이번 측정에 대한 종합 피드백을 남겨보세요.' : '코치가 이번 측정에 대한 종합 피드백을 남기면 여기에 표시돼요.'}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                    {feedbackThread.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, animation: 'hwl-rise .3s ease both' }}>
                        <Avatar initials={c.initials} color={c.color} size={32} fontSize={11} ring={c.isCoach ? '0 0 0 2px #2E9BA6' : undefined} />
                        <div style={{ flex: 1, minWidth: 0, background: c.isCoach ? 'rgba(46,155,166,.12)' : 'rgba(255,255,255,.05)', border: `1px solid ${c.isCoach ? 'rgba(103,215,223,.25)' : 'rgba(255,255,255,.09)'}`, borderRadius: '4px 14px 14px 14px', padding: '10px 13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{c.author}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 600, color: '#67D7DF', background: c.isCoach ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', padding: '1px 7px', borderRadius: 9 }}>{c.isCoach ? '코치' : '회원'}</span>
                            <span style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginLeft: 'auto' }}>{c.time}</span>
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(231,239,234,.82)', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                    <Avatar initials={meDisp.initials} color={meDisp.color} size={32} fontSize={11} />
                    <input value={s.newComment} onChange={(e) => set({ newComment: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitFeedback() } }} placeholder={isTrainer ? '회원에게 종합 피드백을 남기세요…' : '코치 피드백에 댓글을 남기세요…'} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13.5, padding: '10px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                    <button onClick={submitFeedback} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 16px', borderRadius: 20 }}>{isTrainer ? '피드백' : '댓글'}</button>
                  </div>
                </div>
              </section>
            </div>

            {/* TREND + RADAR */}
            <div className="hwl-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
              <section style={{ ...card, padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div><div style={eyebrow}>Trend</div><div style={cardTitle}>{trend.title} 추이</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 28, color: '#67D7DF' }}>{trend.latest}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: trend.deltaColor, background: trend.deltaBg, padding: '3px 9px', borderRadius: 20 }}>{trend.deltaText}</span>
                  </div>
                </div>
                <div className="hwl-chiprow" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '15px 0 6px' }}>
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
                      <circle cx={p.x} cy={p.y} r={p.r} fill="#0A1326" stroke="#67D7DF" strokeWidth="2.4" />
                      <circle cx={p.x} cy={p.y} r="17" fill="transparent" onMouseEnter={() => set({ hoverIdx: i })} onMouseLeave={() => set({ hoverIdx: -1 })} style={{ cursor: 'pointer' }} />
                    </g>
                  ))}
                  {trend.tip.show && <>
                    <rect x={trend.tip.rx} y={trend.tip.ry} width="100" height="42" rx="10" fill="#0E1A38" stroke="rgba(103,215,223,.45)" />
                    <text x={trend.tip.cx} y={trend.tip.t1} textAnchor="middle" fontSize="10" fill="#9DAFCB" fontFamily="IBM Plex Mono">{trend.tip.date}</text>
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
                    <rect x={radar.tip.rx} y={radar.tip.ry} width="96" height="30" rx="8" fill="#0E1A38" stroke="rgba(103,215,223,.45)" />
                    <text x={radar.tip.cx} y={radar.tip.t1} textAnchor="middle" fontSize="9" fill="#9DAFCB" fontFamily="Pretendard">{radar.tip.k}</text>
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
            <div className="hwl-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A9BC0" strokeWidth="1.7"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
                        <span style={{ fontSize: 13.5, color: '#EAF3F1', fontWeight: 500 }}>{r.date}</span>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: r.chipFg, background: r.chipBg, padding: '5px 11px', borderRadius: 18 }}>{r.label}</span>
                    </button>
                  ))}
                </div>
                {be.configured && be.session && <OcrUpload onCommitted={be.reload} />}
              </section>
            </div>

            {/* COMPARE + LIFESTYLE */}
            <div className="hwl-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 20, marginTop: 20 }}>
              <section style={{ ...card, padding: 22 }}>
                <div style={eyebrow}>Compare</div><div style={cardTitle}>변화 비교</div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0 16px' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(231,239,234,.5)', marginBottom: 6 }}>기준 · {D[cmpFromIdx]}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{fromChips.map((c, i) => <button key={i} onClick={() => set({ cmpFrom: i })} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 8, background: c.bg, color: c.fg }}>{c.label}</button>)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(231,239,234,.5)', marginBottom: 6 }}>비교 · {D[cmpToIdx]}</div>
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
                <button onClick={() => set({ showChallengeForm: true, chDone: '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#060B17', background: CTA, padding: '11px 20px', borderRadius: 22 }}>+ 챌린지 만들기</button>
                <span style={{ fontSize: 12, color: '#67D7DF' }}>{s.chDone}</span>
              </div>

              {s.showChallengeForm && (
                <div onClick={() => set({ showChallengeForm: false })} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,12,10,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'hwl-fade .25s ease both' }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#0E1834', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
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
                      <button onClick={() => set({ showChallengeForm: false })} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                      <button onClick={createChallenge} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>만들기</button>
                    </div>
                  </div>
                </div>
              )}

              <section style={{ ...card, borderRadius: 22, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Avatar initials={meDisp.initials} color={meDisp.color} size={42} fontSize={13} />
                  <textarea value={s.newPost} onChange={(e) => set({ newPost: e.target.value })} placeholder="오늘의 성과나 궁금한 점을 나눠보세요… (@로 멘션)" style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.5, padding: '11px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', resize: 'none', minHeight: 54, color: '#EAF3F1' }} />
                </div>
                {(() => { const m = s.newPost.match(/@([가-힣A-Za-z0-9_]*)$/); if (!m) return null; const q = m[1]; const hits = mentionNames.filter((n) => n.includes(q)).slice(0, 5); if (!hits.length) return null; return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                    {hits.map((n) => <button key={n} onClick={() => set({ newPost: s.newPost.replace(/@[가-힣A-Za-z0-9_]*$/, `@${n} `) })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 14, padding: '5px 11px' }}>@{n}</button>)}
                  </div>
                ) })()}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
                  <button onClick={submitPost} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 22px', borderRadius: 22 }}>피드에 올리기</button>
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
                  <div style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(231,239,234,.85)', margin: '14px 2px 4px', whiteSpace: 'pre-wrap' }}>{renderMentions(p.text)}</div>
                  {p.hasMetric && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'rgba(46,155,166,.12)', border: '1px solid rgba(103,215,223,.25)', borderRadius: 14, padding: '13px 15px', margin: '6px 0 2px' }}>
                      <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 30, color: '#67D7DF' }}>{p.metricVal}</div>
                      <div><div style={{ fontSize: 12.5, fontWeight: 600, color: '#EAF3F1' }}>{p.metricLabel}</div><div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)' }}>{p.metricSub}</div></div>
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: '#67D7DF', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2E9BA6' }} />공유된 차트</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <button onClick={() => onPostLike(p.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: p.likeColor }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={p.likeFill} stroke={p.likeColor} strokeWidth="1.8"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" strokeLinejoin="round" /></svg>{p.likes}
                    </button>
                    <button onClick={() => onPostToggle(p.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(231,239,234,.6)' }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(231,239,234,.6)" strokeWidth="1.8"><path d="M4 5h16v10H9l-4 4v-4H4z" strokeLinejoin="round" /></svg>댓글 {p.commentCount}
                    </button>
                  </div>
                  {p.open && (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {p.comments.map((cm, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10 }}>
                          <Avatar initials={cm.initials} color={cm.color} size={30} fontSize={10.5} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: '3px 13px 13px 13px', padding: '9px 13px' }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{cm.author}</span> <span style={{ fontSize: 13, color: 'rgba(231,239,234,.78)' }}>{renderMentions(cm.text)}</span></div>
                            <button onClick={() => { onPostDraftChange(p.id, `@${cm.author} `); document.getElementById(`cmt-${p.id}`)?.focus() }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'rgba(157,175,203,.8)', marginTop: 4, marginLeft: 4 }}>답글</button>
                          </div>
                        </div>
                      ))}
                      {(() => { const m = String(p.draft).match(/@([가-힣A-Za-z0-9_]*)$/); if (!m) return null; const q = m[1]; const hits = mentionNames.filter((n) => n.includes(q)).slice(0, 5); if (!hits.length) return null; return (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          {hits.map((n) => <button key={n} onClick={() => onPostDraftChange(p.id, String(p.draft).replace(/@[가-힣A-Za-z0-9_]*$/, `@${n} `))} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 14, padding: '5px 11px' }}>@{n}</button>)}
                        </div>
                      ) })()}
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 2 }}>
                        <Avatar initials={meDisp.initials} color={meDisp.color} size={30} fontSize={10.5} />
                        <input id={`cmt-${p.id}`} value={p.draft} onChange={(e) => onPostDraftChange(p.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onPostCommentSubmit(p.id) } }} placeholder="댓글 · @로 멘션…" style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13, padding: '9px 14px', borderRadius: 18, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={() => onPostCommentSubmit(p.id)} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600, color: '#67D7DF' }}>댓글</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* ============ 그룹 채팅 ============ */}
          {s.view === 'chat' && (
            <div className="hwl-chat-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 224px', gap: 20, animation: 'hwl-rise .4s ease both' }}>
              <section className="hwl-chat-panel" style={{ ...card, borderRadius: 22, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 168px)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 4px rgba(46,155,166,.25)' }} />
                  <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 19, color: '#F2F7F3' }}>{roomTitle}</div>
                  {activeRoom?.isPrivate && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#C9A24B', background: 'rgba(201,162,75,.14)', border: '1px solid rgba(201,162,75,.3)', borderRadius: 10, padding: '2px 8px' }}>비공개</span>}
                  <div style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(231,239,234,.45)', fontFamily: "'IBM Plex Mono',monospace" }}>{be.configured ? (activeRoom ? `${messages.length}개 메시지` : '') : '5명 접속'}</div>
                </div>
                {chatRooms != null && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    {chatRooms.map((r) => {
                      const sel = r.id === be.activeRoomId
                      return (
                        <button key={r.id} onClick={() => be.selectRoom(r.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 16, background: sel ? CTA : 'rgba(255,249,238,.05)', color: sel ? '#060B17' : '#9DAFCB', border: `1px solid ${sel ? 'transparent' : 'rgba(255,247,232,.12)'}` }}>
                          {r.isPrivate && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={sel ? '#060B17' : '#9DAFCB'} strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
                          {r.name}
                        </button>
                      )
                    })}
                    <button onClick={() => { setChatErr(''); setChatModal('create') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 16, background: 'rgba(46,155,166,.14)', color: '#67D7DF', border: '1px solid rgba(103,215,223,.3)' }}>+ 방 만들기</button>
                    <button onClick={() => { setChatErr(''); setChatModal('join') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 16, background: 'rgba(255,249,238,.05)', color: '#9DAFCB', border: '1px solid rgba(255,247,232,.12)' }}>코드로 입장</button>
                  </div>
                )}
                <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {be.configured && !hasRooms ? (
                    <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 280, padding: 20 }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(157,175,203,.5)" strokeWidth="1.6" style={{ margin: '0 auto 12px' }}><path d="M4 5h16v10H9l-4 4v-4H4z" strokeLinejoin="round" /></svg>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: '#EAF3F1', marginBottom: 6 }}>아직 채팅방이 없어요</div>
                      <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', lineHeight: 1.6, marginBottom: 16 }}>새 방을 만들어 코드를 공유하거나, 받은 코드로 입장해 대화를 시작하세요.</div>
                      <div style={{ display: 'flex', gap: 9, justifyContent: 'center' }}>
                        <button onClick={() => { setChatErr(''); setChatModal('create') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 18px', borderRadius: 22 }}>+ 방 만들기</button>
                        <button onClick={() => { setChatErr(''); setChatModal('join') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.12)', padding: '10px 18px', borderRadius: 22 }}>코드로 입장</button>
                      </div>
                    </div>
                  ) : messages.map((m) => (
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
                  <input value={s.newMsg} disabled={be.configured && !activeRoom} onChange={(e) => set({ newMsg: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg() } }} placeholder={be.configured && !activeRoom ? '먼저 채팅방을 만들거나 입장하세요' : '메시지를 입력하세요…'} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14.5, padding: '13px 18px', borderRadius: 24, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1', opacity: be.configured && !activeRoom ? 0.5 : 1 }} />
                  <button onClick={sendMsg} style={{ all: 'unset', cursor: 'pointer', width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#67D7DF,#2E9BA6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#060B17" strokeWidth="2"><path d="M4 12l16-7-7 16-2-7z" strokeLinejoin="round" /></svg></button>
                </div>
              </section>
              <aside style={{ ...card, borderRadius: 22, padding: 18, height: 'fit-content' }}>
                {activeRoom?.isPrivate && activeRoom.joinCode && (
                  <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(255,247,232,.1)' }}>
                    <div style={{ fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 7 }}>입장 코드</div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, letterSpacing: '3px', color: '#67D7DF', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.25)', borderRadius: 12, padding: '9px 0', textAlign: 'center' }}>{activeRoom.joinCode}</div>
                    <div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginTop: 6 }}>이 코드를 공유해 초대하세요.</div>
                  </div>
                )}
                <div style={{ fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 13 }}>접속 중</div>
                {onlineMembers.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                    <div style={{ position: 'relative', flex: 'none' }}><div style={{ width: 34, height: 34, borderRadius: '50%', background: o.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11 }}>{o.initials}</div><span style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: o.statusColor, border: '2.5px solid #0E1834' }} /></div>
                    <div style={{ lineHeight: 1.2 }}><div style={{ fontSize: 13, fontWeight: 600, color: '#EAF3F1' }}>{o.name}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>{o.role}</div></div>
                  </div>
                ))}
              </aside>

              {/* 방 만들기 / 코드로 입장 모달 */}
              {chatModal !== 'none' && (
                <div onClick={() => setChatModal('none')} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,9,18,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'hwl-fade .25s ease both' }}>
                  <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                    <div style={eyebrow}>{chatModal === 'create' ? 'New Room' : 'Join Room'}</div>
                    <div style={cardTitle}>{chatModal === 'create' ? '채팅방 만들기' : '코드로 입장'}</div>
                    {chatModal === 'create' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 18 }}>
                        <div>
                          <label style={labelStyle}>방 이름</label>
                          <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="예) 7월 챌린지 라운지" style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>공개 범위</label>
                          <div style={{ display: 'flex', gap: 7 }}>
                            {[{ v: false, l: '공개' }, { v: true, l: '비공개(코드)' }].map((o) => (
                              <button key={o.l} onClick={() => setRoomPrivate(o.v)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: roomPrivate === o.v ? '#2E9BA6' : 'rgba(255,249,238,.05)', color: roomPrivate === o.v ? '#060B17' : '#9DAFCB' }}>{o.l}</button>
                            ))}
                          </div>
                          {roomPrivate && <div style={{ fontSize: 11, color: 'rgba(231,239,234,.45)', marginTop: 7 }}>비공개 방은 입장 코드가 자동 생성돼요. 만든 뒤 사이드바에서 확인·공유하세요.</div>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 18 }}>
                        <label style={labelStyle}>입장 코드</label>
                        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="예) K7P2Q9" maxLength={6} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '3px', fontSize: 18, textAlign: 'center' }} />
                      </div>
                    )}
                    {chatErr && <div style={{ fontSize: 12, color: '#E0A06A', marginTop: 10 }}>{chatErr}</div>}
                    <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                      <button onClick={() => setChatModal('none')} style={{ all: 'unset', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9FBCB5', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.15)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                      <button onClick={chatModal === 'create' ? submitCreateRoom : submitJoinRoom} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>{chatModal === 'create' ? '만들기' : '입장'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ 멤버 ============ */}
          {s.view === 'members' && (
            <div style={{ animation: 'hwl-rise .4s ease both' }}>
              {activeMember ? (
                <div>
                  <button onClick={closeMember} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 16 }}>‹ 멤버 목록으로</button>
                  <section style={{ ...card, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 6 }}>
                      <Avatar initials={activeMember.initials} color={activeMember.color} size={58} fontSize={17} />
                      <div>
                        <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#F2F7F3' }}>{activeMember.name}</div>
                        <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)' }}>{activeMember.bio2}</div>
                        {activeMember.measureCount != null && activeMember.measureCount > 0 && (
                          <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.4)', marginTop: 3, fontFamily: "'IBM Plex Mono',monospace" }}>측정 {activeMember.measureCount}회{activeMember.lastDate ? ` · 최근 ${activeMember.lastDate}` : ''}</div>
                        )}
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}><div style={{ fontSize: 10.5, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B' }}>점수</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 30, color: '#67D7DF' }}>{activeMember.score > 0 ? activeMember.score : '—'}</div></div>
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
                        <input value={s.memberDraft} onChange={(e) => set({ memberDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitMemberComment() } }} placeholder="따뜻한 한마디를 남겨보세요…" style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13.5, padding: '11px 15px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={submitMemberComment} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 18px', borderRadius: 20 }}>보내기</button>
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
                        <div><div style={{ fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>점수</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 26, color: '#67D7DF' }}>{m.score > 0 ? m.score : '—'}</div></div>
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
                  <Avatar initials={meDisp.initials} color={meDisp.color} size={84} photo={be.profile?.photoUrl ?? P.photo} fontSize={24} />
                  <label style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '9px 16px' }}>프로필 사진 변경<input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} /></label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div><label style={labelStyle}>이름</label><input value={P.name} onChange={(e) => onProfileField('name', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>생년월일</label><input type="date" value={P.birth} onChange={(e) => onProfileField('birth', e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>성별</label><div style={{ display: 'flex', gap: 8 }}>{genders.map((g, i) => <button key={i} onClick={() => onProfileField('gender', g.label)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 600, border: `1px solid ${g.border}`, background: g.bg, color: g.fg }}>{g.label}</button>)}</div></div>
                  <div><label style={labelStyle}>핸드폰 번호</label><input value={P.phone} onChange={(e) => onProfileField('phone', e.target.value)} placeholder="010-0000-0000" style={inputStyle} /></div>
                </div>
                <button onClick={() => { if (be.configured) void be.updateProfile({ name: P.name, birth: P.birth, gender: P.gender, phone: P.phone }); set({ profileSaved: '✓ 저장되었습니다.' }); go('health') }} style={{ all: 'unset', cursor: 'pointer', marginTop: 24, textAlign: 'center', display: 'block', width: '100%', fontSize: 15, fontWeight: 700, color: '#060B17', background: CTA, padding: 14, borderRadius: 24 }}>저장하기</button>
                <div style={{ textAlign: 'center', fontSize: 12, color: '#67D7DF', marginTop: 10 }}>{s.profileSaved}</div>

                {/* 보기 모드 — 모바일에선 사이드바가 없으므로 여기서 전환 (트레이너 계정만) */}
                {canTrainer && (
                  <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(255,247,232,.1)' }}>
                    <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 9 }}>보기 모드</div>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,.25)', borderRadius: 13, padding: 4 }}>
                      <button onClick={() => set({ role: 'client', view: 'health' })} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', fontSize: 13.5, fontWeight: 700, borderRadius: 10, background: isClient ? '#C9A24B' : 'transparent', color: isClient ? '#060B17' : '#8A9BC0' }}>회원</button>
                      <button onClick={() => set({ role: 'trainer', view: 'trainer' })} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', fontSize: 13.5, fontWeight: 700, borderRadius: 10, background: isTrainer ? '#C9A24B' : 'transparent', color: isTrainer ? '#060B17' : '#8A9BC0' }}>트레이너</button>
                    </div>
                  </div>
                )}

                {be.configured && be.session && (
                  <button onClick={doLogout} style={{ all: 'unset', cursor: 'pointer', marginTop: 14, textAlign: 'center', display: 'block', width: '100%', fontSize: 13.5, fontWeight: 600, color: 'rgba(231,239,234,.6)', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: 12, borderRadius: 24 }}>로그아웃</button>
                )}
              </section>
            </div>
          )}

          {/* ============ 트레이너 ============ */}
          {s.view === 'trainer' && (
            <div style={{ animation: 'hwl-rise .4s ease both' }}>
              <section style={{ ...card, padding: 8, overflow: 'hidden' }}>
                <div className="hwl-roster-wrap"><div className="hwl-roster-inner">
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
                </div></div>
              </section>
              <section style={{ background: 'linear-gradient(165deg,#16264E,#101D3E)', border: '1px solid rgba(184,148,85,.18)', color: '#EAF3F1', borderRadius: 24, padding: 24, marginTop: 20, boxShadow: '0 26px 52px -40px rgba(0,0,0,.8)' }}>
                <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 21, marginBottom: 4, color: '#F2F7F3' }}>코칭 노트 보내기</div>
                <div style={{ fontSize: 13, color: '#9DAFCB', marginBottom: 16 }}>선택한 회원의 “{trend.title}” 차트에 코치 하늘 이름으로 등록됩니다.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                  {roster.map((r) => (
                    <button key={r.id} onClick={() => set({ coachTargetId: r.id === 'jiwoo' ? 'minseo' : r.id, coachConfirm: '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 20, border: `1px solid ${r.selBorder}`, background: r.selBg, color: r.selFg }}>{r.name}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                  <input value={s.coachNote} onChange={(e) => set({ coachNote: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendCoachNote() } }} placeholder={`${coachTargetMember ? coachTargetMember.name : '회원'}님에게 피드백을 작성하세요…`} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14, padding: '13px 17px', borderRadius: 24, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.07)', outline: 'none', color: '#fff' }} />
                  <button onClick={sendCoachNote} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 700, color: '#060B17', background: CTA, padding: '12px 22px', borderRadius: 24 }}>노트 보내기</button>
                </div>
                <div style={{ fontSize: 12, color: '#8AA4CC', marginTop: 11 }}>{s.coachConfirm}</div>
              </section>
            </div>
          )}
        </div>
      </main>

      {!showLogin && <TabBar view={s.view} go={go} chatBadge={be.configured ? undefined : 4} />}

      {/* 결과지 라이트박스 */}
      {s.scanOpen && (
        <div onClick={() => set({ scanOpen: false })} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,12,10,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 34, animation: 'hwl-fade .25s ease both' }}>
          <div style={{ position: 'relative', maxHeight: '92vh', overflow: 'auto', borderRadius: 16, boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
            <img src="/assets/inbody-result.jpg" alt="인바디 결과지 원본" style={{ display: 'block', width: 'auto', maxWidth: '88vw', maxHeight: 'none' }} />
          </div>
          <button onClick={() => set({ scanOpen: false })} style={{ all: 'unset', cursor: 'pointer', position: 'fixed', top: 24, right: 28, width: 44, height: 44, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#0A1326', boxShadow: '0 8px 20px -8px rgba(0,0,0,.6)' }}>×</button>
        </div>
      )}
    </div>
  )
}
