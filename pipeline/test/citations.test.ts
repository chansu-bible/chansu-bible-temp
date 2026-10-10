import { describe, expect, it } from 'vitest'
import { CITATION_FIELDS, itemCitations, mapItemCitations } from '../src/canon/citations.ts'
import type { Character, Era, Place, Thing } from '../src/schema.ts'

const adam: Character = {
  id: 'adam',
  name: '아담',
  aliases: [],
  status: 'approved',
  facts: {
    firstAppearance: 'genesis 2:7',
    gender: '남',
    years: { born: 0, died: 930 },
    relations: [],
    attire: [
      { from: 'genesis 3:21', description: '가죽옷' },
      { from: 'exodus 1:1', description: '뒤 책의 옷' },
    ],
    // 글 속의 절 번호는 인용 필드가 아니다
    notes: '흙으로 지어졌다(genesis 2:7).',
    sources: ['genesis 2:7', 'exodus 1:1'],
  },
  design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
  refs: [],
}

const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: 'genesis 2:8', description: '동산', sources: ['genesis 2:8', 'genesis 2:10-14'] },
  location: { lat: null, lng: null, certainty: '불명' },
  design: { landscape: '', notes: '' },
}

const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'approved',
  range: { from: 'genesis 6:9', to: 'genesis 8:22' },
  years: { from: 1656, to: 1657 },
  facts: { description: '', present: ['방주(genesis 6:14)'], absent: [], sources: ['genesis 7:11'] },
  design: { visualNotes: '' },
}

const ark: Thing = {
  id: 'ark',
  name: '방주',
  aliases: [],
  status: 'approved',
  facts: { description: '잣나무 배', details: [], sources: ['genesis 6:14-16'] },
  design: { visualNotes: '' },
}

describe('설정집 인용 필드', () => {
  it('종류마다 인용이 든 필드를 한 곳에 둔다', () => {
    expect(CITATION_FIELDS).toEqual({
      characters: ['facts.firstAppearance', 'facts.attire', 'facts.sources'],
      places: ['facts.firstAppearance', 'facts.sources'],
      eras: ['range.from', 'range.to', 'facts.sources'],
      things: ['facts.sources'],
    })
  })

  it('항목의 인용을 필드 차례대로 모은다', () => {
    expect(itemCitations('characters', adam)).toEqual(['genesis 2:7', 'genesis 3:21', 'exodus 1:1', 'genesis 2:7', 'exodus 1:1'])
    expect(itemCitations('places', eden)).toEqual(['genesis 2:8', 'genesis 2:8', 'genesis 2:10-14'])
    expect(itemCitations('eras', flood)).toEqual(['genesis 6:9', 'genesis 8:22', 'genesis 7:11'])
    expect(itemCitations('things', ark)).toEqual(['genesis 6:14-16'])
  })

  it('인용마다 필드와 함께 넘기고 돌려준 글로 바꾼 새 항목을 준다(받은 항목과 키 차례는 그대로)', () => {
    const before = structuredClone(adam)
    const seen: [string, string][] = []
    const mapped = mapItemCitations('characters', adam, (citation, field) => {
      seen.push([field, citation])
      return citation.replace('genesis', 'GEN')
    })
    expect(seen).toEqual([
      ['facts.firstAppearance', 'genesis 2:7'],
      ['facts.attire', 'genesis 3:21'],
      ['facts.attire', 'exodus 1:1'],
      ['facts.sources', 'genesis 2:7'],
      ['facts.sources', 'exodus 1:1'],
    ])
    expect(mapped).toEqual({
      ...adam,
      facts: {
        ...adam.facts,
        firstAppearance: 'GEN 2:7',
        attire: [
          { from: 'GEN 3:21', description: '가죽옷' },
          { from: 'exodus 1:1', description: '뒤 책의 옷' },
        ],
        sources: ['GEN 2:7', 'exodus 1:1'],
      },
    })
    expect(adam).toEqual(before)
    expect(JSON.stringify(mapped)).toBe(JSON.stringify(adam).replaceAll('"genesis 2:7"', '"GEN 2:7"').replaceAll('"genesis 3:21"', '"GEN 3:21"'))
  })

  it('목록의 인용은 null이면 빼고(옷차림은 항목째), 한 칸짜리 인용은 뺄 수 없다', () => {
    const later = (citation: string) => (citation.startsWith('exodus') ? null : citation)
    const mapped = mapItemCitations('characters', adam, later)
    expect(mapped.facts.attire).toEqual([{ from: 'genesis 3:21', description: '가죽옷' }])
    expect(mapped.facts.sources).toEqual(['genesis 2:7'])
    expect(() => mapItemCitations('eras', flood, (citation, field) => (field === 'range.to' ? null : citation))).toThrow(
      'range.to는 한 칸짜리 인용이라 뺄 수 없습니다',
    )
    expect(() => mapItemCitations('places', eden, () => null)).toThrow('facts.firstAppearance는 한 칸짜리 인용이라 뺄 수 없습니다')
  })

  it('시대는 범위의 두 끝과 근거 절을 바꾸고 다른 글은 그대로 둔다', () => {
    const mapped = mapItemCitations('eras', flood, (citation) => citation.replace('genesis ', ''))
    expect(mapped).toEqual({ ...flood, range: { from: '6:9', to: '8:22' }, facts: { ...flood.facts, sources: ['7:11'] } })
  })
})
