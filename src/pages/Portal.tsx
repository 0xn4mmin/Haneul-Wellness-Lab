import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  dates, metrics, segData, research, goals, conditionLog, challenge,
  me as ME, coach as COACH, segColor, buildSpark, buildTrend, buildGauges, buildRadar, assess, METRIC_INFO,
  lastNum, firstNum,
  type MetricKey,
} from '../data/portalData'
import { initialState, type PortalState, type View } from '../data/portalState'
import { createFigure, type FigureHandle } from '../lib/threeFigure'
import { useBackend } from '../data/useBackend'
import OcrUpload from '../components/OcrUpload'
import TabBar from '../components/TabBar'

const CTA = 'linear-gradient(110deg,#67D7DF,#2E9BA6)'
// last-active label from a timestamp; null = online now (<3 min)
function fmtActive(iso: string | null): string | null {
  if (!iso) return '활동 기록 없음'
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (min < 3) return null
  if (min < 60) return `${min}분 전 활동`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전 활동`
  return `${Math.floor(hr / 24)}일 전 활동`
}

// ── scheduler date helpers (browser-local) ──
const WD = ['일', '월', '화', '수', '목', '금', '토']
const SLOT_COLORS = ['#2E9BA6', '#67D7DF', '#8FD89E', '#E0B86A', '#E0875C', '#B98BD9', '#E082A8', '#7C8AAE']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseYMD = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)) // Monday
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const STATUS_LABEL: Record<string, string> = { scheduled: '예정', attended: '출석', sameday_cancel: '당일취소', cancelled: '취소' }
const STATUS_COLOR: Record<string, string> = { scheduled: '#9DAFCB', attended: '#7BD88F', sameday_cancel: '#E0875C', cancelled: 'rgba(157,175,203,.5)' }

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
  const [memberQuery, setMemberQuery] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [cycleModal, setCycleModal] = useState(false)
  const [sleepInput, setSleepInput] = useState('')
  const [goalModal, setGoalModal] = useState(false)
  const [goalDraft, setGoalDraft] = useState<Record<string, string>>({})
  const [chMetricsSel, setChMetricsSel] = useState<string[]>([])
  const [chStart, setChStart] = useState('')
  const [chEnd, setChEnd] = useState('')
  const [editChallengeId, setEditChallengeId] = useState<string | null>(null)
  const [roomMenu, setRoomMenu] = useState(false)
  const [memberList, setMemberList] = useState(false)
  const [commTab, setCommTab] = useState<'feed' | 'challenge' | 'members'>('feed')
  const [schedView, setSchedView] = useState<'week' | 'month'>('week')
  const [schedAnchor, setSchedAnchor] = useState('')   // YYYY-MM-DD reference; '' = today
  const [schedDay, setSchedDay] = useState('')          // selected day in month view
  const [sessForm, setSessForm] = useState<null | { id?: string; memberId: string; packageId: string; title: string; color: string; date: string; time: string; dur: string; status: string }>(null)
  const [pkgForm, setPkgForm] = useState<null | { memberId: string; total: string; date: string; note: string }>(null)
  const [schedErr, setSchedErr] = useState('')
  const [chProgInfo, setChProgInfo] = useState(false)
  const [notifPerm, setNotifPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [measEdit, setMeasEdit] = useState<{ id: string; date: string; iso: string; values: Record<string, string> } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualVals, setManualVals] = useState<Record<string, string>>({})
  const [postImg, setPostImg] = useState<File | null>(null)
  const [chatImg, setChatImg] = useState<File | null>(null)
  const [cgMetric, setCgMetric] = useState('')
  const [cgMode, setCgMode] = useState<'absolute' | 'relative'>('relative')
  const [cgTarget, setCgTarget] = useState('')
  const [cgBaseSel, setCgBaseSel] = useState('')      // '' none · '__manual__' · else a picked value
  const [cgBaseManual, setCgBaseManual] = useState('')
  const [goalEdit, setGoalEdit] = useState<{ userId: string; name: string; metricKey: string; metricLabel: string; unit: string; mode: 'absolute' | 'relative'; target: string; baseSel: string; baseManual: string; options: { date: string; value: number }[] } | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [msgActions, setMsgActions] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string; text: string } | null>(null)
  const [readModal, setReadModal] = useState<string[] | null>(null)
  const [aliasModal, setAliasModal] = useState(false)
  const [anonOn, setAnonOn] = useState(false)
  const [anonName, setAnonName] = useState('')
  const [anonPhoto, setAnonPhoto] = useState<File | null>(null)
  const swipeRef = useRef<{ x: number; id: string } | null>(null)
  const [gaugeTip, setGaugeTip] = useState<{ key: string; side: 'min' | 'max' } | null>(null)
  const [gaugeInfo, setGaugeInfo] = useState<string | null>(null)

  // chat-room UI (backend mode)
  const [chatModal, setChatModal] = useState<'none' | 'create' | 'join'>('none')
  const [roomName, setRoomName] = useState('')
  const [roomPrivate, setRoomPrivate] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [chatErr, setChatErr] = useState('')

  const figure = useRef<FigureHandle | null>(null)
  const selectedSegRef = useRef(s.selectedSegment)
  selectedSegRef.current = s.selectedSegment
  const chatRef = useRef<HTMLDivElement | null>(null)
  const chatPanelRef = useRef<HTMLElement | null>(null)

  // 3D figure lifecycle via a callback ref: React calls this with the node when
  // the canvas mounts and with null when it unmounts. This correctly re-inits
  // when the section remounts (e.g. the empty state toggled off after data
  // loaded) — a plain ref + effect kept a stale figure and left a blank canvas.
  const mount3d = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      figure.current?.dispose()
      figure.current = createFigure(node, (seg) => setS((prev) => ({ ...prev, selectedSegment: seg })))
      figure.current.setSelected(selectedSegRef.current)
    } else {
      figure.current?.dispose()
      figure.current = null
    }
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

  // trainer studio: default the note target to a real roster member
  useEffect(() => {
    if (be.configured && be.isAdmin && be.roster && be.roster.length && !be.roster.some((r) => r.id === s.coachTargetId)) {
      set({ coachTargetId: be.roster[0].id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be.roster, be.isAdmin])
  // trainer studio: load the selected member's coach-note history
  useEffect(() => {
    if (be.configured && be.isAdmin && s.view === 'trainer' && s.coachTargetId) { setEditNoteId(null); void be.loadCoachNotes(s.coachTargetId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be.configured, be.isAdmin, s.view, s.coachTargetId])

  // fit the chat panel into one screen: measure its real top + the tab bar so
  // it ends just above the tab bar regardless of header/safe-area height.
  // (mobile only; desktop keeps the CSS height.)
  useEffect(() => {
    if (s.view !== 'chat') return
    const fit = () => {
      const panel = chatPanelRef.current
      if (!panel) return
      if (window.innerWidth > 880) { panel.style.height = ''; return }
      const tab = document.querySelector('.hwl-tabbar') as HTMLElement | null
      const top = panel.getBoundingClientRect().top
      const reserve = (tab?.offsetHeight ?? 58) + 10
      panel.style.height = Math.max(260, window.innerHeight - top - reserve) + 'px'
    }
    const id = setTimeout(fit, 0)
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit)
    return () => { clearTimeout(id); window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit) }
  }, [s.view])

  // on login / logout (user id changes — not on token refresh), land on the
  // default tab with no leftover detail view, modal, or draft from before
  const lastUserId = useRef<string | undefined>(undefined)
  const curUserId = be.session?.user?.id
  useEffect(() => {
    if (lastUserId.current === curUserId) return
    lastUserId.current = curUserId
    set({ view: 'health', role: 'client', activeMember: null, scanOpen: false, showChallengeForm: false, profileSaved: '', chDone: '', newPost: '', newMsg: '', newComment: '' })
    setNotifOpen(false); setCycleModal(false); setGoalModal(false); setChatModal('none'); setGaugeInfo(null); setMemberQuery(''); setPostImg(null); setChatImg(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curUserId])

  // admins default to trainer view (no 나의 건강) once the profile resolves
  const adminApplied = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (be.isAdmin && adminApplied.current !== curUserId) {
      adminApplied.current = curUserId
      set({ role: 'trainer', view: 'trainer' })
    } else if (!be.isAdmin) {
      adminApplied.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [be.isAdmin, curUserId])

  // ---- handlers -----------------------------------------------------------
  // switching tabs always lands on that tab's first screen (no leftover detail
  // view / open modal / scroll from last time)
  const go = (v: View) => {
    // admins have no 나의 건강 — that slot is the 트레이너 스튜디오
    const target = (v === 'health' && be.isAdmin) ? 'trainer' : v
    set({ view: target, role: target === 'trainer' ? 'trainer' : s.role, activeMember: null, scanOpen: false, showChallengeForm: false, chDone: '', profileSaved: '' })
    if (be.configured) be.closeMember()
    setMobileNav(false); setNotifOpen(false); setCycleModal(false); setGoalModal(false); setGaugeInfo(null); setMemberQuery(''); setPostImg(null); setChatImg(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
    const el = document.querySelector('.hwl-content'); if (el) el.scrollTop = 0
  }
  // clicking a notification jumps to where its content lives
  const goToNotif = (n: { type: string; ref: string | null }) => {
    setNotifOpen(false)
    if (n.type === 'chat' && n.ref) { go('chat'); be.selectRoom(n.ref); return }
    if (n.type === 'challenge' && n.ref) { go('community'); const cv = (be.challenges ?? []).find((c) => c.id === n.ref); if (cv) be.openChallenge(cv); return }
    if (n.type === 'feedback') { go('health'); return }
    go('community')  // comment / reply / cheer
  }
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
    const t = s.newPost.trim(); if (!t && !postImg) return
    if (be.configured) { void be.createPost(t, postImg); set({ newPost: '' }); setPostImg(null); return }
    const post = { id: Date.now(), author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, time: '방금', text: t, image: postImg ? URL.createObjectURL(postImg) : null, likes: 0, liked: false, open: false, comments: [], draft: '' }
    setPostImg(null)
    setFn((p) => ({ newPost: '', posts: [post, ...p.posts] }))
  }
  const onDeletePost = (id: string | number) => {
    if (be.configured) { void be.deletePost(String(id)); return }
    setFn((p) => ({ posts: p.posts.filter((x) => x.id !== Number(id)) }))
  }
  const onDeleteComment = (postId: string | number, cmId: string | undefined, idx: number) => {
    if (be.configured) { if (cmId) void be.deletePostComment(cmId); return }
    setFn((p) => ({ posts: p.posts.map((x) => x.id === Number(postId) ? { ...x, comments: x.comments.filter((_c, i) => i !== idx) } : x) }))
  }
  const toggleLike = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x) }))
  const toggleComments = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, open: !x.open } : x) }))
  const setPostDraft = (id: number, v: string) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, draft: v } : x) }))
  const submitPostComment = (id: number) => setFn((p) => ({ posts: p.posts.map((x) => {
    if (x.id !== id) return x
    const t = (x.draft || '').trim(); if (!t) return x
    const entry = { author: ME.name, initials: ME.initials, color: ME.color, text: t, isOwn: true }
    if (x.replyTo != null && x.comments[x.replyTo]) {
      const comments = x.comments.map((c, i) => i === x.replyTo ? { ...c, replies: [...(c.replies || []), entry] } : c)
      return { ...x, comments, draft: '', replyTo: null, replyToName: null }
    }
    return { ...x, comments: [...x.comments, { ...entry, replies: [] }], draft: '' }
  }) }))
  const setReplyToMock = (id: number, idx: number | null, name?: string) => setFn((p) => ({ posts: p.posts.map((x) => x.id === id ? { ...x, open: true, replyTo: idx, replyToName: name ?? null } : x) }))
  // routed post handlers (backend ids are strings, mock ids are numbers)
  const onPostLike = (id: string | number) => (be.configured ? be.toggleLike(String(id)) : toggleLike(Number(id)))
  const onPostToggle = (id: string | number) => (be.configured ? be.toggleComments(String(id)) : toggleComments(Number(id)))
  const onPostDraftChange = (id: string | number, v: string) => (be.configured ? be.setPostDraft(String(id), v) : setPostDraft(Number(id), v))
  const onPostCommentSubmit = (id: string | number) => (be.configured ? be.submitPostComment(String(id)) : submitPostComment(Number(id)))
  const onReply = (id: string | number, commentId: string | undefined, idx: number, name: string) => (be.configured ? be.setReplyTo(String(id), commentId ?? null, name) : setReplyToMock(Number(id), idx, name))
  const onCancelReply = (id: string | number) => (be.configured ? be.setReplyTo(String(id), null) : setReplyToMock(Number(id), null))
  const sendMsg = () => {
    const t = s.newMsg.trim(); if (!t && !chatImg) return
    if (be.configured) { void be.sendMessage(t, chatImg, replyTarget?.id ?? null); set({ newMsg: '' }); setChatImg(null); setReplyTarget(null); return }
    const msg = { id: Date.now(), author: ME.name, initials: ME.initials, color: ME.color, role: 'me' as const, time: '방금', text: t, image: chatImg ? URL.createObjectURL(chatImg) : null }
    setChatImg(null); setReplyTarget(null)
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
    const done = () => set({ coachNote: '', coachConfirm: '✓ ' + (target ? target.name : '회원') + '님에게 전체 피드백을 전달했어요.' })
    // overall feedback → shows in the member's "하늘 코치의 피드백" thread
    if (be.configured) { void be.addCoachNote(s.coachTargetId, 'overall', t).then((err) => err ? set({ coachConfirm: '⚠ ' + err }) : done()); return }
    done()
  }
  const MEAS_FIELDS: { key: string; label: string; unit: string }[] = [
    { key: 'score', label: '인바디 점수', unit: '점' }, { key: 'weight', label: '체중', unit: 'kg' },
    { key: 'smm', label: '골격근량', unit: 'kg' }, { key: 'pbf', label: '체지방률', unit: '%' },
    { key: 'bodyFatMass', label: '체지방량', unit: 'kg' }, { key: 'bmi', label: 'BMI', unit: '' },
    { key: 'bmr', label: '기초대사량', unit: 'kcal' }, { key: 'visceral', label: '내장지방', unit: '레벨' },
    { key: 'tbw', label: '체수분', unit: 'L' },
  ]
  const MEAS_EDIT_KEYS = MEAS_FIELDS.map((f) => f.key)
  const CH_METRIC_OPTS = [
    { key: 'weight', label: '체중' }, { key: 'smm', label: '골격근량' }, { key: 'pbf', label: '체지방률' },
    { key: 'bodyFatMass', label: '체지방량' }, { key: 'bmi', label: 'BMI' }, { key: 'score', label: '인바디 점수' },
  ]
  const openChallengeForm = () => {
    const today = new Date(); const in4w = new Date(today.getTime() + 28 * 86400 * 1000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    setEditChallengeId(null); setChMetricsSel([]); setChStart(iso(today)); setChEnd(iso(in4w))
    set({ showChallengeForm: true, chTitle: '', chScope: '전체 공개', chDone: '' })
  }
  const editChallengeForm = () => {
    const cd = be.challengeDetail; if (!cd) return
    setEditChallengeId(cd.id); setChMetricsSel(cd.metricKeys); setChStart(cd.startDate); setChEnd(cd.endDate)
    set({ showChallengeForm: true, chTitle: cd.title, chScope: cd.scope === 'private' ? '비공개' : '전체 공개', chDone: '' })
    be.closeChallenge()
  }
  const createChallenge = () => {
    const t = (s.chTitle || '').trim() || '새 챌린지'
    if (chMetricsSel.length === 0) { set({ chDone: '⚠ 지표를 1개 이상 선택하세요.' }); return }
    if (!chStart || !chEnd || chEnd < chStart) { set({ chDone: '⚠ 기간을 올바르게 선택하세요.' }); return }
    const payload = { title: t, metrics: chMetricsSel, startDate: chStart, endDate: chEnd, scope: (s.chScope === '비공개' ? 'private' : 'public') as 'public' | 'private' }
    if (be.configured) { if (editChallengeId) void be.updateChallenge(editChallengeId, payload); else void be.createChallenge(payload) }
    set({ showChallengeForm: false, chTitle: '', chDone: editChallengeId ? '✓ 챌린지가 수정되었어요.' : '✓ “' + t + '” 챌린지가 생성되었어요.' })
    setEditChallengeId(null)
  }

  // auth: real Supabase when configured, else the local mock gate
  const showLogin = be.configured ? !be.session : !s.authed
  const loading = be.configured && !!be.session && !be.loaded
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
  // signed-in user with no measurements yet → show an empty state, not mock data
  const noData = be.configured && !!be.session && !be.hasData
  // personal standard ranges from the latest InBody sheet (backend only)
  const measureRanges = be.configured ? (be.measurements?.[0]?.ranges ?? undefined) : undefined

  // a real (backend) account always shows its own profile — incl. the trainer
  // admin (their uploaded photo + name). The COACH persona is only the mock demo.
  const meDisp = be.configured ? {
    name: be.profile?.name ?? s.profile.name,
    initials: be.profile?.initials ?? ME.initials,
    color: be.profile?.color ?? ME.color,
    photo: be.profile?.photoUrl ?? null,
    role: be.profile?.role === 'trainer' ? '트레이너 · 관리자' : ME.role,
  } : {
    name: isTrainer ? COACH.name : s.profile.name,
    initials: isTrainer ? COACH.initials : ME.initials,
    color: isTrainer ? COACH.color : ME.color,
    photo: isTrainer ? null : s.profile.photo,
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

  const gauges = buildGauges(M, measureRanges)
  const radar = useMemo(() => {
    const base = buildRadar(M, measureRanges)
    const rh = s.radarHover
    const rd = base.curDots[rh]
    const tip = (rh >= 0 && rd)
      ? { show: true, cx: rd.x, rx: +Math.max(2, Math.min(142, rd.x - 48)).toFixed(1), ry: +(rd.y - 34).toFixed(1), t1: +(rd.y - 20).toFixed(1), t2: +(rd.y - 6).toFixed(1), k: rd.k, raw: rd.raw, verdict: rd.verdict, color: rd.color }
      : { show: false, cx: 0, rx: 0, ry: 0, t1: 0, t2: 0, k: '', raw: '', verdict: '', color: '' }
    return { ...base, tip }
  }, [s.radarHover, M, measureRanges])

  const sel = s.selectedMetric
  const pub = privacyMap[sel] === 'public'
  const shareInfo = pub
    ? { text: '공개 · 다른 회원이 보고 코멘트할 수 있어요', color: '#67D7DF', bg: 'rgba(46,155,166,.16)', dot: '#2E9BA6' }
    : { text: '비공개 · 나와 코치만 볼 수 있어요', color: 'rgba(231,239,234,.6)', bg: 'rgba(255,255,255,.06)', dot: 'rgba(231,239,234,.4)' }

  // brief
  const _f = (k: MetricKey, i: number) => M[k].series[i] ?? lastNum(M[k].series) ?? 0
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

  const lastV = (k: MetricKey) => lastNum(M[k].series)
  const firstV = (k: MetricKey) => firstNum(M[k].series)
  const ringDefs: { key: MetricKey; label: string; unit: string; down: boolean; color: string }[] = [
    { key: 'score', label: '인바디 점수', unit: '점', down: false, color: '#67D7DF' },
    { key: 'smm', label: '골격근량', unit: 'kg', down: false, color: '#8FD89E' },
    { key: 'pbf', label: '체지방률', unit: '%', down: true, color: '#E0B86A' },
    { key: 'weight', label: '체중', unit: 'kg', down: true, color: '#E0A06A' },
  ]
  // backend: only goals the user actually set; mock: demo goals
  const goalsMap: Record<string, number | undefined> = be.configured ? (be.goals ?? {}) : { score: 90, smm: 34, pbf: 15, weight: 66 }
  const rings = ringDefs.map((d) => {
    const cur = lastV(d.key); const start = firstV(d.key); const goal = goalsMap[d.key]
    const noData = cur == null
    const hasGoal = typeof goal === 'number' && !noData
    let p = 0
    if (hasGoal && start != null) { p = d.down ? (start - cur) / ((start - (goal as number)) || 1) : cur / ((goal as number) || 1); p = Math.max(0, Math.min(1, p)) }
    const fix = d.unit === '점' ? 0 : 1
    return { ...d, cur, noData, hasGoal, goalVal: goal, value: noData ? '기록 없음' : (cur as number).toFixed(fix) + d.unit, goalLabel: noData ? '' : hasGoal ? '목표 ' + goal + d.unit : '목표 미설정', pct: hasGoal ? Math.round(p * 100) : null, dashArray: (ringCirc * (hasGoal ? p : 0)).toFixed(1) + ' ' + ringCirc.toFixed(1) }
  })

  const cmpKeys: MetricKey[] = ['weight', 'smm', 'pbf', 'bmi', 'tbw', 'score']
  // clamp to the actual number of measurements (real data length varies)
  const cmpFromIdx = Math.min(Math.max(0, s.cmpFrom), Math.max(0, D.length - 1))
  const cmpToIdx = Math.min(Math.max(0, s.cmpTo), Math.max(0, D.length - 1))
  const compare = cmpKeys.map((k) => {
    const m = M[k]; const a = m.series[cmpFromIdx]; const b = m.series[cmpToIdx]
    if (a == null || b == null) return { label: m.label, unit: m.unit, before: a, after: b, delta: '기록 없음', deltaColor: '#9DAFCB', deltaBg: 'rgba(255,255,255,.06)' }
    const d = +(b - a).toFixed(1)
    const improved = (m.good === 'up') ? d >= 0 : d <= 0
    return { label: m.label, unit: m.unit, before: a, after: b, delta: (d > 0 ? '+' : '') + d, deltaColor: improved ? '#67D7DF' : '#E0A06A', deltaBg: improved ? 'rgba(46,155,166,.16)' : 'rgba(224,138,94,.18)' }
  })
  const condition = conditionLog.map((c) => ({ w: c.w, sleep: c.sleep, workouts: c.workouts, sleepPct: Math.min(100, Math.round((c.sleep / 9) * 100)) }))
  const todayISO = new Date().toISOString().slice(0, 10)
  const sleepLabel = (iso: string) => { const [, m, d] = iso.split('-'); return iso === todayISO ? '오늘' : `${+m}/${+d}` }
  const board = challenge.board.map((b, i) => ({ handle: b.handle, rank: i + 1, chgText: (b.chg > 0 ? '+' : '') + b.chg + '%p', rowBg: b.me ? 'rgba(46,155,166,.16)' : 'transparent', rowBorder: b.me ? 'rgba(103,215,223,.35)' : 'rgba(255,255,255,.07)' }))

  const metricKeysForCard: MetricKey[] = ['score', 'weight', 'smm', 'pbf', 'bmi', 'tbw']
  const membersSource = be.configured ? (be.members ?? []) : s.members
  const membersDisp = membersSource.map((m) => ({ ...m, publicCount: m.pub.length, lockedCount: metricKeysForCard.length - m.pub.filter((k) => metricKeysForCard.includes(k as MetricKey)).length }))
  type ActiveMember = { id: string; name: string; initials: string; color: string; photo?: string | null; role?: 'client' | 'trainer'; bio2: string; score: number; measureCount?: number; lastDate?: string | null; metrics: { label: string; unit: string; locked: boolean; shown: boolean; value: number; spark: string }[]; comments: { author: string; initials: string; color: string; photo?: string | null; text: string }[] }
  let activeMember: ActiveMember | null = null
  if (be.configured) {
    activeMember = be.activeMember
  } else if (s.activeMember) {
    const m = s.members.find((x) => x.id === s.activeMember)!
    const mc = metricKeysForCard.map((k) => { const open = m.pub.includes(k); const met = metrics[k]; return { label: met.label, unit: met.unit, locked: !open, shown: open, value: lastNum(met.series) ?? 0, spark: buildSpark(met.series) } })
    activeMember = { id: m.id, name: m.name, initials: m.initials, color: m.color, photo: null, role: m.role ?? 'client', bio2: m.bio2, score: m.score, measureCount: dates.length, lastDate: dates[dates.length - 1], metrics: mc, comments: s.memberComments[m.id] || [] }
  }
  const memberOpen = be.configured ? !!be.activeMember : !!s.activeMember

  const statusOf = (score: number) => score >= 85 ? { t: '순조', fg: '#67D7DF', bg: 'rgba(46,155,166,.18)' } : score >= 78 ? { t: '유지', fg: '#D9B45A', bg: 'rgba(214,178,90,.2)' } : { t: '점검 필요', fg: '#E0A06A', bg: 'rgba(224,138,94,.2)' }
  const rosterSrc = be.configured
    ? (be.roster ?? []).map((r) => ({ id: r.id, name: r.name, initials: r.initials, color: r.color, photo: r.photo as string | null, score: r.score, pbf: r.pbf, smm: r.smm, last: D[D.length - 1] }))
    : [
      { id: 'jiwoo', name: '박지우', initials: '지우', color: '#6E9B8E', photo: null as string | null, score: 78, pbf: 20.0, smm: 31.9, last: '6월 14일' },
      ...s.members.map((m, i) => ({ id: m.id, name: m.name, initials: m.initials, color: m.color, photo: (m.photo ?? null) as string | null, score: m.score, pbf: (metrics.pbf.series[5] ?? 0) + (m.score - 80) * -0.3, smm: (metrics.smm.series[5] ?? 0) + (m.score - 80) * 0.1, last: ['6월 12일', '6월 13일', '6월 11일'][i] || '6월 10일' })),
    ]
  const roster = rosterSrc.map((r) => { const st = statusOf(r.score); const tsel = s.coachTargetId === r.id; return { ...r, pbf: r.pbf.toFixed(1), smm: r.smm.toFixed(1), status: st.t, statusFg: st.fg, statusBg: st.bg, selBg: tsel ? CTA : 'rgba(255,255,255,.06)', selFg: tsel ? '#060B17' : '#BFCCE6', selBorder: tsel ? 'transparent' : 'rgba(255,255,255,.16)' } })
  const coachTargetMember = roster.find((m) => m.id === s.coachTargetId)

  const messagesSource = be.configured ? (be.messages ?? []) : s.messages
  const messages = messagesSource.map((m) => { const isMe = m.role === 'me'; return { ...m, dir: (isMe ? 'row-reverse' : 'row') as React.CSSProperties['flexDirection'], justify: isMe ? 'flex-end' : 'flex-start', radius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px', bubbleBg: isMe ? 'linear-gradient(135deg,#7FE0E8,#3FB2BD)' : (m.role === 'trainer' ? 'rgba(103,215,223,.2)' : 'rgba(196,212,240,.16)'), bubbleFg: isMe ? '#06222A' : '#F1F6F4', bubbleBorder: isMe ? 'transparent' : (m.role === 'trainer' ? 'rgba(103,215,223,.32)' : 'rgba(255,255,255,.16)'), ring: m.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none' } })
  const chatRooms = be.configured ? (be.rooms ?? []) : null
  const activeRoom = chatRooms?.find((r) => r.id === be.activeRoomId) ?? null
  const roomTitle = activeRoom ? activeRoom.name : '그룹 채팅'
  const hasRooms = !be.configured || (chatRooms != null && chatRooms.length > 0)
  const mockOnline = [
    { name: '코치 하늘', initials: '하늘', color: '#234B47', photo: null as string | null, role: '트레이너', statusColor: '#2E9BA6' },
    { name: '이민서', initials: '민서', color: '#BE7A57', photo: null, role: '회원', statusColor: '#2E9BA6' },
    { name: '조다온', initials: '다온', color: '#C29A4B', photo: null, role: '회원', statusColor: '#2E9BA6' },
    { name: '박지우 (나)', initials: '지우', color: '#6E9B8E', photo: null, role: '회원', statusColor: '#2E9BA6' },
    { name: '김아리', initials: '아리', color: '#5E97A0', photo: null, role: '회원', statusColor: '#D6B25A' },
  ]
  const onlineMembers = be.configured
    ? be.roomMembers.map((m) => m.anonymous
        ? { name: m.aliasName || '익명', initials: (m.aliasName || '익').slice(0, 2), color: '#5E6B85', photo: m.aliasPhoto, role: '익명', statusColor: '#9DAFCB' }
        : { name: m.name, initials: m.initials, color: m.color, photo: m.photo ?? null, role: m.role === 'trainer' ? '트레이너' : '회원', statusColor: '#2E9BA6' })
    : mockOnline

  // segmental: real from the latest measurement when signed in, else demo
  const latestMeasure = be.configured ? (be.measurements?.[0] ?? null) : null
  const segNames: [string, string][] = [['rightArm', '오른팔'], ['leftArm', '왼팔'], ['trunk', '몸통'], ['rightLeg', '오른다리'], ['leftLeg', '왼다리']]
  const segSource = latestMeasure
    ? segNames.map(([key, name]) => { const v = latestMeasure.segmental?.[key]; const base = segData.find((d) => d.key === key)!; return { key, name, kg: v?.kg ?? base.kg, pct: v?.pct ?? base.pct } })
    : segData
  const segs = segSource.map((seg) => { const c = segColor(seg.pct); const selS = s.selectedSegment === seg.key; return { ...seg, color: c, border: selS ? c : 'rgba(255,255,255,.12)', chipBg: selS ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.04)' } })
  const selSeg = (() => { const ss = segSource.find((x) => x.key === s.selectedSegment) || segSource[2]; const st = ss.pct >= 100 ? '표준 이상 · 우수' : (ss.pct >= 95 ? '표준 범위' : '표준 이하'); return { name: ss.name, pct: ss.pct, kg: ss.kg, color: segColor(ss.pct), status: st } })()

  const metricChips = (Object.keys(M) as MetricKey[]).map((k) => { const a = s.selectedMetric === k; return { key: k, label: M[k].short || M[k].label, bg: a ? CTA : 'rgba(255,255,255,.05)', fg: a ? '#060B17' : '#9DAFCB', border: a ? 'transparent' : 'rgba(255,255,255,.12)' } })

  const commentsSource = be.configured ? (be.chartComments ?? []) : (s.commentsByMetric[sel] || [])
  const comments = commentsSource.map((c) => ({ ...c, tag: c.role === 'trainer' ? '코치' : (c.role === 'me' ? '나' : '회원'), tagBg: c.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF' }))
  const feedbackThread = be.configured ? (be.coachFeedback ?? []) : s.coachFeedback
  const mentionNames = [...new Set([...(be.configured ? (be.members ?? []) : s.members).map((m) => m.name), '코치 하늘'])]
  const postsSource = be.configured ? (be.posts ?? []) : s.posts
  const postsDisp = postsSource.map((p) => ({ ...p, isOwn: be.configured ? (p as { isOwn?: boolean }).isOwn === true : p.role === 'me', tag: p.role === 'trainer' ? '코치' : (p.role === 'me' ? '나' : '회원'), tagBg: p.role === 'trainer' ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', tagFg: '#67D7DF', ring: p.role === 'trainer' ? '0 0 0 2px #2E9BA6' : 'none', likeColor: p.liked ? '#E0A06A' : 'rgba(231,239,234,.6)', likeFill: p.liked ? '#E0A06A' : 'none', commentCount: p.comments.length }))

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
    schedule: ['수업 스케줄', '트레이너와 수업 일정을 예약하세요'],
    trainer: ['트레이너 스튜디오', '모든 회원을 한 곳에서 관리하세요'],
  }
  const score = M.score.series[M.score.series.length - 1]
  const dateLatest = D[D.length - 1]
  // hero meta line: from the real profile when signed in, else the demo line
  const heroMeta = be.configured
    ? [s.profile.gender || null, s.profile.birth ? `${new Date().getFullYear() - +String(s.profile.birth).slice(0, 4)}세` : null, `${dateLatest} 측정`].filter(Boolean).join(' · ')
    : `171cm · 26세 · 남성 · ${dateLatest} 측정`
  // records: real measurements when signed in (only what the user uploaded), else demo
  const fmtScanDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${y} · ${+m}월 ${+d}일` }
  const scansSrc: { id: string | null; iso: string; date: string; has: boolean; path: string | null }[] = be.configured
    ? (be.measurements ?? []).map((m) => ({ id: m.id, iso: m.date, date: fmtScanDate(m.date), has: !!m.result_sheet_path, path: m.result_sheet_path }))
    : [
        { id: null, iso: '', date: '2026 · 6월 14일', has: true, path: null }, { id: null, iso: '', date: '2026 · 5월 10일', has: false, path: null },
        { id: null, iso: '', date: '2026 · 4월 12일', has: false, path: null }, { id: null, iso: '', date: '2026 · 3월 15일', has: false, path: null },
      ]
  const scans = scansSrc.map((r) => ({ id: r.id, iso: r.iso, date: r.date, path: r.path, label: r.has ? '결과지 보기' : '미첨부', cursor: r.has ? 'pointer' : 'default', chipBg: r.has ? 'rgba(46,155,166,.18)' : 'rgba(255,255,255,.05)', chipFg: r.has ? '#67D7DF' : 'rgba(231,239,234,.35)', has: r.has }))
  // research detail: real from the latest measurement when available, else demo
  const researchSrc = latestMeasure
    ? (() => { const dt = latestMeasure.detail || {}; const w = lastV('weight') ?? 0; const ideal = dt.idealWeight ?? w; const adj = +(ideal - w).toFixed(1); const bmrV = lastV('bmr'); const visV = lastV('visceral')
        return [
          { k: '기초대사량', v: bmrV != null ? Math.round(bmrV).toLocaleString() : '—', u: 'kcal' },
          { k: '내장지방 레벨', v: visV != null ? String(visV) : '—', u: '레벨' },
          { k: '위상각', v: dt.phaseAngle != null ? Number(dt.phaseAngle).toFixed(1) : '—', u: '°' },
          { k: 'SMI', v: dt.smi != null ? Number(dt.smi).toFixed(1) : '—', u: 'kg/m²' },
          { k: '적정체중', v: ideal != null ? Number(ideal).toFixed(1) : '—', u: 'kg' },
          { k: '권장 조절', v: (adj > 0 ? '+' : '') + adj, u: 'kg' },
        ] })()
    : research

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14, padding: '12px 15px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 7, display: 'block' }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', fontFamily: "'Pretendard',system-ui,sans-serif", color: '#E7EFEA', background: 'radial-gradient(120% 90% at 82% -8%,#0D1A33 0%,#0A1326 52%,#060B17 100%)' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.4, backgroundImage: 'radial-gradient(rgba(255,255,255,.025) 1px,transparent 1.4px)', backgroundSize: '32px 32px' }} />

      {/* LOGIN GATE */}
      {showLogin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'radial-gradient(120% 90% at 50% 18%,#0E1C38 0%,#0A1326 55%,#060B17 100%)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div className="hwl-modal-wrap" style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'fixed', top: '16%', left: '50%', transform: 'translateX(-50%)', width: '60%', maxWidth: 520, height: 280, background: 'radial-gradient(circle,rgba(46,155,166,.22),transparent 60%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
            <div className="hwl-login-card" style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.11)', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '28px 26px', boxShadow: '0 40px 90px -50px rgba(0,0,0,.9)' }}>
              <img src="/assets/logo-mark.png" alt="로고" style={{ width: 48, height: 48, objectFit: 'contain', display: 'block', margin: '0 auto 10px' }} />
              <div style={{ textAlign: 'center', fontFamily: "'Gowun Batang',serif", fontSize: 22, color: '#F2F7F3' }}>하늘 웰니스 랩</div>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(231,239,234,.5)', margin: '4px 0 20px' }}>회원 전용 포털에 로그인하세요</div>
              <input value={s.loginEmail} onChange={(e) => set({ loginEmail: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') doLogin() }} placeholder="이메일" style={{ ...inputStyle, padding: '12px 16px', fontSize: 14, marginBottom: 9 }} />
              <input value={s.loginPw} onChange={(e) => set({ loginPw: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') doLogin() }} type="password" placeholder="비밀번호" style={{ ...inputStyle, padding: '12px 16px', fontSize: 14, marginBottom: 14 }} />
              <button onClick={doLogin} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', fontSize: 15, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 24, boxShadow: '0 16px 34px -16px rgba(22,192,206,.9)' }}>로그인</button>
              {be.loginError && <div style={{ marginTop: 11, fontSize: 12, color: '#E0A06A', textAlign: 'center', lineHeight: 1.5 }}>{be.loginError}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 12, color: 'rgba(231,239,234,.5)' }}>
                <span style={{ cursor: 'pointer' }}>비밀번호 찾기</span>
                <span onClick={doSignup} style={{ cursor: 'pointer', color: '#67D7DF', fontWeight: 600 }}>회원가입</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!showLogin && loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 190, background: 'radial-gradient(120% 90% at 50% 18%,#0E1C38 0%,#0A1326 55%,#060B17 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <img src="/assets/logo-mark.png" alt="" style={{ width: 52, height: 52, objectFit: 'contain', opacity: 0.9 }} />
          <div className="hwl-spin" style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(103,215,223,.25)', borderTopColor: '#67D7DF' }} />
          <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', letterSpacing: '.5px' }}>불러오는 중…</div>
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

        {(['health', 'community', 'chat', 'schedule'] as View[]).map((k) => {
          const studioSlot = k === 'health' && be.isAdmin
          const active = studioSlot ? s.view === 'trainer' : s.view === k
          const ns = { bg: active ? 'linear-gradient(110deg,#2E9BA6,#247E88)' : 'transparent', fg: active ? '#060B17' : '#9DAFCB' }
          const labels: Record<string, string> = { health: studioSlot ? '트레이너 스튜디오' : '나의 건강', community: '커뮤니티', chat: '그룹 채팅', schedule: '스케줄' }
          const icons: Record<string, React.ReactNode> = {
            health: studioSlot
              ? <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h4" strokeLinecap="round" /></>
              : <><circle cx="12" cy="12" r="8.5" /><path d="M5 12h3l2-4 3 8 2-4h4" strokeLinecap="round" strokeLinejoin="round" /></>,
            community: <><rect x="3.5" y="4.5" width="17" height="6" rx="2.5" /><rect x="3.5" y="13.5" width="11" height="6" rx="2.5" /></>,
            chat: <path d="M4.5 5.5h15v10h-9l-4 4v-4h-2z" strokeLinejoin="round" />,
            schedule: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 9h17M8 3.5v3M16 3.5v3" strokeLinecap="round" /></>,
          }
          return (
            <button key={k} onClick={() => go(k)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 13, fontSize: 14.5, fontWeight: 500, transition: 'background .2s', background: ns.bg, color: ns.fg }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={ns.fg} strokeWidth="1.8">{icons[k]}</svg>
              {labels[k]}
              {k === 'chat' && be.configured && be.unreadChat > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", background: '#2E9BA6', color: '#060B17', borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>{be.unreadChat}</span>}
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
            {s.view === 'health' && (() => {
              const d = be.configured ? be.daysUntilNextMeasure : 19
              const label = !be.configured ? '다음 측정까지 19일'
                : d == null ? '측정 주기 설정'
                : d > 0 ? `다음 측정까지 ${d}일`
                : d === 0 ? '오늘이 측정일이에요' : `측정일 ${-d}일 지남`
              const dot = !be.configured || d == null || d > 3 ? '#2E9BA6' : '#E0A06A'
              return (
                <button onClick={() => be.configured && setCycleModal(true)} className="hwl-header-chip" style={{ all: 'unset', cursor: be.configured ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9FE2E8', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 11, padding: '8px 13px', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, boxShadow: `0 0 0 3px ${dot}40` }} />{label}
                  {be.configured && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: .5 }}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>}
                </button>
              )
            })()}
            {be.configured && be.session && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => { const willOpen = !notifOpen; setNotifOpen(willOpen); if (willOpen && be.unreadCount > 0) be.markNotificationsRead() }} aria-label="알림" style={{ all: 'unset', cursor: 'pointer', position: 'relative', width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.12)' }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9DAFCB" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" /></svg>
                  {be.unreadCount > 0 && <span style={{ position: 'absolute', top: 6, right: 7, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#E0A06A', color: '#06110F', fontSize: 9.5, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{be.unreadCount}</span>}
                </button>
                {notifOpen && (
                  <>
                    <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: 48, right: 0, zIndex: 50, width: 300, maxHeight: 420, overflowY: 'auto', background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 16, boxShadow: '0 30px 70px -30px rgba(0,0,0,.85)', padding: 8 }}>
                      <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A24B', padding: '8px 10px 6px' }}>알림</div>
                      {notifPerm === 'default' && (
                        <button onClick={() => { if (typeof Notification !== 'undefined') void Notification.requestPermission().then((p) => setNotifPerm(p)) }} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, margin: '0 8px 8px', padding: '9px 11px', borderRadius: 10, background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', color: '#9FE2E8', fontSize: 12 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" /></svg>휴대폰 알림 켜기
                        </button>
                      )}
                      {(be.notifications ?? []).length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', padding: '14px 10px' }}>새 알림이 없어요.</div>}
                      {(be.notifications ?? []).map((n) => (
                        <button key={n.id} onClick={() => goToNotif(n)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, padding: '9px 10px', borderRadius: 11, background: n.read ? 'transparent' : 'rgba(46,155,166,.1)' }}>
                          <Avatar initials={n.actorInitials} color={n.actorColor} photo={n.actorPhoto} size={30} fontSize={10.5} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: '#EAF3F1', lineHeight: 1.45 }}>{n.text}</div>
                            <div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginTop: 2 }}>{n.time}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="hwl-content" style={{ flex: 1, minWidth: 0, padding: '26px 34px 60px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
          {/* ============ 나의 건강 ============ */}
          <div style={{ display: s.view === 'health' ? 'block' : 'none', animation: 'hwl-rise .4s ease both' }}>
            {noData ? (
              <section style={{ ...card, padding: '36px 26px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px', background: 'rgba(46,155,166,.12)', border: '1px solid rgba(103,215,223,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#67D7DF" strokeWidth="1.6"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
                </div>
                <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 22, color: '#F2F7F3', marginBottom: 8 }}>{meDisp.name}님, 환영해요</div>
                <div style={{ fontSize: 13.5, color: 'rgba(231,239,234,.6)', lineHeight: 1.7, maxWidth: 360, margin: '0 auto 20px' }}>아직 측정 데이터가 없어요. 인바디 결과지를 업로드하면 자동으로 인식해 차트·추이·코치 피드백이 채워집니다.</div>
                <div style={{ maxWidth: 360, margin: '0 auto' }}>
                  <OcrUpload onCommitted={be.reload} />
                </div>
              </section>
            ) : (
            <>
            {/* HERO BAND */}
            <section className="hwl-hero" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(120deg,#1B2A52 0%,#122046 55%,#1D2E58 100%)', border: '1px solid rgba(184,148,85,.18)', borderRadius: 26, padding: '24px 30px', marginBottom: 20, boxShadow: '0 30px 64px -44px rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ position: 'absolute', top: '-55%', right: '7%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle,rgba(46,155,166,.45),transparent 65%)', filter: 'blur(38px)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '-65%', left: '28%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(184,148,85,.34),transparent 68%)', filter: 'blur(36px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ position: 'relative', width: 60, height: 60, borderRadius: '50%', flex: 'none', overflow: 'hidden', background: meDisp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, boxShadow: '0 0 0 2px rgba(184,148,85,.6),0 10px 24px -10px rgba(0,0,0,.6)' }}>{meDisp.initials}{meDisp.photo && <img src={meDisp.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}</div>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A24B' }}>My Wellness</div>
                  <div className="hwl-hero-name" style={{ fontFamily: "'Gowun Batang',serif", fontSize: 25, color: '#F3EFE6', marginTop: 2 }}>{meDisp.name}</div>
                  <div style={{ fontSize: 12.5, color: '#9DAFCB', marginTop: 3 }}>{heroMeta}</div>
                </div>
              </div>
              <div className="hwl-hero-stats" style={{ position: 'relative', zIndex: 2, marginLeft: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'nowrap', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', minWidth: 0 }}>
                  {([
                    ['체중', 'weight', 'kg', 1],
                    ['체지방률', 'pbf', '%', 1],
                    ['체지방량', 'bodyFatMass', 'kg', 1],
                    ['골격근량', 'smm', 'kg', 1],
                    ['기초대사량', 'bmr', 'kcal', 0],
                  ] as [string, MetricKey, string, number][]).map(([label, key, unit, fix]) => {
                    const val = lastNum(M[key].series)
                    if (val == null) return (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: '#9DAFCB' }}>{label}</div>
                        <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 20, color: 'rgba(231,239,234,.4)', marginTop: 1, whiteSpace: 'nowrap' }}>기록 없음</div>
                      </div>
                    )
                    const a = assess(key, val, M, measureRanges)
                    return (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: '#9DAFCB', display: 'flex', alignItems: 'center', gap: 5 }}>{label}{a.label && <span style={{ fontSize: 8.5, fontWeight: 700, color: '#06110F', background: a.color, padding: '0 5px', borderRadius: 6, letterSpacing: '.3px' }}>{a.label}</span>}</div>
                        <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 23, color: a.state === 'normal' ? '#fff' : a.color, marginTop: 1, whiteSpace: 'nowrap' }}>{val.toLocaleString(undefined, { minimumFractionDigits: fix, maximumFractionDigits: fix })}<span style={{ fontSize: 12, color: '#C9A24B' }}> {unit}</span></div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ position: 'relative', width: 98, height: 98, flex: 'none' }}>
                  <svg viewBox="0 0 120 120" style={{ width: 98, height: 98, transform: 'rotate(-90deg)' }}>
                    <defs><linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#67D7DF" /><stop offset="100%" stopColor="#2E9BA6" /></linearGradient></defs>
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="9" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#scoreGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray="254.8 326.7" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 29, color: '#fff', lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: 9, color: '#9DAFCB', letterSpacing: '.5px', marginTop: 2, whiteSpace: 'nowrap' }}>인바디 점수</div>
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
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div><div style={eyebrow}>Goal Rings</div><div style={cardTitle}>목표 달성률</div></div>
                  {be.configured && (
                    <button onClick={() => { setGoalDraft(Object.fromEntries(ringDefs.map((d) => [d.key, goalsMap[d.key] != null ? String(goalsMap[d.key]) : '']))); setGoalModal(true) }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '6px 12px', whiteSpace: 'nowrap' }}>목표 설정</button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                  {rings.map((r, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <div style={{ position: 'relative', width: 82, height: 82 }}>
                        <svg viewBox="0 0 80 80" style={{ width: 82, height: 82, transform: 'rotate(-90deg)' }}>
                          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7" />
                          {r.hasGoal && <circle cx="40" cy="40" r="34" fill="none" stroke={r.color} strokeWidth="7" strokeLinecap="round" strokeDasharray={r.dashArray} />}
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Gowun Batang',serif", fontSize: r.hasGoal ? 18 : 22, color: r.hasGoal ? '#F2F7F3' : '#fff' }}>{r.hasGoal ? <>{r.pct}<span style={{ fontSize: 10, marginTop: 4 }}>%</span></> : (r.cur != null ? r.cur.toFixed(r.unit === '점' ? 0 : 1) : '—')}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 12, color: '#EAF3F1', fontWeight: 600 }}>{r.label}</div><div style={{ fontSize: 10, color: r.hasGoal ? 'rgba(231,239,234,.45)' : '#C9A24B', marginTop: 1 }}>{r.hasGoal ? `${r.value} · ${r.goalLabel}` : (r.noData ? '기록 없음' : '목표 미설정')}</div></div>
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
                <div><div style={eyebrow}>Latest Scan</div><div style={cardTitle}>체성분 · {dateLatest}</div></div>
                {gauges.map((g) => {
                  const gp = privacyMap[g.key]; const gpub = gp === 'public'
                  const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)
                  const tipOn = (side: 'min' | 'max') => gaugeTip?.key === g.key && gaugeTip.side === side
                  if (g.noData) return (
                    <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EAF3F1' }}>{g.label}</span>
                      <span style={{ fontSize: 12, color: 'rgba(231,239,234,.4)' }}>기록 없음</span>
                    </div>
                  )
                  return (
                    <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 7, animation: 'hwl-rise .4s ease both' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#EAF3F1' }}>{g.label}</span>
                          <button onClick={() => setGaugeInfo((k) => k === g.key ? null : g.key)} aria-label={`${g.label} 설명`} style={{ all: 'unset', cursor: 'pointer', width: 15, height: 15, borderRadius: '50%', border: `1px solid ${gaugeInfo === g.key ? '#67D7DF' : 'rgba(157,175,203,.5)'}`, color: gaugeInfo === g.key ? '#67D7DF' : 'rgba(157,175,203,.7)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>i</button>
                          <span style={{ fontSize: 11, fontWeight: 600, color: g.statusColor, fontFamily: "'IBM Plex Mono',monospace" }}>{g.status}</span>
                          {g.verdict && <span style={{ fontSize: 9, fontWeight: 700, color: '#06110F', background: g.statusColor, padding: '1px 6px', borderRadius: 7, letterSpacing: '.3px' }}>{g.verdict}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 18, color: g.verdict ? g.statusColor : '#F2F7F3' }}>{g.value}<span style={{ fontSize: 11, color: 'rgba(231,239,234,.45)', fontFamily: "'Pretendard'" }}> {g.unit}</span></span>
                          <button onClick={() => (be.configured ? be.togglePrivacy(g.key) : togglePrivacy(g.key))} title="공개 설정" style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, border: `1px solid ${gpub ? 'rgba(103,215,223,.4)' : 'rgba(255,255,255,.12)'}`, background: gpub ? 'rgba(46,155,166,.16)' : 'rgba(255,255,255,.05)', color: gpub ? '#67D7DF' : 'rgba(231,239,234,.5)' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: gpub ? '#2E9BA6' : 'rgba(231,239,234,.4)' }} />{gpub ? '공개' : '비공개'}
                          </button>
                        </div>
                      </div>
                      {gaugeInfo === g.key && (
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(231,239,234,.7)', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.2)', borderRadius: 10, padding: '9px 12px' }}>{METRIC_INFO[g.key] ?? ''} <span style={{ color: '#9FE2E8' }}>· 표준 {fmt(g.nMin)}~{fmt(g.nMax)}{g.unit ? ` ${g.unit}` : ''}</span></div>
                      )}
                      <div style={{ position: 'relative', height: 13, marginTop: 2 }}>
                        {/* rounded bar (inner clip keeps both ends round regardless of segment widths) */}
                        <div style={{ position: 'absolute', inset: 0, borderRadius: 8, overflow: 'hidden', display: 'flex', background: 'rgba(255,255,255,.08)' }}>
                          <div style={{ height: '100%', width: `${g.underW}%`, background: 'rgba(224,138,94,.4)' }} />
                          <div style={{ height: '100%', width: `${g.normW}%`, background: 'linear-gradient(90deg,#2E9BA6,#67D7DF)' }} />
                          <div style={{ height: '100%', width: `${g.overW}%`, background: 'rgba(201,162,75,.45)' }} />
                        </div>
                        {/* value marker */}
                        <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${g.markerPct}%`, width: 3, background: '#fff', borderRadius: 3, boxShadow: '0 0 8px rgba(255,255,255,.6)', pointerEvents: 'none' }} />
                        {/* standard-range boundary handles: hover/tap to reveal the number */}
                        {([['min', g.underW, g.nMin], ['max', g.underW + g.normW, g.nMax]] as [('min' | 'max'), number, number][]).map(([side, pos, num]) => (
                          <div key={side}
                            onMouseEnter={() => setGaugeTip({ key: g.key, side })} onMouseLeave={() => setGaugeTip((t) => (t?.key === g.key && t.side === side ? null : t))}
                            onClick={() => setGaugeTip((t) => (t?.key === g.key && t.side === side ? null : { key: g.key, side }))}
                            style={{ position: 'absolute', top: -5, bottom: -5, left: `calc(${pos}% - 7px)`, width: 14, cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                            <span style={{ width: 2, height: '100%', background: 'rgba(255,255,255,.45)', borderRadius: 2 }} />
                            {tipOn(side) && (
                              <span style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: '#06110F', background: '#9FE2E8', padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{fmt(num)}</span>
                            )}
                          </div>
                        ))}
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
                        <Avatar initials={c.initials} color={c.color} photo={c.photo} size={32} fontSize={11} ring={c.isCoach ? '0 0 0 2px #2E9BA6' : undefined} />
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
                    <Avatar initials={meDisp.initials} color={meDisp.color} photo={meDisp.photo} size={32} fontSize={11} />
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
                  {!trend.hasData && <text x="292" y="135" textAnchor="middle" fontSize="13" fill="rgba(231,239,234,.4)" fontFamily="Pretendard">이 지표의 측정 기록이 없어요</text>}
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
                      {d.state !== 'normal' && <circle cx={d.x} cy={d.y} r="6.5" fill="none" stroke={d.color} strokeWidth="1.6" opacity="0.55" />}
                      <circle cx={d.x} cy={d.y} r="3.6" fill={d.state === 'normal' ? '#67D7DF' : d.color} />
                      <circle cx={d.x} cy={d.y} r="13" fill="transparent" onMouseEnter={() => set({ radarHover: i })} onMouseLeave={() => set({ radarHover: -1 })} style={{ cursor: 'pointer' }} />
                    </g>
                  ))}
                  {radar.labels.map((l, i) => <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize="10.5" fontWeight="600" fill={l.color} fontFamily="Pretendard">{l.k}</text>)}
                  {radar.tip.show && <>
                    <rect x={radar.tip.rx} y={radar.tip.ry} width="96" height="30" rx="8" fill="#0E1A38" stroke="rgba(103,215,223,.45)" />
                    <text x={radar.tip.cx} y={radar.tip.t1} textAnchor="middle" fontSize="9" fill="#9DAFCB" fontFamily="Pretendard">{radar.tip.k}{radar.tip.verdict ? ` · ${radar.tip.verdict}` : ''}</text>
                    <text x={radar.tip.cx} y={radar.tip.t2} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={radar.tip.verdict ? radar.tip.color : '#EAF3F1'} fontFamily="IBM Plex Mono">{radar.tip.raw}</text>
                  </>}
                </svg>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'rgba(231,239,234,.5)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, background: '#67D7DF', borderRadius: 2 }} />현재</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed #C9A24B' }} />{(D[0] ?? '').replace('월 ', '/').replace('일', '').trim() || '처음'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7BD88F' }} />Good</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E0875C' }} />Bad</span>
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
                  {researchSrc.map((r, i) => (
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
                  {scans.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', padding: '6px 2px' }}>아직 측정 기록이 없어요. 결과지를 업로드하면 여기에 쌓여요.</div>}
                  {scans.map((r, i) => (
                    <div key={i} className="hwl-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                      <button onClick={() => { if (r.has) { if (be.configured && r.path) be.viewResultSheet(r.path); else set({ scanOpen: true }) } }} style={{ all: 'unset', cursor: r.cursor, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A9BC0" strokeWidth="1.7" style={{ flexShrink: 0 }}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" /></svg>
                        <span style={{ fontSize: 13.5, color: '#EAF3F1', fontWeight: 500 }}>{r.date}</span>
                      </button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: r.chipFg, background: r.chipBg, padding: '5px 11px', borderRadius: 18, flexShrink: 0 }}>{r.label}</span>
                      {be.configured && r.id && (
                        <>
                          <button onClick={() => { const id = r.id!; void be.fetchMeasurementValues(id).then((vals) => { const v: Record<string, string> = {}; for (const k of MEAS_EDIT_KEYS) v[k] = vals[k] != null ? String(vals[k]) : ''; setMeasEdit({ id, date: r.date, iso: r.iso, values: v }) }) }} title="값 수정" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(157,175,203,.8)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 6.5l4 4" strokeLinecap="round" /></svg>
                          </button>
                          <button onClick={() => { const id = r.id!; if (confirm(`${r.date} 측정 기록을 삭제할까요? 차트에서도 제거돼요.`)) void be.deleteMeasurement(id, r.path) }} title="삭제" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(224,135,92,.8)' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {be.configured && be.session && <OcrUpload onCommitted={be.reload} />}
                {be.configured && be.session && (
                  <button onClick={() => { setManualVals({}); setManualDate(todayISO); setManualOpen(true) }} style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%', textAlign: 'center', marginTop: 10, padding: '11px 0', borderRadius: 12, border: '1px dashed rgba(103,215,223,.4)', color: '#9FE2E8', fontSize: 13, fontWeight: 600 }}>✎ 직접 입력으로 측정 추가</button>
                )}
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
                {be.configured ? (
                  <>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(231,239,234,.6)', margin: '12px 0 14px' }}>매일 수면 시간을 기록하면 컨디션 추이를 한눈에 볼 수 있어요.</div>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 16 }}>
                      <span style={{ fontSize: 12.5, color: 'rgba(231,239,234,.6)', whiteSpace: 'nowrap' }}>오늘 수면</span>
                      <input type="number" step="0.5" min="0" max="24" value={sleepInput} onChange={(e) => setSleepInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const h = parseFloat(sleepInput); if (h >= 0 && h <= 24) { be.addSleepLog(todayISO, h); setSleepInput('') } } }} placeholder={String(be.sleepLogs?.find((l) => l.date === todayISO)?.hours ?? '7.5')} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)' }}>시간</span>
                      <button onClick={() => { const h = parseFloat(sleepInput); if (h >= 0 && h <= 24) { be.addSleepLog(todayISO, h); setSleepInput('') } }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 16px', borderRadius: 14 }}>저장</button>
                    </div>
                    {(be.sleepLogs ?? []).length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', padding: '6px 0 4px' }}>아직 기록이 없어요. 오늘 수면부터 입력해보세요.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {(be.sleepLogs ?? []).slice(0, 7).map((l, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span style={{ fontSize: 11.5, color: l.date === todayISO ? '#9FE2E8' : 'rgba(231,239,234,.55)', fontWeight: l.date === todayISO ? 700 : 400, width: 40, flex: 'none' }}>{sleepLabel(l.date)}</span>
                            <div style={{ flex: 1, height: 9, borderRadius: 6, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, Math.round((l.hours / 9) * 100))}%`, background: 'linear-gradient(90deg,#2E9BA6,#67D7DF)' }} /></div>
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: '#9FE2E8', width: 52, textAlign: 'right' }}>{l.hours}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </section>
            </div>
            </>
            )}
          </div>

          {/* ============ 커뮤니티 ============ */}
          {s.view === 'community' && (
            <div style={{ animation: 'hwl-rise .4s ease both' }}>
              <div className="hwl-chiprow" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                {([['feed', '피드'], ['challenge', '챌린지'], ['members', '멤버의 체성분']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setCommTab(k); closeMember() }} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 22, transition: 'all .18s', background: commTab === k ? CTA : 'rgba(255,255,255,.05)', color: commTab === k ? '#060B17' : '#9DAFCB', border: `1px solid ${commTab === k ? 'transparent' : 'rgba(255,255,255,.12)'}` }}>{l}</button>
                ))}
              </div>
              {commTab !== 'members' && (
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {commTab === 'challenge' && (<>
              {!be.configured && (
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
              )}
              {be.configured && (be.challenges == null || be.challenges.length === 0) && (
                <section style={{ ...card, borderRadius: 22, padding: '26px 22px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={eyebrow}>Challenge</div>
                  <div style={{ fontSize: 14, color: 'rgba(231,239,234,.6)', marginTop: 8, lineHeight: 1.6 }}>진행 중인 챌린지가 없어요.<br />아래에서 첫 챌린지를 만들어 함께 목표를 세워보세요.</div>
                </section>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <button onClick={openChallengeForm} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#060B17', background: CTA, padding: '11px 20px', borderRadius: 22 }}>+ 챌린지 만들기</button>
                <span style={{ fontSize: 12, color: '#67D7DF' }}>{s.chDone}</span>
              </div>

              {be.configured && be.challenges && be.challenges.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {be.challenges.map((c) => (
                    <div key={c.id} style={{ ...card, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => { setCgMetric(''); setCgTarget(''); setCgMode('relative'); setInviteOpen(false); setMemberQuery(''); setChProgInfo(false); be.openChallenge(c) }} className="hwl-row-hover" style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#EAF3F1' }}>{c.title}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#67D7DF', background: 'rgba(103,215,223,.14)', borderRadius: 8, padding: '1px 7px' }}>D-{c.daysLeft}</span>
                          {c.scope === 'private' && <span style={{ fontSize: 9.5, fontWeight: 600, color: '#C9A24B', background: 'rgba(201,162,75,.14)', border: '1px solid rgba(201,162,75,.3)', borderRadius: 8, padding: '0 6px' }}>비공개</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)', marginTop: 3, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {c.metrics.map((m) => <span key={m} style={{ fontSize: 10.5, fontWeight: 600, color: '#9FE2E8', background: 'rgba(46,155,166,.14)', borderRadius: 7, padding: '1px 7px' }}>{m}</span>)}
                          <span>{c.startDate.slice(5).replace('-', '.')} ~ {c.endDate.slice(5).replace('-', '.')}</span>
                        </div>
                      </button>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(157,175,203,.5)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      {(c.isOwn || be.isAdmin) && (
                        <button onClick={() => { if (confirm("이 챌린지를 삭제할까요?")) void be.deleteChallenge(c.id) }} title="삭제" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(224,160,106,.8)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </>)}
              {commTab === 'feed' && (<>

              <section style={{ ...card, borderRadius: 22, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Avatar initials={meDisp.initials} color={meDisp.color} photo={meDisp.photo} size={42} fontSize={13} />
                  <textarea value={s.newPost} onChange={(e) => set({ newPost: e.target.value })} placeholder="오늘의 성과나 궁금한 점을 나눠보세요… (@로 멘션)" style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.5, padding: '11px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', resize: 'none', minHeight: 54, color: '#EAF3F1' }} />
                </div>
                {(() => { const m = s.newPost.match(/@([가-힣A-Za-z0-9_]*)$/); if (!m) return null; const q = m[1]; const hits = mentionNames.filter((n) => n.includes(q)).slice(0, 5); if (!hits.length) return null; return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                    {hits.map((n) => <button key={n} onClick={() => set({ newPost: s.newPost.replace(/@[가-힣A-Za-z0-9_]*$/, `@${n} `) })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 14, padding: '5px 11px' }}>@{n}</button>)}
                  </div>
                ) })()}
                {postImg && (
                  <div style={{ position: 'relative', display: 'inline-block', marginTop: 11 }}>
                    <img src={URL.createObjectURL(postImg)} alt="" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', display: 'block' }} />
                    <button onClick={() => setPostImg(null)} style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(6,11,23,.8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>×</button>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#9FE2E8', background: 'rgba(46,155,166,.12)', border: '1px solid rgba(103,215,223,.25)', borderRadius: 18, padding: '8px 13px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" /></svg>사진
                    <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPostImg(f); e.target.value = '' }} style={{ display: 'none' }} />
                  </label>
                  <button onClick={submitPost} style={{ all: 'unset', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 22px', borderRadius: 22 }}>피드에 올리기</button>
                </div>
              </section>

              {postsDisp.map((p) => (
                <article key={p.id} style={{ ...card, borderRadius: 22, padding: 20, marginBottom: 18, animation: 'hwl-rise .4s ease both' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar initials={p.initials} color={p.color} photo={p.photo} size={44} fontSize={13} ring={p.ring} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 700, fontSize: 14.5, color: '#EAF3F1' }}>{p.author}</span><span style={{ fontSize: 10, fontWeight: 600, color: p.tagFg, background: p.tagBg, padding: '1px 8px', borderRadius: 10 }}>{p.tag}</span></div>
                      <div style={{ fontSize: 12, color: 'rgba(231,239,234,.4)' }}>{p.time}</div>
                    </div>
                    {p.isOwn && (
                      <button onClick={() => { if (confirm('이 게시물을 삭제할까요?')) onDeletePost(p.id) }} title="삭제" style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(157,175,203,.6)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                  </div>
                  {p.text && <div style={{ fontSize: 15, lineHeight: 1.65, color: 'rgba(231,239,234,.85)', margin: '14px 2px 4px', whiteSpace: 'pre-wrap' }}>{renderMentions(p.text)}</div>}
                  {(p as { image?: string | null }).image && <img src={(p as { image?: string | null }).image as string} alt="" style={{ width: '100%', borderRadius: 14, marginTop: 12, border: '1px solid rgba(255,255,255,.08)', display: 'block' }} />}
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
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <Avatar initials={cm.initials} color={cm.color} photo={cm.photo} size={30} fontSize={10.5} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ background: 'rgba(255,255,255,.05)', borderRadius: '3px 13px 13px 13px', padding: '9px 13px' }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{cm.author}</span> <span style={{ fontSize: 13, color: 'rgba(231,239,234,.78)' }}>{renderMentions(cm.text)}</span></div>
                              <div style={{ display: 'flex', gap: 12, marginTop: 4, marginLeft: 4 }}>
                                <button onClick={() => { onReply(p.id, (cm as { id?: string }).id, i, cm.author); document.getElementById(`cmt-${p.id}`)?.focus() }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'rgba(157,175,203,.8)' }}>답글</button>
                                {(be.configured ? (cm as { isOwn?: boolean }).isOwn : cm.author === ME.name) && (
                                  <button onClick={() => { if (confirm('댓글을 삭제할까요?')) onDeleteComment(p.id, (cm as { id?: string }).id, i) }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'rgba(224,160,106,.8)' }}>삭제</button>
                                )}
                              </div>
                            </div>
                          </div>
                          {(cm.replies ?? []).map((rp, j) => (
                            <div key={j} style={{ display: 'flex', gap: 9, marginLeft: 34 }}>
                              <Avatar initials={rp.initials} color={rp.color} photo={rp.photo} size={26} fontSize={9.5} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: '3px 12px 12px 12px', padding: '8px 12px' }}><span style={{ fontWeight: 700, fontSize: 12, color: '#EAF3F1' }}>{rp.author}</span> <span style={{ fontSize: 12.5, color: 'rgba(231,239,234,.78)' }}>{renderMentions(rp.text)}</span></div>
                                {(be.configured ? (rp as { isOwn?: boolean }).isOwn : rp.author === ME.name) && (
                                  <button onClick={() => { if (confirm('답글을 삭제할까요?')) onDeleteComment(p.id, (rp as { id?: string }).id, j) }} style={{ all: 'unset', cursor: 'pointer', fontSize: 10.5, fontWeight: 600, color: 'rgba(224,160,106,.8)', marginTop: 3, marginLeft: 4 }}>삭제</button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                      {(p as { replyToName?: string | null }).replyToName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#9FE2E8', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.2)', borderRadius: 10, padding: '6px 10px' }}>
                          <span><b style={{ color: '#67D7DF' }}>{(p as { replyToName?: string | null }).replyToName}</b>님에게 답글 다는 중</span>
                          <button onClick={() => onCancelReply(p.id)} style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: 14, color: 'rgba(231,239,234,.6)' }}>×</button>
                        </div>
                      )}
                      {(() => { const m = String(p.draft).match(/@([가-힣A-Za-z0-9_]*)$/); if (!m) return null; const q = m[1]; const hits = mentionNames.filter((n) => n.includes(q)).slice(0, 5); if (!hits.length) return null; return (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                          {hits.map((n) => <button key={n} onClick={() => onPostDraftChange(p.id, String(p.draft).replace(/@[가-힣A-Za-z0-9_]*$/, `@${n} `))} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 14, padding: '5px 11px' }}>@{n}</button>)}
                        </div>
                      ) })()}
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 2 }}>
                        <Avatar initials={meDisp.initials} color={meDisp.color} photo={meDisp.photo} size={30} fontSize={10.5} />
                        <input id={`cmt-${p.id}`} value={p.draft} onChange={(e) => onPostDraftChange(p.id, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onPostCommentSubmit(p.id) } }} placeholder={(p as { replyToName?: string | null }).replyToName ? `${(p as { replyToName?: string | null }).replyToName}님에게 답글…` : '댓글 · @로 멘션…'} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13, padding: '9px 14px', borderRadius: 18, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={() => onPostCommentSubmit(p.id)} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600, color: '#67D7DF' }}>{(p as { replyToName?: string | null }).replyToName ? '답글' : '댓글'}</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              </>)}
              </div>
              )}
            </div>
          )}

          {/* ============ 그룹 채팅 ============ */}
          {s.view === 'chat' && (
            <div className="hwl-chat-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 20, animation: 'hwl-rise .4s ease both' }}>
              <section ref={chatPanelRef} className="hwl-chat-panel" style={{ ...card, borderRadius: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ position: 'relative', padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10, zIndex: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {activeRoom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '.3px', borderRadius: 7, padding: '1px 6px', color: activeRoom.isPrivate ? '#C9A24B' : '#67D7DF', background: activeRoom.isPrivate ? 'rgba(201,162,75,.14)' : 'rgba(46,155,166,.12)', border: `1px solid ${activeRoom.isPrivate ? 'rgba(201,162,75,.3)' : 'rgba(103,215,223,.25)'}` }}>{activeRoom.isPrivate ? '비공개' : '공개'}</span>
                        {be.configured && (
                          <button onClick={() => { setRoomMenu(false); setMemberList((v) => !v) }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: '.3px', borderRadius: 7, padding: '1px 6px', color: '#9FE2E8', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-2.6 2.6-4 5.5-4s4.9 1.4 5.5 4" strokeLinecap="round" /><path d="M16 6.5a3 3 0 0 1 0 5.4M17 19c-.3-2-1-3.2-2.4-4" strokeLinecap="round" /></svg>멤버 {be.roomMembers.length}
                          </button>
                        )}
                      </div>
                    )}
                    <button onClick={() => be.configured && chatRooms != null && (setMemberList(false), setRoomMenu((v) => !v))} style={{ all: 'unset', cursor: be.configured && chatRooms != null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, maxWidth: '100%' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2E9BA6', boxShadow: '0 0 0 4px rgba(46,155,166,.25)', flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 19, color: '#F2F7F3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roomTitle}</span>
                      {be.configured && chatRooms != null && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(157,175,203,.8)" strokeWidth="2" style={{ flexShrink: 0, transform: roomMenu ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  </div>
                  {roomMenu && chatRooms != null && (
                    <>
                      <div onClick={() => setRoomMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                      <div style={{ position: 'absolute', top: '100%', left: 20, right: 20, marginTop: 2, zIndex: 10, background: '#0E1A38', border: '1px solid rgba(255,247,232,.14)', borderRadius: 14, boxShadow: '0 24px 50px -20px rgba(0,0,0,.85)', overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                        {chatRooms.map((r) => { const sel = r.id === be.activeRoomId; return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: sel ? 'rgba(46,155,166,.16)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                            <button onClick={() => { be.selectRoom(r.id); setRoomMenu(false) }} style={{ all: 'unset', cursor: 'pointer', flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: sel ? '#67D7DF' : '#EAF3F1' }}>
                              {r.isPrivate && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
                              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                            </button>
                            {r.isOwn && (
                              <button onClick={() => { const n = prompt('새 방 이름', r.name); if (n && n.trim() && n.trim() !== r.name) void be.renameRoom(r.id, n.trim()) }} title="이름 수정" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(157,175,203,.85)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 6.5l4 4" strokeLinecap="round" /></svg>
                              </button>
                            )}
                            {r.isOwn && (
                              <button onClick={() => { if (confirm(`'${r.name}' 방을 삭제할까요? 메시지도 모두 사라져요.`)) void be.deleteRoom(r.id) }} title="방 삭제" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(224,160,106,.85)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </button>
                            )}
                            {sel && <span style={{ flexShrink: 0, marginLeft: 'auto', fontSize: 10.5, color: '#67D7DF' }}>현재</span>}
                          </div>
                        ) })}
                        <div style={{ display: 'flex', gap: 8, padding: 10 }}>
                          <button onClick={() => { setChatErr(''); setChatModal('create'); setRoomMenu(false) }} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '9px 0', borderRadius: 10, background: 'rgba(46,155,166,.14)', color: '#67D7DF', border: '1px solid rgba(103,215,223,.3)' }}>＋ 방 만들기</button>
                          <button onClick={() => { setChatErr(''); setChatModal('join'); setRoomMenu(false) }} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '9px 0', borderRadius: 10, background: 'rgba(255,249,238,.05)', color: '#9DAFCB', border: '1px solid rgba(255,247,232,.12)' }}>코드로 입장</button>
                        </div>
                      </div>
                    </>
                  )}
                  {memberList && (
                    <>
                      <div onClick={() => setMemberList(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
                      <div style={{ position: 'absolute', top: '100%', left: 18, marginTop: 2, zIndex: 10, width: 264, maxWidth: 'calc(100% - 36px)', background: '#0E1A38', border: '1px solid rgba(255,247,232,.14)', borderRadius: 14, boxShadow: '0 24px 50px -20px rgba(0,0,0,.85)', maxHeight: 320, overflowY: 'auto', padding: 8 }}>
                        <div style={{ fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B', padding: '6px 8px 8px' }}>멤버 {be.roomMembers.length}{be.onlineIds.filter((id) => be.roomMembers.some((m) => m.userId === id)).length > 0 && <span style={{ color: '#7BD88F', marginLeft: 6 }}>● {be.onlineIds.filter((id) => be.roomMembers.some((m) => m.userId === id)).length} 접속</span>}</div>
                        {be.roomMembers.length === 0 && <div style={{ fontSize: 12, color: 'rgba(231,239,234,.45)', padding: '4px 8px 8px' }}>멤버 정보를 불러오는 중…</div>}
                        {[...be.roomMembers].sort((a, b) => (be.onlineIds.includes(b.userId) ? 1 : 0) - (be.onlineIds.includes(a.userId) ? 1 : 0) || Date.parse(b.lastReadAt ?? '0') - Date.parse(a.lastReadAt ?? '0')).map((m) => {
                          const disp = m.anonymous ? (m.aliasName?.trim() || '익명') : m.name
                          const online = be.onlineIds.includes(m.userId)
                          const label = online ? '접속 중' : (fmtActive(m.lastReadAt) ?? '방금 전 활동')
                          return (
                            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px' }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <Avatar initials={m.anonymous ? '익' : m.initials} color={m.color} photo={m.anonymous ? m.aliasPhoto : m.photo} size={32} fontSize={11} />
                                <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: online ? '#7BD88F' : 'rgba(157,175,203,.55)', border: '2.5px solid #0E1A38', boxShadow: online ? '0 0 6px rgba(123,216,143,.8)' : 'none' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 600, color: '#EAF3F1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{disp}</span>{m.role === 'trainer' && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#060B17', background: '#67D7DF', borderRadius: 6, padding: '0 5px' }}>코치</span>}</div>
                                <div style={{ fontSize: 11, fontWeight: online ? 600 : 400, color: online ? '#7BD88F' : 'rgba(231,239,234,.45)' }}>{label}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {activeRoom?.isPrivate && activeRoom.joinCode && (
                      <button onClick={() => { navigator.clipboard?.writeText(activeRoom.joinCode!).then(() => { setChatErr(''); setRoomMenu(false) }).catch(() => {}) }} title="코드 복사" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, letterSpacing: '1px', color: '#67D7DF', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.25)', borderRadius: 9, padding: '4px 9px', whiteSpace: 'nowrap' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" /></svg>{activeRoom.joinCode}
                      </button>
                    )}
                    {be.configured && activeRoom && (
                      <button onClick={() => { setAnonOn(be.myRoomAlias?.anonymous ?? false); setAnonName(be.myRoomAlias?.aliasName ?? ''); setAnonPhoto(null); setAliasModal(true) }} title="입장 설정" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: be.myRoomAlias?.anonymous ? '#C9A24B' : '#9DAFCB', background: be.myRoomAlias?.anonymous ? 'rgba(201,162,75,.14)' : 'rgba(255,249,238,.05)', border: `1px solid ${be.myRoomAlias?.anonymous ? 'rgba(201,162,75,.3)' : 'rgba(255,247,232,.12)'}`, borderRadius: 14, padding: '5px 10px' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" /></svg>{be.myRoomAlias?.anonymous ? '익명' : '프로필'}
                      </button>
                    )}
                  </div>
                </div>
                <div ref={chatRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  ) : messages.map((m) => {
                    const mid = String(m.id)
                    const deleted = (m as { deleted?: boolean }).deleted
                    const reactions = (m as { reactions?: { emoji: string; count: number; mine: boolean; users: string[] }[] }).reactions ?? []
                    const reply = (m as { replyTo?: { author: string; text: string } | null }).replyTo
                    const readCount = (m as { readCount?: number }).readCount ?? 0
                    const readBy = (m as { readBy?: string[] }).readBy ?? []
                    const isMine = m.role === 'me' || (m as { isMine?: boolean }).isMine
                    const img = (m as { image?: string | null }).image
                    const open = msgActions === mid
                    return (
                    <div key={m.id}
                      onTouchStart={(e) => { if (be.configured && !deleted) swipeRef.current = { x: e.touches[0].clientX, id: mid } }}
                      onTouchEnd={(e) => { const s = swipeRef.current; if (s && s.id === mid && e.changedTouches[0].clientX - s.x > 55 && !deleted) setReplyTarget({ id: mid, author: m.author, text: m.text || '사진' }); swipeRef.current = null }}
                      style={{ display: 'flex', gap: 11, flexDirection: m.dir, animation: 'hwl-rise .3s ease both' }}>
                      <Avatar initials={m.initials} color={m.color} photo={m.photo} size={34} fontSize={11} ring={m.ring} />
                      <div style={{ maxWidth: '76%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, justifyContent: m.justify }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{m.author}</span><span style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)' }}>{m.time}</span></div>
                        {deleted ? (
                          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(231,239,234,.4)', padding: '6px 11px', borderRadius: m.radius, border: '1px dashed rgba(255,255,255,.14)' }}>메시지가 삭제되었습니다</div>
                        ) : (
                          <div onClick={() => be.configured && setMsgActions(open ? null : mid)} style={{ cursor: be.configured ? 'pointer' : 'default', borderRadius: m.radius, background: m.bubbleBg, border: `1px solid ${m.bubbleBorder}`, overflow: 'hidden' }}>
                            {reply && <div style={{ fontSize: 11.5, padding: '7px 12px 0', color: isMine ? 'rgba(6,17,15,.7)' : 'rgba(231,239,234,.6)' }}><b>{reply.author}</b><div style={{ opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200, borderLeft: '2px solid currentColor', paddingLeft: 7, marginTop: 2 }}>{reply.text}</div></div>}
                            {img && <img src={img} alt="" style={{ width: '100%', maxWidth: 240, display: 'block', marginTop: reply ? 6 : 0 }} />}
                            {m.text && <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.1px', lineHeight: 1.42, padding: '6px 11px', color: m.bubbleFg }}>{m.text}</div>}
                          </div>
                        )}
                        {reactions.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {reactions.map((r) => (
                              <button key={r.emoji} onClick={() => be.toggleReaction(mid, r.emoji)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, padding: '2px 7px', borderRadius: 12, background: r.mine ? 'rgba(46,155,166,.25)' : 'rgba(255,255,255,.06)', border: `1px solid ${r.mine ? 'rgba(103,215,223,.4)' : 'rgba(255,255,255,.1)'}` }}>{r.emoji}<span style={{ color: '#9FE2E8' }}>{r.count}</span></button>
                            ))}
                          </div>
                        )}
                        {isMine && readCount > 0 && <button onClick={() => setReadModal(readBy)} style={{ all: 'unset', cursor: 'pointer', fontSize: 10, color: '#67D7DF', marginTop: 3 }}>읽음 {readCount}</button>}
                        {open && be.configured && !deleted && (
                          <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 2, marginTop: 5, maxWidth: '100%', overflowX: 'auto', background: '#0E1A38', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: '4px 6px' }}>
                            {['👍', '❤️', '😂', '😢', '😮', '😡'].map((e) => <button key={e} onClick={() => { be.toggleReaction(mid, e); setMsgActions(null) }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 15, padding: '2px 2px' }}>{e}</button>)}
                            <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,.14)', margin: '0 3px', flexShrink: 0 }} />
                            <button onClick={() => { setReplyTarget({ id: mid, author: m.author, text: m.text || '사진' }); setMsgActions(null) }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: '#9DAFCB', padding: '2px 6px', whiteSpace: 'nowrap' }}>답글</button>
                            {(isMine || be.isAdmin) && <button onClick={() => { if (confirm('메시지를 삭제할까요?')) be.deleteMessage(mid); setMsgActions(null) }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'rgba(224,135,92,.9)', padding: '2px 6px', whiteSpace: 'nowrap' }}>삭제</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  ) })}
                </div>
                {replyTarget && (
                  <div style={{ padding: '8px 18px 0', display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ flex: 1, minWidth: 0, borderLeft: '2px solid #67D7DF', paddingLeft: 9 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#67D7DF' }}>{replyTarget.author}에게 답글</div>
                      <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyTarget.text}</div>
                    </div>
                    <button onClick={() => setReplyTarget(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: 'rgba(231,239,234,.5)' }}>×</button>
                  </div>
                )}
                {chatImg && (
                  <div style={{ padding: '10px 18px 0', position: 'relative', display: 'inline-block' }}>
                    <img src={URL.createObjectURL(chatImg)} alt="" style={{ maxHeight: 90, borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', display: 'block' }} />
                    <button onClick={() => setChatImg(null)} style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 4, right: 22, width: 20, height: 20, borderRadius: '50%', background: 'rgba(6,11,23,.8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>×</button>
                  </div>
                )}
                <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 9, alignItems: 'center' }}>
                  <label style={{ cursor: be.configured && !activeRoom ? 'default' : 'pointer', flex: 'none', width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9FE2E8', opacity: be.configured && !activeRoom ? 0.5 : 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <input type="file" accept="image/*" disabled={be.configured && !activeRoom} onChange={(e) => { const f = e.target.files?.[0]; if (f) setChatImg(f); e.target.value = '' }} style={{ display: 'none' }} />
                  </label>
                  <input value={s.newMsg} disabled={be.configured && !activeRoom} onChange={(e) => set({ newMsg: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendMsg() } }} placeholder={be.configured && !activeRoom ? '먼저 채팅방을 만들거나 입장하세요' : '메시지를 입력하세요…'} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 14.5, padding: '13px 18px', borderRadius: 24, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1', opacity: be.configured && !activeRoom ? 0.5 : 1 }} />
                  <button onClick={sendMsg} style={{ all: 'unset', cursor: 'pointer', flex: 'none', width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#67D7DF,#2E9BA6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#060B17" strokeWidth="2"><path d="M4 12l16-7-7 16-2-7z" strokeLinejoin="round" /></svg></button>
                </div>
              </section>
              {/* 방 만들기 / 코드로 입장 모달 */}
            </div>
          )}

          {/* 채팅방 만들기 / 입장 모달 (뷰 div 밖) */}
          {chatModal !== 'none' && (
            <div onClick={() => setChatModal('none')} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', animation: 'hwl-fade .25s ease both' }}>
              <div className="hwl-modal-wrap" style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    <button onClick={() => setChatModal('none')} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9FBCB5', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.15)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                    <button onClick={chatModal === 'create' ? submitCreateRoom : submitJoinRoom} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>{chatModal === 'create' ? '만들기' : '입장'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 채팅 입장 설정(프로필/익명) 모달 */}
          {aliasModal && (
            <div onClick={() => setAliasModal(false)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 122, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={eyebrow}>Identity</div><div style={cardTitle}>채팅 입장 설정</div>
                <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.55)', lineHeight: 1.6, margin: '8px 0 16px' }}>이 방에서 어떻게 보일지 선택하세요. 익명이면 닉네임과 사진을 따로 정할 수 있어요.</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[{ v: false, l: '내 프로필' }, { v: true, l: '익명' }].map((o) => (
                    <button key={o.l} onClick={() => setAnonOn(o.v)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 600, border: `1px solid ${anonOn === o.v ? 'transparent' : 'rgba(255,255,255,.12)'}`, background: anonOn === o.v ? '#2E9BA6' : 'rgba(255,255,255,.05)', color: anonOn === o.v ? '#060B17' : '#9DAFCB' }}>{o.l}</button>
                  ))}
                </div>
                {anonOn && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', background: '#5E6B85', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}>
                          {anonPhoto ? <img src={URL.createObjectURL(anonPhoto)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : '사진'}
                        </div>
                        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setAnonPhoto(f); e.target.value = '' }} style={{ display: 'none' }} />
                      </label>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>익명 닉네임</label>
                        <input value={anonName} onChange={(e) => setAnonName(e.target.value)} placeholder="예) 익명의 러너" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setAliasModal(false)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                  <button onClick={() => { void be.setRoomAlias(anonOn, anonName.trim() || null, anonPhoto); setAliasModal(false) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>적용</button>
                </div>
              </div>
            </div>
          )}

          {/* 읽은 사람 모달 */}
          {readModal && (
            <div onClick={() => setReadModal(null)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 122, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 22, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={cardTitle}>읽음 {readModal.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  {readModal.map((n, i) => <div key={i} style={{ fontSize: 13.5, color: '#EAF3F1' }}>{n}</div>)}
                </div>
                <button onClick={() => setReadModal(null)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%', marginTop: 18, fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 12, borderRadius: 20 }}>닫기</button>
              </div>
            </div>
          )}

          {/* 멤버 목표 수정 모달 (관리자) */}
          {goalEdit && (() => {
            const baseVal = goalEdit.baseSel === '__manual__' ? parseFloat(goalEdit.baseManual) : parseFloat(goalEdit.baseSel)
            const canSave = !isNaN(parseFloat(goalEdit.target)) && !isNaN(baseVal)
            return (
              <div onClick={() => setGoalEdit(null)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 123, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                  <div style={eyebrow}>Coach · Member Goal</div><div style={cardTitle}>{goalEdit.name}님 목표 수정</div>
                  <div style={{ fontSize: 12.5, color: '#9FE2E8', fontWeight: 600, margin: '4px 0 16px' }}>{goalEdit.metricLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)' }}>
                      {([['relative', '변화'], ['absolute', '달성']] as const).map(([m, l]) => (
                        <button key={m} onClick={() => setGoalEdit((g) => g ? { ...g, mode: m } : g)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, padding: '9px 0', background: goalEdit.mode === m ? '#2E9BA6' : 'transparent', color: goalEdit.mode === m ? '#060B17' : '#9DAFCB' }}>{l}</button>
                      ))}
                    </div>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>{goalEdit.mode === 'relative' ? '목표 변화량' : '목표 달성값'}</label>
                      <input value={goalEdit.target} onChange={(e) => setGoalEdit((g) => g ? { ...g, target: e.target.value } : g)} type="number" step="0.1" placeholder={goalEdit.mode === 'relative' ? '예) -3' : '예) 35'} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} /></div>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>시작 기준값</label>
                      <select value={goalEdit.baseSel} onChange={(e) => setGoalEdit((g) => g ? { ...g, baseSel: e.target.value } : g)} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }}>
                        <option value="">측정 기록 선택</option>
                        {goalEdit.options.map((o, i) => <option key={i} value={String(o.value)}>{o.date.replace(/-/g, '.')} · {o.value}{goalEdit.unit}</option>)}
                        <option value="__manual__">직접 입력…</option>
                      </select>
                      {goalEdit.baseSel === '__manual__' && <input value={goalEdit.baseManual} onChange={(e) => setGoalEdit((g) => g ? { ...g, baseManual: e.target.value } : g)} type="number" step="0.1" placeholder={`기준값 직접 입력${goalEdit.unit ? ` (${goalEdit.unit})` : ''}`} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13, marginTop: 7 }} />}
                      {goalEdit.options.length === 0 && goalEdit.baseSel !== '__manual__' && <div style={{ fontSize: 11, color: 'rgba(224,160,106,.85)', marginTop: 5 }}>이 멤버의 측정 기록이 없어요 — 직접 입력하세요.</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={() => setGoalEdit(null)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '12px 20px', borderRadius: 22 }}>취소</button>
                    <button disabled={!canSave} onClick={() => { if (canSave) { void be.editChallengeGoalFor(goalEdit.userId, goalEdit.metricKey, goalEdit.mode, parseFloat(goalEdit.target), baseVal); setGoalEdit(null) } }} style={{ all: 'unset', boxSizing: 'border-box', cursor: canSave ? 'pointer' : 'not-allowed', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: canSave ? CTA : 'rgba(103,215,223,.3)', padding: 12, borderRadius: 22 }}>저장</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 직접 입력 측정 추가 모달 */}
          {manualOpen && (
            <div onClick={() => setManualOpen(false)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 122, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={eyebrow}>Manual Entry</div><div style={cardTitle}>직접 입력으로 측정 추가</div>
                <div style={{ fontSize: 12, color: 'rgba(231,239,234,.5)', marginTop: 4, marginBottom: 16 }}>채운 항목만 저장돼요. 비운 항목은 ‘기록 없음’으로 표시되고 모든 계산에서 제외됩니다.</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>측정 날짜</label>
                  <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0, padding: '9px 11px', fontSize: 13 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  {MEAS_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                      <input type="number" step="0.1" value={manualVals[f.key] ?? ''} onChange={(e) => setManualVals((m) => ({ ...m, [f.key]: e.target.value }))} placeholder="기록 없음" style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setManualOpen(false)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                  <button onClick={() => { if (!manualDate) { alert('측정 날짜를 입력하세요.'); return } const vals: Record<string, number> = {}; for (const f of MEAS_FIELDS) { const n = parseFloat(manualVals[f.key]); if (!isNaN(n)) vals[f.key] = n } if (Object.keys(vals).length === 0) { alert('값을 하나 이상 입력하세요.'); return } void be.addManualMeasurement(manualDate, vals).then(() => setManualOpen(false)).catch((e) => alert(e instanceof Error ? e.message : '저장에 실패했어요.')) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>저장</button>
                </div>
              </div>
            </div>
          )}

          {/* 수업 추가/수정 모달 (코치) */}
          {sessForm && (() => {
            const f = sessForm
            const memberPkgs = (be.packages ?? []).filter((p) => p.memberId === f.memberId)
            const canSave = !!f.date && !!f.time
            const save = () => {
              if (!canSave) { setSchedErr('날짜·시간을 입력하세요.'); return }
              const startsAt = new Date(`${f.date}T${f.time}`).toISOString()
              const dur = parseInt(f.dur, 10) || 50
              const done = () => setSessForm(null)
              if (f.id) void be.updateSession(f.id, { title: f.title, color: f.color, starts_at: startsAt, duration_min: dur, member_id: f.memberId || null, package_id: f.packageId || null, status: f.status as never }).then(done).catch((e) => setSchedErr(e instanceof Error ? e.message : '저장 실패'))
              else void be.createSession({ memberId: f.memberId || null, packageId: f.packageId || null, title: f.title, color: f.color, startsAt, durationMin: dur }).then(done).catch((e) => setSchedErr(e instanceof Error ? e.message : '저장 실패'))
            }
            return (
              <div onClick={() => setSessForm(null)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 124, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                  <div style={eyebrow}>Class</div><div style={cardTitle}>{f.id ? '수업 수정' : '수업 추가'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>회원</label>
                      <select value={f.memberId} onChange={(e) => setSessForm({ ...f, memberId: e.target.value, packageId: '' })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }}>
                        <option value="">선택 안 함</option>
                        {(be.roster ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    {f.memberId && (
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>회차권 연결 (시수 차감)</label>
                        <select value={f.packageId} onChange={(e) => setSessForm({ ...f, packageId: e.target.value })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }}>
                          <option value="">연결 안 함</option>
                          {memberPkgs.map((p) => <option key={p.id} value={p.id}>{p.totalSessions}회권 · {p.remaining}회 남음 ({p.registeredOn.replace(/-/g, '.')})</option>)}
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 9 }}>
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>날짜</label><input type="date" value={f.date} onChange={(e) => setSessForm({ ...f, date: e.target.value })} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0, padding: '9px 8px', fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>시간</label><input type="time" value={f.time} onChange={(e) => setSessForm({ ...f, time: e.target.value })} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0, padding: '9px 8px', fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>분</label><input type="number" value={f.dur} onChange={(e) => setSessForm({ ...f, dur: e.target.value })} style={{ ...inputStyle, padding: '9px 8px', fontSize: 13 }} /></div>
                    </div>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>수업명</label><input value={f.title} onChange={(e) => setSessForm({ ...f, title: e.target.value })} placeholder="예) PT, 그룹 클래스" style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} /></div>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>색상</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SLOT_COLORS.map((c) => <button key={c} onClick={() => setSessForm({ ...f, color: c })} style={{ all: 'unset', cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', background: c, boxShadow: f.color === c ? '0 0 0 2px #0E1834, 0 0 0 4px #fff' : 'none' }} />)}</div>
                    </div>
                    {f.id && (
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>상태</label>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{(['scheduled', 'attended', 'sameday_cancel', 'cancelled'] as const).map((st) => <button key={st} onClick={() => setSessForm({ ...f, status: st })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 10, background: f.status === st ? STATUS_COLOR[st] : 'rgba(255,255,255,.05)', color: f.status === st ? '#060B17' : '#9DAFCB', border: '1px solid rgba(255,255,255,.1)' }}>{STATUS_LABEL[st]}</button>)}</div>
                        <div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginTop: 5 }}>출석·당일취소는 시수 1회 차감, 일반 취소는 차감 안 됨.</div>
                      </div>
                    )}
                  </div>
                  {schedErr && <div style={{ fontSize: 12, color: '#E0A06A', marginTop: 10 }}>{schedErr}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    {f.id && <button onClick={() => { if (confirm('이 수업을 삭제할까요?')) void be.deleteSession(f.id!).then(() => setSessForm(null)) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#E0875C', background: 'rgba(224,138,94,.12)', border: '1px solid rgba(224,138,94,.3)', padding: '12px 16px', borderRadius: 22 }}>삭제</button>}
                    <button onClick={() => setSessForm(null)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '12px 18px', borderRadius: 22 }}>취소</button>
                    <button onClick={save} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 12, borderRadius: 22 }}>저장</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 회차권 등록 모달 (코치) */}
          {pkgForm && (() => {
            const f = pkgForm
            const total = parseInt(f.total, 10)
            const canSave = !!f.memberId && !isNaN(total) && total >= 1 && !!f.date
            return (
              <div onClick={() => setPkgForm(null)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 124, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                  <div style={eyebrow}>Session Pass</div><div style={cardTitle}>회차권 등록</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>회원</label>
                      <select value={f.memberId} onChange={(e) => setPkgForm({ ...f, memberId: e.target.value })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }}>
                        <option value="">회원 선택</option>
                        {(be.roster ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>총 횟수</label><input type="number" min="1" value={f.total} onChange={(e) => setPkgForm({ ...f, total: e.target.value })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>등록일</label><input type="date" value={f.date} onChange={(e) => setPkgForm({ ...f, date: e.target.value })} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0, padding: '9px 8px', fontSize: 13 }} /></div>
                    </div>
                    <div><label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>메모(선택)</label><input value={f.note} onChange={(e) => setPkgForm({ ...f, note: e.target.value })} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                    <button onClick={() => setPkgForm(null)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '12px 18px', borderRadius: 22 }}>취소</button>
                    <button disabled={!canSave} onClick={() => { void be.createPackage(f.memberId, total, f.date, f.note).then(() => setPkgForm(null)) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: canSave ? 'pointer' : 'not-allowed', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: canSave ? CTA : 'rgba(103,215,223,.3)', padding: 12, borderRadius: 22 }}>등록</button>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 측정값 수정 모달 */}
          {measEdit && (
            <div onClick={() => setMeasEdit(null)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 122, background: 'rgba(4,9,18,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={eyebrow}>Edit Measurement</div><div style={cardTitle}>측정 기록 수정</div>
                <div style={{ fontSize: 12, color: 'rgba(231,239,234,.5)', marginTop: 4, marginBottom: 16 }}>측정 날짜와 잘못 인식된 값을 직접 고칠 수 있어요.</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>측정 날짜</label>
                  <input type="date" value={measEdit.iso} onChange={(e) => setMeasEdit((m) => m ? { ...m, iso: e.target.value } : m)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0, padding: '9px 11px', fontSize: 13 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                  {MEAS_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>{f.label}{f.unit ? ` (${f.unit})` : ''}</label>
                      <input type="number" step="0.1" value={measEdit.values[f.key] ?? ''} onChange={(e) => setMeasEdit((m) => m ? { ...m, values: { ...m.values, [f.key]: e.target.value } } : m)} style={{ ...inputStyle, padding: '9px 11px', fontSize: 13 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button onClick={() => setMeasEdit(null)} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                  <button onClick={() => { if (!measEdit.iso) { alert('측정 날짜를 입력하세요.'); return } const vals: Record<string, number> = {}; for (const f of MEAS_FIELDS) { const n = parseFloat(measEdit.values[f.key]); if (!isNaN(n)) vals[f.key] = n } void be.updateMeasurement(measEdit.id, measEdit.iso, vals).then(() => setMeasEdit(null)).catch((e) => alert(e instanceof Error ? e.message : '수정에 실패했어요.')) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>저장</button>
                </div>
              </div>
            </div>
          )}

          {/* 측정 주기 설정 모달 */}
          {cycleModal && (
            <div onClick={() => setCycleModal(false)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,9,18,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={eyebrow}>Measurement Cycle</div>
                <div style={cardTitle}>측정 주기</div>
                <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.55)', lineHeight: 1.6, margin: '8px 0 18px' }}>인바디 측정 간격을 정하면, 마지막 측정일을 기준으로 다음 측정일을 알려드려요.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 9 }}>
                  {[{ d: 7, l: '매주' }, { d: 14, l: '2주' }, { d: 28, l: '4주' }, { d: 56, l: '8주' }].map((o) => {
                    const on = be.measureCycleDays === o.d
                    return <button key={o.d} onClick={() => { be.setMeasureCycle(o.d); setCycleModal(false) }} style={{ all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '14px 0', borderRadius: 14, fontSize: 14, fontWeight: 700, color: on ? '#060B17' : '#EAF3F1', background: on ? CTA : 'rgba(255,249,238,.05)', border: `1px solid ${on ? 'transparent' : 'rgba(255,247,232,.12)'}` }}>{o.l}<div style={{ fontSize: 10.5, fontWeight: 500, opacity: .7, marginTop: 2 }}>{o.d}일</div></button>
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14 }}>
                  <label style={{ fontSize: 12.5, color: 'rgba(231,239,234,.6)', whiteSpace: 'nowrap' }}>직접 입력</label>
                  <input type="number" min={1} max={365} defaultValue={be.measureCycleDays} id="cycle-custom" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  <button onClick={() => { const v = parseInt((document.getElementById('cycle-custom') as HTMLInputElement)?.value || '0', 10); if (v >= 1 && v <= 365) { be.setMeasureCycle(v); setCycleModal(false) } }} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 16px', borderRadius: 14 }}>적용</button>
                </div>
              </div>
            </div>
          )}

          {/* 목표 설정 모달 */}
          {goalModal && (
            <div onClick={() => setGoalModal(false)} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,9,18,.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: '#0E1834', border: '1px solid rgba(255,247,232,.14)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={eyebrow}>Goals</div>
                <div style={cardTitle}>목표 설정</div>
                <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.55)', lineHeight: 1.6, margin: '8px 0 18px' }}>각 지표의 목표값을 입력하세요. 비워두면 목표가 해제됩니다.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {ringDefs.map((d) => (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#EAF3F1' }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(231,239,234,.45)' }}>현재 {lastV(d.key) != null ? lastV(d.key)!.toFixed(d.unit === '점' ? 0 : 1) + d.unit : '기록 없음'}</div>
                      </div>
                      <input type="number" step="0.1" value={goalDraft[d.key] ?? ''} onChange={(e) => setGoalDraft((g) => ({ ...g, [d.key]: e.target.value }))} placeholder="목표" style={{ ...inputStyle, width: 92, flex: 'none' }} />
                      <span style={{ fontSize: 12.5, color: 'rgba(231,239,234,.5)', width: 28 }}>{d.unit}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                  <button onClick={() => setGoalModal(false)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.12)', padding: 13, borderRadius: 22 }}>취소</button>
                  <button onClick={() => { ringDefs.forEach((d) => { const raw = (goalDraft[d.key] ?? '').trim(); const v = raw === '' ? null : parseFloat(raw); if (raw !== '' && (v == null || isNaN(v))) return; be.setGoal(d.key, v) }); setGoalModal(false) }} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>저장</button>
                </div>
              </div>
            </div>
          )}

          {/* 챌린지 만들기 모달 (뷰 div 밖에 둬서 transform 컨테이닝 블록에 갇히지 않게) */}
          {s.showChallengeForm && (
            <div onClick={() => set({ showChallengeForm: false })} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,12,10,.82)', backdropFilter: 'blur(6px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', animation: 'hwl-fade .25s ease both' }}>
              <div className="hwl-modal-wrap" style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#0E1834', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 26, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                  <div style={eyebrow}>{editChallengeId ? 'Edit Challenge' : 'New Challenge'}</div><div style={cardTitle}>{editChallengeId ? '챌린지 수정' : '챌린지 만들기'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
                    <div><label style={labelStyle}>제목</label><input value={s.chTitle} onChange={(e) => set({ chTitle: e.target.value })} placeholder="예) 6월 체성분 챌린지" style={inputStyle} /></div>
                    <div>
                      <label style={labelStyle}>지표 <span style={{ fontWeight: 500, color: 'rgba(231,239,234,.4)' }}>· 여러 개 선택 가능</span></label>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{CH_METRIC_OPTS.map((o) => { const on = chMetricsSel.includes(o.key); return (
                        <button key={o.key} onClick={() => setChMetricsSel((xs) => on ? xs.filter((k) => k !== o.key) : [...xs, o.key])} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: on ? '#2E9BA6' : 'rgba(255,255,255,.05)', color: on ? '#060B17' : '#9DAFCB', border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,.12)'}` }}>{on ? '✓ ' : ''}{o.label}</button>
                      ) })}</div>
                      <div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)', marginTop: 7, lineHeight: 1.5 }}>목표 수치는 참여하는 멤버가 각자 설정해요.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 130 }}><label style={labelStyle}>시작일</label><input type="date" value={chStart} max={chEnd || undefined} onChange={(e) => setChStart(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0 }} /></div>
                      <div style={{ flex: 1, minWidth: 130 }}><label style={labelStyle}>종료일</label><input type="date" value={chEnd} min={chStart || undefined} onChange={(e) => setChEnd(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0 }} /></div>
                    </div>
                    <div><label style={labelStyle}>공개 범위</label><div style={{ display: 'flex', gap: 7 }}>{chScopes.map((c, i) => <button key={i} onClick={() => set({ chScope: c.label })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 11, background: c.bg, color: c.fg, border: `1px solid ${c.bg === 'rgba(255,255,255,.05)' ? 'rgba(255,255,255,.12)' : 'transparent'}` }}>{c.label}</button>)}</div></div>
                    {s.chDone.startsWith('⚠') && <div style={{ fontSize: 12, color: '#E0875C' }}>{s.chDone}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                    <button onClick={() => { set({ showChallengeForm: false, chDone: '' }); setEditChallengeId(null) }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#9DAFCB', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: '13px 20px', borderRadius: 22 }}>취소</button>
                    <button onClick={createChallenge} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#060B17', background: CTA, padding: 13, borderRadius: 22 }}>{editChallengeId ? '저장' : '만들기'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 챌린지 상세 모달: 참여자별 목표 + 주간 성취도 비교 */}
          {be.challengeDetail && (() => {
            const cd = be.challengeDetail
            const fmtN = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)
            const goalText = (p: typeof cd.progress[number]) => p.mode === 'relative'
              ? `${p.metricLabel} ${p.target > 0 ? '+' : ''}${fmtN(p.target)}${p.unit}`
              : `${p.metricLabel} ${fmtN(p.target)}${p.unit} 달성`
            const memberIds = new Set(cd.members.map((m) => m.userId))
            const invitable = (be.members ?? []).filter((m) => !memberIds.has(m.id))
            const MEDAL = ['#F2C94C', '#C9D1DA', '#CD7F4E']  // gold / silver / bronze
            const rankBadge = (i: number) => i < 3 ? (
              <span style={{ position: 'relative', width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i === 0 && <svg width="14" height="14" viewBox="0 0 24 24" fill={MEDAL[0]} style={{ position: 'absolute', top: -9 }}><path d="M5 16l-2-9 5 4 4-7 4 7 5-4-2 9z" /></svg>}
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: MEDAL[i], color: '#1a1206', fontSize: 11, fontWeight: 800, fontFamily: "'IBM Plex Mono',monospace", display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 10px ${MEDAL[i]}66` }}>{i + 1}</span>
              </span>
            ) : <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: 'rgba(231,239,234,.4)', width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            const openGoalEdit = (p: typeof cd.progress[number]) => {
              void be.fetchMemberReadings(p.userId, p.metricKey).then((opts) => setGoalEdit({
                userId: p.userId, name: p.name, metricKey: p.metricKey, metricLabel: p.metricLabel, unit: p.unit,
                mode: p.mode, target: String(p.target),
                baseSel: p.baseline != null ? '__manual__' : '', baseManual: p.baseline != null ? String(p.baseline) : '', options: opts,
              }))
            }
            const board = (getPct: (p: typeof cd.progress[number]) => number, items: typeof cd.progress = cd.progress, editable = false) => {
              const rows = [...items].sort((a, b) => getPct(b) - getPct(a))
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {rows.map((p, i) => { const pv = getPct(p); return (
                    <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {rankBadge(i)}
                      <Avatar initials={p.initials} color={p.color} photo={p.photo} size={i < 3 ? 34 : 30} fontSize={11} ring={i === 0 ? `0 0 0 2px ${MEDAL[0]}` : undefined} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 12.5, fontWeight: i < 3 ? 700 : 600, color: '#EAF3F1' }}>{p.name}{p.isMe ? ' (나)' : ''}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: pv >= 100 ? '#7BD88F' : '#67D7DF' }}>{pv}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, pv)}%`, background: pv >= 100 ? '#7BD88F' : (i === 0 ? `linear-gradient(90deg,${MEDAL[0]},#67D7DF)` : 'linear-gradient(90deg,#2E9BA6,#67D7DF)') }} /></div>
                        <div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.45)', marginTop: 2 }}>{goalText(p)} · 현재 {p.current != null ? fmtN(p.current) + p.unit : '—'}</div>
                      </div>
                      {editable && be.isAdmin && (
                        <button onClick={() => openGoalEdit(p)} title="이 멤버 목표 수정" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 12, padding: '4px 10px' }}>수정</button>
                      )}
                    </div>
                  ) })}
                </div>
              )
            }
            return (
            <div onClick={be.closeChallenge} className="hwl-modal-wrap" style={{ position: 'fixed', inset: 0, zIndex: 121, background: 'rgba(4,12,10,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', animation: 'hwl-fade .25s ease both' }}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(100dvh - 150px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#0E1834', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 24, boxShadow: '0 40px 90px -40px rgba(0,0,0,.9)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <div style={eyebrow}>Challenge</div>
                      {cd.scope === 'private' && <span style={{ fontSize: 9.5, fontWeight: 600, color: '#C9A24B', background: 'rgba(201,162,75,.14)', border: '1px solid rgba(201,162,75,.3)', borderRadius: 8, padding: '0 6px' }}>비공개</span>}
                    </div>
                    <div style={cardTitle}>{cd.title}</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)', marginTop: 4 }}>{cd.startDate.slice(5).replace('-', '.')} ~ {cd.endDate.slice(5).replace('-', '.')} · D-{cd.daysLeft} · 지표 {cd.metricLabels.join(', ')}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {(cd.isOwn || be.isAdmin) && <button onClick={editChallengeForm} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 14, padding: '5px 11px' }}>수정</button>}
                    <button onClick={be.closeChallenge} style={{ all: 'unset', cursor: 'pointer', fontSize: 20, color: 'rgba(231,239,234,.5)', lineHeight: 1 }}>×</button>
                  </div>
                </div>

                {cd.progress.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', padding: '14px 0 2px' }}>아직 목표를 설정한 참여자가 없어요. 아래에서 내 목표를 정해보세요.</div>}
                {cd.progress.length > 0 && <>
                  {/* 전체 성취도 (상단) */}
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#F2C94C"><path d="M5 16l-2-9 5 4 4-7 4 7 5-4-2 9z" /></svg>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>전체 성취도 · 순위</div>
                      <button onClick={() => setChProgInfo((v) => !v)} aria-label="성취도 계산 설명" style={{ all: 'unset', cursor: 'pointer', width: 15, height: 15, borderRadius: '50%', border: `1px solid ${chProgInfo ? '#67D7DF' : 'rgba(157,175,203,.5)'}`, color: chProgInfo ? '#67D7DF' : 'rgba(157,175,203,.7)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>i</button>
                    </div>
                    {chProgInfo && (
                      <div style={{ fontSize: 11.5, lineHeight: 1.65, color: 'rgba(231,239,234,.72)', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.2)', borderRadius: 10, padding: '10px 13px', marginBottom: 12 }}>
                        <b style={{ color: '#9FE2E8' }}>전체 성취도</b> = 목표 설정 시점의 내 수치(기준값)에서 현재까지 목표에 얼마나 다가갔는지. <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>(현재−기준) ÷ (목표−기준) × 100</span>, 0~100%.<br />
                        <b style={{ color: '#9FE2E8' }}>이번 주 성취도</b> = 직전 측정 → 최근 측정 사이의 진행분을 목표 대비 비율로. <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>(현재−직전) ÷ (목표−기준) × 100</span>.<br />
                        <span style={{ color: 'rgba(231,239,234,.5)' }}>모두 ‘자기 목표의 몇 %’로 환산하므로 지표·목표가 달라도 공정하게 순위가 매겨져요(예: 체지방 −3 목표 50% vs 골격근 35 목표 50%는 동률). 목표를 넘기면 100%를 넘겨(예: 130%) 표시돼 더 앞 순위가 됩니다.</span>
                      </div>
                    )}
                    {board((p) => p.pct, cd.progress, true)}
                  </div>
                  {/* 이번 주 성취도 (하단) — 직전 측정이 없는 사람은 집계 제외 */}
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 12 }}>이번 주 성취도 · 순위</div>
                    {(() => {
                      const ranked = cd.progress.filter((p) => p.hasWeekly)
                      const noWeekly = cd.progress.filter((p) => !p.hasWeekly)
                      return (<>
                        {ranked.length > 0 ? board((p) => p.weeklyPct, ranked) : <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)' }}>이번 주 집계 대상이 없어요(직전 측정 필요).</div>}
                        {noWeekly.length > 0 && (
                          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {noWeekly.map((p) => (
                              <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: 0.65 }}>
                                <Avatar initials={p.initials} color={p.color} photo={p.photo} size={26} fontSize={9.5} />
                                <span style={{ fontSize: 12, color: '#EAF3F1', flex: 1 }}>{p.name}{p.isMe ? ' (나)' : ''}</span>
                                <span style={{ fontSize: 10.5, color: 'rgba(224,160,106,.85)', fontWeight: 600 }}>지난주 측정 없음 · 집계 제외</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>)
                    })()}
                  </div>
                </>}

                {/* 내 목표 설정 */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 10 }}>내 목표</div>
                  {cd.myGoals.map((g) => (
                    <div key={g.metricKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#EAF3F1', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '8px 12px', marginBottom: 7 }}>
                      <span style={{ flex: 1, minWidth: 0 }}><b style={{ color: '#9FE2E8' }}>{cd.metricLabels[cd.metricKeys.indexOf(g.metricKey)] ?? g.metricKey}</b> {g.mode === 'relative' ? `${g.target > 0 ? '+' : ''}${g.target}` : `${g.target} 달성`}<span style={{ color: g.baseline == null ? 'rgba(224,160,106,.85)' : 'rgba(231,239,234,.45)' }}> · 기준 {g.baseline == null ? '없음' : g.baseline}</span></span>
                      <button onClick={() => { setCgMetric(g.metricKey); setCgMode(g.mode); setCgTarget(String(g.target)); if (g.baseline != null) { setCgBaseSel('__manual__'); setCgBaseManual(String(g.baseline)) } else { setCgBaseSel(''); setCgBaseManual('') } }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: '#67D7DF' }}>수정</button>
                      <button onClick={() => void be.deleteChallengeGoal(g.metricKey)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'rgba(224,135,92,.8)' }}>삭제</button>
                    </div>
                  ))}
                  {(() => {
                    const mSeries = (metrics as Record<string, { series: number[]; unit?: string }>)[cgMetric]?.series
                    const mUnit = (metrics as Record<string, { series: number[]; unit?: string }>)[cgMetric]?.unit ?? ''
                    const baseVal = cgBaseSel === '__manual__' ? parseFloat(cgBaseManual) : parseFloat(cgBaseSel)
                    const canSave = !!cgMetric && !isNaN(parseFloat(cgTarget)) && !isNaN(baseVal)
                    return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <select value={cgMetric} onChange={(e) => { setCgMetric(e.target.value); setCgBaseSel(''); setCgBaseManual('') }} style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '7px 9px', fontSize: 12, borderRadius: 9 }}>
                        <option value="">지표 선택</option>
                        {cd.metricKeys.map((k, i) => <option key={k} value={k}>{cd.metricLabels[i]}</option>)}
                      </select>
                      <div style={{ display: 'flex', flexShrink: 0, borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)' }}>
                        {([['relative', '변화'], ['absolute', '달성']] as const).map(([m, l]) => (
                          <button key={m} onClick={() => setCgMode(m)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: '7px 10px', background: cgMode === m ? '#2E9BA6' : 'transparent', color: cgMode === m ? '#060B17' : '#9DAFCB' }}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <input value={cgTarget} onChange={(e) => setCgTarget(e.target.value)} type="number" step="0.1" placeholder={cgMode === 'relative' ? '목표 변화량 예) -3' : '목표 달성값 예) 35'} style={{ ...inputStyle, padding: '8px 11px', fontSize: 12.5, borderRadius: 9 }} />
                    {/* 시작 기준값: 내 측정 기록 중 선택하거나 직접 입력 */}
                    <select value={cgBaseSel} onChange={(e) => setCgBaseSel(e.target.value)} disabled={!cgMetric} style={{ ...inputStyle, padding: '8px 11px', fontSize: 12.5, borderRadius: 9, opacity: cgMetric ? 1 : 0.5 }}>
                      <option value="">시작 기준값: 측정 기록 선택</option>
                      {cgMetric && (D ?? []).map((d, i) => { const v = mSeries?.[i]; return v == null ? null : <option key={i} value={String(v)}>{d} · {v}{mUnit}</option> })}
                      <option value="__manual__">직접 입력…</option>
                    </select>
                    {cgBaseSel === '__manual__' && <input value={cgBaseManual} onChange={(e) => setCgBaseManual(e.target.value)} type="number" step="0.1" placeholder={`시작 기준값 직접 입력${mUnit ? ` (${mUnit})` : ''}`} style={{ ...inputStyle, padding: '8px 11px', fontSize: 12.5, borderRadius: 9 }} />}
                    <button disabled={!canSave} onClick={() => { if (canSave) { void be.setChallengeGoal(cgMetric, cgMode, parseFloat(cgTarget), baseVal); setCgMetric(''); setCgTarget(''); setCgBaseSel(''); setCgBaseManual('') } }} style={{ all: 'unset', cursor: canSave ? 'pointer' : 'not-allowed', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#060B17', background: canSave ? CTA : 'rgba(103,215,223,.3)', padding: '9px 20px', borderRadius: 9 }}>목표 저장</button>
                  </div>
                    )
                  })()}
                  <div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginTop: 8, lineHeight: 1.55 }}>변화 = 시작 대비 증감(예: 체지방 -3), 달성 = 절대 목표값(예: 골격근 35). <b style={{ color: 'rgba(231,239,234,.6)' }}>시작 기준값</b>은 내 측정 기록 중에서 고르거나 직접 입력해요 — 이 값이 성취도 계산의 기준이 됩니다.</div>
                </div>

                {/* 참여 멤버 + 초대 */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>참여 멤버 {cd.members.length}</div>
                    {(cd.isOwn || be.isAdmin) && <button onClick={() => setInviteOpen((v) => !v)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 16, padding: '5px 11px' }}>{inviteOpen ? '닫기' : '＋ 회원 초대'}</button>}
                  </div>
                  {inviteOpen && (cd.isOwn || be.isAdmin) && (
                    <div style={{ marginBottom: 12 }}>
                      <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="이름으로 검색…" style={{ ...inputStyle, padding: '8px 12px', fontSize: 12.5, marginBottom: 8 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                        {invitable.filter((m) => m.name.includes(memberQuery.trim())).map((m) => (
                          <button key={m.id} onClick={() => void be.inviteToChallenge(m.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                            <Avatar initials={m.initials} color={m.color} photo={m.photo} size={28} fontSize={10} ring={m.role === 'trainer' ? '0 0 0 2px #2E9BA6' : undefined} />
                            <span style={{ flex: 1, fontSize: 12.5, color: '#EAF3F1', display: 'flex', alignItems: 'center', gap: 5 }}>{m.name}{m.role === 'trainer' && <span style={{ fontSize: 9, fontWeight: 700, color: '#060B17', background: '#67D7DF', borderRadius: 6, padding: '1px 5px' }}>코치</span>}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#67D7DF' }}>초대</span>
                          </button>
                        ))}
                        {invitable.filter((m) => m.name.includes(memberQuery.trim())).length === 0 && (
                          <div style={{ fontSize: 12, color: 'rgba(231,239,234,.45)', padding: '8px 2px' }}>{invitable.length === 0 ? '초대할 수 있는 다른 회원이 없어요.' : '검색 결과가 없어요.'}</div>
                        )}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {cd.members.map((m) => (
                      <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '4px 9px 4px 4px' }}>
                        <Avatar initials={m.initials} color={m.color} photo={m.photo} size={24} fontSize={9} />
                        <span style={{ fontSize: 12, color: '#EAF3F1' }}>{m.name}{m.isMe ? ' (나)' : ''}</span>
                        {(cd.isOwn || be.isAdmin) && !m.isMe && <button onClick={() => void be.removeChallengeMember(m.userId)} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: 'rgba(224,135,92,.7)' }}>×</button>}
                      </div>
                    ))}
                  </div>
                  {!cd.isOwn && (
                    <button onClick={() => { if (confirm('이 챌린지에서 나갈까요?')) void be.leaveChallenge() }} style={{ all: 'unset', cursor: 'pointer', marginTop: 14, fontSize: 12.5, fontWeight: 600, color: 'rgba(224,135,92,.8)' }}>챌린지 나가기</button>
                  )}
                </div>
              </div>
            </div>
            )
          })()}

          {/* ============ 커뮤니티 › 멤버의 체성분 ============ */}
          {s.view === 'community' && commTab === 'members' && (
            <div style={{ maxWidth: 980, margin: '0 auto' }}>
              {activeMember ? (
                <div>
                  <button onClick={closeMember} style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(231,239,234,.6)', marginBottom: 16 }}>‹ 멤버 목록으로</button>
                  <section style={{ ...card, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 6 }}>
                      <Avatar initials={activeMember.initials} color={activeMember.color} photo={activeMember.photo} size={58} fontSize={17} ring={activeMember.role === 'trainer' ? '0 0 0 2px #2E9BA6' : undefined} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontFamily: "'Gowun Batang',serif", fontSize: 24, color: '#F2F7F3' }}>{activeMember.name}</span>{activeMember.role === 'trainer' && <span style={{ fontSize: 10, fontWeight: 700, color: '#060B17', background: '#67D7DF', borderRadius: 8, padding: '2px 8px' }}>코치</span>}</div>
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
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}><Avatar initials={c.initials} color={c.color} photo={(c as { photo?: string | null }).photo} size={30} fontSize={10.5} /><div style={{ background: 'rgba(255,255,255,.05)', borderRadius: '3px 13px 13px 13px', padding: '9px 13px', flex: 1 }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{c.author}</span> <span style={{ fontSize: 13, color: 'rgba(231,239,234,.78)' }}>{c.text}</span></div></div>
                      ))}
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 6 }}>
                        <input value={s.memberDraft} onChange={(e) => set({ memberDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitMemberComment() } }} placeholder="따뜻한 한마디를 남겨보세요…" style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13.5, padding: '11px 15px', borderRadius: 20, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', outline: 'none', color: '#EAF3F1' }} />
                        <button onClick={submitMemberComment} style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: '10px 18px', borderRadius: 20 }}>보내기</button>
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(157,175,203,.6)" strokeWidth="1.8" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
                    <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="이름으로 회원 검색…" style={{ width: '100%', fontFamily: 'inherit', fontSize: 14, padding: '12px 16px 12px 42px', borderRadius: 14, border: '1px solid rgba(255,247,232,.12)', background: 'rgba(255,249,238,.05)', outline: 'none', color: '#EAF3F1' }} />
                  </div>
                  {membersDisp.filter((m) => m.name.includes(memberQuery.trim())).length === 0 && (
                    <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(231,239,234,.45)', padding: '32px 0' }}>“{memberQuery.trim()}”에 해당하는 회원이 없어요.</div>
                  )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(248px,1fr))', gap: 18 }}>
                  {membersDisp.filter((m) => m.name.includes(memberQuery.trim())).map((m) => (
                    <button key={m.id} onClick={() => openMember(m.id)} className="hwl-card-hover" style={{ all: 'unset', cursor: 'pointer', ...card, borderRadius: 22, padding: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar initials={m.initials} color={m.color} photo={m.photo} size={48} fontSize={15} ring={m.role === 'trainer' ? '0 0 0 2px #2E9BA6' : undefined} />
                        <div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 700, fontSize: 15, color: '#EAF3F1' }}>{m.name}</span>{m.role === 'trainer' && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#060B17', background: '#67D7DF', borderRadius: 7, padding: '1px 6px' }}>코치</span>}</div><div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.5)' }}>{m.bio}</div></div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div><div style={{ fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B' }}>점수</div><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 26, color: '#67D7DF' }}>{m.score > 0 ? m.score : '—'}</div></div>
                        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#67D7DF', fontWeight: 600 }}>공개 {m.publicCount}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>비공개 {m.lockedCount}</div></div>
                      </div>
                    </button>
                  ))}
                </div>
                </>
              )}
            </div>
          )}

          {/* ============ 수업 스케줄 ============ */}
          {s.view === 'schedule' && (
            <div style={{ maxWidth: 880, margin: '0 auto', animation: 'hwl-rise .4s ease both' }}>
              {!be.configured && (
                <section style={{ ...card, borderRadius: 22, padding: '24px 22px', textAlign: 'center' }}>
                  <div style={eyebrow}>Schedule</div>
                  <div style={{ fontSize: 14, color: 'rgba(231,239,234,.6)', marginTop: 8, lineHeight: 1.6 }}>로그인하면 수업 일정을 달력에서 확인할 수 있어요.</div>
                </section>
              )}
              {be.configured && (() => {
                const isCoach = be.isAdmin
                const sessions = be.sessions ?? []
                const anchor = schedAnchor ? parseYMD(schedAnchor) : new Date()
                const todayY = ymd(new Date())
                const byDay = new Map<string, typeof sessions>()
                for (const ss of sessions) { const k = ymd(new Date(ss.startsAt)); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k)!.push(ss) }
                const dayList = (k: string) => [...(byDay.get(k) ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
                const lowPkgs = (be.packages ?? []).filter((p) => p.remaining <= 2 && p.remaining >= 0)
                const ws = weekStart(anchor)
                const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
                const mFirst = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
                const grid = Array.from({ length: 42 }, (_, i) => addDays(weekStart(mFirst), i))
                const rangeLabel = schedView === 'week'
                  ? `${ws.getMonth() + 1}.${ws.getDate()} – ${addDays(ws, 6).getMonth() + 1}.${addDays(ws, 6).getDate()}`
                  : `${anchor.getFullYear()}.${String(anchor.getMonth() + 1).padStart(2, '0')}`
                const shift = (dir: number) => setSchedAnchor(ymd(schedView === 'week' ? addDays(anchor, dir * 7) : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)))
                const editSess = (ss: typeof sessions[number]) => { setSchedErr(''); setSessForm({ id: ss.id, memberId: ss.memberId || '', packageId: ss.packageId || '', title: ss.title, color: ss.color, date: ymd(new Date(ss.startsAt)), time: hhmm(ss.startsAt), dur: String(ss.durationMin), status: ss.status }) }
                const openNew = (dateStr?: string) => { setSchedErr(''); setSessForm({ memberId: '', packageId: '', title: 'PT', color: SLOT_COLORS[0], date: dateStr || todayY, time: '10:00', dur: '50', status: 'scheduled' }) }
                const SessCard = (ss: typeof sessions[number]) => (
                  <button key={ss.id} onClick={() => isCoach && editSess(ss)} style={{ all: 'unset', cursor: isCoach ? 'pointer' : 'default', display: 'flex', gap: 9, alignItems: 'stretch', width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 11, padding: '8px 11px', opacity: ss.status === 'cancelled' ? 0.5 : 1 }}>
                    <span style={{ width: 4, borderRadius: 4, background: ss.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#9FE2E8' }}>{hhmm(ss.startsAt)}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#EAF3F1', textDecoration: ss.status === 'cancelled' ? 'line-through' : 'none' }}>{ss.title}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: STATUS_COLOR[ss.status], background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: '0 5px' }}>{STATUS_LABEL[ss.status]}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: 'rgba(231,239,234,.5)' }}>
                        {ss.memberName && <span>{ss.memberName}</span>}
                        {ss.packageId && ss.pkgTotal > 0 && <span style={{ color: ss.pkgRemaining <= 2 ? '#E0875C' : '#67D7DF', fontFamily: "'IBM Plex Mono',monospace" }}>{ss.pkgTotal}회 중 {ss.seq}회차</span>}
                      </span>
                    </span>
                  </button>
                )
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.12)' }}>
                        {(['week', 'month'] as const).map((v) => <button key={v} onClick={() => setSchedView(v)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', background: schedView === v ? '#2E9BA6' : 'transparent', color: schedView === v ? '#060B17' : '#9DAFCB' }}>{v === 'week' ? '주간' : '월간'}</button>)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => shift(-1)} style={{ all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9DAFCB', background: 'rgba(255,255,255,.05)' }}>‹</button>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: '#EAF3F1', minWidth: 96, textAlign: 'center' }}>{rangeLabel}</span>
                        <button onClick={() => shift(1)} style={{ all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9DAFCB', background: 'rgba(255,255,255,.05)' }}>›</button>
                        <button onClick={() => { setSchedAnchor(''); setSchedDay('') }} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#9DAFCB', padding: '6px 10px' }}>오늘</button>
                      </div>
                      {isCoach && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button onClick={() => setPkgForm({ memberId: '', total: '10', date: todayY, note: '' })} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#9FE2E8', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 18, padding: '7px 14px' }}>회차권 등록</button>
                        <button onClick={() => openNew()} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#060B17', background: CTA, borderRadius: 18, padding: '7px 16px' }}>+ 수업</button>
                      </div>}
                    </div>

                    {isCoach && lowPkgs.length > 0 && (
                      <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 12, background: 'rgba(224,160,106,.12)', border: '1px solid rgba(224,160,106,.3)', fontSize: 12.5, color: '#F2C28A', lineHeight: 1.6 }}>
                        <b>재등록 임박</b> · {lowPkgs.map((p) => `${p.memberName}(${p.remaining}회 남음)`).join(', ')}
                      </div>
                    )}

                    {schedView === 'week' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {week.map((d) => { const k = ymd(d); const list = dayList(k); const isToday = k === todayY; return (
                          <section key={k} style={{ ...card, borderRadius: 14, padding: '12px 14px', borderColor: isToday ? 'rgba(103,215,223,.4)' : undefined }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: list.length ? 9 : 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#67D7DF' : '#EAF3F1' }}>{d.getMonth() + 1}.{d.getDate()} <span style={{ color: d.getDay() === 0 ? '#E0875C' : d.getDay() === 6 ? '#67D7DF' : 'rgba(231,239,234,.5)' }}>({WD[d.getDay()]})</span>{isToday && <span style={{ fontSize: 10, color: '#67D7DF', marginLeft: 6 }}>오늘</span>}</span>
                              {isCoach && <button onClick={() => openNew(k)} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, color: 'rgba(157,175,203,.7)', lineHeight: 1 }}>+</button>}
                            </div>
                            {list.length === 0 ? <div style={{ fontSize: 12, color: 'rgba(231,239,234,.3)' }}>{isCoach ? '' : '수업 없음'}</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{list.map(SessCard)}</div>}
                          </section>
                        ) })}
                      </div>
                    ) : (
                      <>
                        <div style={{ ...card, borderRadius: 16, padding: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
                            {WD.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: i === 0 ? '#E0875C' : i === 6 ? '#67D7DF' : 'rgba(231,239,234,.45)' }}>{w}</div>)}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                            {grid.map((d) => { const k = ymd(d); const list = dayList(k); const inMonth = d.getMonth() === anchor.getMonth(); const isToday = k === todayY; const selected = k === schedDay; return (
                              <button key={k} onClick={() => setSchedDay(k)} style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', minHeight: 46, padding: '4px 3px', borderRadius: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: selected ? 'rgba(46,155,166,.2)' : isToday ? 'rgba(46,155,166,.08)' : 'transparent', border: `1px solid ${selected ? 'rgba(103,215,223,.5)' : 'transparent'}`, opacity: inMonth ? 1 : 0.35 }}>
                                <span style={{ fontSize: 11.5, fontWeight: isToday ? 700 : 500, color: isToday ? '#67D7DF' : d.getDay() === 0 ? '#E0875C' : '#EAF3F1' }}>{d.getDate()}</span>
                                <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>{list.slice(0, 4).map((ss) => <span key={ss.id} style={{ width: 5, height: 5, borderRadius: '50%', background: ss.color }} />)}</span>
                              </button>
                            ) })}
                          </div>
                        </div>
                        {schedDay && (
                          <section style={{ ...card, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#EAF3F1' }}>{parseYMD(schedDay).getMonth() + 1}.{parseYMD(schedDay).getDate()} ({WD[parseYMD(schedDay).getDay()]})</span>
                              {isCoach && <button onClick={() => openNew(schedDay)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#060B17', background: CTA, borderRadius: 16, padding: '5px 13px' }}>+ 수업</button>}
                            </div>
                            {dayList(schedDay).length === 0 ? <div style={{ fontSize: 12, color: 'rgba(231,239,234,.35)' }}>수업 없음</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>{dayList(schedDay).map(SessCard)}</div>}
                          </section>
                        )}
                      </>
                    )}

                    {!isCoach && (be.packages ?? []).length > 0 && (
                      <section style={{ ...card, borderRadius: 16, padding: 16, marginTop: 16 }}>
                        <div style={eyebrow}>My Pass</div>
                        {(be.packages ?? []).map((p) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                            <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#EAF3F1' }}>{p.totalSessions}회권</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.45)' }}>등록 {p.registeredOn.replace(/-/g, '.')}</div></div>
                            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: "'Gowun Batang',serif", fontSize: 22, color: p.remaining <= 2 ? '#E0875C' : '#67D7DF' }}>{p.remaining}<span style={{ fontSize: 12, color: 'rgba(231,239,234,.4)' }}> / {p.totalSessions}</span></div><div style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)' }}>남은 시수</div></div>
                          </div>
                        ))}
                      </section>
                    )}
                  </>
                )
              })()}
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
                  <div><label style={labelStyle}>생년월일</label><input type="date" value={P.birth} onChange={(e) => onProfileField('birth', e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none', minWidth: 0 }} /></div>
                  <div><label style={labelStyle}>성별</label><div style={{ display: 'flex', gap: 8 }}>{genders.map((g, i) => <button key={i} onClick={() => onProfileField('gender', g.label)} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 13.5, fontWeight: 600, border: `1px solid ${g.border}`, background: g.bg, color: g.fg }}>{g.label}</button>)}</div></div>
                  <div><label style={labelStyle}>핸드폰 번호</label><input value={P.phone} onChange={(e) => onProfileField('phone', e.target.value)} placeholder="010-0000-0000" style={inputStyle} /></div>
                </div>
                <button onClick={() => {
                  if (be.configured) {
                    void be.updateProfile({ name: P.name, birth: P.birth, gender: P.gender, phone: P.phone })
                      .then(() => { set({ profileSaved: '✓ 저장되었습니다.' }); go('health') })
                      .catch(() => set({ profileSaved: '⚠ 저장에 실패했어요. 잠시 후 다시 시도하세요.' }))
                  } else { set({ profileSaved: '✓ 저장되었습니다.' }); go('health') }
                }} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', marginTop: 24, textAlign: 'center', display: 'block', width: '100%', fontSize: 15, fontWeight: 700, color: '#060B17', background: CTA, padding: 14, borderRadius: 24 }}>저장하기</button>
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
                  <button onClick={doLogout} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', marginTop: 14, textAlign: 'center', display: 'block', width: '100%', fontSize: 13.5, fontWeight: 600, color: 'rgba(231,239,234,.6)', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: 12, borderRadius: 24 }}>로그아웃</button>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Avatar initials={r.initials} color={r.color} photo={r.photo} size={38} fontSize={12} /><div><div style={{ fontWeight: 600, fontSize: 14, color: '#EAF3F1' }}>{r.name}</div><div style={{ fontSize: 11, color: 'rgba(231,239,234,.4)' }}>최근 측정 {r.last}</div></div></div>
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
                <div style={{ fontSize: 13, color: '#9DAFCB', marginBottom: 16 }}>선택한 회원에게 전체 피드백으로 등록돼요. 회원의 측정 화면 “하늘 코치의 피드백”에 표시되고, 회원이 댓글로 답할 수 있어요.</div>
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

                {/* 지금까지 보낸 코칭 노트 내역 */}
                {be.configured && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.1)' }}>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A24B', marginBottom: 12 }}>{coachTargetMember ? coachTargetMember.name : '회원'}님 코칭 노트 내역</div>
                    {(be.coachNotes ?? []).length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(231,239,234,.45)', padding: '2px 0 4px' }}>아직 보낸 노트가 없어요.</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(be.coachNotes ?? []).map((n) => (
                        <div key={n.id} style={{ display: 'flex', gap: 10 }}>
                          <Avatar initials={n.initials} color={n.color} photo={n.photo} size={30} fontSize={10.5} ring={n.isCoach ? '0 0 0 2px #2E9BA6' : undefined} />
                          <div style={{ flex: 1, minWidth: 0, background: n.isCoach ? 'rgba(46,155,166,.12)' : 'rgba(255,255,255,.05)', border: `1px solid ${n.isCoach ? 'rgba(103,215,223,.25)' : 'rgba(255,255,255,.09)'}`, borderRadius: '4px 13px 13px 13px', padding: '9px 13px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                              <span style={{ fontWeight: 700, fontSize: 12.5, color: '#EAF3F1' }}>{n.author}</span>
                              <span style={{ fontSize: 9.5, fontWeight: 600, color: '#67D7DF', background: n.isCoach ? 'rgba(46,155,166,.2)' : 'rgba(103,215,223,.16)', padding: '1px 7px', borderRadius: 9 }}>{n.isCoach ? '코치' : '회원'}</span>
                              <span style={{ fontSize: 10.5, color: 'rgba(231,239,234,.4)', marginLeft: 'auto' }}>{n.time}</span>
                            </div>
                            {editNoteId === n.id ? (
                              <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
                                <input value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = editNoteText.trim(); if (t) { void be.editCoachNote(n.id, t, s.coachTargetId); setEditNoteId(null) } } }} style={{ flex: 1, minWidth: 0, fontFamily: 'inherit', fontSize: 13, padding: '7px 11px', borderRadius: 9, border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', outline: 'none', color: '#fff' }} />
                                <button onClick={() => { const t = editNoteText.trim(); if (t) { void be.editCoachNote(n.id, t, s.coachTargetId); setEditNoteId(null) } }} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#060B17', background: CTA, padding: '7px 13px', borderRadius: 9 }}>저장</button>
                                <button onClick={() => setEditNoteId(null)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: '#9DAFCB', padding: '7px 4px' }}>취소</button>
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(231,239,234,.82)', whiteSpace: 'pre-wrap' }}>{n.text}</div>
                                {(n.isMine || be.isAdmin) && <button onClick={() => { setEditNoteId(n.id); setEditNoteText(n.text) }} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'rgba(157,175,203,.8)', marginTop: 4 }}>수정</button>}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      {!showLogin && !loading && <TabBar view={s.view} go={go} chatBadge={be.configured ? (be.unreadChat || undefined) : undefined} isAdmin={be.isAdmin} />}

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
