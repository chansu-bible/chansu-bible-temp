import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCanon, writeCanonKind } from '../src/canon/files.ts'
import { validateCanon } from '../src/canon/validate.ts'
import type { Canon, Character, Era, Place } from '../src/schema.ts'

function character(overrides: Partial<Character>): Character {
  return {
    id: 'adam',
    name: '아담',
    aliases: [],
    status: 'draft',
    facts: {
      firstAppearance: '1:26',
      gender: '남',
      years: { born: 0, died: 930 },
      relations: [],
      attire: [{ from: '3:21', description: '가죽옷' }],
      notes: '',
      sources: ['1:26-27', '5:5'],
    },
    design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    refs: [],
    ...overrides,
  }
}

const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
  location: { lat: 31, lng: 47, certainty: '추정' },
  design: { landscape: '', notes: '' },
}

function era(overrides: Partial<Era>): Era {
  return {
    id: 'flood',
    name: '홍수',
    status: 'draft',
    range: { from: '6:9', to: '8:22' },
    years: { from: 1656, to: 1657 },
    facts: { description: '', present: [], absent: [], sources: ['7:12'] },
    design: { visualNotes: '' },
    ...overrides,
  }
}

function canon(overrides: Partial<Canon>): Canon {
  return { characters: [], places: [], eras: [], things: [], proposals: [], ...overrides }
}

describe('validateCanon', () => {
  it('문제가 없으면 빈 목록을 돌려준다', () => {
    const eve = character({
      id: 'eve',
      name: '하와',
      facts: { ...character({}).facts, gender: '여', relations: [{ type: '남편', to: 'adam' }] },
    })
    expect(validateCanon(canon({ characters: [character({}), eve], places: [eden], eras: [era({})] }))).toEqual([])
  })

  it('같은 종류 안에서 id가 겹치면 알린다', () => {
    expect(validateCanon(canon({ characters: [character({}), character({})] }))).toEqual([
      'characters/adam: id가 겹칩니다',
    ])
  })

  it('다른 종류끼리는 id가 같아도 된다', () => {
    expect(validateCanon(canon({ places: [eden], eras: [era({ id: 'eden' })] }))).toEqual([])
  })

  it('관계가 가리키는 인물이 없으면 알린다', () => {
    const cain = character({ id: 'cain', facts: { ...character({}).facts, relations: [{ type: '아버지', to: 'adam' }] } })
    const abel = character({ id: 'abel', facts: { ...character({}).facts, relations: [{ type: '형', to: 'nobody' }] } })
    expect(validateCanon(canon({ characters: [character({}), cain, abel] }))).toEqual([
      'characters/abel: 관계가 가리키는 인물 nobody가 없습니다',
    ])
  })

  it('절 인용이 1~10장과 그 장의 절 수를 벗어나면 알린다', () => {
    const bad = character({
      facts: { ...character({}).facts, firstAppearance: '11:1', attire: [{ from: '1:32', description: '옷' }], sources: ['0:1', '10:32', '2:25-26'] },
    })
    expect(validateCanon(canon({ characters: [bad] }))).toEqual([
      'characters/adam: 절 인용 11:1이 범위를 벗어납니다',
      'characters/adam: 절 인용 1:32이 범위를 벗어납니다',
      'characters/adam: 절 인용 0:1이 범위를 벗어납니다',
      'characters/adam: 절 인용 2:25-26이 범위를 벗어납니다',
    ])
  })

  it('절 범위의 끝이 시작보다 앞이면 알린다', () => {
    const bad = { ...eden, facts: { ...eden.facts, sources: ['2:14-10'] } }
    expect(validateCanon(canon({ places: [bad] }))).toEqual(['places/eden: 절 인용 2:14-10이 범위를 벗어납니다'])
  })

  it('시대의 시작이 끝보다 뒤면 알린다', () => {
    expect(validateCanon(canon({ eras: [era({ range: { from: '8:22', to: '6:9' } })] }))).toEqual([
      'eras/flood: 시작(8:22)이 끝(6:9)보다 뒤입니다',
    ])
  })

  it('시작과 끝이 같은 절인 시대는 받아들인다', () => {
    expect(validateCanon(canon({ eras: [era({ range: { from: '7:1', to: '7:1' } })] }))).toEqual([])
  })
})

describe('설정집 파일', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'canon-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('없는 파일은 빈 목록으로 읽는다', async () => {
    expect(await readCanon(dir)).toEqual(canon({}))
  })

  it('쓴 항목을 다시 읽을 수 있다', async () => {
    await writeCanonKind('places', [eden], dir)
    expect((await readCanon(dir)).places).toEqual([eden])
    expect(await readFile(path.join(dir, 'places.json'), 'utf8')).toMatch(/\n$/)
  })

  it('스키마에 맞지 않는 파일은 파일 이름과 함께 오류를 낸다', async () => {
    await writeFile(path.join(dir, 'eras.json'), JSON.stringify([{ id: 'Bad' }]), 'utf8')
    await expect(readCanon(dir)).rejects.toThrow('eras.json')
  })

  it('교차 검증에 걸리는 쓰기는 저장하지 않는다', async () => {
    const abel = character({ id: 'abel', facts: { ...character({}).facts, relations: [{ type: '형', to: 'cain' }] } })
    await expect(writeCanonKind('characters', [abel], dir)).rejects.toThrow(
      'characters.json: characters/abel: 관계가 가리키는 인물 cain가 없습니다',
    )
    expect((await readCanon(dir)).characters).toEqual([])
  })
})
