import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { bookOrder, findBook, getBook, josa, type BookId } from 'reader-core'
import { repoRoot, sourceDir as defaultSourceDir, sourceFilePath } from '../paths.ts'
import { SourceSchema, type Source, type SourceChapter } from '../schema.ts'

function displayName(file: string): string {
  const relative = path.relative(repoRoot, file)
  return (relative.startsWith('..') ? file : relative).split(path.sep).join('/')
}

// 책의 본문. 없으면 source 단계를 먼저 돌리라는 오류를 낸다. 파일의 book(한국어 이름)이 책과 다르면 오류다.
export async function readSource(book: BookId, dir: string = defaultSourceDir): Promise<Source> {
  const { name } = getBook(book)
  const file = sourceFilePath(book, dir)
  if (!existsSync(file)) throw new Error(`${name} 본문이 없습니다. 먼저 source --book ${book}를 실행하세요.`)
  let source: Source
  try {
    source = SourceSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayName(file)}: ${message}`)
  }
  if (source.book !== name) throw new Error(`${displayName(file)}의 책 이름(${source.book})이 ${josa(name, '이가')} 아닙니다`)
  return source
}

// 본문에서 한 장을 읽는다. 없으면 오류.
export async function readSourceChapter(book: BookId, chapter: number, dir: string = defaultSourceDir): Promise<SourceChapter> {
  const found = (await readSource(book, dir)).chapters.find((item) => item.chapter === chapter)
  if (!found) throw new Error(`${getBook(book).name} 본문에 ${chapter}장이 없습니다. 먼저 source 단계를 실행하세요.`)
  return found
}

// 본문 파일이 있는 책, 성경 순서로
export async function listSourceBooks(dir: string = defaultSourceDir): Promise<BookId[]> {
  if (!existsSync(dir)) return []
  const names = await readdir(dir)
  const books = names.flatMap((name) => {
    const book = name.endsWith('.json') ? findBook(name.slice(0, -'.json'.length)) : undefined
    return book ? [book] : []
  })
  return books.sort((a, b) => bookOrder(a.id) - bookOrder(b.id)).map((book) => book.id)
}

// 책마다 장별 절 수(설정집 인용 검증용). 장 번호 n의 절 수는 counts[n - 1]이다(없는 장은 0).
export async function readVerseCounts(dir: string = defaultSourceDir): Promise<Map<BookId, number[]>> {
  const counts = new Map<BookId, number[]>()
  for (const book of await listSourceBooks(dir)) {
    const source = await readSource(book, dir)
    const list: number[] = []
    for (const chapter of source.chapters) list[chapter.chapter - 1] = chapter.verses.length
    counts.set(book, Array.from(list, (count) => count ?? 0))
  }
  return counts
}
