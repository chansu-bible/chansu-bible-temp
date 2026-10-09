import { describe, expect, it } from 'vitest'
import { shortGloss, wordOccurrences } from './original.ts'
import type { Chapter, LexiconEntry } from './types.ts'

const word = (strong: string | null) => ({ text: 'א', strong, morph: 'HNcmsa', pos: '명사' })
const chapter = (number: number, original: Chapter['original']): Chapter => ({ chapter: number, verses: [], scenes: [], original, quiz: [] })
const entry = (korean: string | null, english: string): LexiconEntry => ({ lemma: 'אָב', xlit: 'ʼâb', english, korean, note: null, count: 1 })

describe('wordOccurrences', () => {
  it('원어 낱말이 나오는 절을 한 번씩 모은다', () => {
    const chapters = [
      chapter(1, [
        { verse: 1, words: [word('H1'), word('H2')] },
        { verse: 2, words: [word('H1'), word('H1')] },
      ]),
      chapter(2, null),
      chapter(3, [{ verse: 3, words: [word(null), word('H1')] }]),
    ]
    expect(wordOccurrences(chapters, 'H1')).toEqual([
      { chapter: 1, verse: 1 },
      { chapter: 1, verse: 2 },
      { chapter: 3, verse: 3 },
    ])
    expect(wordOccurrences(chapters, 'H9')).toEqual([])
  })
})

describe('shortGloss', () => {
  it('짧은 한국어 뜻은 그대로, 긴 것은 첫 갈래만 쓴다', () => {
    expect(shortGloss(entry('처음, 시작', 'the first'))).toBe('처음, 시작')
    expect(shortGloss(entry('아버지, 조상, 집안의 우두머리', 'father'))).toBe('아버지')
  })

  it('한국어 뜻이 없으면 영어 정의의 첫 갈래를 쓴다', () => {
    expect(shortGloss(entry(null, 'father, in a literal and immediate application'))).toBe('father')
    expect(shortGloss(entry(null, 'to say (used with great latitude)'))).toBe('to say')
    expect(shortGloss(entry(null, 'a primitive particle of uncertain meaning'))).toBe('a primitive par…')
    expect(shortGloss(undefined)).toBeNull()
  })
})
