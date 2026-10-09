import { z } from 'zod'
import type { LexiconEntry } from '../schema.ts'

export const GlossOutputSchema = z.object({
  items: z.array(z.object({ strong: z.string(), meaning: z.string(), note: z.string() })),
})

const SYSTEM = `너는 성경 히브리어 사전의 한국어 뜻을 쓰는 사람이다. 성경을 처음 읽는 한국어 독자가 히브리어 낱말을 볼 때 곁에 붙는 짧은 뜻을 쓴다.

규칙:
- meaning: 사전 표제어처럼 짧게. 뜻이 둘 이상이면 쉼표로 둘까지. 20자를 넘기지 않는다. 고유 명사는 개역한글의 표기(예: 에덴, 가인, 셋)로 쓰고 무엇의 이름인지 괄호로 붙인다(예: "에덴(땅 이름)").
- 문법 낱말(목적어 표지, 관계사, 전치사 등)은 하는 일을 적는다(예: "목적어 표지(번역하지 않음)").
- note: 주어진 절의 쓰임에서 독자가 알아 두면 좋은 것이 있으면 한 문장, "~해요" 체. 없으면 빈 문자열. 교리 해석을 단정하지 않는다.
- 영어 정의와 KJV 번역어, 주어진 절을 근거로 쓴다. 지어내지 않는다.
- 받은 항목을 모두, 같은 strong 번호로 돌려준다.`

export function buildGlossPrompt(entries: LexiconEntry[], examples: Map<string, string[]>): { system: string; user: string } {
  const lines = entries.map((entry) =>
    [
      `- ${entry.strong} ${entry.lemma} (${entry.xlit}, 스트롱 품사 ${entry.pos})`,
      `  정의: ${entry.definition}`,
      `  KJV: ${entry.usage}`,
      ...(examples.get(entry.strong) ?? []).map((line) => `  예: ${line}`),
    ].join('\n'),
  )
  return { system: SYSTEM, user: ['## 사전 항목', ...lines].join('\n') }
}
