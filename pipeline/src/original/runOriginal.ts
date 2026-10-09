import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, josa, type BookId } from 'reader-core'
import {
  lexiconFile as defaultLexiconFile,
  listBookFiles,
  originalDir as defaultOriginalDir,
  originalFilePath,
  sourceDir as defaultSourceDir,
} from '../paths.ts'
import { LexiconFileSchema, type LexiconEntry, type OriginalFile } from '../schema.ts'
import { readSource } from '../source/files.ts'
import { readOriginal } from './files.ts'
import { parseOshb, type OriginalChapter } from './oshb.ts'
import { parseStrongs } from './strongs.ts'
import { OSHB_BASE, STRONGS_URL } from './urls.ts'
import { OSHB_VERSE_MAP_URL, parseVerseMap, toKjvVerses } from './verseMap.ts'

// 책의 OSHB 파일 주소를 만든다. 파일 이름은 책의 OSIS 코드다(창세기는 Gen.xml).
export function oshbUrl(book: BookId): string {
  return `${OSHB_BASE}/${getBook(book).osis}.xml`
}

export type OriginalOptions = {
  fetchText?: (url: string) => Promise<string>
  sourceDir?: string
  originalDir?: string
  lexiconFile?: string
}

// chapters는 원어를 넣은 장 수, skipped는 절 나눔이 본문과 달라 원어 없이 둔 장 번호다.
export type OriginalResult = { chapters: number; words: number; entries: number; withKorean: number; skipped: number[] }

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}을 받지 못했습니다(${response.status})`)
  return response.text()
}

// 원어 폴더의 모든 책 파일에서 스트롱 번호마다 나온 횟수를 센다.
async function countStrongs(dir: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const book of await listBookFiles(dir)) {
    for (const chapter of (await readOriginal(book, dir)).chapters) {
      for (const verse of chapter.verses) {
        for (const word of verse.words) if (word.strong) counts.set(word.strong, (counts.get(word.strong) ?? 0) + 1)
      }
    }
  }
  return counts
}

// 본문에 있는 장의 히브리어 낱말을 개역한글(KJV식) 절 번호로 옮겨 그 책의 원어 파일에 쓴다. 옮겨도 절 나눔이 본문과 다른 장은 원어 없이 두고 알린다.
// 사전 항목은 원어 폴더의 모든 책에서 다시 세어 만들고, 이미 있는 한국어 뜻(초안, 승인)은 그대로 둔다.
export async function runOriginal(
  book: BookId,
  options: OriginalOptions = {},
  log: (line: string) => void = () => {},
): Promise<OriginalResult> {
  const { name, osis, testament } = getBook(book)
  // 본문을 읽거나 받기 전에 본다.
  if (testament === 'new') throw new Error(`신약 원어 자료는 아직 정하지 않았어요(${name})`)
  const fetchText = options.fetchText ?? defaultFetch
  const originalDir = options.originalDir ?? defaultOriginalDir
  const originalFile = originalFilePath(book, originalDir)
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile

  // 받다가 실패하면 아무 파일도 바뀌지 않게, 쓰기 전에 모두 받고 읽는다.
  const source = await readSource(book, options.sourceDir ?? defaultSourceDir)
  log(`OSHB ${josa(name, '을를')} 받는 중…`)
  const wlcChapters = parseOshb(await fetchText(oshbUrl(book)))
  const verseMap = parseVerseMap(await fetchText(OSHB_VERSE_MAP_URL), osis)
  log('스트롱 사전을 받는 중…')
  const strongsXml = await fetchText(STRONGS_URL)
  const previous = existsSync(lexiconFile)
    ? new Map(LexiconFileSchema.parse(JSON.parse(await readFile(lexiconFile, 'utf8'))).entries.map((entry) => [entry.strong, entry]))
    : new Map<string, LexiconEntry>()

  const kjvChapters = toKjvVerses(wlcChapters, verseMap)
  const chapters: OriginalChapter[] = []
  const skipped: number[] = []
  for (const { chapter, verses } of source.chapters) {
    const found = kjvChapters.find((item) => item.chapter === chapter)
    const numbers = found?.verses.map((verse) => verse.verse) ?? []
    // 원어 절이 정확히 1..n(본문 절 수)일 때만 넣는다.
    if (found && numbers.length === verses.length && numbers.every((number, index) => number === index + 1)) {
      chapters.push(found)
      continue
    }
    skipped.push(chapter)
    log(`${name} ${chapter}장은 히브리어와 개역한글의 절 나눔이 달라 원어를 넣지 않았습니다(본문 ${verses.length}절, 원어 ${numbers.length}절)`)
  }
  const original: OriginalFile = { chapters }
  await mkdir(path.dirname(originalFile), { recursive: true })
  await writeFile(originalFile, JSON.stringify(original, null, 1) + '\n', 'utf8')

  // 사전은 방금 쓴 책을 포함해 원어 폴더의 모든 책에서 센다.
  const counts = await countStrongs(originalDir)
  const dictionary = parseStrongs(strongsXml, new Set(counts.keys()))
  const missing = [...counts.keys()].filter((strong) => !dictionary.has(strong))
  if (missing.length > 0) log(`사전에 없는 번호 ${missing.length}개: ${missing.slice(0, 10).join(', ')}`)
  const entries: LexiconEntry[] = [...counts.entries()]
    .filter(([strong]) => dictionary.has(strong))
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([strong, count]) => ({ ...dictionary.get(strong)!, count, korean: previous.get(strong)?.korean ?? null }))
  await writeFile(lexiconFile, JSON.stringify({ entries }, null, 2) + '\n', 'utf8')

  const words = chapters.reduce((sum, chapter) => sum + chapter.verses.reduce((n, verse) => n + verse.words.length, 0), 0)
  return { chapters: chapters.length, words, entries: entries.length, withKorean: entries.filter((entry) => entry.korean).length, skipped }
}
