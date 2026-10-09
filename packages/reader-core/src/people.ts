import { chapterOfReference, verseOfReference } from './refs.ts'
import type { Chapter, Character } from './types.ts'

// 어디까지 읽었는지: 읽은 장면이 있는 가장 뒤 장과 지금 읽는 장 가운데 큰 쪽
export function readUpToChapter(chapters: Chapter[], readSceneIds: ReadonlySet<string>, currentChapter: number): number {
  let upTo = currentChapter
  for (const chapter of chapters) {
    if (chapter.scenes.some((scene) => readSceneIds.has(scene.id))) upTo = Math.max(upTo, chapter.chapter)
  }
  return upTo
}

// upTo장까지 처음 나온 인물(인물 사전, 가계도). 처음 나온 순서로 늘어놓는다.
export function metCharacters(characters: Character[], upTo: number): Character[] {
  return characters
    .filter((character) => {
      const chapter = chapterOfReference(character.firstAppearance)
      return chapter > 0 && chapter <= upTo
    })
    .sort(
      (a, b) =>
        chapterOfReference(a.firstAppearance) - chapterOfReference(b.firstAppearance) ||
        verseOfReference(a.firstAppearance) - verseOfReference(b.firstAppearance),
    )
}
