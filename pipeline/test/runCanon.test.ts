import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CanonOutput } from '../src/canon/merge.ts'
import { buildCanonPrompt } from '../src/canon/prompt.ts'
import { runCanon } from '../src/canon/runCanon.ts'
import type { Llm } from '../src/llm/client.ts'
import type { Canon, Source } from '../src/schema.ts'

const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    {
      chapter: 2,
      verses: [
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
    const prompt = buildCanonPrompt(source.chapters[0]!, {
      ...emptyCanon,
      places: [
        {
          id: 'eden',
          name: '에덴',
          aliases: ['에덴동산'],
          status: 'approved',
          facts: { firstAppearance: '2:8', description: '', sources: ['2:8'] },
          location: { lat: null, lng: null, certainty: '불명' },
          design: { landscape: '', notes: '' },
        },
      ],
    })
    expect(prompt.system).toContain('facts')
    expect(prompt.system).toContain('design')
    expect(prompt.user).toContain('창세기 2장')
    expect(prompt.user).toContain('2:7 여호와 하나님이 흙으로 사람을 지으시고')
    expect(prompt.user).toContain('places/eden')
    expect(prompt.user).toContain('에덴동산')
    expect(prompt.user).toContain('approved')
  })
})

describe('runCanon', () => {
  let dir: string
  let bible: string
  let sourcePath: string
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  beforeEach(async () => {
    lines.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'run-canon-'))
    bible = path.join(dir, 'story-bible')
    sourcePath = path.join(dir, 'genesis.json')
    await writeFile(sourcePath, JSON.stringify(source), 'utf8')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function fakeLlm(calls: unknown[]): Llm {
    return {
      async parse(schema, request) {
        calls.push(request)
        return schema.parse(output)
      },
    }
  }

  it('dry-run이면 프롬프트만 출력하고 모델을 부르지 않는다', async () => {
    const calls: unknown[] = []
    const result = await runCanon(2, { dryRun: true, llm: fakeLlm(calls), storyBibleDir: bible, sourceFile: sourcePath }, log)
    expect(calls).toEqual([])
    expect(result.dryRun).toBe(true)
    expect(result.prompt?.user).toContain('2:7')
    expect(lines.join('\n')).toContain(result.prompt!.system)
  })

  it('출력을 합쳐 파일에 저장하고 요약을 돌려준다', async () => {
    const calls: unknown[] = []
    const result = await runCanon(2, { llm: fakeLlm(calls), storyBibleDir: bible, sourceFile: sourcePath }, log)
    expect(calls).toHaveLength(1)
    expect(result.added).toEqual([{ kind: 'characters', id: 'adam' }])

    const saved = JSON.parse(await readFile(path.join(bible, 'characters.json'), 'utf8'))
    expect(saved[0]).toMatchObject({ id: 'adam', status: 'draft' })
    expect(lines.some((line) => line.includes('추가 1개'))).toBe(true)
  })

  it('없는 장이면 오류를 낸다', async () => {
    await expect(runCanon(9, { dryRun: true, storyBibleDir: bible, sourceFile: sourcePath }, log)).rejects.toThrow('9장')
  })
})
