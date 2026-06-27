// Encapsulates all Supabase wiring (auth + the signed-in user's data + the
// social features) behind one hook. When Supabase isn't configured,
// `configured` is false and the caller falls back to the built-in mock state.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import * as api from './api'
import { metrics as MOCK_METRICS, dates as MOCK_DATES, buildSpark, type Metric, type MetricKey } from './portalData'

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
interface Author { name: string; initials: string; avatar_color: string; role?: Role }

export interface BackendProfile {
  name: string; initials: string; color: string
  birth: string | null; gender: string | null; phone: string | null; photoUrl: string | null
}
export interface PostComment { author: string; initials: string; color: string; text: string }
export interface PostView {
  id: string; author: string; initials: string; color: string; role: Role; time: string; text: string
  likes: number; liked: boolean; open: boolean; draft: string; comments: PostComment[]
  hasMetric?: boolean; metricVal?: string; metricLabel?: string; metricSub?: string
}
export interface MessageView { id: string; author: string; initials: string; color: string; role: Role; time: string; text: string }
export interface MemberView { id: string; name: string; initials: string; color: string; bio: string; bio2: string; score: number; pub: string[] }
export interface ActiveMemberDetail {
  id: string; name: string; initials: string; color: string; bio2: string; score: number
  metrics: { label: string; unit: string; locked: boolean; shown: boolean; value: number; spark: string }[]
  comments: PostComment[]
}
export interface ChartCommentView { author: string; initials: string; color: string; role: Role; text: string; time: string }
export interface RosterRow { id: string; name: string; initials: string; color: string; score: number; pbf: number; smm: number }

