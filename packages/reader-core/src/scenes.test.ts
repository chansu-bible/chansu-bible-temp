import { describe, expect, it } from 'vitest'
import { adjacentScenePosition } from './scenes.ts'
import type { Chapter, Scene } from './types.ts'

function scene(id: string, verseStart: number, verseEnd: number): Scene {
  return {
    id,
    verseStart,
    verseEnd,
    title: id,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    placeId: null,
    characters: [],
    images: {},
    reviewStatus: 'none',
    audio: null,
    audioMs: null,
  }
}

function verses(count: number) {
  return Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: '', audio: null }))
}

const chapters: Chapter[] = [
  { chapter: 1, original: null, quiz: [], verses: verses(4), scenes: [scene('a', 1, 2), scene('b', 3, 4)] },
  { chapter: 2, original: null, quiz: [], verses: verses(2), scenes: [scene('c', 1, 2)] },
]

describe('adjacentScenePosition', () => {
  it('같은 장의 다음 장면 첫 절로 간다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 1 }, 1)).toEqual({ chapter: 1, verse: 3 })
  })

  it('장의 마지막 장면 다음은 다음 장의 첫 장면이다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 4 }, 1)).toEqual({ chapter: 2, verse: 1 })
  })

  it('앞 장면은 앞 장으로도 넘어간다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 2, verse: 2 }, -1)).toEqual({ chapter: 1, verse: 3 })
  })

  it('처음 장면의 앞과 마지막 장면의 뒤는 없다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 1 }, -1)).toBeNull()
    expect(adjacentScenePosition(chapters, { chapter: 2, verse: 1 }, 1)).toBeNull()
  })

  it('모르는 장이면 null이다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 9, verse: 1 }, 1)).toBeNull()
  })
})
