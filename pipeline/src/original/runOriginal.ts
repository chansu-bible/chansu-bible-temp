import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, josa, type BookId } from 'reader-core'
import {
  lexiconFile as defaultLexiconFile,
  listBookFiles,
  originalDir as defaultOriginalDir,
  originalFilePath,
  sourceDir as defaultSourceDir,
} from '../paths.ts'
import type { LexiconEntry, OriginalFile, Source } from '../schema.ts'
import { readSource } from '../source/files.ts'
import { readLexicon, readOriginal } from './files.ts'
import { parseOshb, type OriginalChapter } from './oshb.ts'
import { parseStrongs } from './strongs.ts'
import { OSHB_BASE, STRONGS_URL } from './urls.ts'
import { OSHB_VERSE_MAP_URL, parseVerseMap, toKjvVerses } from './verseMap.ts'

// 책의 OSHB 파일 주소를 만든다. 파일 이름은 책의 OSIS 코드다(창세기는 Gen.xml).
export function oshbUrl(book: BookId): string {
  return `${OSHB_BASE}/${getBook(book).osis}.xml`
}

export type FetchText = (url: string) => Promise<string>

export type OriginalOptions = {
  fetchText?: FetchText
  sourceDir?: string
  originalDir?: string
  lexiconFile?: string
}

// chapters는 원어를 넣은 장 수, skipped는 절 나눔이 본문과 달라 원어 없이 둔 장 번호다.
export type OriginalResult = { chapters: number; words: number; entries: number; withKorean: number; skipped: number[] }

// 절 나눔이 본문과 달라 원어를 넣지 않은 장. verses는 본문 절 수, original은 KJV 절 번호로 옮긴 원어 절 수다.
export type SkippedChapter = { chapter: number; verses: number; original: number }

// 응답이 오지 않아도 멈춰 있지 않게 120초에 끊는다.
async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`${url}을 받지 못했습니다(${response.status})`)
  return response.text()
}

// 같은 주소는 한 번만 받는다. 모든 책의 원어를 만들 때 스트롱 사전과 절 대응표를 책마다 다시 받지 않게 쓴다. 받다가 실패한 주소는 잊는다.
export function memoizeFetch(fetchText: FetchText = defaultFetch): FetchText {
  const texts = new Map<string, Promise<string>>()
  return (url) => {
    let text = texts.get(url)
    if (!text) {
      text = fetchText(url)
      texts.set(url, text)
      text.catch(() => texts.delete(url))
    }
    return text
  }
}

// 원어 자료가 있는 책인지 본다. 지금은 구약(OSHB)만 있고, 신약 원어 자료는 아직 정하지 않았다.
function isOldTestament(book: BookId): boolean {
  return getBook(book).testament === 'old'
}

// 책을 고르지 않고 모든 책의 원어를 만들 때 돌릴 책을 고른다. 신약 책은 알리고 건너뛴다.
export function originalBooks(books: BookId[], log: (line: string) => void = () => {}): BookId[] {
  return books.filter((book) => {
    if (isOldTestament(book)) return true
    log(`${josa(getBook(book).name, '은는')} 신약이라 원어를 건너뜁니다`)
    return false
  })
}

// 본문의 장마다 KJV 절 번호로 옮긴 원어를 맞춘다. 원어 절이 정확히 1..n(본문 절 수)인 장만 넣고 나머지는 skipped로 돌려준다.
// 원어에 아예 없는 장은 원어 0절로 빠진다. 본문에 없는 장은 넣지 않는다.
export function alignChapters(source: Source, kjvChapters: OriginalChapter[]): { chapters: OriginalChapter[]; skipped: SkippedChapter[] } {
  const chapters: OriginalChapter[] = []
  const skipped: SkippedChapter[] = []
  for (const { chapter, verses } of source.chapters) {
    const found = kjvChapters.find((item) => item.chapter === chapter)
    const numbers = found?.verses.map((verse) => verse.verse) ?? []
    if (found && numbers.length === verses.length && numbers.every((number, index) => number === index + 1)) chapters.push(found)
    else skipped.push({ chapter, verses: verses.length, original: numbers.length })
  }
  return { chapters, skipped }
}

