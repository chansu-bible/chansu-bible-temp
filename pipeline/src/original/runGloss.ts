import { readFile, writeFile } from 'node:fs/promises'
import type { BookId } from 'reader-core'
import { createLlm, type Llm } from '../llm/client.ts'
import { lexiconFile as defaultLexiconFile, originalFilePath, sourceFilePath } from '../paths.ts'
import { LexiconFileSchema, OriginalFileSchema, SourceSchema, type OriginalFile, type Source } from '../schema.ts'
import { buildGlossPrompt, GlossOutputSchema } from './glossPrompt.ts'

// 사전은 책을 가리지 않지만, 작성 모델에 보여 줄 예문은 아직 창세기 원어·본문에서 모은다.
const EXAMPLE_BOOK: BookId = 'genesis'

export type GlossOptions = {
  // 이번에 쓸 항목 수. 비우면 남은 것 모두
  limit?: number
  // 이미 초안이 있는 항목도 다시 쓴다(승인된 뜻은 건드리지 않는다).
  force?: boolean
  dryRun?: boolean
  // 한 번에 보내는 항목 수
  batchSize?: number
  // 시험용
  llm?: Llm
  lexiconFile?: string
  originalFile?: string
  sourceFile?: string
}

export type GlossResult = { selected: number; written: number; missing: string[]; dryRun: boolean }

// 사전 항목마다 이 책에서 처음 나오는 절 둘의 개역한글 본문(작성 모델이 문맥을 보게)
function examplesFor(original: OriginalFile, source: Source): Map<string, string[]> {
  const examples = new Map<string, string[]>()
  for (const chapter of original.chapters) {
    const verses = source.chapters.find((item) => item.chapter === chapter.chapter)?.verses ?? []
    for (const verse of chapter.verses) {
      const text = verses.find((item) => item.verse === verse.verse)?.text
      if (!text) continue
      for (const word of verse.words) {
        if (!word.strong) continue
        const lines = examples.get(word.strong) ?? []
        const line = `창세기 ${chapter.chapter}:${verse.verse} ${text}`
        if (lines.length < 2 && !lines.includes(line)) lines.push(line)
        examples.set(word.strong, lines)
      }
    }
  }
  return examples
}

// 사전 항목의 한국어 뜻 초안을 작성 모델로 쓴다. 묶음마다 파일을 써서 중간에 멈춰도 쓴 것은 남는다.
// 초안은 관리 도구에서 사람이 승인해야 앱 묶음에 들어간다.
export async function runGloss(options: GlossOptions = {}, log: (line: string) => void = () => {}): Promise<GlossResult> {
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile
  const lexicon = LexiconFileSchema.parse(JSON.parse(await readFile(lexiconFile, 'utf8')))
  const targets = lexicon.entries
    .filter((entry) => entry.korean === null || (options.force === true && entry.korean.status === 'draft'))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY)
  if (options.dryRun || targets.length === 0) return { selected: targets.length, written: 0, missing: [], dryRun: options.dryRun === true }

  const original = OriginalFileSchema.parse(JSON.parse(await readFile(options.originalFile ?? originalFilePath(EXAMPLE_BOOK), 'utf8')))
  const source = SourceSchema.parse(JSON.parse(await readFile(options.sourceFile ?? sourceFilePath(EXAMPLE_BOOK), 'utf8')))
  const examples = examplesFor(original, source)
  const llm = options.llm ?? createLlm({ stage: 'original-gloss', book: null, chapter: null, log })
  const batchSize = options.batchSize ?? 40

  let written = 0
  const missing: string[] = []
  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize)
    const { system, user } = buildGlossPrompt(batch, examples)
    const output = await llm.parse(GlossOutputSchema, { system, user, name: 'korean_glosses' })
    const byStrong = new Map(output.items.map((item) => [item.strong.trim(), item]))
    for (const entry of batch) {
      const item = byStrong.get(entry.strong)
      if (!item || item.meaning.trim() === '') {
        missing.push(entry.strong)
        continue
      }
      entry.korean = { meaning: item.meaning.trim(), note: item.note.trim(), status: 'draft' }
      written++
    }
    await writeFile(lexiconFile, JSON.stringify(lexicon, null, 2) + '\n', 'utf8')
    log(`한국어 뜻 초안 ${Math.min(start + batchSize, targets.length)}/${targets.length}`)
  }
  return { selected: targets.length, written, missing, dryRun: false }
}
