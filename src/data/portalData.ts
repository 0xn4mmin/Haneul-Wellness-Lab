// Sample data based on a real InBody 770 result sheet — mirrors the design reference.

export type MetricKey =
  | 'score' | 'weight' | 'smm' | 'pbf' | 'bodyFatMass'
  | 'bmi' | 'bmr' | 'visceral' | 'tbw'

export interface Metric {
  label: string
  short: string
  unit: string
  good: 'up' | 'down'
  series: number[]
}

export const dates = ['1월 12일', '2월 9일', '3월 15일', '4월 12일', '5월 10일', '6월 14일']

export const metrics: Record<MetricKey, Metric> = {
  score: { label: '인바디 점수', short: '인바디', unit: '점', good: 'up', series: [70, 72, 74, 75, 77, 78] },
  weight: { label: '체중', short: '체중', unit: 'kg', good: 'down', series: [75.8, 74.6, 73.4, 72.4, 71.4, 70.6] },
  smm: { label: '골격근량', short: '골격근', unit: 'kg', good: 'up', series: [29.4, 30.0, 30.6, 31.1, 31.5, 31.9] },
  pbf: { label: '체지방률', short: '체지방률', unit: '%', good: 'down', series: [26.5, 25.1, 23.8, 22.4, 21.1, 20.0] },
  bodyFatMass: { label: '체지방량', short: '체지방량', unit: 'kg', good: 'down', series: [20.1, 18.7, 17.4, 16.2, 15.1, 14.1] },
  bmi: { label: '체질량지수', short: 'BMI', unit: '', good: 'down', series: [25.9, 25.5, 25.1, 24.7, 24.4, 24.1] },
  bmr: { label: '기초대사량', short: '기초대사', unit: 'kcal', good: 'up', series: [1530, 1545, 1558, 1570, 1582, 1590] },
  visceral: { label: '내장지방', short: '내장지방', unit: '레벨', good: 'down', series: [8, 7, 7, 6, 6, 5] },
  tbw: { label: '체수분', short: '체수분', unit: 'L', good: 'up', series: [39.6, 40.0, 40.4, 40.8, 41.1, 41.4] },
}

// disp = bar display range, norm = standard/normal range.
// (general InBody standards; real sheets personalize by height/sex.)
export const gconf: Record<string, { disp: [number, number]; norm: [number, number] }> = {
  score: { disp: [55, 100], norm: [70, 80] },
  weight: { disp: [50, 95], norm: [60, 73] },
  smm: { disp: [22, 40], norm: [27.5, 33.5] },
  pbf: { disp: [5, 35], norm: [10, 20] },
  bodyFatMass: { disp: [5, 30], norm: [8, 16] },
  bmi: { disp: [15, 33], norm: [18.5, 25] },
  bmr: { disp: [1200, 2100], norm: [1500, 1800] },
  visceral: { disp: [1, 20], norm: [1, 9] },
  tbw: { disp: [30, 50], norm: [38, 46] },
}

export type RangeMap = Record<string, { min: number; max: number } | null | undefined> | null | undefined
// metrics where leaving the range in EITHER direction is bad (no "good" side)
const TWO_SIDED = new Set<string>(['bmi'])
/** Resolve the normal range for a metric: the person's own range from their
 *  InBody sheet if present, else the generic standard. */
export function normFor(key: MetricKey, ranges?: RangeMap): [number, number] | null {
  const r = ranges?.[key]
  if (r && typeof r.min === 'number' && typeof r.max === 'number') return [r.min, r.max]
  return gconf[key]?.norm ?? null
}
/** Judge a value against its standard range, factoring in whether higher or
 *  lower is better. Returns Good/Bad only when outside the range. */
export function assess(key: MetricKey, val: number, md: Record<MetricKey, Metric> = metrics, ranges?: RangeMap):
  { state: 'good' | 'bad' | 'normal'; label: string; color: string } {
  const norm = normFor(key, ranges)
  if (!norm) return { state: 'normal', label: '', color: '#fff' }
  const [nMin, nMax] = norm
  if (val >= nMin && val <= nMax) return { state: 'normal', label: '', color: '#fff' }
  const above = val > nMax
  const isGood = TWO_SIDED.has(key) ? false : (above ? md[key].good === 'up' : md[key].good === 'down')
  return isGood
    ? { state: 'good', label: 'Good', color: '#7BD88F' }
    : { state: 'bad', label: 'Bad', color: '#E0875C' }
}

