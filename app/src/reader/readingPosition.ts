import type { Chapter, Scene, Verse } from '../content/types.ts'
import type { Position } from './position.ts'

// 절이 들어 있는 장면의 순서. 맞는 장면이 없으면 첫 장면으로 본다.
export function findSceneIndex(scenes: Scene[], verse: number): number {
  return Math.max(
    0,
    scenes.findIndex((scene) => verse >= scene.verseStart && verse <= scene.verseEnd),
  )
}

export function startOfChapter(chapter: Chapter): Position {
  return { chapter: chapter.chapter, verse: chapter.verses[0]?.verse ?? 1 }
}

// 저장된 위치가 지금 묶음에 있으면 그대로, 아니면 그 장(또는 첫 장)의 처음이다.
export function initialPosition(chapters: Chapter[], saved: Position | null): Position {
  const chapter = chapters.find((c) => c.chapter === saved?.chapter)
  if (!chapter || !saved) return startOfChapter(chapters[0])
  return chapter.verses.some((v) => v.verse === saved.verse) ? saved : startOfChapter(chapter)
}

// 다음 절. 장의 끝이면 절이 있는 다음 장의 첫 절, 더 없으면 null이다.
export function nextPosition(chapters: Chapter[], chapterNumber: number, verseNumber: number): Position | null {
  const chapterIndex = chapters.findIndex((c) => c.chapter === chapterNumber)
  if (chapterIndex < 0) return null
  const verses = chapters[chapterIndex].verses
  const verseIndex = verses.findIndex((v) => v.verse === verseNumber)
  if (verseIndex < 0) return null
  if (verseIndex + 1 < verses.length) return { chapter: chapterNumber, verse: verses[verseIndex + 1].verse }

  const following = chapters.slice(chapterIndex + 1).find((c) => c.verses.length > 0)
  return following ? startOfChapter(following) : null
}

export function verseAt(chapters: Chapter[], position: Position): Verse | undefined {
  return chapters.find((c) => c.chapter === position.chapter)?.verses.find((v) => v.verse === position.verse)
}
