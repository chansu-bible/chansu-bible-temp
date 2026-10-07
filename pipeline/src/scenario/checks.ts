import type { Canon, Gloss, Scene, SourceChapter } from '../schema.ts'

// 낱말 풀이 하나의 문제. 절이 장면 범위 밖이거나 낱말이 그 절 본문에 글자 그대로 없으면 이유를, 괜찮으면 null.
// 앱이 본문에서 그 낱말을 찾아 표시하므로 build 단계의 checkGlossary와 같은 기준이다.
export function glossaryProblem(
  gloss: Gloss,
  range: { verseStart: number; verseEnd: number },
  chapter: SourceChapter,
): string | null {
  if (gloss.word.trim() === '' || gloss.meaning.trim() === '') return `낱말 풀이에 빈 낱말이나 뜻이 있습니다 (${gloss.verse}절)`
  if (gloss.verse < range.verseStart || gloss.verse > range.verseEnd) {
    return `낱말 '${gloss.word}'의 절(${gloss.verse})이 장면 범위 밖입니다`
  }
  const text = chapter.verses.find((verse) => verse.verse === gloss.verse)?.text ?? ''
  if (!text.includes(gloss.word)) return `낱말 '${gloss.word}'이 ${chapter.chapter}:${gloss.verse} 본문에 없습니다`
  return null
}

export type CanonIds = { characters: Set<string>; places: Set<string>; eras: Set<string> }

export function canonIds(canon: Canon): CanonIds {
  return {
    characters: new Set(canon.characters.map((item) => item.id)),
    places: new Set(canon.places.map((item) => item.id)),
    eras: new Set(canon.eras.map((item) => item.id)),
  }
}

// 장면이 가리키는 설정집 id 가운데 (승인된) 설정집에 없는 것
export function refProblems(scene: Pick<Scene, 'visual' | 'placeId' | 'eraId'>, ids: CanonIds): string[] {
  const problems: string[] = []
  for (const id of scene.visual.characters) {
    if (!ids.characters.has(id)) problems.push(`등장인물 ${id}가 승인된 설정집 인물에 없습니다`)
  }
  if (scene.placeId !== null && !ids.places.has(scene.placeId)) {
    problems.push(`장소 ${scene.placeId}가 승인된 설정집 장소에 없습니다`)
  }
  if (scene.eraId !== null && !ids.eras.has(scene.eraId)) {
    problems.push(`시대 ${scene.eraId}가 승인된 설정집 시대에 없습니다`)
  }
  return problems
}
