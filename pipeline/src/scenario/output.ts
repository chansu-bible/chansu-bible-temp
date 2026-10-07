import { z } from 'zod'
import { HistoryNoteSchema, VerdictSchema, type Scene } from '../schema.ts'

// scenario 단계의 LLM 출력. 장면에서 저장용 필드(id, chapter, commentary, image, review)를 뺀 모양이다.
// 구조화 출력 제약 때문에 모든 필드가 필수다. 빈 값은 "", [], null로 받고, 걸러 내기는 assemble.ts가 한다.
export const ScenarioSceneSchema = z.object({
  verseStart: z.number().int(),
  verseEnd: z.number().int(),
  title: z.string(),
  explanation: z.array(z.string()),
  history: z.array(HistoryNoteSchema),
  glossary: z.array(z.object({ verse: z.number().int(), word: z.string(), meaning: z.string() })),
  visual: z.object({ description: z.string(), shot: z.string(), characters: z.array(z.string()) }),
  placeId: z.string().nullable(),
  eraId: z.string().nullable(),
})

export const ScenarioOutputSchema = z.object({ scenes: z.array(ScenarioSceneSchema) })

// 다시 쓰기: 장면 하나
export const ReviseOutputSchema = z.object({ scene: ScenarioSceneSchema })

// 글 검수 판정. 저장하는 VerdictSchema와 같은 모양이다.
export const TextVerdictSchema = VerdictSchema

export type ScenarioScene = z.infer<typeof ScenarioSceneSchema>
export type ScenarioOutput = z.infer<typeof ScenarioOutputSchema>
export type ReviseOutput = z.infer<typeof ReviseOutputSchema>
export type TextVerdict = z.infer<typeof TextVerdictSchema>

// 저장된 장면을 출력 모양으로 바꾼다. 본보기와 다시 쓰기·검수 프롬프트에 넣는다.
// glossaryLimit을 주면 낱말 풀이를 앞에서 그만큼만 남긴다.
export function toScenarioScene(scene: Scene, glossaryLimit?: number): ScenarioScene {
  return {
    verseStart: scene.verseStart,
    verseEnd: scene.verseEnd,
    title: scene.title,
    explanation: scene.explanation,
    history: scene.history,
    glossary: glossaryLimit === undefined ? scene.glossary : scene.glossary.slice(0, glossaryLimit),
    visual: {
      description: scene.visual.description,
      shot: scene.visual.shot ?? '',
      characters: scene.visual.characters,
    },
    placeId: scene.placeId,
    eraId: scene.eraId,
  }
}
