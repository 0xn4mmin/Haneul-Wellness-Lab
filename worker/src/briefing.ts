import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// Short, frequent task → Haiku by default (fast + cheap). Override with BRIEFING_MODEL.
const MODEL = process.env.BRIEFING_MODEL || 'claude-haiku-4-5'

const anthropic = new Anthropic()

export const BriefingSchema = z.object({
  focus: z.string(),                       // 짧은 관점 라벨
  summary: z.string(),                     // 1문단 요약
  actions: z.array(z.string()).length(3),  // 3개 액션
})
export type Briefing = z.infer<typeof BriefingSchema>

export interface BriefingStats {
  name: string
  pbf: { first: number; last: number; goal: number }
  smm: { first: number; last: number; goal: number }
  score: { first: number; last: number; goal: number }
  visceral: { last: number; goal: number }
  avgSleep: number | null
  months: number
}

const SYSTEM = [
  '당신은 퍼스널 트레이닝 회원의 인바디 데이터를 해석하는 친근한 AI 코치입니다.',
  '주어진 수치만 근거로, 과장 없이 구체적으로 코멘트하세요. 의학적 진단은 하지 마세요.',
  '반드시 아래 JSON 객체 하나만 출력하세요 — 코드펜스(```)나 다른 문장 없이.',
  '한국어로, 따뜻하지만 데이터 기반으로. summary 는 2~3문장. actions 는 정확히 3개, 각 12자~24자의 실행 가능한 행동.',
].join(' ')

const SHAPE = `{"focus":"짧은 관점 라벨(예: 종합 진행 / 근력 집중 / 생활 습관)","summary":"2~3문장 요약","actions":["액션1","액션2","액션3"]}`

function extractJson(text: string): string {
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  if (a === -1 || b === -1 || b < a) throw new Error('no JSON in briefing output')
  return text.slice(a, b + 1)
}

export async function generateBriefing(stats: BriefingStats): Promise<Briefing> {
  const dPbf = +(stats.pbf.last - stats.pbf.first).toFixed(1)
  const dSmm = +(stats.smm.last - stats.smm.first).toFixed(1)
  const dScore = stats.score.last - stats.score.first
  const facts = [
    `회원: ${stats.name}, 최근 ${stats.months}회 측정`,
    `체지방률 ${stats.pbf.first}% → ${stats.pbf.last}% (변화 ${dPbf}%p, 목표 ${stats.pbf.goal}%)`,
    `골격근량 ${stats.smm.first}kg → ${stats.smm.last}kg (변화 ${dSmm >= 0 ? '+' : ''}${dSmm}kg, 목표 ${stats.smm.goal}kg)`,
    `인바디 점수 ${stats.score.first} → ${stats.score.last} (변화 ${dScore >= 0 ? '+' : ''}${dScore}, 목표 ${stats.score.goal})`,
    `내장지방 레벨 ${stats.visceral.last} (목표 ${stats.visceral.goal})`,
    stats.avgSleep != null ? `최근 평균 수면 ${stats.avgSleep}시간` : null,
  ].filter(Boolean).join('\n')

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      { role: 'user', content: `다음 데이터로 이번 달 코치 브리핑을 작성하세요.\n\n${facts}\n\n아래 형태의 JSON 으로만:\n${SHAPE}` },
    ],
  })

  let text = ''
  for (const block of res.content) if (block.type === 'text') text += block.text
  return BriefingSchema.parse(JSON.parse(extractJson(text)))
}
