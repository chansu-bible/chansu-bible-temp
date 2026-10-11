import { describe, expect, it } from 'vitest'
import { canonForBook, type BookCanon } from '../src/build/canonForBook.ts'
import type { Character, Era, Place, Thing } from '../src/schema.ts'

function character(id: string, name: string, facts: Partial<Character['facts']> = {}): Character {
  return {
    id,
    name,
    aliases: [],
    status: 'approved',
    facts: {
      firstAppearance: 'genesis 1:1',
      gender: '남',
      years: { born: null, died: null },
      relations: [],
      attire: [],
      notes: '',
      sources: ['genesis 1:1'],
      ...facts,
    },
    design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    refs: [],
  }
}

function place(id: string, name: string, firstAppearance: string, sources = [firstAppearance]): Place {
  return {
    id,
    name,
    aliases: [],
    status: 'approved',
    facts: { firstAppearance, description: name, sources },
    location: { lat: null, lng: null, certainty: '추정' },
    design: { landscape: '', notes: '' },
  }
}

function era(id: string, from: string, to: string): Era {
  return {
    id,
    name: id,
    status: 'approved',
    range: { from, to },
    years: { from: null, to: null },
    facts: { description: '', present: [], absent: [], sources: [from] },
    design: { visualNotes: '' },
  }
}

function thing(id: string, sources: string[]): Thing {
  return {
    id,
    name: id,
    aliases: [],
    status: 'approved',
    facts: { description: '', details: [], sources },
    design: { visualNotes: '' },
  }
}

const canon = (overrides: Partial<BookCanon>): BookCanon => ({ places: [], characters: [], eras: [], things: [], ...overrides })

// 창세기와 출애굽기의 마지막 절
const GENESIS_LAST = '50:26'
const EXODUS_LAST = '40:38'