export interface SegDatum { key: string; name: string; pct: number; kg: number }
export const segData: SegDatum[] = [
  { key: 'rightArm', name: '오른팔', pct: 97.9, kg: 3.08 },
  { key: 'leftArm', name: '왼팔', pct: 94.8, kg: 2.98 },
  { key: 'trunk', name: '몸통', pct: 97.7, kg: 24.5 },
  { key: 'rightLeg', name: '오른다리', pct: 101.2, kg: 8.83 },
  { key: 'leftLeg', name: '왼다리', pct: 101.8, kg: 8.89 },
]

export const research = [
  { k: '기초대사량', v: '1,590', u: 'kcal' },
  { k: '내장지방 레벨', v: '5', u: '/ 9' },
  { k: '위상각', v: '6.5', u: '°' },
  { k: 'SMI', v: '8.1', u: 'kg/m²' },
  { k: '적정체중', v: '66.4', u: 'kg' },
  { k: '권장 조절', v: '-4.2', u: 'kg' },
]

export const goals = { score: 90, smm: 34, pbf: 15, visceral: 4 }

export const conditionLog = [
  { w: '6월 2주', sleep: 7.4, water: 2.5, mood: 4, workouts: 4 },
  { w: '6월 1주', sleep: 6.8, water: 2.1, mood: 3, workouts: 3 },
  { w: '5월 4주', sleep: 7.6, water: 2.6, mood: 5, workouts: 4 },
  { w: '5월 3주', sleep: 6.1, water: 1.8, mood: 3, workouts: 2 },
]

export const challenge = {
  title: '6월 체지방 챌린지',
  metric: '체지방률 감량',
  goal: '-2.0%p',
  daysLeft: 9,
  board: [
    { handle: '민들레', chg: -3.1, me: false },
    { handle: '나', chg: -2.4, me: true },
    { handle: '초록콩', chg: -2.0, me: false },
    { handle: '바람한줌', chg: -1.6, me: false },
    { handle: '아침해', chg: -1.2, me: false },
  ],
}

export const me = { name: '박지우', initials: '지우', color: '#6E9B8E', role: '회원 · 2025년부터' }
export const coach = { name: '코치 하늘', initials: '하늘', color: '#234B47' }

// --- helpers ---------------------------------------------------------------

export function segColor(pct: number): string {
  const stops: [number, number[]][] = [[88, [201, 150, 90]], [100, [103, 215, 223]], [112, [46, 155, 166]]]
  const p = Math.max(88, Math.min(112, pct))
  let a = stops[0]
  let b = stops[2]
  if (p <= 100) { a = stops[0]; b = stops[1] } else { a = stops[1]; b = stops[2] }
  const t = (p - a[0]) / (b[0] - a[0])
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t))
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const norm = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)))

export function buildSpark(series: number[]): string {
  const min = Math.min(...series)
  const max = Math.max(...series)
  const sp = (max - min) || 1
  return series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * 116 + 2
      const y = 30 - ((v - min) / sp) * 26
      return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
    })
    .join(' ')
}

export interface TrendPoint {
  x: number; y: number; v: number; label: string; full: string; disp: string; ly: number
}
export interface TrendData {
  title: string; latest: string; line: string; area: string
  pts: TrendPoint[]
  grid: { y: number; ty: number; label: string }[]
  deltaText: string; deltaColor: string; deltaBg: string
}

