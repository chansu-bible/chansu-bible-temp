import { describe, expect, it } from 'vitest'
import { CITATION_FIELDS, FIRST_APPEARANCE_FIELD, firstAppearanceOf, itemCitations, mapItemCitations } from '../src/canon/citations.ts'
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

  it('항목의 인용을 필드 차례대로 모으고, 필드를 주면 그 필드의 인용만 모은다', () => {
    expect(itemCitations('characters', adam)).toEqual(['genesis 2:7', 'genesis 3:21', 'exodus 1:1', 'genesis 2:7', 'exodus 1:1'])
    expect(itemCitations('places', eden)).toEqual(['genesis 2:8', 'genesis 2:8', 'genesis 2:10-14'])
    expect(itemCitations('eras', flood)).toEqual(['genesis 6:9', 'genesis 8:22', 'genesis 7:11'])
    expect(itemCitations('things', ark)).toEqual(['genesis 6:14-16'])
    expect(itemCitations('characters', adam, 'facts.attire')).toEqual(['genesis 3:21', 'exodus 1:1'])
    expect(itemCitations('eras', flood, 'range.to')).toEqual(['genesis 8:22'])
  })

  it('처음 나오는 곳은 인물·장소는 처음 나온 절, 시대는 시작 절, 물건은 근거 절 가운데 가장 앞선 절이다', () => {
    expect(FIRST_APPEARANCE_FIELD).toEqual({
      characters: 'facts.firstAppearance',
      places: 'facts.firstAppearance',
      eras: 'range.from',
      things: 'facts.sources',
    })
    expect(firstAppearanceOf('characters', adam, 'genesis')).toEqual({ book: 'genesis', chapter: 2, verse: 7, verseEnd: 7 })
    expect(firstAppearanceOf('places', eden, 'genesis')?.verse).toBe(8)
    expect(firstAppearanceOf('eras', flood, 'genesis')).toEqual({ book: 'genesis', chapter: 6, verse: 9, verseEnd: 9 })
    // 물건: 목록의 차례가 아니라 가장 앞선 절이다. 읽을 수 없는 글은 건너뛰고, 책 없는 인용은 받은 책의 절로 본다.
    const staff = { ...ark, facts: { ...ark.facts, sources: ['exodus 4:2', '엉터리', 'genesis 32:10'] } }
    expect(firstAppearanceOf('things', staff, 'genesis')).toEqual({ book: 'genesis', chapter: 32, verse: 10, verseEnd: 10 })
    expect(firstAppearanceOf('things', staff, 'exodus')).toEqual({ book: 'genesis', chapter: 32, verse: 10, verseEnd: 10 })
    // 책 없는 "3:1"은 출애굽기 3:1로 견주어 출애굽기 4:2보다 앞선다.
    expect(firstAppearanceOf('things', { ...staff, facts: { ...staff.facts, sources: ['exodus 4:2', '3:1'] } }, 'exodus')).toEqual({
      book: null,
      chapter: 3,
      verse: 1,
      verseEnd: 1,
    })
    // 읽을 수 있는 인용이 없으면 null이다.
    expect(firstAppearanceOf('characters', { ...adam, facts: { ...adam.facts, firstAppearance: '' } }, 'genesis')).toBeNull()
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
      'eras/flood range.to: 한 칸짜리 인용이라 뺄 수 없습니다',
    )
    expect(() => mapItemCitations('places', eden, () => null)).toThrow('places/eden facts.firstAppearance: 한 칸짜리 인용이라 뺄 수 없습니다')
  })

  it('fn이 던진 오류에는 어느 항목의 어느 필드인지 붙여 다시 던진다', () => {
    const cause = new Error('2:77-1을 읽을 수 없습니다')
    const fail = (citation: string, field: string) => {
      if (field === 'facts.attire') throw cause
      return citation
    }
    let thrown: unknown
    try {
      mapItemCitations('characters', adam, fail)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe('characters/adam facts.attire: 2:77-1을 읽을 수 없습니다')
    expect((thrown as Error).cause).toBe(cause)
  })

  it('시대는 범위의 두 끝과 근거 절을 바꾸고 다른 글은 그대로 둔다', () => {
    const mapped = mapItemCitations('eras', flood, (citation) => citation.replace('genesis ', ''))
    expect(mapped).toEqual({ ...flood, range: { from: '6:9', to: '8:22' }, facts: { ...flood.facts, sources: ['7:11'] } })
  })
})
