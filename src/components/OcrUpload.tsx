import { useEffect, useRef, useState } from 'react'
import {
  uploadResultSheet, subscribeOcrJob, fetchOcrJob, commitOcrMeasurement,
  type OcrJob, type OcrResult,
} from '../data/api'
import { metrics as METRICS, type MetricKey } from '../data/portalData'

const CTA = 'linear-gradient(110deg,#67D7DF,#2E9BA6)'

type Phase = 'idle' | 'uploading' | 'working' | 'review' | 'saving' | 'done' | 'error'

const REVIEW_FIELDS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'score', label: '인바디 점수', unit: '점' },
  { key: 'weight', label: '체중', unit: 'kg' },
  { key: 'smm', label: '골격근량', unit: 'kg' },
  { key: 'pbf', label: '체지방률', unit: '%' },
  { key: 'bodyFatMass', label: '체지방량', unit: 'kg' },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'bmr', label: '기초대사량', unit: 'kcal' },
  { key: 'visceral', label: '내장지방', unit: '레벨' },
  { key: 'tbw', label: '체수분', unit: 'L' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', borderRadius: 9,
  border: '1px solid rgba(255,247,232,.15)', background: 'rgba(255,249,238,.05)', outline: 'none', color: '#EAF3F1',
}

/** Result-sheet upload → live OCR progress → editable review → commit. */
export default function OcrUpload({ onCommitted }: { onCommitted: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [msg, setMsg] = useState('')
  const [draft, setDraft] = useState<OcrResult | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => () => { unsubRef.current?.() }, [])

  const handleJob = (job: OcrJob) => {
    if (job.status === 'review' && job.result) {
      setDraft(job.result); setPhase('review')
    } else if (job.status === 'error') {
      setMsg(job.error || '분석에 실패했어요.'); setPhase('error')
    } else if (job.status === 'processing') {
      setMsg('결과지를 분석하고 있어요…'); setPhase('working')
    }
  }

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0]; if (!f) return
    setPhase('uploading'); setMsg('업로드 중…'); setDraft(null)
    try {
      const jobId = await uploadResultSheet(f)
      jobIdRef.current = jobId
      setPhase('working'); setMsg('결과지를 분석하고 있어요…')
      unsubRef.current = subscribeOcrJob(jobId, handleJob)
      // safety net: poll once after a beat in case the realtime event was missed
      setTimeout(async () => { const j = await fetchOcrJob(jobId); if (j) handleJob(j) }, 6000)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '업로드 실패'); setPhase('error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const setField = (k: MetricKey, v: string) => setDraft((d) => (d ? { ...d, [k]: Number(v) } : d))
  const setDate = (v: string) => setDraft((d) => (d ? { ...d, date: v } : d))

  const onSave = async () => {
    if (!draft || !jobIdRef.current) return
    setPhase('saving')
    try {
      await commitOcrMeasurement(jobIdRef.current, draft)
      setPhase('done'); setMsg('✓ 측정 기록에 저장했어요.')
      unsubRef.current?.(); unsubRef.current = null
      onCommitted()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '저장 실패'); setPhase('error')
    }
  }

  const reset = () => { setPhase('idle'); setMsg(''); setDraft(null); jobIdRef.current = null }

  const busy = phase === 'uploading' || phase === 'working' || phase === 'saving'

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,247,232,.1)' }}>
      {(phase === 'idle' || phase === 'done' || phase === 'error') && (
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#67D7DF', background: 'rgba(46,155,166,.14)', border: '1px solid rgba(103,215,223,.3)', borderRadius: 13, padding: '11px 14px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#67D7DF" strokeWidth="1.8"><path d="M12 16V4M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" /></svg>
          + 결과지로 추가 (자동 인식)
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </label>
      )}

      {busy && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#9FE2E8', padding: '11px 14px', background: 'rgba(46,155,166,.1)', border: '1px solid rgba(103,215,223,.2)', borderRadius: 13 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(103,215,223,.3)', borderTopColor: '#67D7DF', animation: 'hwl-spin .8s linear infinite' }} />
          {msg}
        </div>
      )}

      {phase === 'review' && draft && (
        <div style={{ background: 'rgba(255,249,238,.045)', border: '1px solid rgba(255,247,232,.13)', borderRadius: 15, padding: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#EAF3F1' }}>추출값 확인</div>
            <span style={{ fontSize: 11, color: draft.confidence >= 0.85 ? '#67D7DF' : '#E0A06A' }}>신뢰도 {Math.round(draft.confidence * 100)}%</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(231,239,234,.55)', marginBottom: 10, lineHeight: 1.5 }}>인식된 값을 확인·수정하고 저장하세요. 측정일이 비어 있으면 직접 선택해 주세요.</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>측정일</label>
            <input type="date" value={draft.date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {REVIEW_FIELDS.map((f) => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'rgba(231,239,234,.55)', display: 'block', marginBottom: 4 }}>{METRICS[f.key].label}{f.unit ? ` (${f.unit})` : ''}</label>
                <input type="number" step="0.1" value={draft[f.key]} onChange={(e) => setField(f.key, e.target.value)} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <button onClick={reset} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#9FBCB5', background: 'rgba(255,249,238,.05)', border: '1px solid rgba(255,247,232,.15)', padding: '10px 16px', borderRadius: 13 }}>취소</button>
            <button onClick={onSave} style={{ all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#060B17', background: CTA, padding: 10, borderRadius: 13 }}>측정 기록에 저장</button>
          </div>
        </div>
      )}

      {(phase === 'done' || phase === 'error') && (
        <div style={{ fontSize: 12, color: phase === 'done' ? '#67D7DF' : '#E0A06A', marginTop: 9, textAlign: 'center' }}>{msg}</div>
      )}
    </div>
  )
}
