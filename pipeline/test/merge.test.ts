import { describe, expect, it } from 'vitest'
import { mergeCanon, type CanonOutput } from '../src/canon/merge.ts'
import { CanonOutputSchema } from '../src/canon/merge.ts'
import { validateCanon } from '../src/canon/validate.ts'
import type { Canon, Character, Place, Proposal } from '../src/schema.ts'

const NOW = '2026-10-07T01:02:03.000Z'

type CharacterOut = CanonOutput['characters'][number]

function characterOut(
  overrides: Omit<Partial<CharacterOut>, 'facts'> & { facts?: Partial<CharacterOut['facts']> } = {},
): CharacterOut {
  const { facts, ...rest } = overrides
  return {
    id: 'adam',
    name: '아담',
    aliases: [],
    facts: {
      firstAppearance: '1:26',
      gender: '남',
      years: { born: 0, died: null },
      relations: [],
      attire: [],
      notes: '',
      sources: ['1:26-27'],
      ...facts,
    },
    design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    ...rest,
  }
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    ...characterOut(),
    status: 'approved',
    refs: [],
    ...overrides,
  } as Character
}

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'eden',
    name: '에덴',
    aliases: ['에덴동산'],
    status: 'approved',
    facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
    location: { lat: 31.02, lng: 47.43, certainty: '추정' },
    design: { landscape: '평야', notes: '' },
    ...overrides,
  }
}

function canon(overrides: Partial<Canon> = {}): Canon {
  return { characters: [], places: [], eras: [], things: [], proposals: [], ...overrides }
}

function output(overrides: Partial<CanonOutput> = {}): CanonOutput {
  return { characters: [], places: [], eras: [], things: [], ...overrides }
}

