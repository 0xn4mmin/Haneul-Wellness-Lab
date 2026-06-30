// Encapsulates all Supabase wiring (auth + the signed-in user's data + the
// social features) behind one hook. When Supabase isn't configured,
// `configured` is false and the caller falls back to the built-in mock state.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import * as api from './api'
import { metrics as MOCK_METRICS, dates as MOCK_DATES, buildSpark, lastNum, type Metric, type MetricKey } from './portalData'

const METRIC_CARD_KEYS: MetricKey[] = ['score', 'weight', 'smm', 'pbf', 'bmi', 'tbw']

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}
function relTime(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}
function clockTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

type Role = 'me' | 'trainer' | 'client'
interface Author { name: string; initials: string; avatar_color: string; role?: Role; photo_path?: string | null }

export interface BackendProfile {
  name: string; initials: string; color: string; role: 'client' | 'trainer'
  birth: string | null; gender: string | null; phone: string | null; photoUrl: string | null
}
export interface PostComment { id?: string; author: string; initials: string; color: string; photo?: string | null; text: string; isOwn?: boolean; replies?: PostComment[] }
export interface PostView {
  id: string; author: string; initials: string; color: string; photo?: string | null; role: Role; time: string; text: string
  likes: number; liked: boolean; open: boolean; draft: string; comments: PostComment[]; isOwn: boolean
  replyTo: string | null; replyToName: string | null; image?: string | null
  hasMetric?: boolean; metricVal?: string; metricLabel?: string; metricSub?: string
}
export interface MessageReaction { emoji: string; count: number; mine: boolean; users: string[] }
export interface MessageView {
  id: string; author: string; initials: string; color: string; photo?: string | null; role: Role; time: string; text: string; image?: string | null
  isMine: boolean; deleted: boolean; createdAt: string
  replyTo: { author: string; text: string } | null
  reactions: MessageReaction[]
  readBy: string[]; readCount: number
}
export interface RoomView { id: string; name: string; isPrivate: boolean; joinCode: string | null; isOwn: boolean }
export interface SessionView extends api.ClassSession { seq: number; pkgTotal: number; pkgUsed: number; pkgRemaining: number }
export interface PackageView extends api.ClassPackage { used: number; remaining: number }
export interface ChallengeView { id: string; title: string; metrics: string[]; metricKeys: string[]; scope: string; startDate: string; endDate: string; daysLeft: number; isOwn: boolean }
export interface ChallengeProgressItem { userId: string; name: string; initials: string; color: string; photo: string | null; metricKey: string; metricLabel: string; unit: string; mode: 'absolute' | 'relative'; target: number; baseline: number | null; current: number | null; pct: number; weeklyPct: number; needsBaseline: boolean; hasWeekly: boolean; isMe: boolean }
export interface ChallengeDetail {
  id: string; title: string; metricKeys: string[]; metricLabels: string[]; startDate: string; endDate: string; scope: string; daysLeft: number; isOwn: boolean
  members: { userId: string; name: string; initials: string; color: string; photo: string | null; isMe: boolean }[]
  myGoals: { metricKey: string; mode: 'absolute' | 'relative'; target: number; baseline: number | null }[]
  progress: ChallengeProgressItem[]
}
const METRIC_LABEL: Record<string, string> = { weight: '체중', smm: '골격근량', pbf: '체지방률', bodyFatMass: '체지방량', bmi: 'BMI', bmr: '기초대사량', visceral: '내장지방', tbw: '체수분', score: '인바디 점수' }
export interface NotificationView { id: string; type: string; text: string; read: boolean; time: string; ref: string | null; actorInitials: string; actorColor: string; actorPhoto?: string | null }
export interface MemberView { id: string; name: string; initials: string; color: string; photo?: string | null; role: 'client' | 'trainer'; bio: string; bio2: string; score: number; pub: string[] }
export interface ActiveMemberDetail {
  id: string; name: string; initials: string; color: string; photo: string | null; role: 'client' | 'trainer'; bio2: string; score: number
  measureCount: number; lastDate: string | null; publicCount: number; lockedCount: number
  metrics: { label: string; unit: string; locked: boolean; shown: boolean; value: number; spark: string }[]
  comments: PostComment[]
}
export interface ChartCommentView { author: string; initials: string; color: string; role: Role; text: string; time: string }
export interface FeedbackItem { author: string; initials: string; color: string; photo?: string | null; isCoach: boolean; text: string; time: string }
export interface RosterRow { id: string; name: string; initials: string; color: string; photo: string | null; score: number; pbf: number; smm: number }
export interface CoachNoteItem { id: string; author: string; initials: string; color: string; photo: string | null; isCoach: boolean; isMine: boolean; text: string; time: string }