export function buildTrend(
  selectedMetric: MetricKey,
  metricsData: Record<MetricKey, Metric> = metrics,
  datesData: string[] = dates,
): TrendData {
  const m = metricsData[selectedMetric]
  const vals = m.series
  const W = 560, H = 260, pL = 44, pR = 20, pT = 26, pB = 42
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1
  const lo = min - span * 0.35, hi = max + span * 0.35, rng = hi - lo
  const xs = vals.map((_v, i) => pL + (i / (vals.length - 1)) * (W - pL - pR))
  const ys = vals.map((v) => pT + (1 - (v - lo) / rng) * (H - pT - pB))
  const md = (d: string) => d.replace('월 ', '/').replace('일', '').trim()  // "6월 14일" → "6/14"
  const pts: TrendPoint[] = xs.map((x, i) => ({
    x: +x.toFixed(1), y: +ys[i].toFixed(1), v: vals[i],
    label: md(datesData[i] ?? ''), full: datesData[i],
    disp: vals[i] + (m.unit ? ' ' + m.unit : ''), ly: +(ys[i] - 12).toFixed(1),
  }))
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ')
  const area = 'M' + xs[0].toFixed(1) + ' ' + (H - pB) + ' ' + pts.map((p) => 'L' + p.x + ' ' + p.y).join(' ') + ' L' + xs[xs.length - 1].toFixed(1) + ' ' + (H - pB) + ' Z'
  const grid: TrendData['grid'] = []
  for (let i = 0; i < 4; i++) {
    const gv = lo + rng * (i / 3)
    const gy = pT + (1 - (gv - lo) / rng) * (H - pT - pB)
    grid.push({ y: +gy.toFixed(1), ty: +(gy + 3).toFixed(1), label: gv.toFixed(gv >= 100 ? 0 : 1) })
  }
  const first = vals[0], last = vals[vals.length - 1], diff = last - first
  const improved = (m.good === 'up') ? diff >= 0 : diff <= 0
  const dec = (m.unit === '%' || ['smm', 'tbw', 'bodyFatMass', 'weight', 'bmi'].includes(selectedMetric)) ? 1 : 0
  const sign = diff > 0 ? '+' : ''
  const firstLabel = md(datesData[0] ?? '') || '처음'
  return {
    title: m.label, latest: last + (m.unit ? ' ' + m.unit : ''), line, area, pts, grid,
    deltaText: firstLabel + ' 대비 ' + sign + diff.toFixed(dec),
    deltaColor: improved ? '#67D7DF' : '#E0A06A',
    deltaBg: improved ? 'rgba(46,155,166,.18)' : 'rgba(224,138,94,.2)',
  }
}

export interface GaugeGeom {
  key: string; label: string; unit: string; value: number
  status: string; statusColor: string; verdict: '' | 'Good' | 'Bad'
  markerPct: number; underW: number; normW: number; overW: number
  nMin: number; nMax: number
}

// short, friendly explanation of each metric (shown via the ⓘ button)
export const METRIC_INFO: Record<string, string> = {
  score: '근육·체지방 균형을 종합한 InBody 점수예요. 보통 80점 이상이면 표준 이상으로 봅니다.',
  weight: '몸 전체의 무게예요. 키 대비 적정 범위는 사람마다 달라요.',
  smm: '팔·다리·몸통을 움직이는 골격근의 무게예요. 많을수록 대사와 체형에 유리해요.',
  pbf: '체중에서 지방이 차지하는 비율(%)이에요. 낮을수록 좋지만 너무 낮아도 건강에 좋지 않아요.',
  bodyFatMass: '몸에 있는 지방의 실제 무게(kg)예요.',
  bmi: '체중(kg)을 키(m)의 제곱으로 나눈 비만도 지표예요.',
  bmr: '가만히 있어도 소비되는 최소 에너지(kcal)예요. 근육이 많을수록 높아져요.',
  visceral: '복부 장기 주변에 쌓인 지방 수준이에요. 보통 9 이하를 표준으로 봅니다.',
  tbw: '몸속 수분의 양(L)이에요. 근육량과 함께 늘어나요.',
}
export function buildGauges(metricsData: Record<MetricKey, Metric> = metrics, ranges?: RangeMap): GaugeGeom[] {
  return Object.keys(gconf).map((key) => {
    const m = metricsData[key as MetricKey]
    const c = gconf[key]
    const val = m.series[m.series.length - 1]
    const [nMin, nMax] = normFor(key as MetricKey, ranges) ?? c.norm
    // widen the display range so a personalized normal band still fits the bar
    const dMin = Math.min(c.disp[0], nMin, val)
    const dMax = Math.max(c.disp[1], nMax, val)
    const dr = dMax - dMin
    const markerPct = Math.max(2, Math.min(98, ((val - dMin) / dr) * 100))
    const underW = ((nMin - dMin) / dr) * 100
    const normW = ((nMax - nMin) / dr) * 100
    const overW = 100 - underW - normW
    let status = '표준', sc = '#67D7DF', verdict: '' | 'Good' | 'Bad' = ''
    if (val < nMin || val > nMax) {
      const above = val > nMax
      const isGood = TWO_SIDED.has(key) ? false : (above ? m.good === 'up' : m.good === 'down')
      status = above ? '표준 이상' : '표준 이하'
      verdict = isGood ? 'Good' : 'Bad'
      sc = isGood ? '#7BD88F' : '#E0875C'
    }
    return {
      key, label: m.label, unit: m.unit, value: val, status, statusColor: sc, verdict,
      markerPct: +markerPct.toFixed(1), underW: +underW.toFixed(1),
      normW: +normW.toFixed(1), overW: +overW.toFixed(1),
      nMin, nMax,
    }
  })
}

