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
  measure_cycle_days: number | null
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
  ranges: Record<string, { min: number; max: number } | null> | null
}
export async function fetchMeasurements(userId: string): Promise<MeasurementRow[]> {
  const { data, error } = await requireSupabase()
    .from('measurements')
    .select('id, date, segmental, detail, result_sheet_path, ranges')
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
    .from('profiles').select('*').neq('id', me)
  if (error) throw error
  return (data ?? []) as ProfileRow[]
}

// ─────────────────────── chart comments ─────────────────
export async function fetchChartComments(ownerId: string, metricKey: string) {
  const { data, error } = await requireSupabase()
    .from('chart_comments')
    .select('id, text, created_at, author:profiles!chart_comments_author_id_fkey(name, initials, avatar_color, role, photo_path)')
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

// ───────────────────── media (feed / chat images) ───────
/** Public URL for a stored post/chat image. */
export function postMediaUrl(path?: string | null): string | null {
  if (!path) return null
  return requireSupabase().storage.from('post-media').getPublicUrl(path).data.publicUrl
}
export async function uploadPostMedia(file: File): Promise<string> {
  const sb = requireSupabase()
  const me = await uid()
  const path = `${me}/${Date.now()}-${file.name}`
  const { error } = await sb.storage.from('post-media').upload(path, file, { upsert: true })
  if (error) throw error
  return path
}

// ───────────────────────── feed ─────────────────────────
export async function fetchPosts() {
  const { data, error } = await requireSupabase()
    .from('posts')
    .select('id, author_id, text, shared_metric, image_path, created_at, author:profiles!posts_author_id_fkey(name, initials, avatar_color, role, photo_path), post_likes(user_id), post_comments(id, text, author_id, parent_id, created_at, author:profiles!post_comments_author_id_fkey(name, initials, avatar_color, photo_path))')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
export async function createPost(text: string, imagePath?: string | null, sharedMetric?: unknown) {
  const me = await uid()
  return requireSupabase().from('posts').insert({ author_id: me, text, image_path: imagePath ?? null, shared_metric: sharedMetric ?? null })
}
export async function toggleLike(postId: string, liked: boolean) {
  const me = await uid()
  const sb = requireSupabase()
  return liked
    ? sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', me)
    : sb.from('post_likes').insert({ post_id: postId, user_id: me })
}
export async function addPostComment(postId: string, text: string, parentId?: string | null) {
  const me = await uid()
  return requireSupabase().from('post_comments').insert({ post_id: postId, author_id: me, text, parent_id: parentId ?? null })
}
export async function deletePost(postId: string) {
  return requireSupabase().from('posts').delete().eq('id', postId)
}
export async function deletePostComment(commentId: string) {
  return requireSupabase().from('post_comments').delete().eq('id', commentId)
}

// ───────────────────────── chat ─────────────────────────
export async function fetchMessages(roomId: string) {
  const { data, error } = await requireSupabase()
    .from('messages')
    .select('id, author_id, text, image_path, deleted, reply_to, created_at, author:profiles!messages_author_id_fkey(id, name, initials, avatar_color, role, photo_path), message_reactions(emoji, user_id)')
    .eq('room_id', roomId).order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}
export async function sendMessage(roomId: string, text: string, imagePath?: string | null, replyTo?: string | null) {
  const me = await uid()
  return requireSupabase().from('messages').insert({ room_id: roomId, author_id: me, text, image_path: imagePath ?? null, reply_to: replyTo ?? null })
}
export async function deleteMessage(messageId: string) {
  const me = await uid()
  return requireSupabase().from('messages').update({ deleted: true, text: '', image_path: null }).eq('id', messageId).eq('author_id', me)
}
export async function addReaction(messageId: string, emoji: string) {
  const me = await uid()
  return requireSupabase().from('message_reactions').upsert({ message_id: messageId, user_id: me, emoji }, { onConflict: 'message_id,user_id,emoji' })
}
export async function removeReaction(messageId: string, emoji: string) {
  const me = await uid()
  return requireSupabase().from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me).eq('emoji', emoji)
}
/** Per-room identity: profile, or anonymous nickname + photo. */
export async function setRoomAlias(roomId: string, anonymous: boolean, aliasName: string | null, aliasPhotoPath: string | null) {
  const me = await uid()
  return requireSupabase().from('room_members')
    .update({ anonymous, alias_name: anonymous ? (aliasName || '익명') : null, alias_photo: anonymous ? aliasPhotoPath : null })
    .eq('room_id', roomId).eq('user_id', me)
}
export async function markRoomRead(roomId: string) {
  const me = await uid()
  return requireSupabase().from('room_members').update({ last_read_at: new Date().toISOString() }).eq('room_id', roomId).eq('user_id', me)
}
/** Subscribe to message inserts/updates + reactions in a room. */
export function subscribeMessages(roomId: string, onChange: (row: unknown) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (p) => onChange(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => onChange(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, (p) => onChange(p.new))
    .subscribe()
  return () => { sb.removeChannel(channel) }
}

export interface RoomRow { id: string; name: string; is_private: boolean; join_code: string | null; created_by: string | null }

/** Rooms the current user is a member of (default lounge first). */
export async function fetchMyRooms(): Promise<RoomRow[]> {
  const sb = requireSupabase()
  const me = await uid()
  const { data } = await sb.from('room_members')
    .select('room:chat_rooms!room_members_room_id_fkey(id, name, is_private, join_code, created_by)')
    .eq('user_id', me)
  const rooms = ((data ?? []) as unknown[])
    .map((r) => {
      const room = (r as { room: RoomRow | RoomRow[] | null }).room
      return Array.isArray(room) ? room[0] : room
    })
    .filter(Boolean) as RoomRow[]
  rooms.sort((a, b) => (a.name === '하늘 라운지' ? -1 : b.name === '하늘 라운지' ? 1 : a.name.localeCompare(b.name)))
  return rooms
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function genCode(): string {
  // deterministic-enough randomness without Math.random in workflows; fine here in the app
  let s = ''
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  for (const n of a) s += CODE_CHARS[n % CODE_CHARS.length]
  return s
}

/** Creates a room (private rooms get a join code), joins it, returns it. */
export async function createRoom(name: string, isPrivate: boolean): Promise<RoomRow> {
  const sb = requireSupabase()
  const me = await uid()
  const join_code = isPrivate ? genCode() : null
  const { data, error } = await sb.from('chat_rooms')
    .insert({ name: name.trim() || '새 채팅방', is_private: isPrivate, join_code, created_by: me })
    .select('id, name, is_private, join_code, created_by').single()
  if (error) throw error
  const room = data as RoomRow
  await sb.from('room_members').upsert({ room_id: room.id, user_id: me })
  return room
}

/** Deletes a room the current user created (RLS enforces creator-only). */
export async function deleteRoom(roomId: string) {
  return requireSupabase().from('chat_rooms').delete().eq('id', roomId)
}

/** Joins a (possibly private) room by its code. */
export async function joinRoomByCode(code: string): Promise<{ ok: boolean; reason?: string; room_id?: string; name?: string }> {
  const { data, error } = await requireSupabase().rpc('join_room_by_code', { p_code: code })
  if (error) return { ok: false, reason: error.message }
  return data as { ok: boolean; reason?: string; room_id?: string; name?: string }
}

export interface ChallengeRow {
  id: string; title: string; metric_key: string | null; metric_keys: string[] | null
  goal: string | null; starts_at: string; ends_at: string
  scope: 'public' | 'private'; created_by: string | null
}
export async function fetchChallenges(): Promise<ChallengeRow[]> {
  const { data } = await requireSupabase().from('challenges')
    .select('id, title, metric_key, metric_keys, goal, starts_at, ends_at, scope, created_by')
    .order('created_at', { ascending: false })
  return (data ?? []) as ChallengeRow[]
}
export async function createChallengeRow(c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) {
  const me = await uid()
  return requireSupabase().from('challenges').insert({
    title: c.title.trim() || '새 챌린지', metric_keys: c.metrics, metric_key: c.metrics[0] ?? null, goal: null,
    starts_at: c.startDate, ends_at: c.endDate, scope: c.scope, created_by: me,
  })
}
export async function deleteChallenge(id: string) {
  return requireSupabase().from('challenges').delete().eq('id', id)
}
export async function updateChallengeRow(id: string, c: { title: string; metrics: string[]; startDate: string; endDate: string; scope: 'public' | 'private' }) {
  return requireSupabase().from('challenges').update({
    title: c.title.trim() || '새 챌린지', metric_keys: c.metrics, metric_key: c.metrics[0] ?? null,
    starts_at: c.startDate, ends_at: c.endDate, scope: c.scope,
  }).eq('id', id)
}

// ───────────── challenge participation / goals / progress ─────────
export interface ChallengeMemberRow { user_id: string; name: string; initials: string; color: string; photo: string | null; status: string }
export async function fetchChallengeMembers(challengeId: string): Promise<ChallengeMemberRow[]> {
  const { data } = await requireSupabase().from('challenge_members')
    .select('user_id, status, profile:profiles!challenge_members_user_id_fkey(name, initials, avatar_color, photo_path)')
    .eq('challenge_id', challengeId)
  return ((data ?? []) as any[]).map((r) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile
    return { user_id: r.user_id, status: r.status, name: p?.name ?? '', initials: p?.initials ?? '', color: p?.avatar_color ?? '#5E97A0', photo: avatarUrl(p?.photo_path) }
  })
}
export async function inviteToChallenge(challengeId: string, userId: string) {
  return requireSupabase().from('challenge_members').upsert({ challenge_id: challengeId, user_id: userId, status: 'joined' }, { onConflict: 'challenge_id,user_id' })
}
export async function leaveChallenge(challengeId: string) {
  const me = await uid()
  return requireSupabase().from('challenge_members').delete().eq('challenge_id', challengeId).eq('user_id', me)
}
export async function removeChallengeMember(challengeId: string, userId: string) {
  return requireSupabase().from('challenge_members').delete().eq('challenge_id', challengeId).eq('user_id', userId)
}
export interface ChallengeGoalRow { metric_key: string; mode: 'absolute' | 'relative'; target: number; baseline: number | null }
export async function fetchMyChallengeGoals(challengeId: string): Promise<ChallengeGoalRow[]> {
  const me = await uid()
  const { data } = await requireSupabase().from('challenge_goals')
    .select('metric_key, mode, target, baseline').eq('challenge_id', challengeId).eq('user_id', me)
  return (data ?? []) as ChallengeGoalRow[]
}
export async function setChallengeGoal(challengeId: string, metricKey: string, mode: 'absolute' | 'relative', target: number, baseline: number | null) {
  const me = await uid()
  return requireSupabase().from('challenge_goals')
    .upsert({ challenge_id: challengeId, user_id: me, metric_key: metricKey, mode, target, baseline }, { onConflict: 'challenge_id,user_id,metric_key' })
}
export async function deleteChallengeGoal(challengeId: string, metricKey: string) {
  const me = await uid()
  return requireSupabase().from('challenge_goals').delete().eq('challenge_id', challengeId).eq('user_id', me).eq('metric_key', metricKey)
}
export interface ChallengeProgressRow {
  user_id: string; name: string; initials: string; color: string; photo_path: string | null
  metric_key: string; mode: 'absolute' | 'relative'; target: number; baseline: number | null; current: number | null; prev: number | null
}
export async function fetchChallengeProgress(challengeId: string): Promise<ChallengeProgressRow[]> {
  const { data } = await requireSupabase().rpc('get_challenge_progress', { p_challenge: challengeId })
  return (data ?? []) as ChallengeProgressRow[]
}

export interface NotificationRow {
  id: string; type: string; text: string; read: boolean; created_at: string
  actor: { name: string; initials: string; color: string; photo: string | null } | null
}
export async function fetchNotifications(): Promise<NotificationRow[]> {
  const me = await uid()
  const { data } = await requireSupabase().from('notifications')
    .select('id, type, text, read, created_at, actor:profiles!notifications_actor_id_fkey(name, initials, avatar_color, photo_path)')
    .eq('user_id', me).order('created_at', { ascending: false }).limit(50)
  return ((data ?? []) as any[]).map((n) => {
    const a = Array.isArray(n.actor) ? n.actor[0] : n.actor
    return { id: n.id, type: n.type, text: n.text, read: n.read, created_at: n.created_at,
      actor: a ? { name: a.name, initials: a.initials, color: a.avatar_color, photo: avatarUrl(a.photo_path) } : null }
  })
}
export async function markNotificationsRead() {
  const me = await uid()
  return requireSupabase().from('notifications').update({ read: true }).eq('user_id', me).eq('read', false)
}
/** Mark the chat notifications for a room read (the user is viewing it). */
export async function markRoomNotificationsRead(roomId: string) {
  const me = await uid()
  return requireSupabase().from('notifications').update({ read: true })
    .eq('user_id', me).eq('type', 'chat').eq('ref', roomId).eq('read', false)
}
export function subscribeNotifications(userId: string, onChange: () => void) {
  const sb = requireSupabase()
  const channel = sb.channel(`notif:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => onChange())
    .subscribe()
  return () => { sb.removeChannel(channel) }
}

export interface RoomMember {
  userId: string; name: string; initials: string; color: string; photo: string | null; role: 'client' | 'trainer'
  anonymous: boolean; aliasName: string | null; aliasPhoto: string | null; lastReadAt: string | null
}
/** Members of a room, with each member's per-room alias + read marker. */
export async function fetchRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data } = await requireSupabase().from('room_members')
    .select('user_id, anonymous, alias_name, alias_photo, last_read_at, profile:profiles!room_members_user_id_fkey(name, initials, avatar_color, role, photo_path)')
    .eq('room_id', roomId)
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as { user_id: string; anonymous: boolean; alias_name: string | null; alias_photo: string | null; last_read_at: string | null; profile: any }
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile
    if (!p) return null
    return {
      userId: row.user_id, name: p.name, initials: p.initials, color: p.avatar_color, photo: avatarUrl(p.photo_path), role: p.role,
      anonymous: !!row.anonymous, aliasName: row.alias_name, aliasPhoto: postMediaUrl(row.alias_photo), lastReadAt: row.last_read_at,
    }
  }).filter(Boolean) as RoomMember[]
}
/** My membership row for a room (to know if I've set an alias yet). */
export async function fetchMyRoomMembership(roomId: string): Promise<{ anonymous: boolean; aliasName: string | null } | null> {
  const me = await uid()
  const { data } = await requireSupabase().from('room_members').select('anonymous, alias_name').eq('room_id', roomId).eq('user_id', me).maybeSingle()
  return data ? { anonymous: !!data.anonymous, aliasName: data.alias_name } : null
}

// ───────────────────── profile / uploads ────────────────
export async function updateProfile(patch: Partial<Pick<ProfileRow, 'name' | 'birth' | 'gender' | 'phone'>>) {
  const me = await uid()
  return requireSupabase().from('profiles').update(patch).eq('id', me)
}
/** Sets the user's measurement cycle (days between InBody scans). */
export async function setMeasureCycle(days: number) {
  const me = await uid()
  return requireSupabase().from('profiles').update({ measure_cycle_days: days }).eq('id', me)
}

// ───────────────────────── goals ────────────────────────
export async function fetchGoals(userId: string): Promise<Record<string, number>> {
  const { data } = await requireSupabase().from('metric_goals').select('metric_key, target').eq('user_id', userId)
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { metric_key: string; target: number }[]) out[r.metric_key] = Number(r.target)
  return out
}
export async function setGoal(metricKey: string, target: number) {
  const me = await uid()
  return requireSupabase().from('metric_goals').upsert({ user_id: me, metric_key: metricKey, target }, { onConflict: 'user_id,metric_key' })
}
export async function clearGoal(metricKey: string) {
  const me = await uid()
  return requireSupabase().from('metric_goals').delete().eq('user_id', me).eq('metric_key', metricKey)
}

// ───────────────────────── sleep log ────────────────────
export interface SleepRow { date: string; hours: number }
export async function fetchSleepLogs(userId: string, limit = 14): Promise<SleepRow[]> {
  const { data } = await requireSupabase().from('sleep_logs')
    .select('date, hours').eq('user_id', userId).order('date', { ascending: false }).limit(limit)
  return ((data ?? []) as SleepRow[]).map((r) => ({ date: r.date, hours: Number(r.hours) }))
}
export async function upsertSleepLog(date: string, hours: number) {
  const me = await uid()
  return requireSupabase().from('sleep_logs').upsert({ user_id: me, date, hours }, { onConflict: 'user_id,date' })
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

/** Public URL for a stored avatar path (avatars bucket is public). */
export function avatarUrl(path?: string | null): string | null {
  if (!path) return null
  return requireSupabase().storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// ───────────────────────── members ──────────────────────
export interface MemberCard {
  id: string; name: string; initials: string; color: string; photo: string | null; role: 'client' | 'trainer'
  bio: string | null; bio2: string | null; pub: string[]; score: number | null
}
/** Member roster with each member's public metric keys + score (if public). */
export async function fetchMemberCards(): Promise<MemberCard[]> {
  const sb = requireSupabase()
  const me = await uid()
  // include trainers/admins too — they have all member features and should be
  // browsable + invitable like any member
  const { data: profs } = await sb.from('profiles')
    .select('id, name, initials, avatar_color, bio, bio2, photo_path, role').neq('id', me)
  const cards: MemberCard[] = []
  for (const p of (profs ?? []) as Array<{ id: string; name: string; initials: string; avatar_color: string; bio: string | null; bio2: string | null; photo_path: string | null; role: 'client' | 'trainer' }>) {
    const { data: pv } = await sb.from('metric_privacy').select('metric_key, visibility').eq('user_id', p.id)
    const pub = ((pv ?? []) as { metric_key: string; visibility: string }[]).filter((r) => r.visibility === 'public').map((r) => r.metric_key)
    let score: number | null = null
    if (pub.includes('score')) {
      const { data: sc } = await sb.from('metric_readings').select('value').eq('user_id', p.id).eq('metric_key', 'score').order('date', { ascending: false }).limit(1)
      score = (sc?.[0] as { value: number } | undefined)?.value ?? null
    }
    cards.push({ id: p.id, name: p.name, initials: p.initials, color: p.avatar_color, photo: avatarUrl(p.photo_path), role: p.role, bio: p.bio, bio2: p.bio2, pub, score })
  }
  return cards
}

export async function fetchMemberCheers(id: string) {
  const { data } = await requireSupabase().from('member_cheers')
    .select('text, author:profiles!member_cheers_author_id_fkey(name, initials, avatar_color, photo_path)')
    .eq('target_user_id', id).order('created_at', { ascending: true })
  return data ?? []
}
export async function addMemberCheer(id: string, text: string) {
  const me = await uid()
  return requireSupabase().from('member_cheers').insert({ target_user_id: id, author_id: me, text })
}
export async function fetchMemberProfile(id: string) {
  const { data } = await requireSupabase().from('profiles')
    .select('name, initials, avatar_color, bio, bio2, photo_path').eq('id', id).single()
  return data as { name: string; initials: string; avatar_color: string; bio: string | null; bio2: string | null; photo_path: string | null } | null
}

// ───────────────────── trainer studio ───────────────────
export interface RosterRow { id: string; name: string; initials: string; color: string; score: number | null; pbf: number | null; smm: number | null }
export async function fetchRoster(): Promise<RosterRow[]> {
  const sb = requireSupabase()
  const { data: profs } = await sb.from('profiles').select('id, name, initials, avatar_color, role, photo_path').eq('role', 'client')
  const rows: RosterRow[] = []
  for (const p of (profs ?? []) as Array<{ id: string; name: string; initials: string; avatar_color: string }>) {
    const latest = async (k: string) => {
      const { data } = await sb.from('metric_readings').select('value').eq('user_id', p.id).eq('metric_key', k).order('date', { ascending: false }).limit(1)
      return (data?.[0] as { value: number } | undefined)?.value ?? null
    }
    rows.push({ id: p.id, name: p.name, initials: p.initials, color: p.avatar_color, score: await latest('score'), pbf: await latest('pbf'), smm: await latest('smm') })
  }
  return rows
}
export async function addCoachNote(memberId: string, metricKey: string, text: string) {
  const me = await uid()
  return requireSupabase().from('coach_notes').insert({ trainer_id: me, member_id: memberId, metric_key: metricKey, text })
}

// ───────────────────────── chat room ────────────────────
/** Returns the shared lounge room id, creating it + joining if needed. */
export async function getOrCreateDefaultRoom(): Promise<string | null> {
  const sb = requireSupabase()
  const me = await uid()
  const { data: rooms } = await sb.from('chat_rooms').select('id').eq('name', '하늘 라운지').limit(1)
  let roomId = (rooms?.[0] as { id: string } | undefined)?.id
  if (!roomId) {
    const { data: r } = await sb.from('chat_rooms').insert({ name: '하늘 라운지', is_private: false }).select('id').single()
    roomId = (r as { id: string } | null)?.id
  }
  if (roomId) await sb.from('room_members').upsert({ room_id: roomId, user_id: me })
  return roomId ?? null
}

// ───────────────────── InBody result OCR ─────────────────
export type OcrStatus = 'pending' | 'processing' | 'review' | 'committed' | 'error'
export interface SegVal { kg: number; pct: number }
export interface MetricRange { min: number; max: number }
export type MetricRanges = Partial<Record<'weight' | 'smm' | 'pbf' | 'bodyFatMass' | 'bmi' | 'tbw', MetricRange | null>>
export interface OcrResult {
  date: string
  score: number; weight: number; smm: number; pbf: number; bodyFatMass: number
  bmi: number; bmr: number; visceral: number; tbw: number
  segmental: Record<'rightArm' | 'leftArm' | 'trunk' | 'rightLeg' | 'leftLeg', SegVal>
  detail: { phaseAngle: number; smi: number; protein: number; mineral: number; idealWeight: number }
  ranges?: MetricRanges
  confidence: number
}
export interface OcrJob {
  id: string; status: OcrStatus; image_path: string; result: OcrResult | null; error: string | null
}

/** Uploads a result-sheet image and enqueues an OCR job. Returns the job id. */
export async function uploadResultSheet(file: File): Promise<string> {
  const sb = requireSupabase()
  const me = await uid()
  const path = `${me}/${Date.now()}-${file.name}`
  const { error: upErr } = await sb.storage.from('inbody-results').upload(path, file, { upsert: true })
  if (upErr) throw upErr
  const { data, error } = await sb.from('ocr_jobs').insert({ user_id: me, image_path: path }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Signed URL to view a stored result-sheet image (private bucket). */
export async function getResultSheetUrl(path: string): Promise<string | null> {
  const { data } = await requireSupabase().storage.from('inbody-results').createSignedUrl(path, 60 * 10)
  return data?.signedUrl ?? null
}

/** Subscribe to one OCR job's status changes. Returns an unsubscribe fn. */
export function subscribeOcrJob(jobId: string, onChange: (job: OcrJob) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`ocr:${jobId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ocr_jobs', filter: `id=eq.${jobId}` },
      (payload) => onChange(payload.new as OcrJob))
    .subscribe()
  return () => { sb.removeChannel(channel) }
}

export async function fetchOcrJob(jobId: string): Promise<OcrJob | null> {
  const { data } = await requireSupabase().from('ocr_jobs').select('id, status, image_path, result, error').eq('id', jobId).single()
  return (data as OcrJob) ?? null
}

/**
 * Commits a reviewed OCR result as a measurement + its metric_readings,
 * then marks the job 'committed'. `r` is the (possibly user-edited) result.
 */
export async function commitOcrMeasurement(jobId: string, r: OcrResult): Promise<void> {
  const sb = requireSupabase()
  const me = await uid()
  // carry the uploaded result-sheet image onto the measurement so it's viewable
  const { data: jobRow } = await sb.from('ocr_jobs').select('image_path').eq('id', jobId).single()
  const sheetPath = (jobRow as { image_path?: string } | null)?.image_path ?? null
  const { data: m, error: mErr } = await sb.from('measurements').upsert({
    user_id: me, date: r.date, source: 'ocr',
    segmental: r.segmental,
    detail: r.detail,
    ranges: r.ranges ?? null,
    result_sheet_path: sheetPath,
  }, { onConflict: 'user_id,date' }).select('id').single()
  if (mErr) throw mErr
  const measurementId = (m as { id: string }).id

  const metricVals: Record<MetricKey, number> = {
    score: r.score, weight: r.weight, smm: r.smm, pbf: r.pbf, bodyFatMass: r.bodyFatMass,
    bmi: r.bmi, bmr: r.bmr, visceral: r.visceral, tbw: r.tbw,
  }
  // replace any existing readings for this date, then insert the new set
  await sb.from('metric_readings').delete().eq('user_id', me).eq('date', r.date)
  const rows = (Object.keys(metricVals) as MetricKey[]).map((k) => ({
    user_id: me, measurement_id: measurementId, metric_key: k, date: r.date, value: metricVals[k],
  }))
  const { error: rErr } = await sb.from('metric_readings').insert(rows)
  if (rErr) throw rErr
  await sb.from('ocr_jobs').update({ status: 'committed' }).eq('id', jobId)
  // new measurement → enqueue a fresh AI briefing (measurement source, no rate limit)
  await sb.rpc('request_briefing', { p_source: 'measurement' }).then(() => {}, () => {})
}

// ───────────────────── AI coach briefing ────────────────
export interface BriefingRow { focus: string; summary: string; actions: string[]; source: 'measurement' | 'manual'; created_at: string }

export async function fetchLatestBriefing(userId: string): Promise<BriefingRow | null> {
  const { data } = await requireSupabase()
    .from('briefings').select('focus, summary, actions, source, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1)
  return (data?.[0] as BriefingRow) ?? null
}

/** How many manual regenerations the user has used in the last 7 days. */
export async function manualBriefingsThisWeek(userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { count } = await requireSupabase()
    .from('briefings').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('source', 'manual').gte('created_at', since)
  return count ?? 0
}

/** Requests a briefing. Returns {ok, reason?, used, limit}. RPC enforces the cap. */
export async function requestBriefing(source: 'measurement' | 'manual'): Promise<{ ok: boolean; reason?: string; used?: number; limit?: number }> {
  const { data, error } = await requireSupabase().rpc('request_briefing', { p_source: source })
  if (error) return { ok: false, reason: error.message }
  return data as { ok: boolean; reason?: string; used?: number; limit?: number }
}

/** Subscribe to new briefings for a user. Returns an unsubscribe fn. */
export function subscribeBriefings(userId: string, onInsert: (row: BriefingRow) => void) {
  const sb = requireSupabase()
  const channel = sb
    .channel(`briefings:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'briefings', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as BriefingRow))
    .subscribe()
  return () => { sb.removeChannel(channel) }
}