describe('mergeCanon', () => {
  it('새 id는 draft로 추가한다. 출력의 status는 무시한다', () => {
    const adam = { ...characterOut(), status: 'approved' } as CharacterOut
    const result = mergeCanon(canon(), output({ characters: [adam] }), NOW)

    expect(result.added).toEqual([{ kind: 'characters', id: 'adam' }])
    expect(result.canon.characters).toHaveLength(1)
    expect(result.canon.characters[0]).toMatchObject({ id: 'adam', status: 'draft', refs: [] })
    expect(result.proposals).toEqual([])
    expect(validateCanon(result.canon)).toEqual([])
  })

  it('장소, 시대, 물건도 추가한다', () => {
    const result = mergeCanon(
      canon(),
      output({
        places: [
          {
            id: 'nod',
            name: '놋',
            aliases: [],
            facts: { firstAppearance: '4:16', description: '에덴 동편', sources: ['4:16'] },
            location: { lat: null, lng: null, certainty: '불명' },
            design: { landscape: '', notes: '' },
          },
        ],
        eras: [
          {
            id: 'flood',
            name: '홍수',
            range: { from: '6:9', to: '8:22' },
            years: { from: 1656, to: 1657 },
            facts: { description: '', present: ['방주'], absent: [], sources: ['6:14'] },
            design: { visualNotes: '' },
          },
        ],
        things: [
          {
            id: 'ark',
            name: '방주',
            aliases: [],
            facts: { description: '잣나무 배', details: ['길이 300규빗'], sources: ['6:14-15'] },
            design: { visualNotes: '' },
          },
        ],
      }),
      NOW,
    )
    expect(result.added).toEqual([
      { kind: 'places', id: 'nod' },
      { kind: 'eras', id: 'flood' },
      { kind: 'things', id: 'ark' },
    ])
    expect(result.canon.places[0]?.status).toBe('draft')
  })

  it('승인된 항목과 id가 같으면 추가하지 않고 달라진 필드마다 proposal을 만든다', () => {
    const existing = canon({
      characters: [character({ facts: { ...character().facts, notes: '흙으로 지음', sources: ['1:26-27'] } })],
    })
    const result = mergeCanon(
      existing,
      output({
        characters: [
          characterOut({
            facts: { notes: '930세에 죽음', sources: ['5:5'], years: { born: null, died: 930 } },
            design: { build: '', face: '', hair: '짧은 검은 곱슬머리', skin: '', ageNotes: '', notes: '' },
          }),
        ],
      }),
      NOW,
    )

    expect(result.added).toEqual([])
    expect(result.canon.characters).toEqual(existing.characters)

    const byField = Object.fromEntries(result.proposals.map((proposal) => [proposal.field, proposal]))
    expect(Object.keys(byField).sort()).toEqual(['design.hair', 'facts.notes', 'facts.sources', 'facts.years'].sort())
    // 배열은 합치고, 빈 값(null)은 기존 값을 지우지 않는다
    expect(byField['facts.sources']?.value).toEqual(['1:26-27', '5:5'])
    expect(byField['facts.years']?.value).toEqual({ born: 0, died: 930 })
    // 본문 근거 글은 기존 글 뒤에 이어 붙인 값을 제안한다
    expect(byField['facts.notes']).toMatchObject({
      target: 'characters/adam',
      value: '흙으로 지음\n930세에 죽음',
      status: 'open',
      createdAt: NOW,
      sources: ['5:5'],
    })
    expect(new Set(result.proposals.map((proposal) => proposal.id)).size).toBe(result.proposals.length)
    expect(result.canon.proposals).toEqual(result.proposals)
    expect(validateCanon(result.canon)).toEqual([])
  })

  it('이름이나 별칭이 같으면 같은 항목으로 보고, 그 id를 가리키는 관계를 기존 id로 바꾼다', () => {
    const existing = canon({ places: [place()], characters: [character()] })
    const result = mergeCanon(
      existing,
      output({
        places: [
          {
            id: 'garden-of-eden',
            name: '에덴동산',
            aliases: [],
            facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
            location: { lat: null, lng: null, certainty: '불명' },
            design: { landscape: '', notes: '' },
          },
        ],
        characters: [
          characterOut({ id: 'first-man', name: '아담' }),
          characterOut({
            id: 'eve',
            name: '하와',
            facts: { firstAppearance: '2:22', gender: '여', relations: [{ type: '남편', to: 'first-man' }], sources: ['2:22'] },
          }),
        ],
      }),
      NOW,
    )

    expect(result.added).toEqual([{ kind: 'characters', id: 'eve' }])
    expect(result.canon.places.map((item) => item.id)).toEqual(['eden'])
    expect(result.proposals).toEqual([])
    const eve = result.canon.characters.find((item) => item.id === 'eve')
    expect(eve?.facts.relations).toEqual([{ type: '남편', to: 'adam' }])
    expect(validateCanon(result.canon)).toEqual([])
  })

  it('이름이 같아도 아버지가 다르면 다른 인물로 추가하고, 아버지가 같으면 같은 인물로 합친다', () => {
    const facts = characterOut().facts
    const existing = canon({
      characters: [
        character(),
        character({ id: 'cain', name: '가인', status: 'draft', facts: { ...facts, firstAppearance: '4:1', sources: ['4:1'] } }),
        character({ id: 'jared', name: '야렛', status: 'draft', facts: { ...facts, firstAppearance: '5:15', sources: ['5:15'] } }),
        character({
          id: 'enoch-cain',
          name: '에녹',
          status: 'draft',
          facts: { ...facts, firstAppearance: '4:17', relations: [{ type: '아버지', to: 'cain' }], sources: ['4:17'] },
        }),
      ],
    })
    const sethite = characterOut({
      id: 'enoch',
      name: '에녹',
      facts: { firstAppearance: '5:18', relations: [{ type: '아버지', to: 'jared' }], sources: ['5:18'] },
    })
    const split = mergeCanon(existing, output({ characters: [sethite] }), NOW)
    expect(split.added).toEqual([{ kind: 'characters', id: 'enoch' }])
    expect(split.canon.characters.find((item) => item.id === 'enoch-cain')?.facts.relations).toEqual([
      { type: '아버지', to: 'cain' },
    ])
    expect(validateCanon(split.canon)).toEqual([])

    const cainite = characterOut({
      id: 'enoch',
      name: '에녹',
      facts: { firstAppearance: '4:17', relations: [{ type: '아버지', to: 'cain' }], notes: '성을 쌓음', sources: ['4:17'] },
    })
    const joined = mergeCanon(existing, output({ characters: [cainite] }), NOW)
    expect(joined.added).toEqual([])
    expect(joined.updated).toEqual([{ kind: 'characters', id: 'enoch-cain' }])
  })

  it('기존 항목이 draft면 proposal 없이 덮어쓴다(배열은 합치고 refs는 둔다)', () => {
    const existing = canon({
      characters: [character({ status: 'draft', refs: ['adam-front.jpg'], facts: { ...character().facts, notes: '옛 메모' } })],
    })
    const result = mergeCanon(
      existing,
      output({ characters: [characterOut({ aliases: ['사람'], facts: { notes: '새 메모', sources: ['2:7'] } })] }),
      NOW,
    )

    expect(result.proposals).toEqual([])
    expect(result.added).toEqual([])
    expect(result.updated).toEqual([{ kind: 'characters', id: 'adam' }])
    expect(result.canon.characters[0]).toMatchObject({
      status: 'draft',
      refs: ['adam-front.jpg'],
      aliases: ['사람'],
      facts: { notes: '옛 메모\n새 메모', sources: ['1:26-27', '2:7'] },
    })
  })

  it('draft 시대라도 range와 years는 기존 값을 지키고 빈 칸만 채운다', () => {
    const era = {
      id: 'creation-week',
      name: '창조 주간',
      range: { from: '1:1', to: '2:3' },
      years: { from: 0, to: null },
      facts: { description: '엿새 창조', present: ['빛(1:3)'], absent: [], sources: ['1:3'] },
      design: { visualNotes: '' },
    }
    const result = mergeCanon(
      canon({ eras: [{ ...era, status: 'draft' }] }),
      output({
        eras: [
          {
            ...era,
            range: { from: '1:1', to: '1:31' },
            years: { from: 7, to: 0 },
            facts: { ...era.facts, present: ['사람(1:27)'], description: '' },
          },
        ],
      }),
      NOW,
    )
    expect(result.updated).toEqual([{ kind: 'eras', id: 'creation-week' }])
    expect(result.canon.eras[0]).toMatchObject({
      range: { from: '1:1', to: '2:3' },
      years: { from: 0, to: 0 },
      facts: { description: '엿새 창조', present: ['빛(1:3)', '사람(1:27)'] },
    })
  })

  it('facts.notes와 facts.description은 바꾸지 않고 이어 붙이고, 같은 글은 다시 붙이지 않는다', () => {
    const facts = characterOut().facts
    const existing = canon({
      characters: [character({ id: 'noah', name: '노아', status: 'draft', facts: { ...facts, notes: '방주를 지었다.' } })],
      places: [place({ status: 'draft' })],
    })
    const out = output({
      characters: [characterOut({ id: 'noah', name: '노아', facts: { notes: '포도나무를 심었다.' } })],
      places: [
        {
          id: 'eden',
          name: '에덴',
          aliases: [],
          facts: { firstAppearance: '2:8', description: '네 강이 흐른다', sources: ['2:10'] },
          location: { lat: null, lng: null, certainty: '불명' },
          design: { landscape: '숲', notes: '' },
        },
      ],
    })
    const once = mergeCanon(existing, out, NOW)
    expect(once.canon.characters[0]?.facts.notes).toBe('방주를 지었다.\n포도나무를 심었다.')
    expect(once.canon.places[0]?.facts.description).toBe('동산\n네 강이 흐른다')
    expect(once.canon.places[0]?.design.landscape).toBe('숲')
    const twice = mergeCanon(once.canon, out, NOW)
    expect(twice.updated).toEqual([])
    expect(twice.canon.characters[0]?.facts.notes).toBe('방주를 지었다.\n포도나무를 심었다.')
  })

  it('첫 등장은 더 앞선 절을 남긴다', () => {
    const existing = canon({ characters: [character({ status: 'draft' })] })
    const result = mergeCanon(existing, output({ characters: [characterOut({ facts: { firstAppearance: '2:7' } })] }), NOW)
    expect(result.canon.characters[0]?.facts.firstAppearance).toBe('1:26')
  })

  it('없는 인물을 가리키는 관계는 버리고 경고한다', () => {
    const result = mergeCanon(
      canon(),
      output({ characters: [characterOut({ facts: { relations: [{ type: '아내', to: 'eve' }] } })] }),
      NOW,
    )
    expect(result.canon.characters[0]?.facts.relations).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('eve')
  })

  it('스키마나 절 범위를 어긴 항목은 넣지 않고 경고한다', () => {
    const result = mergeCanon(
      canon(),
      output({
        characters: [
          characterOut({ id: 'Bad Id' }),
          characterOut({ id: 'seth', name: '셋', facts: { firstAppearance: '11:1', sources: ['4:25'] } }),
        ],
      }),
      NOW,
    )
    expect(result.canon.characters).toEqual([])
    expect(result.added).toEqual([])
    expect(result.warnings).toHaveLength(2)
  })

  it('같은 내용의 열린 proposal이 있으면 다시 만들지 않는다', () => {
    const first = mergeCanon(
      canon({ characters: [character()] }),
      output({ characters: [characterOut({ facts: { notes: '새 사실' } })] }),
      NOW,
    )
    expect(first.proposals).toHaveLength(1)
    const second = mergeCanon(first.canon, output({ characters: [characterOut({ facts: { notes: '새 사실' } })] }), NOW)
    expect(second.proposals).toEqual([])
    expect(second.canon.proposals).toHaveLength(1)
  })

  it('반려된 항목도 다시 추가하지 않는다', () => {
    const existing = canon({ characters: [character({ status: 'rejected' })] })
    const result = mergeCanon(existing, output({ characters: [characterOut()] }), NOW)
    expect(result.added).toEqual([])
    expect(result.canon.characters).toEqual(existing.characters)
  })

  it('기존 proposals는 그대로 둔다', () => {
    const old: Proposal = {
      id: 'p-old',
      createdAt: NOW,
      target: 'places/eden',
      field: 'design.notes',
      value: 'x',
      reason: '',
      sources: [],
      status: 'dismissed',
    }
    const result = mergeCanon(canon({ proposals: [old] }), output(), NOW)
    expect(result.canon.proposals).toEqual([old])
  })
})

describe('CanonOutputSchema', () => {
  it('빈 출력을 받아들인다', () => {
    expect(CanonOutputSchema.parse({ characters: [], places: [], eras: [], things: [] })).toEqual(output())
  })
})