const byNumber = (a: string, b: string): number => Number(a.slice(1)) - Number(b.slice(1))

// 여러 책의 원어에서 스트롱 번호마다 나온 횟수를 센다.
function countStrongs(originals: OriginalFile[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { chapters } of originals) {
    for (const chapter of chapters) {
      for (const verse of chapter.verses) {
        for (const word of verse.words) if (word.strong) counts.set(word.strong, (counts.get(word.strong) ?? 0) + 1)
      }
    }
  }
  return counts
}

// 모든 책의 원어로 사전 항목을 만든다. 원어에 나오는 번호마다 스트롱 사전(XML) 항목에 나온 횟수와 이전 항목의 한국어 뜻을 붙이고 번호 차례로 둔다.
// - missing: 원어에 나오는데 스트롱 사전에 없는 번호(번호 차례)
// - kept: 한국어 뜻이 있는데 이번에 사전에서 만들지 못한 이전 항목. 사람이 쓴 뜻을 잃지 않게 그대로 남기되 횟수만 지금 나온 횟수(어느 책에도 없으면 0)로 바꾼다.
//   어느 책 원어에도 나오지 않게 된 번호와 스트롱 사전에 없는 번호가 여기에 든다. 한국어 뜻이 없는 이전 항목은 남기지 않는다.
export function buildLexicon(
  originals: OriginalFile[],
  strongsXml: string,
  previous: LexiconEntry[],
): { entries: LexiconEntry[]; missing: string[]; kept: LexiconEntry[] } {
  const counts = countStrongs(originals)
  const dictionary = parseStrongs(strongsXml, new Set(counts.keys()))
  const missing = [...counts.keys()].filter((strong) => !dictionary.has(strong)).sort(byNumber)
  const korean = new Map(previous.map((entry) => [entry.strong, entry.korean]))
  const built: LexiconEntry[] = [...counts.entries()]
    .filter(([strong]) => dictionary.has(strong))
    .map(([strong, count]) => ({ ...dictionary.get(strong)!, count, korean: korean.get(strong) ?? null }))
  const builtNumbers = new Set(built.map((entry) => entry.strong))
  const kept = previous
    .filter((entry) => entry.korean !== null && !builtNumbers.has(entry.strong))
    .map((entry) => ({ ...entry, count: counts.get(entry.strong) ?? 0 }))
    .sort((a, b) => byNumber(a.strong, b.strong))
  const entries = [...built, ...kept].sort((a, b) => byNumber(a.strong, b.strong))
  return { entries, missing, kept }
}

