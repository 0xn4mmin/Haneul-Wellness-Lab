import { createClient } from '@supabase/supabase-js'
import { extractInBody } from './ocr.js'

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

async function loop() {
  console.log('[ocr] worker started; polling every', POLL_MS, 'ms')
  for (;;) {
    try {
      const job = await claimOne()
      if (job) await processJob(job)
      else await sleep(POLL_MS)
    } catch (e) {
      console.warn('[ocr] loop error', e)
      await sleep(POLL_MS)
    }
  }
}

loop()
