import { describe, expect, it } from 'vitest'
import { compareRefs, formatRef, localRef, parseRef, qualifyRef } from './refs.ts'

describe('parseRef', () => {
  it('책이 붙은 참조와 책 없는 참조를 읽는다', () => {
    expect(parseRef('genesis 4:1-5')).toEqual({ book: 'genesis', chapter: 4, verse: 1, verseEnd: 5 })
    expect(parseRef('4:1')).toEqual({ book: null, chapter: 4, verse: 1, verseEnd: 1 })
    expect(parseRef('psalms 119:105')).toEqual({ book: 'psalms', chapter: 119, verse: 105, verseEnd: 105 })
    expect(parseRef('1-samuel 3:10')?.book).toBe('1-samuel')
  })

  it('틀린 참조는 null', () => {
    expect(parseRef('nope 1:1')).toBeNull()
    expect(parseRef('4:5-3')).toBeNull()
    expect(parseRef('4')).toBeNull()
    expect(parseRef('0:1')).toBeNull()
  })
})

describe('formatRef', () => {
  it('저장용 id, 화면용 이름, 장:절만 쓴다', () => {
    const ref = parseRef('genesis 4:1-5')!
    expect(formatRef(ref)).toBe('genesis 4:1-5')
    expect(formatRef(ref, 'name')).toBe('창세기 4:1-5')
    expect(formatRef(ref, 'bare')).toBe('4:1-5')
    expect(formatRef(parseRef('2:7')!, 'name')).toBe('2:7')
  })
})

describe('책 붙이기와 떼기', () => {
  it('책 없는 참조에 책을 붙이고, 이미 붙은 것은 그대로 둔다', () => {
    expect(qualifyRef('2:7-8', 'genesis')).toBe('genesis 2:7-8')
    expect(qualifyRef('exodus 3:2', 'genesis')).toBe('exodus 3:2')
    expect(qualifyRef('엉터리', 'genesis')).toBeNull()
  })

  it('같은 책이면 떼고, 다른 책이면 null', () => {
    expect(localRef('genesis 4:1', 'genesis')).toBe('4:1')
    expect(localRef('4:1', 'genesis')).toBe('4:1')
    expect(localRef('exodus 3:2', 'genesis')).toBeNull()
  })
})

describe('compareRefs', () => {
  it('책 순서, 장, 절 순서로 비교한다', () => {
    const at = (text: string) => parseRef(text)!
    expect(compareRefs(at('genesis 4:1'), at('genesis 4:2'))).toBeLessThan(0)
    expect(compareRefs(at('genesis 5:1'), at('genesis 4:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('exodus 1:1'), at('genesis 50:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('4:1'), at('genesis 4:1'), 'genesis')).toBe(0)
  })
})
