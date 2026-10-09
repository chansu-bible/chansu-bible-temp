import { describe, expect, it } from 'vitest'
import { migrateCanonRefs } from '../src/canon/migrateRefs.ts'
import type { Canon, Character, Era, Place, Proposal, Thing } from '../src/schema.ts'

const adam: Character = {
  id: 'adam',
  name: '아담',
  aliases: [],
  status: 'approved',
  facts: {
    firstAppearance: '2:7',
    gender: '남',
    years: { born: 0, died: 930 },
    relations: [],
    attire: [{ from: '3:21', description: '가죽옷' }],
    // 글 속의 절 번호는 인용 필드가 아니라 그대로 둔다
    notes: '흙으로 지어졌다(2:7).',
    sources: ['2:7-8', 'genesis 3:1', 'exodus 3:2'],
  },
  design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
  refs: [],
}

const beforeFlood: Era = {
  id: 'before-flood',
  name: '홍수 전',
  status: 'approved',
  range: { from: '1:1', to: '5:32' },
  years: { from: 0, to: null },
  facts: { description: '', present: ['동산(2:8)'], absent: [], sources: ['5:1'] },
  design: { visualNotes: '' },
}

const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8', '2:10-14'] },
  location: { lat: null, lng: null, certainty: '불명' },
  design: { landscape: '', notes: '' },
}

const ark: Thing = {
  id: 'ark',
  name: '방주',
  aliases: [],
  status: 'approved',
  facts: { description: '잣나무 배', details: [], sources: ['6:14-16'] },
  design: { visualNotes: '' },
}

function proposal(id: string, overrides: Partial<Proposal>): Proposal {
  return {
    id,
    createdAt: '2026-10-07T00:00:00.000Z',
    target: 'characters/adam',
    field: 'design.notes',
    value: '',
    reason: '',
    sources: [],
    status: 'open',
    ...overrides,
  }
}

function canon(overrides: Partial<Canon>): Canon {
  return { characters: [], places: [], eras: [], things: [], proposals: [], ...overrides }
}

describe('migrateCanonRefs', () => {
  it('책 없는 인용에 책을 붙이고, 이미 책이 있는 인용은 그대로 둔다', () => {
    const { canon: migrated, changed } = migrateCanonRefs(
      canon({
        characters: [adam],
        eras: [beforeFlood],
        proposals: [
          proposal('p1', { field: 'facts.notes', value: '새 사실', sources: ['4:1'] }),
          proposal('p2', { field: 'facts.sources', value: ['2:8'] }),
        ],
      }),
      'genesis',
    )
    expect(migrated.characters[0]!.facts).toEqual({
      ...adam.facts,
      firstAppearance: 'genesis 2:7',
      attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
      sources: ['genesis 2:7-8', 'genesis 3:1', 'exodus 3:2'],
    })
    expect(migrated.eras[0]).toEqual({
      ...beforeFlood,
      range: { from: 'genesis 1:1', to: 'genesis 5:32' },
      facts: { ...beforeFlood.facts, sources: ['genesis 5:1'] },
    })
    expect(migrated.proposals[0]).toMatchObject({ value: '새 사실', sources: ['genesis 4:1'] })
    expect(migrated.proposals[1]).toMatchObject({ value: ['genesis 2:8'], sources: [] })
    // 인물 3(첫 등장, 옷차림, 근거 하나) + 시대 3 + 제안 2
    expect(changed).toBe(8)
  })

  it('장소와 물건, 제안 값의 첫 등장·옷차림·시대 범위에도 붙이고, 인용이 없는 필드의 값은 그대로 둔다', () => {
    const { canon: migrated, changed } = migrateCanonRefs(
      canon({
        places: [eden],
        things: [ark],
        proposals: [
          proposal('first', { field: 'facts.firstAppearance', value: '2:7' }),
          proposal('attire', { field: 'facts.attire', value: [{ from: '3:21', description: '가죽옷' }] }),
          proposal('range', { target: 'eras/before-flood', field: 'range', value: { from: '1:1', to: '5:32' } }),
          proposal('design', { field: 'design.notes', value: '2:7' }),
        ],
      }),
      'genesis',
    )
    expect(migrated.places[0]!.facts).toEqual({
      firstAppearance: 'genesis 2:8',
      description: '동산',
      sources: ['genesis 2:8', 'genesis 2:10-14'],
    })
    expect(migrated.things[0]!.facts.sources).toEqual(['genesis 6:14-16'])
    expect(migrated.proposals.map((item) => item.value)).toEqual([
      'genesis 2:7',
      [{ from: 'genesis 3:21', description: '가죽옷' }],
      { from: 'genesis 1:1', to: 'genesis 5:32' },
      '2:7',
    ])
    expect(changed).toBe(8)
  })

  it('field가 facts.sources인 제안의 value에도 책을 붙인다', () => {
    const { canon: migrated } = migrateCanonRefs(canon({ proposals: [proposal('p', { field: 'facts.sources', value: ['2:8'] })] }), 'genesis')
    expect(migrated.proposals[0]!.value).toEqual(['genesis 2:8'])
  })

  it('두 번 돌리면 바뀌는 것이 없다', () => {
    const all = canon({
      characters: [adam],
      places: [eden],
      eras: [beforeFlood],
      things: [ark],
      proposals: [proposal('p', { field: 'facts.sources', value: ['2:8'], sources: ['2:8'] })],
    })
    const once = migrateCanonRefs(all, 'genesis')
    const twice = migrateCanonRefs(once.canon, 'genesis')
    expect(twice.changed).toBe(0)
    expect(twice.canon).toEqual(once.canon)
  })

  it('받은 설정집은 바꾸지 않는다', () => {
    const all = canon({ characters: [adam], eras: [beforeFlood], proposals: [proposal('p', { field: 'range', value: { from: '1:1', to: '2:3' } })] })
    const before = structuredClone(all)
    migrateCanonRefs(all, 'genesis')
    expect(all).toEqual(before)
  })

  it('읽을 수 없는 인용은 어디인지 적은 오류를 낸다', () => {
    const bad = { ...adam, facts: { ...adam.facts, sources: ['2:77-1'] } }
    expect(() => migrateCanonRefs(canon({ characters: [bad] }), 'genesis')).toThrow(
      'characters/adam facts.sources: 2:77-1을 읽을 수 없습니다',
    )
    // 창세기에 없는 장
    const beyond = { ...eden, facts: { ...eden.facts, firstAppearance: '51:1' } }
    expect(() => migrateCanonRefs(canon({ places: [beyond] }), 'genesis')).toThrow(
      'places/eden facts.firstAppearance: 51:1을 읽을 수 없습니다',
    )
    const range = proposal('p', { field: 'range', value: { from: '1:1', to: '' } })
    expect(() => migrateCanonRefs(canon({ proposals: [range] }), 'genesis')).toThrow('proposals/p value.to: ""을 읽을 수 없습니다')
    const notList = proposal('q', { field: 'facts.sources', value: '2:8' })
    expect(() => migrateCanonRefs(canon({ proposals: [notList] }), 'genesis')).toThrow('proposals/q value: facts.sources 값이 목록이 아닙니다')
  })
})
