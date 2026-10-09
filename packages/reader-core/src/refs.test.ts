import { describe, expect, it } from 'vitest'
import {
  chapterOfReference,
  compareRefs,
  displayRange,
  displayRef,
  formatRef,
  localRef,
  parseRef,
  qualifyRef,
  verseOfReference,
} from './refs.ts'

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

  it('앞뒤 공백은 무시하고, 책 id는 소문자만 받는다', () => {
    expect(parseRef(' 4:1 ')).toEqual({ book: null, chapter: 4, verse: 1, verseEnd: 1 })
    expect(parseRef('Genesis 4:1')).toBeNull()
  })

  it('책이 붙은 참조는 그 책에 있는 장이어야 한다', () => {
    expect(parseRef('genesis 50:26')?.chapter).toBe(50)
    expect(parseRef('genesis 51:1')).toBeNull()
    expect(parseRef('obadiah 1:21')?.chapter).toBe(1)
    expect(parseRef('obadiah 2:1')).toBeNull()
  })

  it('책 없는 참조는 장 수를 볼 책이 없어서 그대로 읽는다', () => {
    expect(parseRef('51:1')).toEqual({ book: null, chapter: 51, verse: 1, verseEnd: 1 })
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

  it('책이 없으면 어느 모양이든 장:절만 쓴다', () => {
    expect(formatRef(parseRef('2:7')!, 'id')).toBe('2:7')
  })
})

describe('책 붙이기와 떼기', () => {
  it('책 없는 참조에 책을 붙이고, 이미 붙은 것은 그대로 둔다', () => {
    expect(qualifyRef('2:7-8', 'genesis')).toBe('genesis 2:7-8')
    expect(qualifyRef('exodus 3:2', 'genesis')).toBe('exodus 3:2')
    expect(qualifyRef('엉터리', 'genesis')).toBeNull()
  })

  it('붙인 책에 없는 장이면 null', () => {
    expect(qualifyRef('50:26', 'genesis')).toBe('genesis 50:26')
    expect(qualifyRef('51:1', 'genesis')).toBeNull()
    expect(qualifyRef('1:21', 'obadiah')).toBe('obadiah 1:21')
    expect(qualifyRef('2:1', 'obadiah')).toBeNull()
  })

  it('같은 책이면 떼고, 다른 책이면 null', () => {
    expect(localRef('genesis 4:1', 'genesis')).toBe('4:1')
    expect(localRef('4:1', 'genesis')).toBe('4:1')
    expect(localRef('exodus 3:2', 'genesis')).toBeNull()
  })

  it('읽을 수 없는 글도 null', () => {
    expect(localRef('엉터리', 'genesis')).toBeNull()
    expect(localRef('', 'genesis')).toBeNull()
  })
})

describe('displayRef', () => {
  it('이 책의 절은 책 없이 보인다', () => {
    expect(displayRef('genesis 3:21', 'genesis')).toBe('3:21')
    expect(displayRef('genesis 4:1-5', 'genesis')).toBe('4:1-5')
  })

  it('다른 책의 절은 책 이름을 붙여 보인다', () => {
    expect(displayRef('genesis 3:21', 'exodus')).toBe('창세기 3:21')
    expect(displayRef('genesis 4:1-5', 'exodus')).toBe('창세기 4:1-5')
    expect(displayRef('1-samuel 3:10', 'genesis')).toBe('사무엘상 3:10')
  })

  it('책 없는 참조는 이 책의 것으로 본다', () => {
    expect(displayRef('4:1', 'genesis')).toBe('4:1')
    expect(displayRef('4:1-5', 'exodus')).toBe('4:1-5')
  })

  it('읽을 수 없는 글은 그대로 둔다', () => {
    expect(displayRef('엉터리', 'genesis')).toBe('엉터리')
    expect(displayRef('', 'genesis')).toBe('')
    // 그 책에 없는 장도 읽을 수 없는 글이다.
    expect(displayRef('genesis 51:1', 'exodus')).toBe('genesis 51:1')
  })
})