// 본문에 있는 장의 히브리어 낱말을 개역한글(KJV식) 절 번호로 옮겨 그 책의 원어 파일에 쓴다. 옮겨도 절 나눔이 본문과 다른 장은 원어 없이 두고 알린다.
// 사전 항목은 원어 폴더의 모든 책에서 다시 세어 만들고, 이미 있는 한국어 뜻(초안, 승인)은 그대로 둔다.
// 한국어 뜻이 있는 항목은 그 번호가 어느 책에도 나오지 않게 되어도 횟수 0으로 남긴다.
// 받은 자료가 틀려 보이면(가로챈 HTML 쪽 같은 것) 아무 파일도 쓰지 않고, 무엇이 이상한지와 주소를 대며 멈춘다.
export async function runOriginal(
  book: BookId,
  options: OriginalOptions = {},
  log: (line: string) => void = () => {},
): Promise<OriginalResult> {
  const { name, osis } = getBook(book)
  // 본문을 읽거나 받기 전에 본다.
  if (!isOldTestament(book)) throw new Error(`신약 원어 자료는 아직 정하지 않았어요(${name})`)
  const fetchText = options.fetchText ?? defaultFetch
  const originalDir = options.originalDir ?? defaultOriginalDir
  const originalFile = originalFilePath(book, originalDir)
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile

  // 깨진 파일이 있으면 받기 전에 멈추도록 본문, 사전, 다른 책 원어를 먼저 읽는다. 이 책의 원어 파일은 새로 쓰므로 읽지 않는다.
  const source = await readSource(book, options.sourceDir ?? defaultSourceDir)
  const previous = existsSync(lexiconFile) ? (await readLexicon(lexiconFile)).entries : []
  const others: OriginalFile[] = []
  for (const other of await listBookFiles(originalDir)) if (other !== book) others.push(await readOriginal(other, originalDir))

  const url = oshbUrl(book)
  log(`OSHB ${josa(name, '을를')} 받는 중…`)
  const wlcChapters = parseOshb(await fetchText(url))
  if (wlcChapters.length === 0) throw new Error(`OSHB ${name} 자료에서 절을 하나도 찾지 못했습니다. 받은 글이 OSHB 파일인지 보세요: ${url}`)
  const verseMapXml = await fetchText(OSHB_VERSE_MAP_URL)
  if (!/<verseMap[\s>]/.test(verseMapXml)) {
    throw new Error(`받은 절 대응표에 <verseMap>이 없습니다. 받은 글이 VerseMap.xml인지 보세요: ${OSHB_VERSE_MAP_URL}`)
  }
  log('스트롱 사전을 받는 중…')
  const strongsXml = await fetchText(STRONGS_URL)

  // 원어 파일과 사전을 둘 다 메모리에서 만든 뒤에 쓴다.
  const { chapters, skipped } = alignChapters(source, toKjvVerses(wlcChapters, parseVerseMap(verseMapXml, osis)))
  for (const item of skipped) {
    log(`${name} ${item.chapter}장은 히브리어와 개역한글의 절 나눔이 달라 원어를 넣지 않았습니다(본문 ${item.verses}절, 원어 ${item.original}절)`)
  }
  if (chapters.length === 0 && source.chapters.length > 0) {
    throw new Error(`${name} 본문의 어느 장에도 원어를 맞추지 못했습니다. 받은 OSHB와 절 대응표가 맞는지 보세요: ${url}, ${OSHB_VERSE_MAP_URL}`)
  }
  const original: OriginalFile = { chapters }
  const { entries, missing, kept } = buildLexicon([...others, original], strongsXml, previous)
  if (missing.length > 0) {
    throw new Error(
      `스트롱 사전에 없는 번호가 ${missing.length}개 있습니다(${missing.slice(0, 10).join(', ')}). 받은 글이 스트롱 사전인지 보세요: ${STRONGS_URL}`,
    )
  }
  if (kept.length > 0) {
    const numbers = kept.slice(0, 10).map((entry) => entry.strong)
    log(`어느 책 원어에도 나오지 않지만 한국어 뜻이 있어 남긴 사전 항목 ${kept.length}개: ${numbers.join(', ')}`)
  }
  const originalText = JSON.stringify(original, null, 1) + '\n'
  const lexiconText = JSON.stringify({ entries }, null, 2) + '\n'

  // 둘 다 만든 뒤에 쓴다. 두 쓰기 사이에서 실패할 때만 사전이 옛 것으로 남을 수 있고, 다시 돌리면 고쳐진다.
  await mkdir(path.dirname(originalFile), { recursive: true })
  await writeFile(originalFile, originalText, 'utf8')
  await writeFile(lexiconFile, lexiconText, 'utf8')

  const words = chapters.reduce((sum, chapter) => sum + chapter.verses.reduce((n, verse) => n + verse.words.length, 0), 0)
  return {
    chapters: chapters.length,
    words,
    entries: entries.length,
    withKorean: entries.filter((entry) => entry.korean).length,
    skipped: skipped.map((item) => item.chapter),
  }
}
