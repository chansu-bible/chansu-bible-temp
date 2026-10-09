import { describe, expect, it } from 'vitest'
import {
  BOOKS,
  bookByName,
  bookOrder,
  chapterStem,
  fallbackSceneIdOf,
  findBook,
  getBook,
  isBookId,
  parseChapterStem,
  parseSceneId,
  quizQuestionId,
  sceneIdOf,
  verseAudioName,
} from './books.ts'

describe('BOOKS', () => {
  it('66권, 구약 39권 929장, 신약 27권 260장이다', () => {
    expect(BOOKS).toHaveLength(66)
    const old = BOOKS.filter((book) => book.testament === 'old')
    const fresh = BOOKS.filter((book) => book.testament === 'new')
    expect(old).toHaveLength(39)
    expect(fresh).toHaveLength(27)
    expect(old.reduce((sum, book) => sum + book.chapters, 0)).toBe(929)
    expect(fresh.reduce((sum, book) => sum + book.chapters, 0)).toBe(260)
  })

  it('id, 이름, OSIS 코드가 겹치지 않는다', () => {
    for (const key of ['id', 'name', 'osis'] as const) {
      expect(new Set(BOOKS.map((book) => book[key])).size).toBe(66)
    }
    for (const book of BOOKS) expect(book.id).toMatch(/^([1-3]-)?[a-z]+(-[a-z]+)*$/)
  })

  it('책을 찾고 순서를 안다', () => {
    expect(getBook('genesis').name).toBe('창세기')
    expect(findBook('nope')).toBeUndefined()
    expect(isBookId('1-samuel')).toBe(true)
    expect(isBookId('samuel')).toBe(false)
    expect(bookByName('요한계시록')?.id).toBe('revelation')
    expect(bookOrder('genesis')).toBe(0)
    expect(bookOrder('revelation')).toBe(65)
    expect(() => getBook('nope' as never)).toThrow('알 수 없는 책')
  })
})

describe('id와 파일 이름', () => {
  it('장 번호를 그 책의 장 수 자리수로 채운다', () => {
    expect(chapterStem('genesis', 4)).toBe('genesis-04')
    expect(chapterStem('psalms', 1)).toBe('psalms-001')
    expect(chapterStem('psalms', 119)).toBe('psalms-119')
    expect(chapterStem('obadiah', 1)).toBe('obadiah-1')
    expect(() => chapterStem('genesis', 51)).toThrow('창세기에는 51장이 없습니다')
  })

  it('장면, 대체 장면, 절 낭독, 퀴즈 id는 지금 창세기 이름과 같다', () => {
    expect(sceneIdOf('genesis', 4, 3)).toBe('genesis-04-03')
    expect(fallbackSceneIdOf('genesis', 6)).toBe('genesis-06-00')
    expect(verseAudioName('genesis', 1, 1)).toBe('genesis-01-001.mp3')
    expect(quizQuestionId('genesis', 4, 1)).toBe('genesis-04-q1')
    expect(sceneIdOf('1-samuel', 1, 2)).toBe('1-samuel-01-02')
  })

  it('오른쪽부터 읽어 책과 장을 되찾는다', () => {
    expect(parseChapterStem('genesis-04')).toEqual({ book: 'genesis', chapter: 4 })
    expect(parseChapterStem('1-samuel-01')).toEqual({ book: '1-samuel', chapter: 1 })
    expect(parseChapterStem('genesis-4')).toBeNull()
    expect(parseChapterStem('genesis-51')).toBeNull()
    expect(parseChapterStem('nope-01')).toBeNull()
    expect(parseSceneId('genesis-04-03')).toEqual({ book: 'genesis', chapter: 4, index: 3 })
    expect(parseSceneId('psalms-119-02')).toEqual({ book: 'psalms', chapter: 119, index: 2 })
    expect(parseSceneId('genesis-04')).toBeNull()
  })
})
