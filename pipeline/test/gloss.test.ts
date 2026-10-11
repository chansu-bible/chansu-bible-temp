import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { buildGlossPrompt } from '../src/original/glossPrompt.ts'
import { runGloss } from '../src/original/runGloss.ts'
import { displayPath } from '../src/paths.ts'
import type { LexiconEntry } from '../src/schema.ts'

const entry = (strong: string, korean: LexiconEntry['korean'] = null): LexiconEntry => ({
  strong,
  lemma: 'אָב',
  xlit: 'ʼâb',
  pos: 'n-m',
  definition: 'father',
  usage: 'father',
  count: 1,
  korean,
})

type Files = { lexiconFile: string; originalDir: string; sourceDir: string }
type VerseWords = { verse: number; text: string; strongs: string[] }

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'gloss-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// 한 책의 1장 원어 파일과 본문 파일을 쓴다. source가 false면 원어만 쓴다.
async function writeBook(files: Files, book: string, name: string, verses: VerseWords[], { source = true } = {}): Promise<void> {
  const words = (strongs: string[]) => strongs.map((strong) => ({ text: 'א', strong, morph: 'HNcmsa' }))
  await writeFile(
    path.join(files.originalDir, `${book}.json`),
    JSON.stringify({ chapters: [{ chapter: 1, verses: verses.map((item) => ({ verse: item.verse, words: words(item.strongs) })) }] }),
  )
  if (!source) return
  await writeFile(
    path.join(files.sourceDir, `${book}.json`),
    JSON.stringify({ book: name, translation: '개역한글', chapters: [{ chapter: 1, verses: verses.map((item) => ({ verse: item.verse, text: item.text })) }] }),
  )
}

// 사전과 창세기 원어·본문을 임시 폴더에 쓴다. 원어 폴더에는 실제처럼 lexicon.json과 README.md도 함께 있다.
async function setup(entries: LexiconEntry[]): Promise<Files> {
  const files = { lexiconFile: path.join(dir, 'lexicon.json'), originalDir: dir, sourceDir: path.join(dir, 'source') }
  await mkdir(files.sourceDir)
  await writeFile(files.lexiconFile, JSON.stringify({ entries }))
  await writeFile(path.join(dir, 'README.md'), '# 원어')
  await writeBook(files, 'genesis', '창세기', [{ verse: 1, text: '태초에', strongs: entries.map((item) => item.strong) }])
  return files
}

// 받은 항목마다 "뜻 H번호"를 돌려주는 가짜 작성 모델. 부른 프롬프트를 모은다.
function fakeLlm(skip: string[] = []): Llm & { requests: ParseRequest[] } {
  const requests: ParseRequest[] = []
  return {
    requests,
    async parse(schema, request) {
      requests.push(request)
      const strongs = [...request.user.matchAll(/^- (H\d+)/gm)].map((match) => match[1]!)
      return schema.parse({ items: strongs.filter((strong) => !skip.includes(strong)).map((strong) => ({ strong, meaning: `뜻 ${strong}`, note: '' })) })
    },
  }
}

// 요청 글에서 사전 항목마다 붙은 예문 줄을 번호별로 꺼낸다.
function examplesOf(user: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  let strong = ''
  for (const line of user.split('\n')) {
    const head = /^- (H\d+) /.exec(line)
    if (head) {
      strong = head[1]!
      result[strong] = []
    } else if (line.startsWith('  예: ')) {
      result[strong]!.push(line.slice('  예: '.length))
    }
  }
  return result
}

