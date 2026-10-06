import { describe, expect, it } from 'vitest'
import type { Gloss } from '../content/types.ts'
import { splitByGlosses } from './glossary.ts'

const gloss = (word: string): Gloss => ({ verse: 2, word, meaning: `${word}의 뜻` })

describe('splitByGlosses', () => {
  it('낱말이 없으면 본문 전체가 한 조각이다', () => {
    expect(splitByGlosses('태초에 하나님이', [])).toEqual([{ text: '태초에 하나님이' }])
  })

  it('풀이한 낱말을 본문에서 찾아 조각으로 나눈다', () => {
    const parts = splitByGlosses('땅이 혼돈하고 공허하며 흑암이 깊음 위에', [gloss('흑암'), gloss('혼돈하고 공허하며')])
    expect(parts).toEqual([
      { text: '땅이 ' },
      { text: '혼돈하고 공허하며', gloss: gloss('혼돈하고 공허하며') },
      { text: ' ' },
      { text: '흑암', gloss: gloss('흑암') },
      { text: '이 깊음 위에' },
    ])
  })

  it('같은 낱말이 여러 번 나오면 처음 나온 곳만 표시한다', () => {
    const parts = splitByGlosses('빛을 낮이라 칭하시고 어두움을 밤이라 칭하시고', [gloss('칭하시고')])
    expect(parts.filter((part) => part.gloss)).toHaveLength(1)
    expect(parts.map((part) => part.text).join('')).toBe('빛을 낮이라 칭하시고 어두움을 밤이라 칭하시고')
  })

  it('본문에 없는 낱말은 건너뛴다', () => {
    expect(splitByGlosses('태초에', [gloss('없음')])).toEqual([{ text: '태초에' }])
  })

  it('겹치는 낱말은 먼저 나오는 것만 표시한다', () => {
    const parts = splitByGlosses('선악을 알게 하는 나무도 있더라', [gloss('선악을 알게 하는 나무'), gloss('나무')])
    expect(parts.filter((part) => part.gloss).map((part) => part.text)).toEqual(['선악을 알게 하는 나무'])
  })
})