export interface Backend {
  configured: boolean
  ready: boolean
  session: Session | null
  loginError: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reload: () => void
  loaded: boolean    // initial data load for the signed-in user has finished
  hasData: boolean   // false for a signed-in user with no measurements (show empty state, not mock)
  measureCycleDays: number
  daysUntilNextMeasure: number | null
  setMeasureCycle: (days: number) => void
  sleepLogs: { date: string; hours: number }[] | null
  addSleepLog: (date: string, hours: number) => void
  measurements: api.MeasurementRow[] | null
  goals: Record<string, number> | null
  setGoal: (metricKey: string, target: number | null) => void
  viewResultSheet: (path: string) => void
  deleteMeasurement: (id: string, resultPath?: string | null) => Promise<void>
  addManualMeasurement: (date: string, values: Partial<Record<MetricKey, number>>) => Promise<void>
  updateMeasurement: (id: string, date: string | null, values: Record<string, number>) => Promise<void>
  fetchMeasurementValues: (id: string) => Promise<Record<string, number>>
  unreadChat: number
  dmThreads: api.DmThread[] | null
  trainers: { id: string; name: string; initials: string; color: string; photo: string | null }[] | null
  unreadByRoom: Record<string, number>
  openDm: (otherId: string) => Promise<void>
  reloadDms: () => Promise<void>
  metrics: Record<MetricKey, Metric>
  dates: string[]
  privacy: Record<string, 'public' | 'private'> | null
  togglePrivacy: (key: string) => void
  profile: BackendProfile | null
  isAdmin: boolean   // trainer/admin — can see + manage all challenges and chats
  updateProfile: (patch: { name: string; birth: string; gender: string; phone: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  // social
  posts: PostView[] | null
  postsMore: boolean
  loadMorePosts: () => Promise<void>
  createPost: (text: string, file?: File | null) => Promise<void>
  deletePost: (id: string) => Promise<void>
  deletePostComment: (id: string) => Promise<void>
  toggleLike: (id: string) => void
  toggleComments: (id: string) => void
  setPostDraft: (id: string, text: string) => void
  setReplyTo: (id: string, commentId: string | null, name?: string) => void
  submitPostComment: (id: string) => void
  // chat
  messages: MessageView[] | null
  sendMessage: (text: string, file?: File | null, replyTo?: string | null) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  toggleReaction: (id: string, emoji: string) => Promise<void>
  setRoomAlias: (anonymous: boolean, aliasName: string | null, photoFile: File | null) => Promise<void>
  myRoomAlias: { anonymous: boolean; aliasName: string | null } | null
  rooms: RoomView[] | null
  activeRoomId: string | null
  roomMembers: api.RoomMember[]
  onlineIds: string[]
  selectRoom: (id: string) => void
  createRoom: (name: string, isPrivate: boolean) => Promise<void>
  joinRoom: (code: string) => Promise<{ ok: boolean; reason?: string }>
  deleteRoom: (id: string) => Promise<void>
  renameRoom: (id: string, name: string) => Promise<void>
  sessions: SessionView[] | null
  packages: PackageView[] | null
  createSession: (s: { memberId: string | null; packageId: string | null; title: string; color: string; location: string | null; startsAt: string; durationMin: number }) => Promise<void>
  updateSession: (id: string, fields: Parameters<typeof api.updateSession>[1]) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  createPackage: (memberId: string, total: number, registeredOn: string, startedOn: string | null, note: string | null) => Promise<void>
  updatePackage: (id: string, fields: Parameters<typeof api.updatePackage>[1]) => Promise<void>
  sendReregNotice: (memberId: string, text: string) => Promise<void>
  deletePackage: (id: string) => Promise<void>
  ensureCommunity: () => Promise<void>
  ensureChat: () => Promise<void>
  ensureSchedule: () => Promise<void>
  ensureTrainer: () => Promise<void>
  requests: api.ScheduleRequest[] | null
  createRequest: (memberId: string, text: string) => Promise<void>
  postRequestMessage: (id: string, text: string) => Promise<void>
  closeRequest: (id: string) => Promise<void>
  deleteRequest: (id: string) => Promise<void>
  // challenges
  challenges: ChallengeView[] | null
  createChallenge: (c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) => Promise<void>
  deleteChallenge: (id: string) => Promise<void>
  updateChallenge: (id: string, c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) => Promise<void>
  challengeDetail: ChallengeDetail | null
  openChallenge: (cv: ChallengeView) => void
  closeChallenge: () => void
  inviteToChallenge: (userId: string) => Promise<void>
  removeChallengeMember: (userId: string) => Promise<void>
  leaveChallenge: () => Promise<void>
  setChallengeGoal: (metricKey: string, mode: 'absolute' | 'relative', target: number, baseline: number) => Promise<void>
  deleteChallengeGoal: (metricKey: string) => Promise<void>
  editChallengeGoalFor: (userId: string, metricKey: string, mode: 'absolute' | 'relative', target: number, baseline: number) => Promise<void>
  fetchMemberReadings: (userId: string, metricKey: string) => Promise<{ date: string; value: number }[]>
  // members
  members: MemberView[] | null
  activeMember: ActiveMemberDetail | null
  openMember: (id: string) => void
  closeMember: () => void
  addMemberCheer: (text: string) => Promise<void>
  // chart comments
  chartComments: ChartCommentView[] | null
  loadChartComments: (metricKey: string) => void
  addChartComment: (metricKey: string, text: string) => Promise<void>
  // overall coach feedback thread (on the latest scan)
  coachFeedback: FeedbackItem[] | null
  addCoachFeedback: (text: string) => void
  // trainer
  roster: RosterRow[] | null
  addCoachNote: (memberId: string, metricKey: string, text: string) => Promise<string>
  coachNotes: CoachNoteItem[] | null
  loadCoachNotes: (memberId: string) => Promise<void>
  editCoachNote: (id: string, text: string, memberId: string) => Promise<string>
  // notifications
  notifications: NotificationView[] | null
  unreadCount: number
  markNotificationsRead: () => void
  // AI briefing (measurement-cached, manual regen ≤ 2/week)
  briefing: { focus: string; summary: string; actions: string[] } | null
  briefingBusy: boolean
  briefingRemaining: number   // manual regens left this week (0–2)
  briefingMsg: string
  regenBriefing: () => void
}

export function useBackend(): Backend {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [loginError, setLoginError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [remoteMetrics, setRemoteMetrics] = useState<Record<MetricKey, Metric> | null>(null)
  const [remoteDates, setRemoteDates] = useState<string[] | null>(null)
  const [lastMeasureISO, setLastMeasureISO] = useState<string | null>(null)
  const [cycleDays, setCycleDays] = useState<number>(28)
  const [sleepLogs, setSleepLogs] = useState<{ date: string; hours: number }[] | null>(null)
  const [measurements, setMeasurements] = useState<api.MeasurementRow[] | null>(null)
  const [goals, setGoals] = useState<Record<string, number> | null>(null)
  const [privacy, setPrivacyState] = useState<Record<string, 'public' | 'private'> | null>(null)
  const [profile, setProfile] = useState<BackendProfile | null>(null)
  const [posts, setPosts] = useState<PostView[] | null>(null)
  const [postsMore, setPostsMore] = useState(false)
  const postsRef = useRef<PostView[]>([])
  const [messages, setMessages] = useState<MessageView[] | null>(null)
  const [myRoomAlias, setMyRoomAlias] = useState<{ anonymous: boolean; aliasName: string | null } | null>(null)
  const [rooms, setRooms] = useState<RoomView[] | null>(null)
  const [dmThreads, setDmThreads] = useState<api.DmThread[] | null>(null)
  const [trainers, setTrainers] = useState<{ id: string; name: string; initials: string; color: string; photo: string | null }[] | null>(null)
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({})
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [roomMembers, setRoomMembers] = useState<api.RoomMember[]>([])
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [activeMember, setActiveMember] = useState<ActiveMemberDetail | null>(null)
  const [chartComments, setChartComments] = useState<ChartCommentView[] | null>(null)
  const [coachFeedback, setCoachFeedback] = useState<FeedbackItem[] | null>(null)
  const [challenges, setChallenges] = useState<ChallengeView[] | null>(null)
  const [challengeDetail, setChallengeDetail] = useState<ChallengeDetail | null>(null)
  const [notifications, setNotifications] = useState<NotificationView[] | null>(null)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [coachNotes, setCoachNotes] = useState<CoachNoteItem[] | null>(null)
  const [briefing, setBriefing] = useState<{ focus: string; summary: string; actions: string[] } | null>(null)
  const [briefingBusy, setBriefingBusy] = useState(false)
  const [briefingUsed, setBriefingUsed] = useState(0)
  const [briefingMsg, setBriefingMsg] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const roomId = useRef<string | null>(null)
  const isAdminRef = useRef(false)
  const postUi = useRef<Record<string, { open: boolean; draft: string; replyTo: string | null }>>({})

  const meId = session?.user?.id ?? null
  const roleOf = (id: string | undefined, r?: Role): Role => (id && id === meId ? 'me' : (r ?? 'client'))

  // auth bootstrap
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // ── loaders ──
  const POSTS_PAGE = 12
  const shapePosts = useCallback((rows: any[]): PostView[] => (rows as any[]).map((r) => {
      const a = (r.author ?? {}) as Author
      const ui = postUi.current[r.id] ?? { open: false, draft: '', replyTo: null }
      const sm = r.shared_metric as { val?: string; label?: string; sub?: string } | null
      // build nested comments: top-level + their replies (one level)
      const raw = (r.post_comments ?? []).map((c: any) => ({ id: c.id, author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color, photo: api.avatarUrl(c.author?.photo_path), text: c.text, isOwn: c.author_id === meId, parentId: c.parent_id as string | null, ts: Date.parse(c.created_at) }))
      raw.sort((x: any, y: any) => x.ts - y.ts)
      const byParent: Record<string, PostComment[]> = {}
      raw.filter((c: any) => c.parentId).forEach((c: any) => { (byParent[c.parentId] ??= []).push(c) })
      const comments = raw.filter((c: any) => !c.parentId).map((c: any) => ({ ...c, replies: byParent[c.id] ?? [] }))
      const replyToName = ui.replyTo ? (raw.find((c: any) => c.id === ui.replyTo)?.author ?? null) : null
      return {
        id: r.id, author: a.name, initials: a.initials, color: a.avatar_color, photo: api.avatarUrl(a.photo_path),
        role: roleOf(r.author_id, a.role), time: relTime(r.created_at), text: r.text,
        likes: (r.post_likes ?? []).length,
        liked: (r.post_likes ?? []).some((l: { user_id: string }) => l.user_id === meId),
        open: ui.open, draft: ui.draft, isOwn: r.author_id === meId,
        replyTo: ui.replyTo, replyToName, image: api.postMediaUrl(r.image_path),
        comments,
        hasMetric: !!sm, metricVal: sm?.val, metricLabel: sm?.label, metricSub: sm?.sub,
      }
    }), [meId])
  const reloadPosts = useCallback(async () => {
    const rows = await api.fetchPosts(POSTS_PAGE, 0)
    setPosts(shapePosts(rows as any[]))
    setPostsMore(rows.length === POSTS_PAGE)
  }, [shapePosts])
  const loadMorePosts = useCallback(async () => {
    const cur = postsRef.current.length
    const rows = await api.fetchPosts(POSTS_PAGE, cur)
    setPosts((prev) => [...(prev ?? []), ...shapePosts(rows as any[])])
    setPostsMore(rows.length === POSTS_PAGE)
  }, [shapePosts])
  useEffect(() => { postsRef.current = posts ?? [] }, [posts])

  const reloadMessages = useCallback(async (room?: string | null) => {
    const rid = room ?? roomId.current
    if (!rid) return
    const [rows, members] = await Promise.all([api.fetchMessages(rid), api.fetchRoomMembers(rid)])
    setRoomMembers(members)
    // per-room display identity: anonymous alias overrides the profile
    const disp = new Map(members.map((m) => [m.userId, m.anonymous
      ? { name: m.aliasName || '익명', initials: (m.aliasName || '익').slice(0, 2), color: '#5E6B85', photo: m.aliasPhoto }
      : { name: m.name, initials: m.initials, color: m.color, photo: m.photo }]))
    const dispOf = (id: string, fallback: { name: string; initials: string; color: string; photo: string | null }) => disp.get(id) ?? fallback
    const byId = new Map((rows as any[]).map((r) => [r.id, r]))
    const shaped: MessageView[] = (rows as any[]).map((r) => {
      const a = (r.author ?? {}) as Author & { id?: string }
      const d = dispOf(r.author_id, { name: a.name, initials: a.initials, color: a.avatar_color, photo: api.avatarUrl(a.photo_path) })
      // reactions grouped by emoji
      const rmap = new Map<string, { count: number; mine: boolean; users: string[] }>()
      for (const x of (r.message_reactions ?? []) as { emoji: string; user_id: string }[]) {
        const g = rmap.get(x.emoji) ?? { count: 0, mine: false, users: [] }
        g.count++; if (x.user_id === meId) g.mine = true
        g.users.push(dispOf(x.user_id, { name: '회원', initials: '', color: '', photo: null }).name)
        rmap.set(x.emoji, g)
      }
      const reactions = [...rmap.entries()].map(([emoji, g]) => ({ emoji, ...g }))
      // reply preview
      let replyTo: { author: string; text: string } | null = null
      if (r.reply_to && byId.has(r.reply_to)) {
        const rep = byId.get(r.reply_to)
        const rd = dispOf(rep.author_id, { name: '회원', initials: '', color: '', photo: null })
        replyTo = { author: rd.name, text: rep.deleted ? '삭제된 메시지' : (rep.text || (rep.image_path ? '사진' : '')) }
      }
      // read receipts: other members whose last_read >= this message time
      const t = Date.parse(r.created_at)
      const readers = members.filter((m) => m.userId !== r.author_id && m.lastReadAt && Date.parse(m.lastReadAt) >= t)
        .map((m) => dispOf(m.userId, { name: m.name, initials: '', color: '', photo: null }).name)
      return {
        id: r.id, author: d.name, initials: d.initials, color: d.color, photo: d.photo,
        role: roleOf(r.author_id, a.role), time: clockTime(r.created_at), text: r.text, image: api.postMediaUrl(r.image_path),
        isMine: r.author_id === meId, deleted: !!r.deleted, createdAt: r.created_at,
        replyTo, reactions, readBy: readers, readCount: readers.length,
      }
    })
    setMessages(shaped)
  }, [meId])

  const reloadChallenges = useCallback(async () => {
    const rows = await api.fetchChallenges()
    const dayMs = 86400 * 1000
    setChallenges(rows.map((c) => {
      const keys = (c.metric_keys && c.metric_keys.length ? c.metric_keys : (c.metric_key ? [c.metric_key] : []))
      return {
        id: c.id, title: c.title,
        metrics: keys.map((k) => METRIC_LABEL[k] ?? k), metricKeys: keys, scope: c.scope,
        startDate: c.starts_at, endDate: c.ends_at,
        daysLeft: Math.max(0, Math.ceil((Date.parse(c.ends_at) - Date.now()) / dayMs)),
        isOwn: c.created_by === meId,
      }
    }))
  }, [meId])

  const reloadNotifications = useCallback(async () => {
    const rows = await api.fetchNotifications()
    setNotifications(rows.map((n) => ({
      id: n.id, type: n.type, text: n.text, read: n.read, time: relTime(n.created_at), ref: n.ref,
      actorInitials: n.actor?.initials ?? '·', actorColor: n.actor?.color ?? '#5E97A0', actorPhoto: n.actor?.photo ?? null,
    })))
  }, [])

  const reloadCoachFeedback = useCallback(async () => {
    if (!meId) return
    const rows = await api.fetchChartComments(meId, 'overall')
    setCoachFeedback((rows as any[]).map((c) => ({
      author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color, photo: api.avatarUrl(c.author?.photo_path),
      isCoach: c.author?.role === 'trainer', text: c.text, time: relTime(c.created_at),
    })))
  }, [meId])

  const reloadRooms = useCallback(async () => {
    const rows = isAdminRef.current ? await api.fetchAllRooms() : await api.fetchMyRooms()
    setRooms(rows.map((r) => ({ id: r.id, name: r.name, isPrivate: r.is_private, joinCode: r.join_code, isOwn: r.created_by === meId || isAdminRef.current })))
    return rows
  }, [meId])

  const reloadMembers = useCallback(async () => {
    const cards = await api.fetchMemberCards()
    setMembers(cards.map((c) => ({ id: c.id, name: c.name, initials: c.initials, color: c.color, photo: c.photo, role: c.role, bio: c.bio ?? '', bio2: c.bio2 ?? '', score: c.score ?? 0, pub: c.pub })))
  }, [])

  // load everything for the signed-in user
  useEffect(() => {
    if (!supabase || !meId) {
      setRemoteMetrics(null); setRemoteDates(null); setPrivacyState(null); setProfile(null)
      setLastMeasureISO(null); setCycleDays(28); setSleepLogs(null); setMeasurements(null); setGoals(null)
      setPosts(null); setMessages(null); setMyRoomAlias(null); setMembers(null); setActiveMember(null); setChartComments(null); setRoster(null); setCoachNotes(null)
      setBriefing(null); setBriefingUsed(0); setBriefingBusy(false); setBriefingMsg('')
      setRooms(null); setActiveRoomId(null); setRoomMembers([]); setCoachFeedback(null); setChallenges(null); setChallengeDetail(null); setNotifications(null)
      roomId.current = null
      isAdminRef.current = false
      setLoaded(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [{ dates, series }, priv, prof] = await Promise.all([
          api.fetchMetricSeries(meId), api.fetchPrivacy(meId), api.getMyProfile(),
        ])
        if (cancelled) return
        if (dates.length) {
          const built = {} as Record<MetricKey, Metric>
          for (const k of Object.keys(MOCK_METRICS) as MetricKey[]) {
            const sv = series[k]
            // gap-aware: null-filled where unrecorded; all-null if never recorded
            built[k] = { ...MOCK_METRICS[k], series: sv ?? dates.map(() => null) }
          }
          setRemoteMetrics(built); setRemoteDates(dates.map(fmtDate))
          setLastMeasureISO(dates[dates.length - 1])
        } else { setRemoteMetrics(null); setRemoteDates(null); setLastMeasureISO(null) }
        setPrivacyState(priv && Object.keys(priv).length ? priv : null)
        if (prof) {
          const photoUrl = prof.photo_path
            ? supabase.storage.from('avatars').getPublicUrl(prof.photo_path).data.publicUrl
            : null
          isAdminRef.current = prof.role === 'trainer'
          setProfile({ name: prof.name, initials: prof.initials, color: prof.avatar_color, role: prof.role, birth: prof.birth, gender: prof.gender, phone: prof.phone, photoUrl })
          setCycleDays(prof.measure_cycle_days ?? 28)
        }
        // first-screen (나의 건강) essentials — fetched in parallel
        const [sleep, meas, goals, latestBrief, used] = await Promise.all([
          api.fetchSleepLogs(meId), api.fetchMeasurements(meId), api.fetchGoals(meId),
          api.fetchLatestBriefing(meId), api.manualBriefingsThisWeek(meId),
        ])
        if (cancelled) return
        setSleepLogs(sleep); setMeasurements(meas); setGoals(goals)
        setBriefing(latestBrief ? { focus: latestBrief.focus, summary: latestBrief.summary, actions: latestBrief.actions } : null)
        setBriefingUsed(used)
        // the home screen is ready → reveal the app now. Coach feedback (shown
        // on 나의 건강) and notifications (the bell) load in the background;
        // community / chat / schedule are loaded lazily on first tab open.
        setLoaded(true)
        void Promise.all([reloadCoachFeedback(), reloadNotifications()]).catch((e) => console.warn('[backend] background load', e))
      } catch (e) {
        console.warn('[backend] load failed', e)
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [meId, reloadKey, reloadCoachFeedback, reloadNotifications])

  // realtime: new notification → reload
  useEffect(() => {
    if (!supabase || !meId) return
    return api.subscribeNotifications(meId, (row) => {
      void reloadNotifications()
      // best-effort phone/desktop popup (works while the app is open/alive)
      if (row?.text && typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification('하늘 웰니스 랩', { body: row.text, icon: '/assets/logo-mark.png', badge: '/assets/logo-mark.png' }))
          .catch(() => {})
      }
    })
  }, [meId, reloadNotifications])

  // realtime: a new briefing finished → show it, clear busy, count manual usage
  useEffect(() => {
    if (!supabase || !meId) return
    const unsub = api.subscribeBriefings(meId, (row) => {
      setBriefing({ focus: row.focus, summary: row.summary, actions: row.actions })
      setBriefingBusy(false)
      setBriefingMsg('')
      if (row.source === 'manual') setBriefingUsed((u) => u + 1)
    })
    return unsub
  }, [meId])

  // realtime chat — re-subscribes when the active room changes
  useEffect(() => {
    if (!supabase || !meId || !activeRoomId) return
    const unsub = api.subscribeMessages(activeRoomId, () => {
      // viewing the room → mark read so others see my read receipt, then refresh
      void api.markRoomRead(activeRoomId).catch(() => {})
      void reloadMessages(activeRoomId)
    })
    return unsub
  }, [meId, activeRoomId, reloadMessages])

  // realtime presence: who is currently in the active room (online even if idle)
  const [onlineIds, setOnlineIds] = useState<string[]>([])
  useEffect(() => {
    if (!supabase || !meId || !activeRoomId) { setOnlineIds([]); return }
    const unsub = api.subscribePresence(activeRoomId, meId, setOnlineIds)
    return () => { setOnlineIds([]); unsub() }
  }, [meId, activeRoomId])

  // ── auth actions ──
  const validCreds = (email: string, password: string) => {
    if (!email.trim() || !password) { setLoginError('이메일과 비밀번호를 입력하세요.'); return false }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setLoginError('올바른 이메일 형식이 아니에요.'); return false }
    if (password.length < 6) { setLoginError('비밀번호는 6자 이상이어야 해요.'); return false }
    return true
  }
  const signIn = useCallback(async (email: string, password: string) => {
    setLoginError('')
    if (!validCreds(email, password)) return
    const { error } = await api.signIn(email, password)
    if (error) setLoginError(error.message)
  }, [])
  const signUp = useCallback(async (email: string, password: string) => {
    setLoginError('')
    if (!validCreds(email, password)) return
    const { data, error } = await api.signUp(email, password, email.split('@')[0])
    if (error) {
      setLoginError(/rate limit/i.test(error.message)
        ? '메일 발송 한도를 초과했어요. 잠시 후 다시 시도하거나 관리자에게 문의하세요.'
        : error.message)
      return
    }
    if (!data.session) setLoginError('확인 메일을 보냈어요. 메일의 링크를 눌러 인증한 뒤 로그인하세요.')
  }, [])
  const signOut = useCallback(async () => { await api.signOut() }, [])

  const togglePrivacy = useCallback((key: string) => {
    setPrivacyState((prev) => {
      const next: 'public' | 'private' = (prev?.[key] ?? 'private') === 'public' ? 'private' : 'public'
      api.setPrivacy(key, next).catch((e) => console.warn('[backend] setPrivacy', e))
      return { ...(prev ?? {}), [key]: next }
    })
  }, [])

  // ── profile ──
  const updateProfile = useCallback(async (patch: { name: string; birth: string; gender: string; phone: string }) => {
    // an empty date string is rejected by the `date` column and rolls back the
    // whole update (so name wouldn't save) — coerce '' → null
    const clean = { name: patch.name.trim(), birth: patch.birth ? patch.birth : null, gender: patch.gender || null, phone: patch.phone || null }
    const { error } = await api.updateProfile(clean)
    if (error) { console.warn('[backend] updateProfile failed', error); throw error }
    setProfile((p) => (p ? { ...p, ...patch } : p))
  }, [])
  const setMeasureCycle = useCallback((days: number) => {
    setCycleDays(days)
    api.setMeasureCycle(days).catch((e) => console.warn('[backend] setMeasureCycle', e))
  }, [])
  const addSleepLog = useCallback((date: string, hours: number) => {
    setSleepLogs((ls) => { const rest = (ls ?? []).filter((l) => l.date !== date); return [{ date, hours }, ...rest].sort((a, b) => (a.date < b.date ? 1 : -1)) })
    api.upsertSleepLog(date, hours).catch((e) => console.warn('[backend] addSleepLog', e))
  }, [])
  const viewResultSheet = useCallback((path: string) => {
    // open a placeholder synchronously (avoids popup blockers), then redirect
    const w = window.open('', '_blank')
    api.getResultSheetUrl(path).then((url) => { if (w) { if (url) w.location.href = url; else w.close() } }).catch(() => w?.close())
  }, [])
  const deleteMeasurement = useCallback(async (id: string, resultPath?: string | null) => {
    await api.deleteMeasurement(id, resultPath)
    setReloadKey((k) => k + 1)
  }, [])
  const addManualMeasurement = useCallback(async (date: string, values: Partial<Record<MetricKey, number>>) => {
    await api.commitManualMeasurement(date, values)
    setReloadKey((k) => k + 1)
  }, [])
  const updateMeasurement = useCallback(async (id: string, date: string | null, values: Record<string, number>) => {
    if (date) await api.updateMeasurementDate(id, date)
    await api.updateMeasurementValues(id, values)
    setReloadKey((k) => k + 1)
  }, [])
  const fetchMeasurementValues = useCallback((id: string) => api.fetchMeasurementValues(id), [])
  const setGoal = useCallback((metricKey: string, target: number | null) => {
    setGoals((g) => { const next = { ...(g ?? {}) }; if (target == null) delete next[metricKey]; else next[metricKey] = target; return next })
    ;(target == null ? api.clearGoal(metricKey) : api.setGoal(metricKey, target)).catch((e) => console.warn('[backend] setGoal', e))
  }, [])
  const uploadAvatar = useCallback(async (file: File) => {
    const url = await api.uploadAvatar(file)
    setProfile((p) => (p ? { ...p, photoUrl: url } : p))
    // propagate the new photo to feed/chat/members where I appear
    void reloadPosts(); void reloadMembers()
    if (roomId.current) void reloadMessages(roomId.current)
  }, [reloadPosts, reloadMembers, reloadMessages])

  // ── posts ──
  const createPost = useCallback(async (text: string, file?: File | null) => {
    const imagePath = file ? await api.uploadPostMedia(file) : null
    await api.createPost(text, imagePath)
    await reloadPosts()
  }, [reloadPosts])
  const deletePost = useCallback(async (id: string) => { await api.deletePost(id); await reloadPosts() }, [reloadPosts])
  const deletePostComment = useCallback(async (id: string) => { await api.deletePostComment(id); await reloadPosts() }, [reloadPosts])
  const toggleLike = useCallback((id: string) => {
    const liked = posts?.find((p) => p.id === id)?.liked ?? false
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) } : p) ?? ps)
    api.toggleLike(id, liked).catch((e) => console.warn('[backend] like', e))
  }, [posts])
  const toggleComments = useCallback((id: string) => {
    const ui = postUi.current[id] ?? { open: false, draft: '', replyTo: null }
    postUi.current[id] = { ...ui, open: !ui.open }
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, open: !p.open } : p) ?? ps)
  }, [])
  const setPostDraft = useCallback((id: string, text: string) => {
    const ui = postUi.current[id] ?? { open: true, draft: '', replyTo: null }
    postUi.current[id] = { ...ui, draft: text }
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, draft: text } : p) ?? ps)
  }, [])
  const setReplyTo = useCallback((id: string, commentId: string | null, name?: string) => {
    const ui = postUi.current[id] ?? { open: true, draft: '', replyTo: null }
    postUi.current[id] = { ...ui, open: true, replyTo: commentId }
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, replyTo: commentId, replyToName: name ?? null } : p) ?? ps)
  }, [])
  const submitPostComment = useCallback((id: string) => {
    const ui = postUi.current[id] ?? { open: true, draft: '', replyTo: null }
    const draft = (ui.draft ?? '').trim()
    if (!draft) return
    const parent = ui.replyTo
    postUi.current[id] = { open: true, draft: '', replyTo: null }
    api.addPostComment(id, draft, parent).then(() => reloadPosts()).catch((e) => console.warn('[backend] comment', e))
  }, [reloadPosts])

  // ── chat ──
  const sendMessage = useCallback(async (text: string, file?: File | null, replyTo?: string | null) => {
    if (!activeRoomId) return
    const imagePath = file ? await api.uploadPostMedia(file) : null
    await api.sendMessage(activeRoomId, text, imagePath, replyTo ?? null)
    await api.markRoomRead(activeRoomId).catch(() => {})
    await reloadMessages(activeRoomId)
  }, [activeRoomId, reloadMessages])
  const deleteMessage = useCallback(async (id: string) => {
    await api.deleteMessage(id)
    if (activeRoomId) await reloadMessages(activeRoomId)
  }, [activeRoomId, reloadMessages])
  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    const mine = messages?.find((m) => m.id === id)?.reactions.find((r) => r.emoji === emoji)?.mine
    await (mine ? api.removeReaction(id, emoji) : api.addReaction(id, emoji))
    if (activeRoomId) await reloadMessages(activeRoomId)
  }, [messages, activeRoomId, reloadMessages])
  const setRoomAlias = useCallback(async (anonymous: boolean, aliasName: string | null, photoFile: File | null) => {
    if (!activeRoomId) return
    const path = photoFile ? await api.uploadPostMedia(photoFile) : null
    await api.setRoomAlias(activeRoomId, anonymous, aliasName, path)
    setMyRoomAlias({ anonymous, aliasName: anonymous ? (aliasName || '익명') : null })
    await reloadMessages(activeRoomId)
  }, [activeRoomId, reloadMessages])

  const reloadUnread = useCallback(async () => {
    if (!supabase || !meId) { setUnreadByRoom({}); return }
    setUnreadByRoom(await api.fetchUnreadByRoom().catch(() => ({})))
  }, [meId])
  const reloadDms = useCallback(async () => {
    if (!supabase || !meId) { setDmThreads(null); setTrainers(null); return }
    const [t, tr] = await Promise.all([api.fetchDmThreads(meId), api.fetchTrainers()])
    setDmThreads(t); setTrainers(tr.filter((x) => x.id !== meId))
  }, [meId])
  const selectRoom = useCallback((id: string) => {
    roomId.current = id
    setActiveRoomId(id)
    setMessages(null)
    void api.markRoomRead(id).then(() => reloadUnread()).catch(() => {})
    void reloadMessages(id)
    void api.fetchMyRoomMembership(id).then(setMyRoomAlias).catch(() => setMyRoomAlias(null))
    // viewing the room clears its chat notifications
    setNotifications((ns) => ns?.map((n) => (n.type === 'chat' ? { ...n, read: true } : n)) ?? ns)
    void api.markRoomNotificationsRead(id).catch(() => {})
  }, [reloadMessages, reloadUnread])
  const openDm = useCallback(async (otherId: string) => {
    const rid = await api.getOrCreateDm(otherId)
    await reloadDms()
    selectRoom(rid)
  }, [reloadDms, selectRoom])
  // unread badges: load on login + refresh on any new message in my rooms
  useEffect(() => { if (supabase && meId) void reloadUnread() }, [meId, reloadUnread, reloadKey])
  useEffect(() => {
    const sb = supabase
    if (!sb || !meId) return
    const ch = sb.channel('all-msgs').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { void reloadUnread(); void reloadDms() }).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [meId, reloadUnread, reloadDms])

  const createRoom = useCallback(async (name: string, isPrivate: boolean) => {
    const room = await api.createRoom(name, isPrivate)
    await reloadRooms()
    selectRoom(room.id)
  }, [reloadRooms, selectRoom])

  const joinRoom = useCallback(async (code: string): Promise<{ ok: boolean; reason?: string }> => {
    const res = await api.joinRoomByCode(code)
    if (res.ok && res.room_id) {
      await reloadRooms()
      selectRoom(res.room_id)
    }
    return res
  }, [reloadRooms, selectRoom])

  const deleteRoom = useCallback(async (id: string) => {
    await api.deleteRoom(id)
    const left = await reloadRooms()
    const next = left[0]?.id ?? null
    roomId.current = next
    setActiveRoomId(next)
    if (next) { await reloadMessages(next); setRoomMembers(await api.fetchRoomMembers(next)) }
    else { setMessages([]); setRoomMembers([]) }
  }, [reloadRooms, reloadMessages])
  const renameRoom = useCallback(async (id: string, name: string) => {
    await api.renameRoom(id, name)
    await reloadRooms()
  }, [reloadRooms])

  // ── coach scheduler ──
  const [sessions, setSessions] = useState<SessionView[] | null>(null)
  const [packages, setPackages] = useState<PackageView[] | null>(null)
  const reloadSchedule = useCallback(async () => {
    if (!supabase || !meId) { setSessions(null); setPackages(null); return }
    const dayMs = 86400000
    const fromISO = new Date(Date.now() - 45 * dayMs).toISOString()
    const toISO = new Date(Date.now() + 150 * dayMs).toISOString()
    const [pkgs, pkgSess, winSess] = await Promise.all([api.fetchPackages(), api.fetchPackageSessions(), api.fetchSessions(fromISO, toISO)])
    // per-package: usage + 회차 numbering (advance-cancels skipped)
    const byPkg = new Map<string, { used: number; seq: Map<string, number> }>()
    const grouped = new Map<string, typeof pkgSess>()
    for (const s of pkgSess) { if (!s.packageId) continue; (grouped.get(s.packageId) ?? grouped.set(s.packageId, []).get(s.packageId)!).push(s) }
    for (const [pid, list] of grouped) {
      const ordered = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      const seq = new Map<string, number>(); let n = 0; let used = 0
      for (const s of ordered) {
        if (s.status === 'cancelled') continue
        n += 1; seq.set(s.id, n)
        if (s.status === 'attended' || s.status === 'sameday_cancel') used += 1
      }
      byPkg.set(pid, { used, seq })
    }
    setPackages(pkgs.map((p) => { const u = byPkg.get(p.id)?.used ?? 0; return { ...p, used: u, remaining: p.totalSessions - u } }))
    setSessions(winSess.map((s) => {
      const pk = pkgs.find((p) => p.id === s.packageId)
      const info = s.packageId ? byPkg.get(s.packageId) : undefined
      return { ...s, seq: (s.packageId && info?.seq.get(s.id)) || 0, pkgTotal: pk?.totalSessions ?? 0, pkgUsed: info?.used ?? 0, pkgRemaining: pk ? pk.totalSessions - (info?.used ?? 0) : 0 }
    }))
  }, [meId])
  const createSession = useCallback(async (s: { memberId: string | null; packageId: string | null; title: string; color: string; location: string | null; startsAt: string; durationMin: number }) => { const { error } = await api.createSession(s); if (error) throw new Error(error.message); await reloadSchedule() }, [reloadSchedule])
  const updateSession = useCallback(async (id: string, fields: Parameters<typeof api.updateSession>[1]) => { const { error } = await api.updateSession(id, fields); if (error) throw new Error(error.message); await reloadSchedule() }, [reloadSchedule])
  const deleteSession = useCallback(async (id: string) => { await api.deleteSession(id); await reloadSchedule() }, [reloadSchedule])
  const createPackage = useCallback(async (memberId: string, total: number, registeredOn: string, startedOn: string | null, note: string | null) => { await api.createPackage(memberId, total, registeredOn, startedOn, note); await reloadSchedule() }, [reloadSchedule])
  const updatePackage = useCallback(async (id: string, fields: Parameters<typeof api.updatePackage>[1]) => { await api.updatePackage(id, fields); await reloadSchedule() }, [reloadSchedule])
  const sendReregNotice = useCallback(async (memberId: string, text: string) => { const { error } = await api.sendReregNotice(memberId, text); if (error) throw new Error(error.message) }, [])
  const deletePackage = useCallback(async (id: string) => { await api.deletePackage(id); await reloadSchedule() }, [reloadSchedule])
  const [requests, setRequests] = useState<api.ScheduleRequest[] | null>(null)
  const reloadRequests = useCallback(async () => {
    if (!supabase || !meId) { setRequests(null); return }
    setRequests(await api.fetchRequests(meId))
  }, [meId])
  useEffect(() => { if (!supabase || !meId) return; return api.subscribeRequestMessages(() => { void reloadRequests() }) }, [meId, reloadRequests])
  const createRequest = useCallback(async (memberId: string, text: string) => { await api.createRequest(memberId, text); await reloadRequests() }, [reloadRequests])
  const postRequestMessage = useCallback(async (id: string, text: string) => { await api.postRequestMessage(id, text); await reloadRequests() }, [reloadRequests])
  const closeRequest = useCallback(async (id: string) => { await api.closeRequest(id); await reloadRequests() }, [reloadRequests])
  const deleteRequest = useCallback(async (id: string) => { await api.deleteRequest(id); await reloadRequests() }, [reloadRequests])

  // ── challenges ──
  const createChallenge = useCallback(async (c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) => {
    await api.createChallengeRow(c)
    await reloadChallenges()
  }, [reloadChallenges])
  const deleteChallenge = useCallback(async (id: string) => {
    await api.deleteChallenge(id)
    await reloadChallenges()
  }, [reloadChallenges])
  const updateChallenge = useCallback(async (id: string, c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) => {
    await api.updateChallengeRow(id, c)
    await reloadChallenges()
  }, [reloadChallenges])

  const loadChallengeDetail = useCallback(async (cv: ChallengeView) => {
    const [members, myGoals, progress] = await Promise.all([
      api.fetchChallengeMembers(cv.id), api.fetchMyChallengeGoals(cv.id), api.fetchChallengeProgress(cv.id),
    ])
    const prog: ChallengeProgressItem[] = progress.map((r) => {
      const m = MOCK_METRICS[r.metric_key as MetricKey]
      // baseline = the start-date reading; null means the member has no
      // measurement on the challenge start date yet
      const needsBaseline = r.baseline == null
      // weekly progress needs a previous measurement (prev) to compare against;
      // members with only one reading are excluded from the weekly ranking
      const hasWeekly = !needsBaseline && r.current != null && r.prev != null
      const floor0 = (v: number) => Math.max(0, Math.round(v))
      let pct = 0, weeklyPct = 0
      if (!needsBaseline && r.current != null) {
        const base = Number(r.baseline)
        const goalDelta = r.mode === 'relative' ? Number(r.target) : (Number(r.target) - base)
        const cur = Number(r.current)
        pct = goalDelta === 0 ? (cur - base === 0 ? 100 : 0) : floor0(((cur - base) / goalDelta) * 100)
        weeklyPct = !hasWeekly || goalDelta === 0 ? 0 : floor0(((cur - Number(r.prev)) / goalDelta) * 100)
      }
      return {
        userId: r.user_id, name: r.name, initials: r.initials, color: r.color, photo: api.avatarUrl(r.photo_path),
        metricKey: r.metric_key, metricLabel: m?.label ?? r.metric_key, unit: m?.unit ?? '',
        mode: r.mode, target: Number(r.target), baseline: r.baseline, current: r.current, pct, weeklyPct, needsBaseline, hasWeekly, isMe: r.user_id === meId,
      }
    })
    setChallengeDetail({
      id: cv.id, title: cv.title, metricKeys: cv.metricKeys, metricLabels: cv.metrics,
      startDate: cv.startDate, endDate: cv.endDate, scope: cv.scope, daysLeft: cv.daysLeft, isOwn: cv.isOwn,
      members: members.map((m) => ({ userId: m.user_id, name: m.name, initials: m.initials, color: m.color, photo: m.photo, isMe: m.user_id === meId })),
      myGoals: myGoals.map((g) => ({ metricKey: g.metric_key, mode: g.mode, target: Number(g.target), baseline: g.baseline })),
      progress: prog,
    })
  }, [meId])
  const openChallenge = useCallback((cv: ChallengeView) => { void loadChallengeDetail(cv) }, [loadChallengeDetail])
  const closeChallenge = useCallback(() => setChallengeDetail(null), [])
  const inviteToChallenge = useCallback(async (userId: string) => {
    if (!challengeDetail) return
    await api.inviteToChallenge(challengeDetail.id, userId)
    const cv = (challenges ?? []).find((c) => c.id === challengeDetail.id); if (cv) await loadChallengeDetail(cv)
  }, [challengeDetail, challenges, loadChallengeDetail])
  const removeChallengeMember = useCallback(async (userId: string) => {
    if (!challengeDetail) return
    await api.removeChallengeMember(challengeDetail.id, userId)
    const cv = (challenges ?? []).find((c) => c.id === challengeDetail.id); if (cv) await loadChallengeDetail(cv)
  }, [challengeDetail, challenges, loadChallengeDetail])
  const leaveChallenge = useCallback(async () => {
    if (!challengeDetail) return
    await api.leaveChallenge(challengeDetail.id)
    setChallengeDetail(null); await reloadChallenges()
  }, [challengeDetail, reloadChallenges])
  const setChallengeGoal = useCallback(async (metricKey: string, mode: 'absolute' | 'relative', target: number, baseline: number) => {
    if (!challengeDetail) return
    await api.setChallengeGoal(challengeDetail.id, metricKey, mode, target, baseline)
    const cv = (challenges ?? []).find((c) => c.id === challengeDetail.id); if (cv) await loadChallengeDetail(cv)
  }, [challengeDetail, challenges, loadChallengeDetail])
  const deleteChallengeGoal = useCallback(async (metricKey: string) => {
    if (!challengeDetail) return
    await api.deleteChallengeGoal(challengeDetail.id, metricKey)
    const cv = (challenges ?? []).find((c) => c.id === challengeDetail.id); if (cv) await loadChallengeDetail(cv)
  }, [challengeDetail, challenges, loadChallengeDetail])
  // trainer/admin: edit any member's goal + read their readings for the picker
  const editChallengeGoalFor = useCallback(async (userId: string, metricKey: string, mode: 'absolute' | 'relative', target: number, baseline: number) => {
    if (!challengeDetail) return
    await api.setChallengeGoalFor(challengeDetail.id, userId, metricKey, mode, target, baseline)
    const cv = (challenges ?? []).find((c) => c.id === challengeDetail.id); if (cv) await loadChallengeDetail(cv)
  }, [challengeDetail, challenges, loadChallengeDetail])
  const fetchMemberReadings = useCallback((userId: string, metricKey: string) => api.fetchMemberMetricReadings(userId, metricKey), [])

  // ── members ──
  const openMember = useCallback((id: string) => {
    void (async () => {
      try {
        const { dates, series } = await api.fetchMetricSeries(id)
        const priv = await api.fetchPrivacy(id)
        const cheers = await api.fetchMemberCheers(id)
        const prof = await api.fetchMemberProfile(id)
        // a trainer/admin sees every metric regardless of the member's privacy
        const adminView = isAdminRef.current
        const mc = METRIC_CARD_KEYS.map((k) => {
          const open = adminView || priv[k] === 'public'
          const sv = series[k]
          const lv = sv ? lastNum(sv) : null
          return {
            label: MOCK_METRICS[k].label, unit: MOCK_METRICS[k].unit, locked: !open, shown: open,
            value: lv ?? 0, spark: sv ? buildSpark(sv) : '',
          }
        })
        const publicCount = mc.filter((m) => m.shown).length
        const scorePublic = (adminView || priv.score === 'public') && lastNum(series.score ?? []) != null
        setActiveMember({
          id, name: prof?.name ?? '', initials: prof?.initials ?? '', color: prof?.avatar_color ?? '#5E97A0',
          photo: api.avatarUrl(prof?.photo_path), role: prof?.role ?? 'client', bio2: prof?.bio2 ?? '', score: scorePublic ? (lastNum(series.score!) ?? 0) : 0,
          measureCount: dates.length, lastDate: dates.length ? fmtDate(dates[dates.length - 1]) : null,
          publicCount, lockedCount: METRIC_CARD_KEYS.length - publicCount,
          metrics: mc,
          comments: (cheers as any[]).map((c) => ({ author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color, photo: api.avatarUrl(c.author?.photo_path), text: c.text })),
        })
      } catch (e) { console.warn('[backend] openMember', e) }
    })()
  }, [])
  const closeMember = useCallback(() => setActiveMember(null), [])
  const addMemberCheer = useCallback(async (text: string) => {
    const id = activeMember?.id
    if (!id || !text.trim()) return
    await api.addMemberCheer(id, text.trim())
    openMember(id)
  }, [activeMember, openMember])

  // ── chart comments ──
  const loadChartComments = useCallback((metricKey: string) => {
    if (!meId) return
    void (async () => {
      try {
        const rows = await api.fetchChartComments(meId, metricKey)
        setChartComments((rows as any[]).map((c) => ({
          author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color,
          role: roleOf(c.author_id, c.author?.role), text: c.text, time: relTime(c.created_at),
        })))
      } catch (e) { console.warn('[backend] chartComments', e) }
    })()
  }, [meId])
  const addChartComment = useCallback(async (metricKey: string, text: string) => {
    if (!meId || !text.trim()) return
    await api.addChartComment(meId, metricKey, text.trim())
    loadChartComments(metricKey)
  }, [meId, loadChartComments])

  const addCoachFeedback = useCallback(async (text: string) => {
    if (!meId || !text.trim()) return
    await api.addChartComment(meId, 'overall', text.trim())
    reloadCoachFeedback()
  }, [meId, reloadCoachFeedback])

  // ── lazy per-tab loading: only fetch a section's data when its tab opens ──
  const lazy = useRef({ community: false, chat: false, schedule: false, roster: false })
  useEffect(() => { lazy.current = { community: false, chat: false, schedule: false, roster: false } }, [meId, reloadKey])
  const loadRoster = useCallback(async () => {
    if (lazy.current.roster) return; lazy.current.roster = true
    try { const rows = await api.fetchRoster(); setRoster(rows.map((r) => ({ id: r.id, name: r.name, initials: r.initials, color: r.color, photo: r.photo, score: r.score ?? 0, pbf: r.pbf ?? 0, smm: r.smm ?? 0 }))) } catch (e) { console.warn('[backend] roster', e) }
  }, [])
  const ensureCommunity = useCallback(async () => {
    if (lazy.current.community) return; lazy.current.community = true
    await Promise.all([reloadPosts(), reloadMembers(), reloadChallenges()]).catch((e) => console.warn('[backend] community', e))
  }, [reloadPosts, reloadMembers, reloadChallenges])
  const ensureChat = useCallback(async () => {
    if (lazy.current.chat) return; lazy.current.chat = true
    try {
      const [myRooms] = await Promise.all([reloadRooms(), reloadDms(), reloadUnread(), loadRoster()])
      const first = myRooms[0]?.id ?? null
      roomId.current = first; setActiveRoomId(first)
      if (first) { await reloadMessages(first); setMyRoomAlias(await api.fetchMyRoomMembership(first)) } else { setMessages([]); setRoomMembers([]) }
    } catch (e) { console.warn('[backend] chat', e) }
  }, [reloadRooms, reloadMessages, reloadDms, reloadUnread, loadRoster])
  const ensureSchedule = useCallback(async () => {
    if (lazy.current.schedule) return; lazy.current.schedule = true
    await Promise.all([reloadSchedule(), reloadRequests(), loadRoster()]).catch((e) => console.warn('[backend] schedule', e))
  }, [reloadSchedule, reloadRequests, loadRoster])
  const ensureTrainer = useCallback(async () => { await loadRoster() }, [loadRoster])
  const loadCoachNotes = useCallback(async (memberId: string) => {
    if (!memberId || !/^[0-9a-f-]{36}$/i.test(memberId)) { setCoachNotes(null); return }
    const rows = await api.fetchChartComments(memberId, 'overall').catch(() => [])
    setCoachNotes((rows as any[]).map((c) => ({
      id: c.id, author: c.author?.name ?? '', photo: api.avatarUrl(c.author?.photo_path),
      initials: c.author?.initials ?? '', color: c.author?.avatar_color ?? '#5E97A0',
      isCoach: c.author?.role === 'trainer', isMine: c.author_id === meId, text: c.text, time: relTime(c.created_at),
    })))
  }, [meId])
  const addCoachNote = useCallback(async (memberId: string, metricKey: string, text: string): Promise<string> => {
    // write to chart_comments (owner = the member) so it lands in their
    // "하늘 코치의 피드백" thread (which reads chart_comments) and notifies them
    const { error } = await api.addChartComment(memberId, metricKey, text)
    if (!error) void loadCoachNotes(memberId)
    return error ? error.message : ''
  }, [loadCoachNotes])
  const editCoachNote = useCallback(async (id: string, text: string, memberId: string): Promise<string> => {
    const { error } = await api.updateChartComment(id, text)
    if (!error) await loadCoachNotes(memberId)
    return error ? error.message : ''
  }, [loadCoachNotes])

  const markNotificationsRead = useCallback(() => {
    setNotifications((ns) => ns?.map((n) => ({ ...n, read: true })) ?? ns)
    api.markNotificationsRead().catch((e) => console.warn('[backend] markRead', e))
  }, [])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const regenBriefing = useCallback(() => {
    if (briefingBusy) return
    setBriefingMsg('')
    void (async () => {
      const res = await api.requestBriefing('manual')
      if (!res.ok) {
        if (res.reason === 'rate_limited') setBriefingMsg('이번 주 재생성 2회를 모두 사용했어요.')
        else setBriefingMsg(res.reason || '요청 실패')
        return
      }
      setBriefingBusy(true)
      setBriefingMsg('새 브리핑을 생성하고 있어요…')
      // safety: clear the spinner if realtime is missed
      setTimeout(() => setBriefingBusy((b) => (b ? false : b)), 30000)
    })()
  }, [briefingBusy])

  return {
    configured: isSupabaseConfigured, ready, session, loginError, signIn, signUp, signOut, reload,
    loaded,
    hasData: !isSupabaseConfigured || remoteMetrics !== null,
    measureCycleDays: cycleDays,
    daysUntilNextMeasure: lastMeasureISO
      ? Math.ceil((Date.parse(lastMeasureISO) + cycleDays * 86400000 - Date.now()) / 86400000)
      : null,
    setMeasureCycle, sleepLogs, addSleepLog, measurements, goals, setGoal, viewResultSheet,
    deleteMeasurement, updateMeasurement, fetchMeasurementValues, addManualMeasurement,
    unreadChat: Object.values(unreadByRoom).reduce((a, b) => a + b, 0),
    dmThreads, trainers, unreadByRoom, openDm, reloadDms,
    briefing, briefingBusy, briefingRemaining: Math.max(0, 2 - briefingUsed), briefingMsg, regenBriefing,
    metrics: remoteMetrics ?? MOCK_METRICS, dates: remoteDates ?? MOCK_DATES,
    privacy, togglePrivacy, profile, isAdmin: profile?.role === 'trainer', updateProfile, uploadAvatar,
    posts, postsMore, loadMorePosts, createPost, deletePost, deletePostComment, toggleLike, toggleComments, setPostDraft, setReplyTo, submitPostComment,
    messages, sendMessage, deleteMessage, toggleReaction, setRoomAlias, myRoomAlias,
    rooms, activeRoomId, roomMembers, onlineIds, selectRoom, createRoom, joinRoom, deleteRoom, renameRoom,
    sessions, packages, createSession, updateSession, deleteSession, createPackage, updatePackage, sendReregNotice, deletePackage,
    ensureCommunity, ensureChat, ensureSchedule, ensureTrainer,
    requests, createRequest, postRequestMessage, closeRequest, deleteRequest,
    challenges, createChallenge, deleteChallenge, updateChallenge,
    challengeDetail, openChallenge, closeChallenge, inviteToChallenge, removeChallengeMember, leaveChallenge, setChallengeGoal, deleteChallengeGoal, editChallengeGoalFor, fetchMemberReadings,
    members, activeMember, openMember, closeMember, addMemberCheer,
    chartComments, loadChartComments, addChartComment, coachFeedback, addCoachFeedback,
    roster, addCoachNote, coachNotes, loadCoachNotes, editCoachNote,
    notifications, unreadCount: (notifications ?? []).filter((n) => !n.read).length, markNotificationsRead,
  }
}