describe('runGloss', () => {
  it('뜻이 없는 항목에 초안을 쓰고, 승인된 뜻은 건드리지 않으며, 예문을 함께 보낸다', async () => {
    const files = await setup([entry('H1'), entry('H2', { meaning: '승인됨', note: '', status: 'approved' })])
    const llm = fakeLlm()
    const result = await runGloss({ ...files, llm })
    expect(result).toEqual({ selected: 1, written: 1, missing: [], dryRun: false })
    expect(llm.requests[0]!.user).toContain('예: 창세기 1:1 태초에')
    const saved = JSON.parse(await readFile(files.lexiconFile, 'utf8')) as { entries: LexiconEntry[] }
    expect(saved.entries.map((item) => item.korean)).toEqual([
      { meaning: '뜻 H1', note: '', status: 'draft' },
      { meaning: '승인됨', note: '', status: 'approved' },
    ])
  })

  it('limit만큼 묶음으로 나눠 쓰고, 돌려받지 못한 항목은 남긴다', async () => {
    const files = await setup([entry('H1'), entry('H2'), entry('H3')])
    const llm = fakeLlm(['H2'])
    const result = await runGloss({ ...files, llm, limit: 2, batchSize: 1 })
    expect(result).toEqual({ selected: 2, written: 1, missing: ['H2'], dryRun: false })
    expect(llm.requests).toHaveLength(2)
  })

  it('dry-run이면 고를 항목 수만 센다', async () => {
    const files = await setup([entry('H1')])
    expect(await runGloss({ ...files, dryRun: true })).toEqual({ selected: 1, written: 0, missing: [], dryRun: true })
  })

  it('원어가 있는 모든 책에서 성경 순서로 예문을 모은다(번호마다 둘까지)', async () => {
    const files = await setup([entry('H1'), entry('H2'), entry('H3')])
    // 출애굽기 파일이 이름순으로 먼저 오더라도 창세기 예문이 앞서야 한다.
    await writeBook(files, 'exodus', '출애굽기', [{ verse: 1, text: '야곱과 함께 애굽에 이른', strongs: ['H1', 'H2', 'H3'] }])
    await writeBook(files, 'genesis', '창세기', [
      { verse: 1, text: '태초에', strongs: ['H1', 'H2'] },
      { verse: 2, text: '땅이 혼돈하고', strongs: ['H1'] },
    ])
    const llm = fakeLlm()
    await runGloss({ ...files, llm })
    expect(examplesOf(llm.requests[0]!.user)).toEqual({
      H1: ['창세기 1:1 태초에', '창세기 1:2 땅이 혼돈하고'],
      H2: ['창세기 1:1 태초에', '출애굽기 1:1 야곱과 함께 애굽에 이른'],
      H3: ['출애굽기 1:1 야곱과 함께 애굽에 이른'],
    })
  })

  it('원어는 있는데 본문이 없는 책은 로그를 남기고 예문에서 뺀다', async () => {
    const files = await setup([entry('H1')])
    await writeBook(files, 'exodus', '출애굽기', [{ verse: 1, text: '야곱과', strongs: ['H1'] }], { source: false })
    const lines: string[] = []
    const llm = fakeLlm()
    const result = await runGloss({ ...files, llm }, (line) => lines.push(line))
    expect(result).toEqual({ selected: 1, written: 1, missing: [], dryRun: false })
    expect(lines).toContain('출애굽기 원어는 있지만 본문이 없어 예문에서 뺍니다')
    expect(examplesOf(llm.requests[0]!.user)).toEqual({ H1: ['창세기 1:1 태초에'] })
  })

  it('원어 파일이 하나도 없으면 로그를 한 번 남기고 예문 없이 쓴다', async () => {
    const files = await setup([entry('H1')])
    // 책 파일이 없는 폴더(README.md만 있다)와 아예 없는 폴더
    const empty = path.join(dir, 'empty')
    await mkdir(empty)
    await writeFile(path.join(empty, 'README.md'), '# 원어')
    for (const originalDir of [empty, path.join(dir, 'none')]) {
      const lines: string[] = []
      const llm = fakeLlm()
      const result = await runGloss({ ...files, originalDir, llm, force: true }, (line) => lines.push(line))
      expect(result).toMatchObject({ selected: 1, written: 1 })
      expect(lines.filter((line) => line.includes('원어 파일이 없어'))).toEqual([`원어 파일이 없어 예문 없이 씁니다(${displayPath(originalDir)})`])
      expect(examplesOf(llm.requests[0]!.user)).toEqual({ H1: [] })
    }
  })

  it('원어 파일이 깨졌으면 어느 파일인지 알려 준다', async () => {
    const files = await setup([entry('H1')])
    await writeFile(path.join(dir, 'exodus.json'), JSON.stringify({ chapters: 'x' }))
    await writeFile(path.join(files.sourceDir, 'exodus.json'), JSON.stringify({ book: '출애굽기', translation: '개역한글', chapters: [] }))
    const llm = fakeLlm()
    await expect(runGloss({ ...files, llm })).rejects.toThrow(`${displayPath(path.join(dir, 'exodus.json'))}: `)
    expect(llm.requests).toEqual([])
  })

  it('낱말 뜻 프롬프트의 system은 책을 가리지 않는다', () => {
    const { system } = buildGlossPrompt([entry('H1')], new Map())
    expect(system).toContain('성경을 처음 읽는 한국어 독자가 히브리어 낱말을 볼 때')
    expect(system).toContain('- note: 주어진 절의 쓰임에서')
    expect(system).not.toContain('창세기')
  })
})
