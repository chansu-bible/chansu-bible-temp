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
// 0장으로 읽히는 인물은 어느 장에서나 이미 만난 인물이라 언제나 넣고 맨 앞에 둔다.
// - 뒤 책 묶음은 앞 책 인용에 책 이름을 붙이고("창세기 2:7"), chapterOfReference는 이를 0으로 읽는다.
// - 빈 글이나 읽을 수 없는 firstAppearance도 0장이라 만난 인물로 본다. 검증을 거친 묶음에는 이런 글이 없다.
// 0장 인물끼리는 견줄 장·절이 없어 받은 순서로 남는다. Array.prototype.sort가 안정 정렬이라서다.
export function metCharacters(characters: Character[], upTo: number): Character[] {
  return characters
    .filter((character) => chapterOfReference(character.firstAppearance) <= upTo)
    .sort(
      (a, b) =>
        chapterOfReference(a.firstAppearance) - chapterOfReference(b.firstAppearance) ||
        verseOfReference(a.firstAppearance) - verseOfReference(b.firstAppearance),
    )
}
