import { createClient } from '@supabase/supabase-js'
import { extractInBody } from './ocr.js'
import { generateBriefing, type BriefingStats } from './briefing.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
// Service-role client bypasses RLS — this is a trusted server, never ship this key to the browser.
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const POLL_MS = Number(process.env.POLL_MS || 4000)
const BUCKET = 'inbody-results'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function claimOne(): Promise<{ id: string; image_path: string } | null> {
  // fetch oldest pending, then atomically flip to processing (guard on status)
  const { data: rows } = await sb
    .from('ocr_jobs').select('id, image_path').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(1)
  const job = rows?.[0] as { id: string; image_path: string } | undefined
  if (!job) return null
  const { data: claimed } = await sb
    .from('ocr_jobs').update({ status: 'processing' })
    .eq('id', job.id).eq('status', 'pending').select('id, image_path')
  if (!claimed || claimed.length === 0) return null // someone else claimed it
  return claimed[0] as { id: string; image_path: string }
}

async function processJob(job: { id: string; image_path: string }) {
  console.log(`[ocr] processing ${job.id} (${job.image_path})`)
  try {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(job.image_path)
    if (error || !blob) throw new Error(`download failed: ${error?.message}`)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const mediaType = blob.type || 'image/jpeg'

    const result = await extractInBody(bytes, mediaType)
    await sb.from('ocr_jobs').update({ status: 'review', result, error: null }).eq('id', job.id)
    console.log(`[ocr] ${job.id} → review (confidence ${result.confidence})`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[ocr] ${job.id} failed: ${msg}`)
    await sb.from('ocr_jobs').update({ status: 'error', error: msg }).eq('id', job.id)
  }
}

// ── briefing jobs ──
async function claimBriefing(): Promise<{ id: string; user_id: string; source: string } | null> {
  const { data: rows } = await sb
    .from('briefing_jobs').select('id, user_id, source').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(1)
  const job = rows?.[0] as { id: string; user_id: string; source: string } | undefined
  if (!job) return null
  const { data: claimed } = await sb
    .from('briefing_jobs').update({ status: 'processing' })
    .eq('id', job.id).eq('status', 'pending').select('id, user_id, source')
  if (!claimed || claimed.length === 0) return null
  return claimed[0] as { id: string; user_id: string; source: string }
}

async function gatherStats(userId: string): Promise<BriefingStats> {
  const series = async (k: string) => {
    const { data } = await sb.from('metric_readings').select('value, date')
      .eq('user_id', userId).eq('metric_key', k).order('date', { ascending: true })
    const vals = (data ?? []).map((r: { value: number }) => Number(r.value))
    return vals
  }
  const [pbf, smm, score, visceral] = await Promise.all([series('pbf'), series('smm'), series('score'), series('visceral')])
  const { data: g } = await sb.from('goals').select('*').eq('user_id', userId).single()
  const goals = (g ?? { score: 90, smm: 34, pbf: 15, visceral: 4 }) as { score: number; smm: number; pbf: number; visceral: number }
  const { data: prof } = await sb.from('profiles').select('name').eq('id', userId).maybeSingle()
  const name = (prof as { name?: string } | null)?.name || '회원'
  const { data: cond } = await sb.from('condition_logs').select('sleep').eq('user_id', userId)
  const sleeps = (cond ?? []).map((c: { sleep: number }) => Number(c.sleep)).filter((n) => !Number.isNaN(n))
  const avgSleep = sleeps.length ? +(sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1) : null
  const fl = (a: number[]) => ({ first: a[0] ?? 0, last: a[a.length - 1] ?? 0 })
  return {
    name,
    pbf: { ...fl(pbf), goal: goals.pbf },
    smm: { ...fl(smm), goal: goals.smm },
    score: { ...fl(score), goal: goals.score },
    visceral: { last: visceral[visceral.length - 1] ?? 0, goal: goals.visceral },
    avgSleep,
    months: Math.max(pbf.length, smm.length, score.length),
  }
}

async function processBriefing(job: { id: string; user_id: string; source: string }) {
  console.log(`[brief] processing ${job.id} (${job.source}) for ${job.user_id.slice(0, 8)}`)
  try {
    const stats = await gatherStats(job.user_id)
    const b = await generateBriefing(stats)
    await sb.from('briefings').insert({ user_id: job.user_id, source: job.source, focus: b.focus, summary: b.summary, actions: b.actions })
    await sb.from('briefing_jobs').update({ status: 'done', error: null }).eq('id', job.id)
    console.log(`[brief] ${job.id} → done (${b.focus})`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[brief] ${job.id} failed: ${msg}`)
    await sb.from('briefing_jobs').update({ status: 'error', error: msg }).eq('id', job.id)
  }
}

async function loop() {
  console.log('[worker] started; polling every', POLL_MS, 'ms (ocr + briefing)')
  for (;;) {
    try {
      const ocrJob = await claimOne()
      if (ocrJob) { await processJob(ocrJob); continue }
      const briefJob = await claimBriefing()
      if (briefJob) { await processBriefing(briefJob); continue }
      await sleep(POLL_MS)
    } catch (e) {
      console.warn('[worker] loop error', e)
      await sleep(POLL_MS)
    }
  }
}

loop()
