// Supabase data-access layer. These functions return data shaped for the
// existing UI so that wiring is a matter of replacing the `portalState` mock
// with these calls (the chart math in `portalData.ts` stays unchanged).
//
// Every function assumes Supabase is configured; guard at the call site with
// `isSupabaseConfigured` from '../lib/supabase'.

import { requireSupabase } from '../lib/supabase'
import type { MetricKey } from './portalData'

export const METRIC_KEYS: MetricKey[] = [
  'score', 'weight', 'smm', 'pbf', 'bodyFatMass', 'bmi', 'bmr', 'visceral', 'tbw',
]

export interface ProfileRow {
  id: string
  name: string
  initials: string
  avatar_color: string
  role: 'client' | 'trainer'
  bio: string | null
  bio2: string | null
  height_cm: number | null
  birth: string | null
  gender: string | null
  phone: string | null
  photo_path: string | null
}

async function uid(): Promise<string> {
  const { data } = await requireSupabase().auth.getUser()
  if (!data.user) throw new Error('Not authenticated')
  return data.user.id
}

// ───────────────────────── auth ─────────────────────────
export async function signUp(email: string, password: string, name: string) {
  const initials = name.slice(-2) || name
  return requireSupabase().auth.signUp({ email, password, options: { data: { name, initials } } })
}
export async function signIn(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({ email, password })
}
export async function signOut() {
  return requireSupabase().auth.signOut()
}
export async function getMyProfile(): Promise<ProfileRow | null> {
  const sb = requireSupabase()
  const { data: u } = await sb.auth.getUser()
  if (!u.user) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', u.user.id).single()
  if (error) throw error
  return data as ProfileRow
}

// ───────────────────── measurements / metrics ───────────
/** Per-metric series for a user. RLS hides metrics the viewer can't see. */
export async function fetchMetricSeries(
  userId: string,
): Promise<{ dates: string[]; series: Partial<Record<MetricKey, number[]>> }> {
  const { data, error } = await requireSupabase()
    .from('metric_readings')
    .select('metric_key, date, value')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) throw error

  const byDate = new Set<string>()
  const series: Partial<Record<MetricKey, number[]>> = {}
  for (const r of (data ?? []) as { metric_key: MetricKey; date: string; value: number }[]) {
    byDate.add(r.date)
    ;(series[r.metric_key] ??= []).push(Number(r.value))
  }
  return { dates: [...byDate].sort(), series }
}

export interface MeasurementRow {
  id: string; date: string; segmental: Record<string, { kg: number; pct: number }>
  detail: Record<string, number>; result_sheet_path: string | null
}
export async function fetchMeasurements(userId: string): Promise<MeasurementRow[]> {
  const { data, error } = await requireSupabase()
    .from('measurements')
    .select('id, date, segmental, detail, result_sheet_path')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as MeasurementRow[]
}

// ───────────────────────── privacy ──────────────────────
export async function fetchPrivacy(userId: string): Promise<Record<string, 'public' | 'private'>> {
  const { data, error } = await requireSupabase()
    .from('metric_privacy').select('metric_key, visibility').eq('user_id', userId)
  if (error) throw error
  const out: Record<string, 'public' | 'private'> = {}
  for (const r of (data ?? []) as { metric_key: string; visibility: 'public' | 'private' }[]) {
    out[r.metric_key] = r.visibility
  }
  return out
}
export async function setPrivacy(metricKey: string, visibility: 'public' | 'private') {
  const me = await uid()
  return requireSupabase().from('metric_privacy')
    .upsert({ user_id: me, metric_key: metricKey, visibility })
}

// ───────────────────────── members ──────────────────────
export async function fetchMembers(): Promise<ProfileRow[]> {
  const me = await uid()
  const { data, error } = await requireSupabase()
    .from('profiles').select('*').neq('id', me).eq('role', 'client')
  if (error) throw error
  return (data ?? []) as ProfileRow[]
}

// ─────────────────────── chart comments ─────────────────
export async function fetchChartComments(ownerId: string, metricKey: string) {
  const { data, error } = await requireSupabase()
    .from('chart_comments')
    .select('id, text, created_at, author:profiles!chart_comments_author_id_fkey(name, initials, avatar_color, role)')
    .eq('owner_id', ownerId).eq('metric_key', metricKey)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
export async function addChartComment(ownerId: string, metricKey: string, text: string) {
  const me = await uid()
  return requireSupabase().from('chart_comments')
    .insert({ owner_id: ownerId, metric_key: metricKey, author_id: me, text })
}

// ───────────────────────── feed ─────────────────────────
export async function fetchPosts() {
  const { data, error } = await requireSupabase()
    .from('posts')
    .select('id, text, shared_metric, created_at, author:profiles!posts_author_id_fkey(name, initials, avatar_color, role), post_likes(user_id), post_comments(id, text, author:profiles!post_comments_author_id_fkey(name, initials, avatar_color))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
export async function createPost(text: string, sharedMetric?: unknown) {
  const me = await uid()
  return requireSupabase().from('posts').insert({ author_id: me, text, shared_metric: sharedMetric ?? null })
}
export async function toggleLike(postId: string, liked: boolean) {
  const me = await uid()
  const sb = requireSupabase()
  return liked
    ? sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', me)
    : sb.from('post_likes').insert({ post_id: postId, user_id: me })
}
export async function addPostComment(postId: string, text: string) {
  const me = await uid()
  return requireSupabase().from('post_comments').insert({ post_id: postId, author_id: me, text })
}

// ───────────────────────── chat ─────────────────────────
export async function fetchMessages(roomId: string) {
  const { data, error } = await requireSupabase()
    .from('messages')
    .select('id, text, created_at, author:profiles!messages_author_id_fkey(id, name, initials, avatar_color, role)')
    .eq('room_id', roomId).order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
export async function sendMessage(roomId: string, text: string) {
  const me = await uid()
  return requireSupabase().from('messages').insert({ room_id: roomId, author_id: me, text })
}
/** Subscribe to new messages in a room. Returns an unsubscribe fn. */
export function subscribeMessages(roomId: string, onInsert: (row: unknown) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => onInsert(payload.new))
    .subscribe()
  return () => { sb.removeChannel(channel) }
}

// ───────────────────── profile / uploads ────────────────
export async function updateProfile(patch: Partial<Pick<ProfileRow, 'name' | 'birth' | 'gender' | 'phone'>>) {
  const me = await uid()
  return requireSupabase().from('profiles').update(patch).eq('id', me)
}
/** Uploads to avatars/<uid>/<filename> and returns the public URL. */
export async function uploadAvatar(file: File): Promise<string> {
  const sb = requireSupabase()
  const me = await uid()
  const path = `${me}/${Date.now()}-${file.name}`
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  await sb.from('profiles').update({ photo_path: path }).eq('id', me)
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
