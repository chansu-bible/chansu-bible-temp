import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { runGloss } from '../src/original/runGloss.ts'
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

async function setup(entries: LexiconEntry[]) {
  const dir = await mkdtemp(path.join(tmpdir(), 'gloss-'))
  const files = {
    lexiconFile: path.join(dir, 'lexicon.json'),
    originalFile: path.join(dir, 'genesis.json'),
    sourceFile: path.join(dir, 'source.json'),
  }
  await writeFile(files.lexiconFile, JSON.stringify({ entries }))
  await writeFile(
    files.originalFile,
    JSON.stringify({ chapters: [{ chapter: 1, verses: [{ verse: 1, words: entries.map((item) => ({ text: 'א', strong: item.strong, morph: 'HNcmsa' })) }] }] }),
  )
  await writeFile(
    files.sourceFile,
    JSON.stringify({ book: '창세기', translation: '개역한글', chapters: [{ chapter: 1, verses: [{ verse: 1, text: '태초에' }] }] }),
  )
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
})
