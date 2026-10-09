import { describe, expect, it } from 'vitest'
import { bookProgress, chapterRangeLabel } from './library.ts'
import type { Chapter, Scene } from './types.ts'

const scene = (id: string): Scene => ({
  id,
  verseStart: 1,
  verseEnd: 2,
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
})

const chapter = (number: number, scenes: Scene[]): Chapter => ({ chapter: number, verses: [], scenes, original: null, quiz: [] })

describe('bookProgress', () => {
  it('장·장면 수와 장면을 모두 읽은 장을 센다', () => {
    const chapters = [chapter(1, [scene('a'), scene('b')]), chapter(2, [scene('c')]), chapter(3, [scene('d')])]
    expect(bookProgress(chapters, new Set(['a', 'b', 'd']))).toEqual({
      firstChapter: 1,
      lastChapter: 3,
      chapterCount: 3,
      sceneCount: 4,
      readChapters: [1, 3],
    })
  })

  it('장면이 없는 장은 읽은 장으로 세지 않는다', () => {
    expect(bookProgress([chapter(1, [])], new Set()).readChapters).toEqual([])
  })
})

describe('chapterRangeLabel', () => {
  it('장 번호를 이어진 구간으로 줄여 쓴다', () => {
    expect(chapterRangeLabel([1, 2, 3, 5])).toBe('1~3, 5장')
    expect(chapterRangeLabel([5, 4])).toBe('4~5장')
    expect(chapterRangeLabel([4])).toBe('4장')
    expect(chapterRangeLabel([])).toBe('')
  })
})