describe('canonForBook', () => {
  // 아담은 창세기에 처음 나오고 출애굽기에도 근거가 있다. 모세는 출애굽기에 처음 나온다.
  const adam = character('adam', '아담', { firstAppearance: 'genesis 2:7', sources: ['genesis 2:7', 'exodus 1:1'] })
  const moses = character('moses', '모세', { firstAppearance: 'exodus 2:10', sources: ['exodus 2:10'] })
  const eden = place('eden', '에덴', 'genesis 2:8')
  const midian = place('midian', '미디안', 'exodus 2:15')

  it('이 책이거나 앞 책에서 처음 나온 항목만 넣고, 같은 책 인용은 책 없이, 앞 책 인용은 책 이름으로 쓴다', () => {
    const both = canon({ places: [eden, midian], characters: [adam, moses] })

    const genesis = canonForBook(both, 'genesis', GENESIS_LAST)
    expect(genesis.characters.map((item) => item.id)).toEqual(['adam'])
    expect(genesis.characters[0]!.facts).toMatchObject({ firstAppearance: '2:7', sources: ['2:7'] })
    expect(genesis.places.map((item) => item.id)).toEqual(['eden'])
    expect(genesis.places[0]!.facts).toMatchObject({ firstAppearance: '2:8', sources: ['2:8'] })

    const exodus = canonForBook(both, 'exodus', EXODUS_LAST)
    expect(exodus.characters.map((item) => item.id)).toEqual(['adam', 'moses'])
    expect(exodus.characters[0]!.facts).toMatchObject({ firstAppearance: '창세기 2:7', sources: ['창세기 2:7', '1:1'] })
    expect(exodus.characters[1]!.facts).toMatchObject({ firstAppearance: '2:10', sources: ['2:10'] })
    // 앞 책에서 나온 장소도 들어가고, 인용에는 책 이름이 붙는다.
    expect(exodus.places.map((item) => item.id)).toEqual(['eden', 'midian'])
    expect(exodus.places[0]!.facts).toMatchObject({ firstAppearance: '창세기 2:8', sources: ['창세기 2:8'] })
    expect(exodus.places[1]!.facts).toMatchObject({ firstAppearance: '2:15', sources: ['2:15'] })
  })

  it('시대는 시작 절로 넣고, 끝이 뒤 책이면 이 책의 마지막 절로 둔다', () => {
    const eras = [
      era('patriarchs', 'genesis 12:1', 'exodus 1:7'),
      era('flood', 'genesis 6:9', 'genesis 8:22'),
      era('wilderness', 'exodus 16:1', 'numbers 14:45'),
    ]
    const ranges = (book: 'genesis' | 'exodus', last: string) =>
      canonForBook(canon({ eras }), book, last).eras.map((item) => [item.id, item.range])
    expect(ranges('genesis', GENESIS_LAST)).toEqual([
      ['patriarchs', { from: '12:1', to: GENESIS_LAST }],
      ['flood', { from: '6:9', to: '8:22' }],
    ])
    // 앞 책에서 끝난 시대는 두 끝에 책 이름을 붙인다.
    expect(ranges('exodus', EXODUS_LAST)).toEqual([
      ['patriarchs', { from: '창세기 12:1', to: '1:7' }],
      ['flood', { from: '창세기 6:9', to: '창세기 8:22' }],
      ['wilderness', { from: '16:1', to: EXODUS_LAST }],
    ])
  })

  it('물건은 근거 절 가운데 가장 앞선 절이 이 책이거나 앞 책이면 넣고, 뒤 책 근거는 뺀다', () => {
    // 지팡이의 가장 앞선 근거는 목록의 첫 글(출애굽기 4:2)이 아니라 창세기 32:10이다.
    const things = [thing('staff', ['exodus 4:2', 'genesis 32:10']), thing('manna', ['exodus 16:15'])]
    const sources = (book: 'genesis' | 'exodus', last: string) =>
      canonForBook(canon({ things }), book, last).things.map((item) => [item.id, item.facts.sources])
    expect(sources('genesis', GENESIS_LAST)).toEqual([['staff', ['32:10']]])
    expect(sources('exodus', EXODUS_LAST)).toEqual([
      ['staff', ['4:2', '창세기 32:10']],
      ['manna', ['16:15']],
    ])
  })

  it('뒤 책의 옷차림은 빼고, 관계는 넣은 인물만 가리킨다', () => {
    const dressed = character('adam', '아담', {
      firstAppearance: 'genesis 2:7',
      relations: [{ type: '후손', to: 'moses' }],
      attire: [
        { from: 'genesis 3:21', description: '가죽옷' },
        { from: 'exodus 1:1', description: '뒤 책의 옷' },
      ],
      sources: ['genesis 2:7'],
    })
    const both = canon({ characters: [dressed, moses] })
    expect(canonForBook(both, 'genesis', GENESIS_LAST).characters[0]!.facts).toMatchObject({
      relations: [],
      attire: [{ from: '3:21', description: '가죽옷' }],
    })
    expect(canonForBook(both, 'exodus', EXODUS_LAST).characters[0]!.facts).toMatchObject({
      relations: [{ type: '후손', to: 'moses' }],
      attire: [
        { from: '창세기 3:21', description: '가죽옷' },
        { from: '1:1', description: '뒤 책의 옷' },
      ],
    })
  })

  it('읽을 수 없는 인용은 그대로 두고, 처음 나오는 곳을 읽을 수 없는 항목은 넣는다', () => {
    const odd = character('odd', '이상', { firstAppearance: '엉터리', sources: ['엉터리', 'genesis 1:1'] })
    const eras = [era('no-start', '엉터리', 'genesis 8:22'), era('no-end', 'genesis 6:9', '엉터리')]
    const exodus = canonForBook(canon({ characters: [odd], eras }), 'exodus', EXODUS_LAST)
    expect(exodus.characters[0]!.facts).toMatchObject({ firstAppearance: '엉터리', sources: ['엉터리', '창세기 1:1'] })
    expect(exodus.eras.map((item) => [item.id, item.range])).toEqual([
      ['no-start', { from: '엉터리', to: '창세기 8:22' }],
      ['no-end', { from: '창세기 6:9', to: '엉터리' }],
    ])
  })

  it('끝을 맞춰야 하는 시대가 있는데 이 책 본문에 절이 없으면 어느 시대인지와 어느 책인지 적은 오류를 낸다', () => {
    const eras = [era('patriarchs', 'genesis 12:1', 'exodus 1:7')]
    expect(() => canonForBook(canon({ eras }), 'genesis', null)).toThrow(
      'eras/patriarchs range.to: 본문에 절이 없어 시대의 끝(exodus 1:7)을 창세기의 마지막 절로 둘 수 없습니다',
    )
    // 맞출 끝이 없으면 마지막 절을 몰라도 된다.
    expect(canonForBook(canon({ eras: [era('flood', 'genesis 6:9', 'genesis 8:22')] }), 'genesis', null).eras[0]!.range).toEqual({
      from: '6:9',
      to: '8:22',
    })
  })

  it('받은 설정집은 바꾸지 않고, 항목의 키 차례도 그대로 둔다', () => {
    const all = canon({ places: [eden, midian], characters: [adam, moses], eras: [era('flood', 'genesis 6:9', 'genesis 8:22')] })
    const before = structuredClone(all)
    const exodus = canonForBook(all, 'exodus', EXODUS_LAST)
    expect(all).toEqual(before)
    expect(Object.keys(exodus)).toEqual(['places', 'characters', 'eras', 'things'])
    expect(Object.keys(exodus.characters[0]!)).toEqual(Object.keys(adam))
    expect(Object.keys(exodus.characters[0]!.facts)).toEqual(Object.keys(adam.facts))
  })
})
