import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when Supabase env vars are present. When false, the app runs on the
 *  built-in mock data (`portalState`) so it still works without a backend. */
export const isSupabaseConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — running on mock data.')
}

/** Throws if Supabase isn't configured. Use inside the api layer. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  return supabase
}
