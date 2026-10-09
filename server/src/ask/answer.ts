import { z } from 'zod'
import type { Passage } from './passages.ts'
import { retrieve, type PassageIndex } from './retrieve.ts'

// LLM이 돌려주는 답. 문장마다 근거 자료 번호(S1, S2…)를 단다.
export const AskOutputSchema = z.object({
  found: z.boolean(),
  sentences: z.array(z.object({ text: z.string(), sources: z.array(z.string()) })),
})

// 질문하기에 쓰는 LLM. 시험에서는 가짜를 넣는다.
export type AskModel = (request: { system: string; user: string }) => Promise<unknown>

export type Citation = {
  id: string
  kind: Passage['kind']
  label: string
  chapter: number | null
  verse: number | null
  sceneId: string | null
  entity: Passage['entity'] | null
}

export type AskResult = { status: 'answer' | 'none'; text: string; citations: Citation[] }

export const NONE_TEXT = '자료에 없어요. 이 앱의 본문과 검수된 해설·설정집에서 이 질문의 답을 찾지 못했어요.'

const SYSTEM = `너는 성경 읽기 앱의 질문 도우미다. 독자가 창세기에 대해 물으면, 번호를 붙여 준 자료(개역한글 본문, 검수된 장면 해설, 설정집)만 근거로 한국어로 짧게 답한다.

규칙:
- 자료에 있는 내용만 쓴다. 자료 밖의 지식, 추측, 교파마다 다른 해석은 쓰지 않는다.
- 답은 세 문장 안팎, "~해요" 체로 쓴다. 성경을 처음 읽는 사람이 알아듣게 쉬운 말로 쓴다.
- 문장마다 근거 자료 번호를 sources에 적는다(예: ["S2"]). 근거를 댈 수 없는 문장은 쓰지 않는다.
- 자료로 답할 수 없으면 found를 false로 하고 sentences는 빈 배열로 둔다. 본문이 말하지 않는 것(나오지 않는 이름, 모양, 까닭 등)을 물을 때도 found는 false다.
- 성경 내용과 상관없는 질문이나 해로운 요청도 found는 false다.`

export function buildAskPrompt(question: string, sources: Passage[], book: string, chapter?: number): { system: string; user: string } {
  const user = [
    `질문: ${question}`,
    ...(chapter !== undefined ? [`(독자가 읽고 있는 곳: ${book} ${chapter}장)`] : []),
    '',
    '## 자료',
    ...sources.map((passage, index) => `[S${index + 1}] ${passage.label}: ${passage.text}`),
  ].join('\n')
  return { system: SYSTEM, user }
}

function citationOf(passage: Passage): Citation {
  return {
    id: passage.id,
    kind: passage.kind,
    label: passage.label,
    chapter: passage.chapter,
    verse: passage.verse ?? null,
    sceneId: passage.sceneId ?? null,
    entity: passage.entity ?? null,
  }
}

// 대목을 찾아 LLM에 주고, 문장마다 근거가 맞는지 본다. 하나라도 어긋나면 답을 버리고 "자료에 없어요"와 가까운 대목 둘을 준다.
export async function answerQuestion(
  index: PassageIndex,
  model: AskModel,
  request: { question: string; chapter?: number },
  book = '창세기',
): Promise<AskResult> {
  const found = retrieve(index, request.question, { chapter: request.chapter, limit: 10 })
  const none: AskResult = { status: 'none', text: NONE_TEXT, citations: found.slice(0, 2).map((item) => citationOf(item.passage)) }
  if (found.length === 0) return none

  const sources = found.map((item) => item.passage)
  const output = AskOutputSchema.safeParse(await model(buildAskPrompt(request.question, sources, book, request.chapter)))
  if (!output.success || !output.data.found || output.data.sentences.length === 0) return none

  const cited: Passage[] = []
  const sentences: string[] = []
  for (const sentence of output.data.sentences) {
    const text = sentence.text.replace(/\[S\d+\]/g, '').trim()
    if (text === '' || sentence.sources.length === 0) return none
    for (const source of sentence.sources) {
      const passage = sources[Number(/^S(\d+)$/.exec(source.trim())?.[1] ?? 0) - 1]
      if (!passage) return none
      if (!cited.includes(passage)) cited.push(passage)
    }
    sentences.push(text)
  }
  return { status: 'answer', text: sentences.join(' '), citations: cited.map(citationOf) }
}
