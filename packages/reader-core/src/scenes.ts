import type { Position } from './position.ts'
import { findSceneIndex } from './readingPosition.ts'
import type { Chapter } from './types.ts'

// 지금 위치의 앞(-1)이나 뒤(1) 장면의 첫 절. 장의 처음·끝이면 앞·뒤 장의 장면으로 넘어가고, 더 없으면 null이다.
export function adjacentScenePosition(chapters: Chapter[], position: Position, direction: 1 | -1): Position | null {
  const chapter = chapters.find((item) => item.chapter === position.chapter)
  if (!chapter || chapter.scenes.length === 0) return null
  const current = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const all = chapters.flatMap((item) => item.scenes.map((scene) => ({ chapter: item.chapter, scene })))
  const target = all[all.findIndex((item) => item.scene.id === current.id) + direction]
  return target ? { chapter: target.chapter, verse: target.scene.verseStart } : null
}
