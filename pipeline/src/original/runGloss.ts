import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { getBook, type BookId } from 'reader-core'
import { createLlm, type Llm } from '../llm/client.ts'
import {
  displayPath,
  lexiconFile as defaultLexiconFile,
  listBookFiles,
  originalDir as defaultOriginalDir,
  sourceDir as defaultSourceDir,
  sourceFilePath,
} from '../paths.ts'
import type { OriginalFile, Source } from '../schema.ts'
import { readSource } from '../source/files.ts'
import { readLexicon, readOriginal } from './files.ts'
import { buildGlossPrompt, GlossOutputSchema } from './glossPrompt.ts'

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
  // 예문을 모으는 원어 폴더(<책 id>.json)와 본문 폴더
  originalDir?: string
  sourceDir?: string
}

export type GlossResult = { selected: number; written: number; missing: string[]; dryRun: boolean }

// 한 책의 원어 낱말마다 그 낱말이 나온 절의 개역한글 본문을 예문으로 더한다. 번호마다 둘까지, 찾은 차례대로다.
function addExamples(examples: Map<string, string[]>, book: BookId, original: OriginalFile, source: Source): void {
  const { name } = getBook(book)
  for (const chapter of original.chapters) {
    const verses = source.chapters.find((item) => item.chapter === chapter.chapter)?.verses ?? []
    for (const verse of chapter.verses) {
      const text = verses.find((item) => item.verse === verse.verse)?.text
      if (!text) continue
      for (const word of verse.words) {
        if (!word.strong) continue
        const lines = examples.get(word.strong) ?? []
        const line = `${name} ${chapter.chapter}:${verse.verse} ${text}`
        if (lines.length < 2 && !lines.includes(line)) lines.push(line)
        examples.set(word.strong, lines)
      }
    }
  }
}

// 사전 항목마다 원어가 있는 책들에서 처음 나오는 절 둘의 개역한글 본문(작성 모델이 문맥을 보게). 성경 순서로 모으므로 앞 책의 절이 먼저다.
// 원어는 있는데 본문이 없는 책은 오류 없이 예문에서 빼고, 원어 파일이 하나도 없으면 예문 없이 쓴다. 둘 다 로그를 남긴다.
async function collectExamples(
  originalDir: string,
  sourceDir: string,
  log: (line: string) => void,
): Promise<Map<string, string[]>> {
  const examples = new Map<string, string[]>()
  const books = await listBookFiles(originalDir)
  if (books.length === 0) log(`원어 파일이 없어 예문 없이 씁니다(${displayPath(originalDir)})`)
  for (const book of books) {
    if (!existsSync(sourceFilePath(book, sourceDir))) {
      log(`${getBook(book).name} 원어는 있지만 본문이 없어 예문에서 뺍니다`)
      continue
    }
    addExamples(examples, book, await readOriginal(book, originalDir), await readSource(book, sourceDir))
  }
  return examples
}

// 사전 항목의 한국어 뜻 초안을 작성 모델로 쓴다. 묶음마다 파일을 써서 중간에 멈춰도 쓴 것은 남는다.
// 초안은 관리 도구에서 사람이 승인해야 앱 묶음에 들어간다.
export async function runGloss(options: GlossOptions = {}, log: (line: string) => void = () => {}): Promise<GlossResult> {
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile
  const lexicon = await readLexicon(lexiconFile)
  const targets = lexicon.entries
    .filter((entry) => entry.korean === null || (options.force === true && entry.korean.status === 'draft'))
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY)
  if (options.dryRun || targets.length === 0) return { selected: targets.length, written: 0, missing: [], dryRun: options.dryRun === true }

  const examples = await collectExamples(options.originalDir ?? defaultOriginalDir, options.sourceDir ?? defaultSourceDir, log)
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
