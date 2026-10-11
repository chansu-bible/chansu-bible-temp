import { describe, expect, it } from 'vitest'
import { citationHint, citationPaths } from './canonForm.ts'
import { citationLabel, citationValueLabel, toStoredCitation } from './citations.ts'

describe('toStoredCitation', () => {
  it('세 모양의 인용을 저장 모양으로 바꾸고, 책 없는 인용에는 고른 책을 붙인다', () => {
    expect(toStoredCitation('genesis 2:7', null)).toBe('genesis 2:7')
    expect(toStoredCitation('창세기 2:7-8', null)).toBe('genesis 2:7-8')
    expect(toStoredCitation('  창세기   2:7 ', 'exodus')).toBe('genesis 2:7')
    expect(toStoredCitation('2:7', 'genesis')).toBe('genesis 2:7')
    expect(toStoredCitation('2:7', 'exodus')).toBe('exodus 2:7')
  })

  it('서버가 받는 표준 모양으로 쓴다', () => {
    expect(toStoredCitation('02:07', 'genesis')).toBe('genesis 2:7')
    expect(toStoredCitation('2:7-7', 'genesis')).toBe('genesis 2:7')
  })

  it('세 자리 장(시편 119편)과 숫자로 시작하는 책 id를 받는다', () => {
    expect(toStoredCitation('psalms 119:105', null)).toBe('psalms 119:105')
    expect(toStoredCitation('시편 119:105', null)).toBe('psalms 119:105')
    expect(toStoredCitation('119:105', 'psalms')).toBe('psalms 119:105')
    expect(toStoredCitation('3-john 1:4', null)).toBe('3-john 1:4')
    expect(toStoredCitation('요한삼서 1:4', null)).toBe('3-john 1:4')
  })

  it('붙일 책이 없거나, 그 책에 없는 장이거나, 인용이 아니면 null', () => {
    expect(toStoredCitation('2:7', null)).toBeNull()
    expect(toStoredCitation('51:1', 'genesis')).toBeNull()
    expect(toStoredCitation('출애굽기 41:1', null)).toBeNull()
    expect(toStoredCitation('genesys 2:7', 'genesis')).toBeNull()
    expect(toStoredCitation('2:8-7', 'genesis')).toBeNull()
    expect(toStoredCitation('3장', 'genesis')).toBeNull()
    expect(toStoredCitation('', 'genesis')).toBeNull()
  })
})

describe('citationLabel', () => {
  it('저장된 인용을 책 이름으로 보이고, 읽을 수 없는 글은 그대로 둔다', () => {
    expect(citationLabel('genesis 2:7')).toBe('창세기 2:7')
    expect(citationLabel('1-samuel 3:4-5')).toBe('사무엘상 3:4-5')
    expect(citationLabel('psalms 119:105')).toBe('시편 119:105')
    expect(citationLabel('2:7')).toBe('2:7')
    expect(citationLabel('3장')).toBe('3장')
    expect(citationLabel('')).toBe('')
  })
})

describe('citationValueLabel', () => {
  it('인용이 든 자리는 폼의 citation 필드(SECTIONS)에서 온다', () => {
    expect(citationPaths('characters')).toEqual(['facts.firstAppearance', 'facts.attire.*.from', 'facts.sources.*'])
    expect(citationPaths('places')).toEqual(['facts.firstAppearance', 'facts.sources.*'])
    expect(citationPaths('eras')).toEqual(['range.from', 'range.to', 'facts.sources.*'])
    expect(citationPaths('things')).toEqual(['facts.sources.*'])
  })

  it('제안 값(필드와 그 아래)에 든 인용을 책 이름으로 보인다', () => {
    const characters = citationPaths('characters')
    const eras = citationPaths('eras')
    expect(citationValueLabel(characters, 'facts.sources', ['genesis 2:10', 'genesis 2:11'])).toEqual(['창세기 2:10', '창세기 2:11'])
    expect(citationValueLabel(characters, 'facts.sources.1', 'genesis 2:11')).toBe('창세기 2:11')
    expect(citationValueLabel(characters, 'facts.firstAppearance', 'genesis 1:26')).toBe('창세기 1:26')
    expect(citationValueLabel(characters, 'facts.attire', [{ from: 'genesis 3:21', description: '가죽옷' }])).toEqual([
      { from: '창세기 3:21', description: '가죽옷' },
    ])
    expect(citationValueLabel(eras, 'range', { from: 'genesis 6:9', to: 'genesis 8:22' })).toEqual({
      from: '창세기 6:9',
      to: '창세기 8:22',
    })
    expect(citationValueLabel(eras, 'range.to', 'genesis 8:22')).toBe('창세기 8:22')
    // 필드의 위(facts 전체)를 바꾸는 제안도 그 안의 인용을 바꾼다
    expect(
      citationValueLabel(characters, 'facts', { firstAppearance: 'genesis 1:26', notes: 'genesis 2:7', sources: ['genesis 2:7'] }),
    ).toEqual({ firstAppearance: '창세기 1:26', notes: 'genesis 2:7', sources: ['창세기 2:7'] })
  })

  it('인용이 없는 필드와 모양이 다른 값은 그대로 둔다', () => {
    const characters = citationPaths('characters')
    expect(citationValueLabel(characters, 'design.hair', 'genesis 2:7')).toBe('genesis 2:7')
    expect(citationValueLabel(characters, 'facts.sources', 'genesis 2:7')).toBe('genesis 2:7')
    expect(citationValueLabel(characters, 'facts.sources', undefined)).toBeUndefined()
    expect(citationValueLabel(citationPaths('things'), 'facts.firstAppearance', 'genesis 2:7')).toBe('genesis 2:7')
  })
})

describe('citationHint', () => {
  it('책 없는 인용이 고른 책의 절임을 그 책 이름으로 보인다', () => {
    expect(citationHint('genesis')).toBe('예: 2:7(창세기), 창세기 2:7, genesis 2:7')
    expect(citationHint('exodus')).toBe('예: 2:7(출애굽기), 출애굽기 2:7, exodus 2:7')
    // 장이 하나뿐인 책은 1:1을 예로 든다
    expect(citationHint('obadiah')).toBe('예: 1:1(오바댜), 오바댜 1:1, obadiah 1:1')
    // 고른 책이 없으면 책 없는 인용을 받지 않는다
    expect(citationHint(null)).toBe('예: 창세기 2:7, genesis 2:7')
  })
})
