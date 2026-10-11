import { describe, expect, it } from 'vitest'
import { countMarks, isEmptyMark, markId, parseMark, sortMarks, type Mark } from './marks.ts'

const mark = (overrides: Partial<Mark>): Mark => ({
  book: 'genesis',
  chapter: 4,
  verse: 9,
  color: null,
  note: '',
  bookmark: false,
  ...overrides,
})

describe('밑줄과 메모', () => {
  it('절마다 하나의 id를 쓴다', () => {
    expect(markId('genesis', 4, 9)).toBe('genesis:4:9')
  })

  it('색도 메모도 즐겨찾기도 없으면 빈 기록이다', () => {
    expect(isEmptyMark(mark({}))).toBe(true)
    expect(isEmptyMark(mark({ note: '   ' }))).toBe(true)
    expect(isEmptyMark(mark({ color: 'green' }))).toBe(false)
    expect(isEmptyMark(mark({ bookmark: true }))).toBe(false)
  })

  it('저장된 값을 읽고, 모르는 색은 버린다', () => {
    expect(parseMark({ book: 'genesis', chapter: 4, verse: 9, color: 'red', note: '메모', bookmark: 1 })).toEqual(
      mark({ note: '메모' }),
    )
    expect(parseMark({ chapter: 'x' })).toBeNull()
  })

  it('밑줄·메모·즐겨찾기를 센다', () => {
    const marks = [mark({ color: 'yellow', note: '가' }), mark({ verse: 10, bookmark: true }), mark({ verse: 11, color: 'blue' })]
    expect(countMarks(marks)).toEqual({ highlights: 2, notes: 1, bookmarks: 1 })
  })

  it('장과 절 순서로 늘어놓는다', () => {
    const sorted = sortMarks([mark({ chapter: 5, verse: 1 }), mark({ chapter: 4, verse: 10 }), mark({ chapter: 4, verse: 2 })])
    expect(sorted.map((item) => `${item.chapter}:${item.verse}`)).toEqual(['4:2', '4:10', '5:1'])
  })
})
