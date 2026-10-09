import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { BookId } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCanon, writeCanon, writeCanonKind } from '../src/canon/files.ts'
import { validateCanon } from '../src/canon/validate.ts'
import type { Canon, Character, Era, Place, Proposal, Source } from '../src/schema.ts'

// 창세기 1~10장의 절 수
const GENESIS_COUNTS = [31, 25, 24, 26, 32, 22, 24, 22, 29, 32]
const verseCounts = new Map<BookId, number[]>([['genesis', GENESIS_COUNTS]])

function character(overrides: Partial<Character>): Character {
  return {
    id: 'adam',
    name: '아담',
    aliases: [],
    status: 'draft',
    facts: {
      firstAppearance: 'genesis 1:26',
      gender: '남',
      years: { born: 0, died: 930 },
      relations: [],
      attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
      notes: '',
      sources: ['genesis 1:26-27', 'genesis 5:5'],
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
  facts: { firstAppearance: 'genesis 2:8', description: '동산', sources: ['genesis 2:8'] },
  location: { lat: 31, lng: 47, certainty: '추정' },
  design: { landscape: '', notes: '' },
}

function era(overrides: Partial<Era>): Era {
  return {
    id: 'flood',
    name: '홍수',
    status: 'draft',
    range: { from: 'genesis 6:9', to: 'genesis 8:22' },
    years: { from: 1656, to: 1657 },
    facts: { description: '', present: [], absent: [], sources: ['genesis 7:12'] },
    design: { visualNotes: '' },
    ...overrides,
  }
}

const proposal: Proposal = {
  id: 'p1',
  createdAt: '2026-10-06T00:00:00.000Z',
  target: 'places/eden',
  field: 'design.landscape',
  value: '네 강이 갈라지는 평야',
  reason: '',
  sources: ['genesis 2:10'],
  status: 'open',
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
    const all = canon({ characters: [character({}), eve], places: [eden], eras: [era({})], proposals: [proposal] })
    expect(validateCanon(all, verseCounts)).toEqual([])
  })

  it('같은 종류 안에서 id가 겹치면 알린다', () => {
    expect(validateCanon(canon({ characters: [character({}), character({})] }), verseCounts)).toEqual([
      'characters/adam: id가 겹칩니다',
    ])
  })

  it('다른 종류끼리는 id가 같아도 된다', () => {
    expect(validateCanon(canon({ places: [eden], eras: [era({ id: 'eden' })] }), verseCounts)).toEqual([])
  })

  it('관계가 가리키는 인물이 없으면 알린다', () => {
    const cain = character({ id: 'cain', facts: { ...character({}).facts, relations: [{ type: '아버지', to: 'adam' }] } })
    const abel = character({ id: 'abel', facts: { ...character({}).facts, relations: [{ type: '형', to: 'nobody' }] } })
    expect(validateCanon(canon({ characters: [character({}), cain, abel] }), verseCounts)).toEqual([
      'characters/abel: 관계가 가리키는 인물 nobody가 없습니다',
    ])
  })

  it('절 인용이 본문에 있는 장과 그 장의 절 수를 벗어나면 알린다', () => {
    const bad = character({
      facts: {
        ...character({}).facts,
        firstAppearance: 'genesis 11:1',
        attire: [{ from: 'genesis 1:32', description: '옷' }],
        sources: ['genesis 10:32', 'genesis 2:25-26'],
      },
    })
    expect(validateCanon(canon({ characters: [bad] }), verseCounts)).toEqual([
      'characters/adam: 절 인용 genesis 11:1이 범위를 벗어납니다',
      'characters/adam: 절 인용 genesis 1:32이 범위를 벗어납니다',
      'characters/adam: 절 인용 genesis 2:25-26이 범위를 벗어납니다',
    ])
    // 받지 않은 장은 절 수가 0이다
    const missing = new Map<BookId, number[]>([['genesis', [31, 0, 24]]])
    expect(validateCanon(canon({ places: [eden] }), missing)).toEqual([
      'places/eden: 절 인용 genesis 2:8이 범위를 벗어납니다',
      'places/eden: 절 인용 genesis 2:8이 범위를 벗어납니다',
    ])
  })

  it('책이 없거나 읽을 수 없는 인용은 모양이 틀렸다고 알린다', () => {
    // 0장, 끝이 시작보다 앞선 범위, 창세기에 없는 51장은 parseRef가 읽지 못한다
    const bad = { ...eden, facts: { ...eden.facts, sources: ['2:8', 'genesis 0:1', 'genesis 2:14-10', 'genesis 51:1', '2장 8절'] } }
    expect(validateCanon(canon({ places: [bad], proposals: [{ ...proposal, sources: ['2:10'] }] }), verseCounts)).toEqual([
      'places/eden: 절 인용의 모양이 틀렸습니다(2:8)',
      'places/eden: 절 인용의 모양이 틀렸습니다(genesis 0:1)',
      'places/eden: 절 인용의 모양이 틀렸습니다(genesis 2:14-10)',
      'places/eden: 절 인용의 모양이 틀렸습니다(genesis 51:1)',
      'places/eden: 절 인용의 모양이 틀렸습니다(2장 8절)',
      'proposals/p1: 절 인용의 모양이 틀렸습니다(2:10)',
    ])
  })

  it('본문이 없는 책의 인용은 확인할 수 없다고 알린다', () => {
    const exodus = { ...eden, facts: { ...eden.facts, sources: ['genesis 2:8', 'exodus 3:2'] } }
    expect(validateCanon(canon({ places: [exodus] }), verseCounts)).toEqual([
      'places/eden: 출애굽기 본문이 없어 절 인용을 확인할 수 없습니다(exodus 3:2)',
    ])
    const withExodus = new Map<BookId, number[]>([...verseCounts, ['exodus', [22, 25, 22]]])
    expect(validateCanon(canon({ places: [exodus] }), withExodus)).toEqual([])
  })

  it('시대의 시작이 끝보다 뒤면 알린다', () => {
    expect(validateCanon(canon({ eras: [era({ range: { from: 'genesis 8:22', to: 'genesis 6:9' } })] }), verseCounts)).toEqual([
      'eras/flood: 시작(genesis 8:22)이 끝(genesis 6:9)보다 뒤입니다',
    ])
  })

  it('시대의 앞뒤는 책 순서부터 본다', () => {
    const counts = new Map<BookId, number[]>([...verseCounts, ['exodus', [22]]])
    expect(validateCanon(canon({ eras: [era({ range: { from: 'exodus 1:1', to: 'genesis 8:22' } })] }), counts)).toEqual([
      'eras/flood: 시작(exodus 1:1)이 끝(genesis 8:22)보다 뒤입니다',
    ])
    expect(validateCanon(canon({ eras: [era({ range: { from: 'genesis 8:22', to: 'exodus 1:1' } })] }), counts)).toEqual([])
  })

  it('시작과 끝이 같은 절인 시대는 받아들인다', () => {
    expect(validateCanon(canon({ eras: [era({ range: { from: 'genesis 7:1', to: 'genesis 7:1' } })] }), verseCounts)).toEqual([])
  })
})

