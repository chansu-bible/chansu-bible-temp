import { describe, expect, it } from 'vitest'
import type { Chapter, Scene, Verse } from '../content/types.ts'
import { findSceneIndex, initialPosition, nextPosition } from './readingPosition.ts'

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
  }
}

function verses(count: number): Verse[] {
  return Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: '', audio: null }))
}

function chapter(number: number, verseCount: number): Chapter {
  return { chapter: number, verses: verses(verseCount), scenes: [scene(`s${number}`, 1, verseCount)] }
}

const scenes = [scene('a', 1, 3), scene('b', 4, 7), scene('c', 8, 10)]
const chapters = [chapter(1, 3), chapter(2, 2), chapter(3, 0), chapter(4, 1)]

describe('findSceneIndex', () => {
  it('절이 들어 있는 장면의 순서를 준다', () => {
    expect(findSceneIndex(scenes, 1)).toBe(0)
    expect(findSceneIndex(scenes, 4)).toBe(1)
    expect(findSceneIndex(scenes, 7)).toBe(1)
    expect(findSceneIndex(scenes, 10)).toBe(2)
  })

  it('어느 장면에도 없는 절이면 첫 장면이다', () => {
    expect(findSceneIndex(scenes, 11)).toBe(0)
    expect(findSceneIndex([], 1)).toBe(0)
  })
})

describe('nextPosition', () => {
  it('장 안에서는 다음 절이다', () => {
    expect(nextPosition(chapters, 1, 2)).toEqual({ chapter: 1, verse: 3 })
  })

  it('장의 마지막 절 다음은 다음 장의 첫 절이다', () => {
    expect(nextPosition(chapters, 1, 3)).toEqual({ chapter: 2, verse: 1 })
  })

  it('절이 없는 장은 건너뛴다', () => {
    expect(nextPosition(chapters, 2, 2)).toEqual({ chapter: 4, verse: 1 })
  })

  it('마지막 장의 마지막 절 다음은 없다', () => {
    expect(nextPosition(chapters, 4, 1)).toBeNull()
  })

  it('모르는 장이나 절이면 없다', () => {
    expect(nextPosition(chapters, 9, 1)).toBeNull()
    expect(nextPosition(chapters, 1, 9)).toBeNull()
  })
})

describe('initialPosition', () => {
  it('저장된 위치가 없으면 첫 장의 첫 절이다', () => {
    expect(initialPosition(chapters, null)).toEqual({ chapter: 1, verse: 1 })
  })

  it('저장된 위치가 있으면 그 절이다', () => {
    expect(initialPosition(chapters, { chapter: 2, verse: 2 })).toEqual({ chapter: 2, verse: 2 })
  })

  it('저장된 절이 그 장에 없으면 그 장의 첫 절이다', () => {
    expect(initialPosition(chapters, { chapter: 2, verse: 9 })).toEqual({ chapter: 2, verse: 1 })
  })

  it('저장된 장이 없으면 첫 장의 첫 절이다', () => {
    expect(initialPosition(chapters, { chapter: 9, verse: 2 })).toEqual({ chapter: 1, verse: 1 })
  })
})
