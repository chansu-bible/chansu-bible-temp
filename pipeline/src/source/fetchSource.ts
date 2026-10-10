import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, hasChapter, type BookId } from 'reader-core'
import { fetchErrorReason } from '../fetchError.ts'
import { sourceDir, sourceFilePath } from '../paths.ts'
import { SourceSchema, type Source } from '../schema.ts'
import { findSourceProblems, parseWikisource, type ChapterRange } from './parseWikisource.ts'
import { wikisourcePageTitle } from './wikisource.ts'

export type { ChapterRange }
// 쪽 이름 규칙은 받기와 상관없는 작은 모듈(wikisource.ts)에 있다. 이 모듈에서 가져오던 곳을 위해 다시 내보낸다.
export { wikisourcePageTitle }

// 장 범위 글을 읽는다. 3-7은 3~7장, 3은 3장 하나다. 책에 그 장이 있는지는 fetchSource가 본다.
export function parseChapterRange(text: string): ChapterRange {
  const range = /^(\d+)-(\d+)$/.exec(text)
  if (range) return { from: Number(range[1]), to: Number(range[2]) }
  if (/^\d+$/.test(text)) return { from: Number(text), to: Number(text) }
  throw new Error(`장 범위는 3-7이나 3처럼 씁니다: ${text}`)
}

// 위키문헌의 개역한글판 본문에서 고른 장(기본은 책 전체)을 받아 content/source/<책 id>.json에 쓴다.
// 파일에는 받은 장만 있고, 있던 파일은 합치지 않고 바꾼다. dir은 시험에서 다른 폴더에 쓰려고 둔다.
export async function fetchSource(book: BookId, range: Partial<ChapterRange> = {}, dir: string = sourceDir): Promise<Source> {
  const { name, chapters } = getBook(book)
  const from = range.from ?? 1
  const to = range.to ?? chapters
  // 받기 전에 본다.
  if (!hasChapter(book, from) || !hasChapter(book, to) || from > to) {
    throw new Error(`${name}의 장 범위가 틀렸습니다: ${from}~${to} (1~${chapters}장)`)
  }

  const title = wikisourcePageTitle(book)
  const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`
  let text: string
  try {
    // 응답이 오지 않아도 작업이 멈춰 있지 않게 60초에 끊는다.
    const response = await fetch(url, { headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' }, signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    text = await response.text()
  } catch (error) {
    throw new Error(`${name} 본문을 가져오지 못했습니다: ${title} (${fetchErrorReason(error)})`, { cause: error })
  }
  if (text.trim() === '') throw new Error(`${name} 본문이 비어 있습니다: ${title}`)

  const parsed = parseWikisource(text, from, to)
  if (parsed.length === 0) {
    throw new Error(`본문 형식을 알아보지 못했습니다. 응답의 첫 줄: ${text.trim().split(/\r?\n/)[0].trim()}`)
  }
  const problems = findSourceProblems(parsed, { from, to })
  if (problems.length > 0) throw new Error(`본문 검증에 실패했습니다:\n${problems.join('\n')}`)

  const source = SourceSchema.parse({ book: name, translation: '개역한글', chapters: parsed })
  const file = sourceFilePath(book, dir)
  await mkdir(path.dirname(file), { recursive: true })
  // 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거친다.
  await writeFile(`${file}.tmp`, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  await rename(`${file}.tmp`, file)
  return source
}
