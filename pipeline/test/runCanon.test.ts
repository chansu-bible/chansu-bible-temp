import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CanonOutput } from '../src/canon/merge.ts'
import { buildCanonPrompt } from '../src/canon/prompt.ts'
import { runCanon } from '../src/canon/runCanon.ts'
import type { Llm } from '../src/llm/client.ts'
import type { Canon, Source } from '../src/schema.ts'

// 설정집의 절 인용은 본문의 절 수로 검증하므로 2장은 1~8절을 다 둔다.
const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    {
      chapter: 2,
      verses: [
        ...[1, 2, 3, 4, 5, 6].map((verse) => ({ verse, text: `2장 ${verse}절` })),
        { verse: 7, text: '여호와 하나님이 흙으로 사람을 지으시고' },
        { verse: 8, text: '여호와 하나님이 동방의 에덴에 동산을 창설하시고' },
      ],
    },
  ],
}

const emptyCanon: Canon = { characters: [], places: [], eras: [], things: [], proposals: [] }

const output: CanonOutput = {
  characters: [
    {
      id: 'adam',
      name: '아담',
      aliases: ['사람'],
      facts: {
        firstAppearance: '2:7',
        gender: '남',
        years: { born: null, died: null },
        relations: [],
        attire: [],
        notes: '흙으로 지어짐',
        sources: ['2:7'],
      },
      design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    },
  ],
  places: [],
  eras: [],
  things: [],
}

describe('buildCanonPrompt', () => {
  it('절 번호가 붙은 본문과 기존 항목 목록을 넣는다', () => {
    const prompt = buildCanonPrompt('genesis', source.chapters[0]!, {
      ...emptyCanon,
      places: [
        {
          id: 'eden',
          name: '에덴',
          aliases: ['에덴동산'],
          status: 'approved',
          facts: { firstAppearance: 'genesis 2:8', description: '', sources: ['genesis 2:8'] },
          location: { lat: null, lng: null, certainty: '불명' },
          design: { landscape: '', notes: '' },
        },
      ],
    })
    expect(prompt.system).toContain('facts')
    expect(prompt.system).toContain('design')
    // 하나님과 일반 명사, 창조물 범주는 항목으로 내지 않는다
    expect(prompt.system).toContain('하나님·여호와·하나님의 신은 내지 않는다')
    expect(prompt.system).toContain('고유한 지명만 낸다')
    expect(prompt.system).toContain('이미 있는 시대는 다시 내지 않는다')
    expect(prompt.user).toContain('창세기 2장')
    expect(prompt.user).toContain('2:7 여호와 하나님이 흙으로 사람을 지으시고')
    expect(prompt.user).toContain('places/eden')
    expect(prompt.user).toContain('에덴동산')
    expect(prompt.user).toContain('approved')
  })

  it('어느 책이든 그 장 안의 절을 책 없이 쓰게 하고, 머리에 책 이름을 적는다', () => {
    const prompt = buildCanonPrompt('exodus', { chapter: 3, verses: [{ verse: 2, text: '떨기나무' }] }, emptyCanon)
    expect(prompt.system).toContain('성경 한 장을 읽고')
    expect(prompt.system).toContain('이 장 안의 절만 쓴다. 책 이름은 붙이지 않는다(코드가 붙인다).')
    expect(prompt.system).not.toContain('창세기 1~10장')
    expect(prompt.user.split('\n')[0]).toBe('출애굽기 3장')
    expect(prompt.user).toContain('3:2 떨기나무')
  })
})

describe('runCanon', () => {
  let dir: string
  let bible: string
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  beforeEach(async () => {
    lines.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'run-canon-'))
    bible = path.join(dir, 'story-bible')
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify(source), 'utf8')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function fakeLlm(calls: unknown[], answer: CanonOutput = output): Llm {
    return {
      async parse(schema, request) {
        calls.push(request)
        return schema.parse(answer)
      },
    }
  }

  it('dry-run이면 프롬프트만 출력하고 모델을 부르지 않는다', async () => {
    const calls: unknown[] = []
    const result = await runCanon('genesis', 2, { dryRun: true, llm: fakeLlm(calls), storyBibleDir: bible, sourceDir: dir }, log)
    expect(calls).toEqual([])
    expect(result.dryRun).toBe(true)
    expect(result.prompt?.user).toContain('2:7')
    expect(lines.join('\n')).toContain(result.prompt!.system)
  })

  it('출력을 합쳐 파일에 저장하고 요약을 돌려준다', async () => {
    const calls: unknown[] = []
    const result = await runCanon('genesis', 2, { llm: fakeLlm(calls), storyBibleDir: bible, sourceDir: dir }, log)
    expect(calls).toHaveLength(1)
    expect(result.added).toEqual([{ kind: 'characters', id: 'adam' }])

    const saved = JSON.parse(await readFile(path.join(bible, 'characters.json'), 'utf8'))
    expect(saved[0]).toMatchObject({ id: 'adam', status: 'draft' })
    // 모델이 책 없이 낸 인용에 책을 붙여 저장한다
    expect(saved[0].facts).toMatchObject({ firstAppearance: 'genesis 2:7', sources: ['genesis 2:7'] })
    expect(lines.some((line) => line.includes('추가 1개'))).toBe(true)
  })

  it('절 인용은 sourceDir 본문의 절 수로 검증한다', async () => {
    // 시험 본문의 2장은 8절까지다
    const beyond = { ...output, characters: [{ ...output.characters[0]!, facts: { ...output.characters[0]!.facts, sources: ['2:9'] } }] }
    const result = await runCanon('genesis', 2, { llm: fakeLlm([], beyond), storyBibleDir: bible, sourceDir: dir }, log)
    expect(result.added).toEqual([])
    expect(result.warnings.join('\n')).toContain('genesis 2:9이 범위를 벗어납니다')
  })

  it('다른 책의 본문이 깨져도 이 책의 설정집은 저장하고, 그 책을 가리키는 항목만 경고와 함께 버린다', async () => {
    await writeFile(path.join(dir, 'exodus.json'), '{ 깨진 파일', 'utf8')
    const adam = output.characters[0]!
    const moses = {
      ...adam,
      id: 'moses',
      name: '모세',
      aliases: [],
      facts: { ...adam.facts, firstAppearance: 'exodus 3:1', sources: ['exodus 3:1'] },
    }
    const both = { ...output, characters: [adam, moses] }
    const result = await runCanon('genesis', 2, { llm: fakeLlm([], both), storyBibleDir: bible, sourceDir: dir }, log)
    expect(result.added).toEqual([{ kind: 'characters', id: 'adam' }])
    expect(result.warnings.join('\n')).toContain(
      'characters/moses: 출애굽기 본문을 읽지 못해 절 인용을 확인할 수 없습니다(exodus 3:1)',
    )
    const saved = JSON.parse(await readFile(path.join(bible, 'characters.json'), 'utf8'))
    expect(saved.map((item: { id: string }) => item.id)).toEqual(['adam'])
  })

  it('없는 장이면 오류를 낸다', async () => {
    await expect(runCanon('genesis', 9, { dryRun: true, storyBibleDir: bible, sourceDir: dir }, log)).rejects.toThrow('9장')
  })
})
