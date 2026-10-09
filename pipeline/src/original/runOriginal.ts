import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { lexiconFile as defaultLexiconFile, originalFile as defaultOriginalFile, sourceFile as defaultSourceFile } from '../paths.ts'
import { LexiconFileSchema, SourceSchema, type LexiconEntry, type OriginalFile } from '../schema.ts'
import { parseOshb } from './oshb.ts'
import { parseStrongs } from './strongs.ts'

// 고정된 커밋에서 받는다(같은 자료로 다시 만들 수 있게).
// OSHB: 본문은 WLC(퍼블릭 도메인), 원형과 형태 분석은 CC BY 4.0. 스트롱 사전 XML은 퍼블릭 도메인.
export const OSHB_URL = 'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc/Gen.xml'
export const STRONGS_URL =
  'https://raw.githubusercontent.com/openscriptures/strongs/0acd2f251c2d35ff8db2dece4e0593979d3ac223/hebrew/StrongHebrewG.xml'

export type OriginalOptions = {
  fetchText?: (url: string) => Promise<string>
  sourceFile?: string
  originalFile?: string
  lexiconFile?: string
}

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}을 받지 못했습니다(${response.status})`)
  return response.text()
}

// 본문에 있는 장의 히브리어 낱말과 그 낱말들의 사전 항목을 만든다. 이미 있는 한국어 뜻(초안, 승인)은 그대로 둔다.
export async function runOriginal(options: OriginalOptions = {}, log: (line: string) => void = () => {}) {
  const fetchText = options.fetchText ?? defaultFetch
  const sourceFile = options.sourceFile ?? defaultSourceFile
  const originalFile = options.originalFile ?? defaultOriginalFile
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile

  const source = SourceSchema.parse(JSON.parse(await readFile(sourceFile, 'utf8')))
  const chapterNumbers = new Set(source.chapters.map((chapter) => chapter.chapter))
  log('OSHB 창세기를 받는 중…')
  const chapters = parseOshb(await fetchText(OSHB_URL), chapterNumbers)
  for (const chapter of source.chapters) {
    const found = chapters.find((item) => item.chapter === chapter.chapter)
    if (!found || found.verses.length !== chapter.verses.length) {
      throw new Error(`${chapter.chapter}장의 절 수가 본문(${chapter.verses.length})과 OSHB(${found?.verses.length ?? 0})에서 다릅니다`)
    }
  }

  const counts = new Map<string, number>()
  for (const chapter of chapters) {
    for (const verse of chapter.verses) {
      for (const word of verse.words) if (word.strong) counts.set(word.strong, (counts.get(word.strong) ?? 0) + 1)
    }
  }
  log('스트롱 사전을 받는 중…')
  const dictionary = parseStrongs(await fetchText(STRONGS_URL), new Set(counts.keys()))
  const missing = [...counts.keys()].filter((strong) => !dictionary.has(strong))
  if (missing.length > 0) log(`사전에 없는 번호 ${missing.length}개: ${missing.slice(0, 10).join(', ')}`)

  const previous = existsSync(lexiconFile)
    ? new Map(LexiconFileSchema.parse(JSON.parse(await readFile(lexiconFile, 'utf8'))).entries.map((entry) => [entry.strong, entry]))
    : new Map<string, LexiconEntry>()
  const entries: LexiconEntry[] = [...counts.entries()]
    .filter(([strong]) => dictionary.has(strong))
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([strong, count]) => ({ ...dictionary.get(strong)!, count, korean: previous.get(strong)?.korean ?? null }))

  const original: OriginalFile = { chapters }
  await mkdir(path.dirname(originalFile), { recursive: true })
  await writeFile(originalFile, JSON.stringify(original, null, 1) + '\n', 'utf8')
  await writeFile(lexiconFile, JSON.stringify({ entries }, null, 2) + '\n', 'utf8')
  const words = chapters.reduce((sum, chapter) => sum + chapter.verses.reduce((n, verse) => n + verse.words.length, 0), 0)
  return { chapters: chapters.length, words, entries: entries.length, withKorean: entries.filter((entry) => entry.korean).length }
}
