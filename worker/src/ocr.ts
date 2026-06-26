import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

// Default model: Sonnet 4.6 (good OCR/structuring at lower cost). Swap to
// claude-opus-4-8 for maximum accuracy. Override with OCR_MODEL.
const MODEL = process.env.OCR_MODEL || 'claude-sonnet-4-6'

const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY

const Seg = z.object({ kg: z.number(), pct: z.number() })

// The structured shape Claude must return for one InBody result sheet.
export const InBodySchema = z.object({
  date: z.string().describe('측정일 (ISO YYYY-MM-DD). 결과지의 측정 일시에서 추출.'),
  score: z.number().describe('인바디 점수 (점)'),
  weight: z.number().describe('체중 (kg)'),
  smm: z.number().describe('골격근량 SMM (kg)'),
  pbf: z.number().describe('체지방률 PBF (%)'),
  bodyFatMass: z.number().describe('체지방량 (kg)'),
  bmi: z.number().describe('체질량지수 BMI'),
  bmr: z.number().describe('기초대사량 BMR (kcal)'),
  visceral: z.number().describe('내장지방 레벨'),
  tbw: z.number().describe('체수분 TBW (L)'),
  segmental: z.object({
    rightArm: Seg, leftArm: Seg, trunk: Seg, rightLeg: Seg, leftLeg: Seg,
  }).describe('부위별 근육분석: kg 와 표준대비 % (Segmental Lean Analysis)'),
  detail: z.object({
    phaseAngle: z.number().describe('위상각 (°)'),
    smi: z.number().describe('골격근지수 SMI (kg/m²)'),
    protein: z.number().describe('단백질 (kg)'),
    mineral: z.number().describe('무기질 (kg)'),
    idealWeight: z.number().describe('적정체중 (kg)'),
  }),
  confidence: z.number().describe('전체 추출 신뢰도 0~1. 흐리거나 가려진 값이 있으면 낮게.'),
})

export type InBodyResult = z.infer<typeof InBodySchema>

const SYSTEM = [
  '당신은 인바디(InBody) 체성분 결과지 이미지를 읽어 구조화된 데이터로 변환하는 도우미입니다.',
  '결과지의 한국어/영어 라벨을 정확히 인식해 각 항목을 알맞은 필드에 매핑하세요.',
  '값이 흐릿하거나 보이지 않으면 추측하지 말고 가장 가능성 높은 판독값을 넣되 confidence 를 낮추세요.',
  '숫자만, 단위 없이 반환하세요(예: 체지방률 20.0% → 20.0).',
].join(' ')

/** Runs Claude vision + structured output on an InBody sheet image. */
export async function extractInBody(imageBytes: Uint8Array, mediaType: string): Promise<InBodyResult> {
  const base64 = Buffer.from(imageBytes).toString('base64')
  const media = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)
    ? mediaType
    : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: base64 } },
          { type: 'text', text: '이 인바디 결과지에서 측정값을 추출해 스키마에 맞게 JSON 으로 반환하세요.' },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(InBodySchema) },
  })

  if (!response.parsed_output) {
    throw new Error(`OCR parse failed (stop_reason=${response.stop_reason})`)
  }
  return response.parsed_output
}
