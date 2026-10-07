import type { Canon, Gloss, Scene, SourceChapter } from '../schema.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { canonIds, glossaryProblem, type CanonIds } from './checks.ts'
import type { ScenarioOutput, ScenarioScene } from './output.ts'

export type AssembleResult = { scenes: Scene[]; warnings: string[]; problems: string[] }

export function sceneId(chapter: number, index: number): string {
  return `genesis-${String(chapter).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
}

// 출력 장면 하나를 저장할 모양으로 다듬는다. 고칠 수 있는 문제는 빼거나 null로 하고 warnings에 적는다.
function clean(
  chapter: SourceChapter,
  out: ScenarioScene,
  range: { verseStart: number; verseEnd: number },
  ids: CanonIds,
  id: string,
  warnings: string[],
): Pick<Scene, 'title' | 'explanation' | 'history' | 'glossary' | 'visual' | 'placeId' | 'eraId'> {
  const warn = (text: string) => warnings.push(`${id}: ${text}`)

  const glossary: Gloss[] = []
  for (const gloss of out.glossary) {
    const problem = glossaryProblem(gloss, range, chapter)
    if (problem) warn(`${problem}. 뺍니다`)
    else glossary.push({ verse: gloss.verse, word: gloss.word, meaning: gloss.meaning.trim() })
  }

  const characters: string[] = []
  for (const character of out.visual.characters) {
    if (!ids.characters.has(character)) warn(`등장인물 ${character}는 승인된 인물이 아니라 뺍니다`)
    else if (!characters.includes(character)) characters.push(character)
  }

  const ref = (value: string | null, known: Set<string>, label: string): string | null => {
    const trimmed = value?.trim() ?? ''
    if (trimmed === '') return null
    if (known.has(trimmed)) return trimmed
    warn(`${label} ${trimmed}는 승인된 ${label}가 아니라 null로 둡니다`)
    return null
  }

  const shot = out.visual.shot.trim()
  return {
    title: out.title.trim(),
    explanation: out.explanation.map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph !== ''),
    history: out.history,
    glossary,
    visual: { description: out.visual.description.trim(), characters, ...(shot ? { shot } : {}) },
    placeId: ref(out.placeId, ids.places, '장소'),
    eraId: ref(out.eraId, ids.eras, '시대'),
  }
}

// 출력 장면을 저장할 Scene으로 바꾼다. id는 genesis-CC-NN(순서대로)이고 상태는 draft다.
// 절 범위 문제는 고쳐 쓰게 하려고 problems에 따로 둔다. canon은 승인된 항목만 넘긴다.
export function assembleScenes(chapter: SourceChapter, output: ScenarioOutput, canon: Canon): AssembleResult {
  const ids = canonIds(canon)
  const warnings: string[] = []
  const scenes: Scene[] = output.scenes.map((out, index) => {
    const id = sceneId(chapter.chapter, index)
    const range = { verseStart: out.verseStart, verseEnd: out.verseEnd }
    return {
      id,
      chapter: chapter.chapter,
      ...range,
      commentary: null,
      ...clean(chapter, out, range, ids, id, warnings),
      image: null,
      review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    }
  })
  const problems = findCoverageProblems(scenes, chapter.verses.length)
  return { scenes, warnings, problems }
}

// 다시 쓴 장면 하나를 기존 장면 자리에 맞춘다. id, 절 범위, image, review는 기존 값을 둔다.
// attempts는 그대로 두고 호출하는 쪽이 올린다.
export function assembleRevision(
  chapter: SourceChapter,
  before: Scene,
  revised: ScenarioScene,
  canon: Canon,
): { scene: Scene; warnings: string[] } {
  const warnings: string[] = []
  if (revised.verseStart !== before.verseStart || revised.verseEnd !== before.verseEnd) {
    warnings.push(
      `${before.id}: 다시 쓴 장면의 절 범위(${revised.verseStart}~${revised.verseEnd})가 달라 기존 범위(${before.verseStart}~${before.verseEnd})를 둡니다`,
    )
  }
  const range = { verseStart: before.verseStart, verseEnd: before.verseEnd }
  const scene: Scene = {
    id: before.id,
    chapter: before.chapter,
    ...range,
    commentary: before.commentary,
    ...clean(chapter, revised, range, canonIds(canon), before.id, warnings),
    image: before.image,
    review: { ...before.review },
  }
  return { scene, warnings }
}