// 창세기 1~10장 본문. 설정집 검증은 장마다 절 수만 보므로 글은 아무것이나 넣는다.
const genesisSource: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: GENESIS_COUNTS.map((count, index) => ({
    chapter: index + 1,
    verses: Array.from({ length: count }, (_, verse) => ({ verse: verse + 1, text: '본문' })),
  })),
}

describe('설정집 파일', () => {
  let root: string
  // 설정집 폴더와, 절 인용을 검증할 본문 폴더
  let dir: string
  let sourceDir: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'canon-'))
    dir = path.join(root, 'story-bible')
    sourceDir = path.join(root, 'source')
    await mkdir(dir)
    await mkdir(sourceDir)
    await writeFile(path.join(sourceDir, 'genesis.json'), JSON.stringify(genesisSource), 'utf8')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const readText = (name: string) => readFile(path.join(dir, `${name}.json`), 'utf8')

  it('없는 파일은 빈 목록으로 읽는다', async () => {
    expect(await readCanon(dir, { sourceDir })).toEqual(canon({}))
  })

  it('쓴 항목을 다시 읽을 수 있다', async () => {
    await writeCanonKind('places', [eden], dir, { sourceDir })
    expect((await readCanon(dir, { sourceDir })).places).toEqual([eden])
    expect(await readText('places')).toMatch(/\n$/)
  })

  it('스키마에 맞지 않는 파일은 파일 이름과 함께 오류를 낸다', async () => {
    await writeFile(path.join(dir, 'eras.json'), JSON.stringify([{ id: 'Bad' }]), 'utf8')
    await expect(readCanon(dir, { sourceDir })).rejects.toThrow('eras.json')
  })

  it('책 없는 옛 인용은 스키마에 맞지 않는다', async () => {
    const old = { ...eden, facts: { ...eden.facts, firstAppearance: '2:8', sources: ['2:8'] } }
    await writeFile(path.join(dir, 'places.json'), JSON.stringify([old]), 'utf8')
    await expect(readCanon(dir, { sourceDir })).rejects.toThrow(/places\.json: [\s\S]*facts[\s\S]*책 장:절/)
  })

  it('교차 검증에 걸리는 쓰기는 저장하지 않는다', async () => {
    const abel = character({ id: 'abel', facts: { ...character({}).facts, relations: [{ type: '형', to: 'cain' }] } })
    await expect(writeCanonKind('characters', [abel], dir, { sourceDir })).rejects.toThrow(
      'characters.json: characters/abel: 관계가 가리키는 인물 cain가 없습니다',
    )
    expect((await readCanon(dir, { sourceDir })).characters).toEqual([])
  })

  it('절 인용은 sourceDir 본문의 절 수로 검증한다', async () => {
    const outside = { ...eden, facts: { ...eden.facts, sources: ['genesis 11:1'] } }
    await expect(writeCanonKind('places', [outside], dir, { sourceDir })).rejects.toThrow('genesis 11:1이 범위를 벗어납니다')
    await writeCanonKind('places', [eden], dir, { sourceDir })
    const empty = path.join(root, 'empty')
    await mkdir(empty)
    await expect(readCanon(dir, { sourceDir: empty })).rejects.toThrow('창세기 본문이 없어 절 인용을 확인할 수 없습니다')
  })

  it('writeCanon은 다섯 파일을 한 번에 쓴다', async () => {
    const all = canon({ characters: [character({})], places: [eden], eras: [era({})], proposals: [proposal] })
    await writeCanon(all, dir, { sourceDir })
    expect(await readCanon(dir, { sourceDir })).toEqual(all)
    for (const name of ['characters', 'places', 'eras', 'things', 'proposals']) {
      expect(await readText(name)).toMatch(/\n$/)
    }
    expect(await readText('things')).toBe('[]\n')
  })

  it('writeCanon은 지금 파일이 옛 형식이어도 통째로 바꾼다', async () => {
    // 목록 하나씩 쓰면 아직 옮기지 않은 파일에서 걸린다
    const old = { ...eden, facts: { ...eden.facts, firstAppearance: '2:8', sources: ['2:8'] } }
    await writeFile(path.join(dir, 'places.json'), JSON.stringify([old]), 'utf8')
    await expect(writeCanonKind('eras', [era({})], dir, { sourceDir })).rejects.toThrow('places.json')

    await writeCanon(canon({ places: [eden], eras: [era({})] }), dir, { sourceDir })
    expect(await readCanon(dir, { sourceDir })).toEqual(canon({ places: [eden], eras: [era({})] }))
  })

  it('writeCanon은 하나라도 틀리면 아무것도 쓰지 않는다', async () => {
    await writeFile(path.join(dir, 'places.json'), 'old', 'utf8')
    const abel = character({ id: 'abel', facts: { ...character({}).facts, relations: [{ type: '형', to: 'cain' }] } })
    await expect(writeCanon(canon({ characters: [abel], places: [eden] }), dir, { sourceDir })).rejects.toThrow(
      'characters.json: characters/abel: 관계가 가리키는 인물 cain가 없습니다',
    )
    await expect(writeCanon(canon({ places: [eden], proposals: [{ ...proposal, sources: ['2:10'] }] }), dir, { sourceDir })).rejects.toThrow(
      'proposals.json',
    )
    // 임시 파일도 남지 않는다
    expect(await readdir(dir)).toEqual(['places.json'])
    expect(await readText('places')).toBe('old')
  })

  it('writeCanon은 쓰다가 실패하면 이 호출의 임시 파일을 치우고 옛 파일을 그대로 둔다', async () => {
    const names = ['characters', 'places', 'eras', 'things', 'proposals']
    await writeCanon(canon({ places: [eden] }), dir, { sourceDir })
    const before = await Promise.all(names.map(readText))
    // 세 번째(eras) 임시 파일 자리에 폴더를 두어 쓰기가 실패하게 한다. 앞의 두 임시 파일은 이미 쓴 뒤다.
    await mkdir(path.join(dir, 'eras.json.tmp'))
    await expect(writeCanon(canon({ places: [eden], eras: [era({})] }), dir, { sourceDir })).rejects.toThrow('eras.json.tmp')
    // 남은 .tmp는 시험이 둔 폴더뿐이다
    expect((await readdir(dir)).sort()).toEqual([...names.map((name) => `${name}.json`), 'eras.json.tmp'].sort())
    expect(await Promise.all(names.map(readText))).toEqual(before)
  })
})
