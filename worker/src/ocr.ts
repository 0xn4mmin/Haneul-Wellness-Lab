import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// Default model: Sonnet 4.6 (good OCR/structuring at lower cost). Swap to
// claude-opus-4-8 for maximum accuracy. Override with OCR_MODEL.
const MODEL = process.env.OCR_MODEL || 'claude-sonnet-4-6'

const anthropic = new Anthropic() // reads ANTHROPIC_API_KEY

const Seg = z.object({ kg: z.number(), pct: z.number() })

// Validated shape for one InBody result sheet.
export const InBodySchema = z.object({
  date: z.string(),            // 측정일 ISO YYYY-MM-DD
  score: z.number(),           // 인바디 점수
  weight: z.number(),          // 체중 kg
  smm: z.number(),             // 골격근량 kg
  pbf: z.number(),             // 체지방률 %
  bodyFatMass: z.number(),     // 체지방량 kg
  bmi: z.number(),             // BMI
  bmr: z.number(),             // 기초대사량 kcal
  visceral: z.number(),        // 내장지방 레벨
  tbw: z.number(),             // 체수분 L
  segmental: z.object({
    rightArm: Seg, leftArm: Seg, trunk: Seg, rightLeg: Seg, leftLeg: Seg,
  }),
  detail: z.object({
    phaseAngle: z.number(),    // 위상각 °
    smi: z.number(),           // SMI kg/m²
    protein: z.number(),       // 단백질 kg
    mineral: z.number(),       // 무기질 kg
    idealWeight: z.number(),   // 적정체중 kg
  }),
  confidence: z.number(),      // 0~1
})

export type InBodyResult = z.infer<typeof InBodySchema>

const SYSTEM = [
  '당신은 인바디(InBody) 체성분 결과지 이미지를 읽어 구조화된 데이터로 변환하는 도우미입니다.',
  '결과지의 한국어/영어 라벨을 정확히 인식해 각 항목을 알맞은 필드에 매핑하세요.',
  '값이 흐릿하면 가장 가능성 높은 판독값을 넣되 confidence 를 낮추세요.',
  '반드시 아래 JSON 객체 하나만 출력하세요 — 코드펜스(```)나 설명 문장 없이.',
  '숫자는 단위 없이 숫자만(예: 체지방률 20.0% → 20.0). 모르는 값은 0.',
].join(' ')

const SHAPE = `{
  "date": "YYYY-MM-DD",
  "score": 인바디점수, "weight": 체중kg, "smm": 골격근량kg, "pbf": 체지방률%,
  "bodyFatMass": 체지방량kg, "bmi": BMI, "bmr": 기초대사량kcal, "visceral": 내장지방레벨, "tbw": 체수분L,
  "segmental": {
    "rightArm": {"kg": 오른팔kg, "pct": 표준대비%}, "leftArm": {"kg": ., "pct": .},
    "trunk": {"kg": ., "pct": .}, "rightLeg": {"kg": ., "pct": .}, "leftLeg": {"kg": ., "pct": .}
  },
  "detail": {"phaseAngle": 위상각, "smi": SMI, "protein": 단백질kg, "mineral": 무기질kg, "idealWeight": 적정체중kg},
  "confidence": 0.0~1.0
}`

/** Extract the first balanced JSON object from model text (tolerates fences/prose). */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in model output')
  return text.slice(start, end + 1)
}

/** Runs Claude vision on an InBody sheet image and returns validated data. */
export async function extractInBody(imageBytes: Uint8Array, mediaType: string): Promise<InBodyResult> {
  const base64 = Buffer.from(imageBytes).toString('base64')
  const media = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)
    ? mediaType
    : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data: base64 } },
          { type: 'text', text: `이 인바디 결과지에서 측정값을 추출해 아래 형태의 JSON 으로만 반환하세요:\n${SHAPE}` },
        ],
      },
    ],
  })

  let text = ''
  for (const block of res.content) if (block.type === 'text') text += block.text
  const json = JSON.parse(extractJson(text))
  return InBodySchema.parse(json)
}