export interface RadarData {
  rings: { points: string }[]
  spokes: { x: number; y: number }[]
  curDots: { x: number; y: number; k: string; raw: string; pctText: string; state: 'good' | 'bad' | 'normal'; verdict: string; color: string }[]
  labels: { k: string; x: number; y: number; anchor: 'start' | 'middle' | 'end'; color: string }[]
  curPoints: string
  prevPoints: string
}
export function buildRadar(metricsData: Record<MetricKey, Metric> = metrics, ranges?: RangeMap): RadarData {
  const cx = 120, cy = 120, R = 88
  const last = (k: MetricKey) => metricsData[k].series[metricsData[k].series.length - 1]
  const first = (k: MetricKey) => metricsData[k].series[0]
  // each axis is normalized so "further out = better"; mk carries the metric so
  // we can judge Good/Bad against its (personal) standard range.
  const axes: { k: string; mk: MetricKey; cur: number; prev: number; raw: string }[] = [
    { k: '근육', mk: 'smm', cur: norm(last('smm'), 24, 36), prev: norm(first('smm'), 24, 36), raw: '골격근량 ' + last('smm') + 'kg' },
    { k: '체지방', mk: 'pbf', cur: 1 - norm(last('pbf'), 8, 32), prev: 1 - norm(first('pbf'), 8, 32), raw: '체지방률 ' + last('pbf') + '%' },
    { k: '수분', mk: 'tbw', cur: norm(last('tbw'), 36, 44), prev: norm(first('tbw'), 36, 44), raw: '체수분 ' + last('tbw') + 'L' },
    { k: '점수', mk: 'score', cur: norm(last('score'), 55, 100), prev: norm(first('score'), 55, 100), raw: '인바디 ' + last('score') + '점' },
    { k: 'BMI', mk: 'bmi', cur: 1 - norm(Math.abs(last('bmi') - 21.7), 0, 6), prev: 1 - norm(Math.abs(first('bmi') - 21.7), 0, 6), raw: 'BMI ' + last('bmi') },
    { k: '내장', mk: 'visceral', cur: 1 - norm(last('visceral'), 3, 12), prev: 1 - norm(first('visceral'), 3, 12), raw: '내장지방 Lv.' + last('visceral') },
  ]
  const ang = (i: number) => ((-90 + i * (360 / axes.length)) * Math.PI) / 180
  const pt = (i: number, r: number): [number, number] => [
    +(cx + Math.cos(ang(i)) * R * r).toFixed(1),
    +(cy + Math.sin(ang(i)) * R * r).toFixed(1),
  ]
  const rings = [0.25, 0.5, 0.75, 1].map((r) => ({ points: axes.map((_a, i) => pt(i, r).join(',')).join(' ') }))
  const spokes = axes.map((_a, i) => { const [x, y] = pt(i, 1); return { x, y } })
  const curDots = axes.map((a, i) => {
    const [x, y] = pt(i, a.cur)
    const v = assess(a.mk, last(a.mk), metricsData, ranges)
    return { x, y, k: a.k, raw: a.raw, pctText: Math.round(a.cur * 100) + '%', state: v.state, verdict: v.label, color: v.color }
  })
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, 1.2)
    let anchor: 'start' | 'middle' | 'end' = 'middle'
    if (x < cx - 6) anchor = 'end'; else if (x > cx + 6) anchor = 'start'
    const v = assess(a.mk, last(a.mk), metricsData, ranges)
    return { k: a.k, x: +x.toFixed(1), y: +(y + 3).toFixed(1), anchor, color: v.state === 'normal' ? 'rgba(231,239,234,.55)' : v.color }
  })
  return {
    rings, spokes, curDots, labels,
    curPoints: axes.map((a, i) => pt(i, a.cur).join(',')).join(' '),
    prevPoints: axes.map((a, i) => pt(i, a.prev).join(',')).join(' '),
  }
}
