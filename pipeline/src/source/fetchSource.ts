import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, hasChapter, type BookId } from 'reader-core'
import { sourceDir, sourceFilePath } from '../paths.ts'
import { SourceSchema, type Source } from '../schema.ts'
import { findSourceProblems, parseWikisource } from './parseWikisource.ts'

// 위키문헌에는 요한일서·요한이서·요한삼서가 요한1서·요한2서·요한3서라는 쪽 이름으로 있다. 나머지 63권은 책 이름 그대로다.
// 본문 파일의 책 이름은 쪽 이름과 상관없이 개역한글 이름(요한일서)이다.
const pageNames: Partial<Record<BookId, string>> = {
  '1-john': '요한1서',
  '2-john': '요한2서',
  '3-john': '요한3서',
}

export function wikisourcePageTitle(book: BookId): string {
  return `개역한글판/${pageNames[book] ?? getBook(book).name}`
}

// --chapters 값을 읽는다. 3-7은 3~7장, 3은 3장 하나다. 책에 그 장이 있는지는 fetchSource가 본다.
export function parseChapterRange(text: string): { from: number; to: number } {
  const range = /^(\d+)-(\d+)$/.exec(text)
  if (range) return { from: Number(range[1]), to: Number(range[2]) }
  if (/^\d+$/.test(text)) return { from: Number(text), to: Number(text) }
  throw new Error(`--chapters는 3-7이나 3처럼 씁니다: ${text}`)
}

// 위키문헌의 개역한글판 본문에서 고른 장(기본은 책 전체)을 받아 content/source/<책 id>.json에 쓴다.
// 파일에는 받은 장만 있고, 있던 파일은 합치지 않고 바꾼다. dir은 시험에서 다른 폴더에 쓰려고 둔다.
export async function fetchSource(book: BookId, range: { from?: number; to?: number } = {}, dir: string = sourceDir): Promise<Source> {
  const { name, chapters } = getBook(book)
  const from = range.from ?? 1
  const to = range.to ?? chapters
  // 받기 전에 본다.
  if (!hasChapter(book, from) || !hasChapter(book, to) || from > to) {
    throw new Error(`${name}의 장 범위가 틀렸습니다: ${from}~${to} (1~${chapters}장)`)
  }

  const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(wikisourcePageTitle(book))}&action=raw`
  const response = await fetch(url, { headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' } })
  if (!response.ok) throw new Error(`본문을 가져오지 못했습니다 (HTTP ${response.status})`)

  const text = await response.text()
  const parsed = parseWikisource(text, from, to)
  if (parsed.length === 0) {
    throw new Error(`본문 형식을 알아보지 못했습니다. 응답의 첫 줄: ${text.split(/\r?\n/)[0]}`)
  }
  const problems = findSourceProblems(parsed, { from, to })
  if (problems.length > 0) throw new Error(`본문 검증에 실패했습니다:\n${problems.join('\n')}`)

  const source = SourceSchema.parse({ book: name, translation: '개역한글', chapters: parsed })
  const file = sourceFilePath(book, dir)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  return source
}
