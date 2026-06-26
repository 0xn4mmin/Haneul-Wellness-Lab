// Encapsulates all Supabase wiring (auth + the logged-in user's metric data)
// behind one hook. When Supabase isn't configured, `configured` is false and
// the caller falls back to the built-in mock state.

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import * as api from './api'
import { metrics as MOCK_METRICS, dates as MOCK_DATES, type Metric, type MetricKey } from './portalData'

/** ISO date (2026-06-14) → '6월 14일' label used by the charts. */
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

export interface BackendProfile { name: string; initials: string; color: string }

export interface Backend {
  configured: boolean
  ready: boolean
  session: Session | null
  loginError: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** Real series when signed in with data, else the mock metrics. */
  metrics: Record<MetricKey, Metric>
  dates: string[]
  /** Real per-metric privacy when loaded, else null (caller uses mock). */
  privacy: Record<string, 'public' | 'private'> | null
  togglePrivacy: (key: string) => void
  profile: BackendProfile | null
}

export function useBackend(): Backend {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isSupabaseConfigured)
  const [loginError, setLoginError] = useState('')
  const [remoteMetrics, setRemoteMetrics] = useState<Record<MetricKey, Metric> | null>(null)
  const [remoteDates, setRemoteDates] = useState<string[] | null>(null)
  const [privacy, setPrivacy] = useState<Record<string, 'public' | 'private'> | null>(null)
  const [profile, setProfile] = useState<BackendProfile | null>(null)

  // auth bootstrap
  useEffect(() => {
    if (!supabase) { setReady(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // load the signed-in user's data
  const userId = session?.user?.id
  useEffect(() => {
    if (!supabase || !userId) {
      setRemoteMetrics(null); setRemoteDates(null); setPrivacy(null); setProfile(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [{ dates, series }, priv, prof] = await Promise.all([
          api.fetchMetricSeries(userId),
          api.fetchPrivacy(userId),
          api.getMyProfile(),
        ])
        if (cancelled) return
        if (dates.length) {
          const built = {} as Record<MetricKey, Metric>
          for (const k of Object.keys(MOCK_METRICS) as MetricKey[]) {
            const s = series[k]
            built[k] = { ...MOCK_METRICS[k], series: s && s.length ? s : MOCK_METRICS[k].series }
          }
          setRemoteMetrics(built)
          setRemoteDates(dates.map(fmtDate))
        } else {
          setRemoteMetrics(null); setRemoteDates(null)
        }
        setPrivacy(priv && Object.keys(priv).length ? priv : null)
        if (prof) setProfile({ name: prof.name, initials: prof.initials, color: prof.avatar_color })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[backend] load failed', e)
      }
    })()
    return () => { cancelled = true }
  }, [userId])

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
    setPrivacy((prev) => {
      const cur = prev?.[key] ?? 'private'
      const next: 'public' | 'private' = cur === 'public' ? 'private' : 'public'
      api.setPrivacy(key, next).catch((e) => console.warn('[backend] setPrivacy failed', e))
      return { ...(prev ?? {}), [key]: next }
    })
  }, [])

  return {
    configured: isSupabaseConfigured,
    ready,
    session,
    loginError,
    signIn,
    signUp,
    signOut,
    metrics: remoteMetrics ?? MOCK_METRICS,
    dates: remoteDates ?? MOCK_DATES,
    privacy,
    togglePrivacy,
    profile,
  }
}