export interface Backend {
  configured: boolean
  ready: boolean
  session: Session | null
  loginError: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  reload: () => void
  metrics: Record<MetricKey, Metric>
  dates: string[]
  privacy: Record<string, 'public' | 'private'> | null
  togglePrivacy: (key: string) => void
  profile: BackendProfile | null
  updateProfile: (patch: { name: string; birth: string; gender: string; phone: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  // social
  posts: PostView[] | null
  createPost: (text: string) => Promise<void>
  toggleLike: (id: string) => void
  toggleComments: (id: string) => void
  setPostDraft: (id: string, text: string) => void
  submitPostComment: (id: string) => void
  // chat
  messages: MessageView[] | null
  sendMessage: (text: string) => Promise<void>
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
  // trainer
  roster: RosterRow[] | null
  addCoachNote: (memberId: string, metricKey: string, text: string) => Promise<string>
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
  const [remoteMetrics, setRemoteMetrics] = useState<Record<MetricKey, Metric> | null>(null)
  const [remoteDates, setRemoteDates] = useState<string[] | null>(null)
  const [privacy, setPrivacyState] = useState<Record<string, 'public' | 'private'> | null>(null)
  const [profile, setProfile] = useState<BackendProfile | null>(null)
  const [posts, setPosts] = useState<PostView[] | null>(null)
  const [messages, setMessages] = useState<MessageView[] | null>(null)
  const [members, setMembers] = useState<MemberView[] | null>(null)
  const [activeMember, setActiveMember] = useState<ActiveMemberDetail | null>(null)
  const [chartComments, setChartComments] = useState<ChartCommentView[] | null>(null)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [briefing, setBriefing] = useState<{ focus: string; summary: string; actions: string[] } | null>(null)
  const [briefingBusy, setBriefingBusy] = useState(false)
  const [briefingUsed, setBriefingUsed] = useState(0)
  const [briefingMsg, setBriefingMsg] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const roomId = useRef<string | null>(null)
  const postUi = useRef<Record<string, { open: boolean; draft: string }>>({})

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
  const reloadPosts = useCallback(async () => {
    const rows = await api.fetchPosts()
    const shaped: PostView[] = (rows as any[]).map((r) => {
      const a = (r.author ?? {}) as Author
      const ui = postUi.current[r.id] ?? { open: false, draft: '' }
      const sm = r.shared_metric as { val?: string; label?: string; sub?: string } | null
      return {
        id: r.id, author: a.name, initials: a.initials, color: a.avatar_color,
        role: roleOf(r.author_id, a.role), time: relTime(r.created_at), text: r.text,
        likes: (r.post_likes ?? []).length,
        liked: (r.post_likes ?? []).some((l: { user_id: string }) => l.user_id === meId),
        open: ui.open, draft: ui.draft,
        comments: (r.post_comments ?? []).map((c: any) => ({ author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color, text: c.text })),
        hasMetric: !!sm, metricVal: sm?.val, metricLabel: sm?.label, metricSub: sm?.sub,
      }
    })
    setPosts(shaped)
  }, [meId])

  const reloadMessages = useCallback(async () => {
    if (!roomId.current) return
    const rows = await api.fetchMessages(roomId.current)
    setMessages((rows as any[]).map((r) => {
      const a = (r.author ?? {}) as Author & { id?: string }
      return { id: r.id, author: a.name, initials: a.initials, color: a.avatar_color, role: roleOf(a.id, a.role), time: clockTime(r.created_at), text: r.text }
    }))
  }, [meId])

  const reloadMembers = useCallback(async () => {
    const cards = await api.fetchMemberCards()
    setMembers(cards.map((c) => ({ id: c.id, name: c.name, initials: c.initials, color: c.color, bio: c.bio ?? '', bio2: c.bio2 ?? '', score: c.score ?? 0, pub: c.pub })))
  }, [])

  // load everything for the signed-in user
  useEffect(() => {
    if (!supabase || !meId) {
      setRemoteMetrics(null); setRemoteDates(null); setPrivacyState(null); setProfile(null)
      setPosts(null); setMessages(null); setMembers(null); setActiveMember(null); setChartComments(null); setRoster(null)
      setBriefing(null); setBriefingUsed(0); setBriefingBusy(false); setBriefingMsg('')
      roomId.current = null
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
            built[k] = { ...MOCK_METRICS[k], series: sv && sv.length ? sv : MOCK_METRICS[k].series }
          }
          setRemoteMetrics(built); setRemoteDates(dates.map(fmtDate))
        } else { setRemoteMetrics(null); setRemoteDates(null) }
        setPrivacyState(priv && Object.keys(priv).length ? priv : null)
        if (prof) {
          const photoUrl = prof.photo_path
            ? supabase.storage.from('avatars').getPublicUrl(prof.photo_path).data.publicUrl
            : null
          setProfile({ name: prof.name, initials: prof.initials, color: prof.avatar_color, birth: prof.birth, gender: prof.gender, phone: prof.phone, photoUrl })
        }
        const [latestBrief, used] = await Promise.all([
          api.fetchLatestBriefing(meId), api.manualBriefingsThisWeek(meId),
        ])
        if (cancelled) return
        setBriefing(latestBrief ? { focus: latestBrief.focus, summary: latestBrief.summary, actions: latestBrief.actions } : null)
        setBriefingUsed(used)
        await Promise.all([reloadPosts(), reloadMembers()])
        roomId.current = await api.getOrCreateDefaultRoom()
        await reloadMessages()
      } catch (e) {
        console.warn('[backend] load failed', e)
      }
    })()
    return () => { cancelled = true }
  }, [meId, reloadKey, reloadPosts, reloadMembers, reloadMessages])

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

  // realtime chat
  useEffect(() => {
    if (!supabase || !meId || !roomId.current) return
    const unsub = api.subscribeMessages(roomId.current, () => { void reloadMessages() })
    return unsub
  }, [meId, messages === null, reloadMessages])

  // ── auth actions ──
  const signIn = useCallback(async (email: string, password: string) => {
    setLoginError('')
    const { error } = await api.signIn(email, password)
    if (error) setLoginError(error.message)
  }, [])
  const signUp = useCallback(async (email: string, password: string) => {
    setLoginError('')
    const { data, error } = await api.signUp(email, password, email.split('@')[0])
    if (error) { setLoginError(error.message); return }
    if (!data.session) setLoginError('확인 메일을 보냈어요. 인증 후 로그인하거나, 대시보드에서 Auto Confirm 하세요.')
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
    await api.updateProfile(patch)
    setProfile((p) => (p ? { ...p, ...patch } : p))
  }, [])
  const uploadAvatar = useCallback(async (file: File) => {
    const url = await api.uploadAvatar(file)
    setProfile((p) => (p ? { ...p, photoUrl: url } : p))
  }, [])

  // ── posts ──
  const createPost = useCallback(async (text: string) => { await api.createPost(text); await reloadPosts() }, [reloadPosts])
  const toggleLike = useCallback((id: string) => {
    const liked = posts?.find((p) => p.id === id)?.liked ?? false
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) } : p) ?? ps)
    api.toggleLike(id, liked).catch((e) => console.warn('[backend] like', e))
  }, [posts])
  const toggleComments = useCallback((id: string) => {
    const ui = postUi.current[id] ?? { open: false, draft: '' }
    postUi.current[id] = { ...ui, open: !ui.open }
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, open: !p.open } : p) ?? ps)
  }, [])
  const setPostDraft = useCallback((id: string, text: string) => {
    const ui = postUi.current[id] ?? { open: true, draft: '' }
    postUi.current[id] = { ...ui, draft: text }
    setPosts((ps) => ps?.map((p) => p.id === id ? { ...p, draft: text } : p) ?? ps)
  }, [])
  const submitPostComment = useCallback((id: string) => {
    const draft = (postUi.current[id]?.draft ?? '').trim()
    if (!draft) return
    postUi.current[id] = { open: true, draft: '' }
    api.addPostComment(id, draft).then(() => reloadPosts()).catch((e) => console.warn('[backend] comment', e))
  }, [reloadPosts])

  // ── chat ──
  const sendMessage = useCallback(async (text: string) => {
    if (!roomId.current) return
    await api.sendMessage(roomId.current, text)
    await reloadMessages()
  }, [reloadMessages])

  // ── members ──
  const openMember = useCallback((id: string) => {
    void (async () => {
      try {
        const { series } = await api.fetchMetricSeries(id)
        const priv = await api.fetchPrivacy(id)
        const cheers = await api.fetchMemberCheers(id)
        const prof = await api.fetchMemberProfile(id)
        const mc = METRIC_CARD_KEYS.map((k) => {
          const open = priv[k] === 'public'
          const sv = series[k]
          return {
            label: MOCK_METRICS[k].label, unit: MOCK_METRICS[k].unit, locked: !open, shown: open,
            value: sv && sv.length ? sv[sv.length - 1] : 0, spark: sv && sv.length ? buildSpark(sv) : '',
          }
        })
        setActiveMember({
          id, name: prof?.name ?? '', initials: prof?.initials ?? '', color: prof?.avatar_color ?? '#5E97A0',
          bio2: prof?.bio2 ?? '', score: series.score?.length ? series.score[series.score.length - 1] : 0,
          metrics: mc,
          comments: (cheers as any[]).map((c) => ({ author: c.author?.name, initials: c.author?.initials, color: c.author?.avatar_color, text: c.text })),
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

  // ── trainer ──
  useEffect(() => {
    if (!supabase || !meId) { setRoster(null); return }
    void (async () => {
      try {
        const rows = await api.fetchRoster()
        setRoster(rows.map((r) => ({ id: r.id, name: r.name, initials: r.initials, color: r.color, score: r.score ?? 0, pbf: r.pbf ?? 0, smm: r.smm ?? 0 })))
      } catch (e) { console.warn('[backend] roster', e) }
    })()
  }, [meId])
  const addCoachNote = useCallback(async (memberId: string, metricKey: string, text: string): Promise<string> => {
    const { error } = await api.addCoachNote(memberId, metricKey, text)
    return error ? error.message : ''
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
    briefing, briefingBusy, briefingRemaining: Math.max(0, 2 - briefingUsed), briefingMsg, regenBriefing,
    metrics: remoteMetrics ?? MOCK_METRICS, dates: remoteDates ?? MOCK_DATES,
    privacy, togglePrivacy, profile, updateProfile, uploadAvatar,
    posts, createPost, toggleLike, toggleComments, setPostDraft, submitPostComment,
    messages, sendMessage,
    members, activeMember, openMember, closeMember, addMemberCheer,
    chartComments, loadChartComments, addChartComment,
    roster, addCoachNote,
  }
}