describe('displayRange', () => {
  it('두 끝이 모두 이 책 안이면 책 없이 보인다', () => {
    expect(displayRange('genesis 2:4', 'genesis 3:24', 'genesis')).toBe('2:4~3:24')
    expect(displayRange('genesis 2:4-5', 'genesis 3:24', 'genesis')).toBe('2:4-5~3:24')
  })

  it('두 끝이 같은 다른 책 안이면 책 이름을 앞에 한 번만 쓴다', () => {
    expect(displayRange('genesis 2:4', 'genesis 3:24', 'exodus')).toBe('창세기 2:4~3:24')
    expect(displayRange('genesis 2:4-5', 'genesis 3:24', 'leviticus')).toBe('창세기 2:4-5~3:24')
  })

  it('두 끝이 서로 다른 책이면 끝마다 책 이름을 쓴다', () => {
    expect(displayRange('genesis 50:26', 'exodus 1:1', 'leviticus')).toBe('창세기 50:26~출애굽기 1:1')
    // 한 끝이 이 책이어도 이름을 써서 거꾸로 읽히지 않게 한다.
    expect(displayRange('genesis 50:26', 'exodus 1:1', 'exodus')).toBe('창세기 50:26~출애굽기 1:1')
    expect(displayRange('genesis 50:26', 'exodus 1:1', 'genesis')).toBe('창세기 50:26~출애굽기 1:1')
  })

  it('책 없는 끝은 이 책의 절로 보고 가른다', () => {
    expect(displayRange('2:4', '3:24', 'genesis')).toBe('2:4~3:24')
    expect(displayRange('2:4', 'genesis 3:24', 'genesis')).toBe('2:4~3:24')
    expect(displayRange('2:4', 'genesis 3:24', 'exodus')).toBe('출애굽기 2:4~창세기 3:24')
    expect(displayRange('genesis 50:26', '1:1', 'exodus')).toBe('창세기 50:26~출애굽기 1:1')
  })

  it('한 끝이라도 읽을 수 없으면 끝마다 displayRef로 보인다', () => {
    expect(displayRange('엉터리', 'genesis 3:24', 'genesis')).toBe('엉터리~3:24')
    expect(displayRange('genesis 2:4', '엉터리', 'exodus')).toBe('창세기 2:4~엉터리')
    expect(displayRange('엉터리', '또 엉터리', 'genesis')).toBe('엉터리~또 엉터리')
    expect(displayRange('genesis 2:4', 'genesis 51:1', 'genesis')).toBe('2:4~genesis 51:1')
  })
})

describe('compareRefs', () => {
  const at = (text: string) => parseRef(text)!

  it('책 순서, 장, 절 순서로 비교한다', () => {
    expect(compareRefs(at('genesis 4:1'), at('genesis 4:2'))).toBeLessThan(0)
    expect(compareRefs(at('genesis 5:1'), at('genesis 4:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('exodus 1:1'), at('genesis 50:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('4:1'), at('genesis 4:1'), 'genesis')).toBe(0)
  })

  it('시작 위치만 비교하고 끝 절은 보지 않는다', () => {
    expect(compareRefs(at('genesis 4:1-5'), at('genesis 4:1'))).toBe(0)
    expect(compareRefs(at('genesis 4:1-5'), at('genesis 4:2'))).toBeLessThan(0)
  })

  it('책 없는 참조는 fallback 책으로 보고, 책 없는 참조끼리는 같은 책으로 친다', () => {
    expect(compareRefs(at('exodus 1:1'), at('50:1'), 'genesis')).toBeGreaterThan(0)
    expect(compareRefs(at('4:1'), at('4:2'))).toBeLessThan(0)
    expect(compareRefs(at('5:1'), at('4:26'))).toBeGreaterThan(0)
  })

  it('한쪽만 책이 있는데 fallback이 없으면 오류를 던진다', () => {
    const message = '책이 있는 참조와 책 없는 참조를 비교하려면 fallback 책이 필요합니다'
    expect(() => compareRefs(at('genesis 4:1'), at('4:1'))).toThrow(message)
    expect(() => compareRefs(at('4:1'), at('genesis 4:1'))).toThrow(message)
  })
})

describe('장과 절만 꺼내기', () => {
  it('참조에서 장과 절을 꺼내고, 읽을 수 없으면 0이다', () => {
    expect(chapterOfReference('4:17')).toBe(4)
    expect(verseOfReference('4:17-20')).toBe(17)
    expect(chapterOfReference('')).toBe(0)
    expect(verseOfReference('엉터리')).toBe(0)
  })

  it('책이 붙어 있어도 책은 보지 않는다', () => {
    expect(chapterOfReference('genesis 4:17')).toBe(4)
    expect(verseOfReference('exodus 3:2')).toBe(2)
  })
})
