import { describe, expect, it } from 'vitest'
import { firstSentence, groupRelations, paragraphs, yearsLabel } from './entity.ts'

describe('인물 카드 글', () => {
  it('요약은 notes의 첫 문장이다', () => {
    expect(firstSentence('들에서 아우를 쳐죽였다. 표를 받았다.')).toBe('들에서 아우를 쳐죽였다.')
    expect(firstSentence('\n첫 문단이다\n둘째 문단.')).toBe('첫 문단이다')
    expect(firstSentence('')).toBe('')
  })

  it('문단은 줄바꿈으로 나누고 빈 줄은 버린다', () => {
    expect(paragraphs('하나.\n\n 둘. \n')).toEqual(['하나.', '둘.'])
  })

  it('생몰년은 둘 다 있으면 나이까지, 태어난 해만 있으면 태어난 해만 쓴다', () => {
    expect(yearsLabel({ born: 130, died: 1042 })).toBe('창조 원년 기준 130년 ~ 1042년, 912세')
    expect(yearsLabel({ born: 622, died: null })).toBe('창조 원년 기준 622년에 태어남')
    expect(yearsLabel({ born: null, died: null })).toBeNull()
    expect(yearsLabel({ born: null, died: 930 })).toBeNull()
  })

  it('관계를 종류별로 묶는다', () => {
    expect(
      groupRelations([
        { type: '아내', to: 'eve' },
        { type: '아들', to: 'cain' },
        { type: '아들', to: 'abel' },
        { type: '아들', to: 'cain' },
      ]),
    ).toEqual([
      { type: '아내', ids: ['eve'] },
      { type: '아들', ids: ['cain', 'abel'] },
    ])
  })
})
