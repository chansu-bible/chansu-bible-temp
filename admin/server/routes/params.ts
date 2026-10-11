import { getBook, isBookId, type BookId } from 'reader-core'
import { readSource } from '../content.ts'
import { HttpError } from '../errors.ts'

// 책을 가리는 API(/api/books/:book/…)의 라우트가 받는 값. 주소의 책은 bookScopedRoutes가 한 번 읽어 c.var.book에 둔다.
export type BookEnv = { Variables: { book: BookId } }

// 주소의 책 id. 모르는 책이면 404.
export function parseBook(raw: string | undefined): BookId {
  if (raw === undefined || !isBookId(raw)) throw new HttpError(404, `알 수 없는 책입니다: ${raw ?? ''}`)
  return raw
}

// 주소의 장 번호. 1 이상의 정수가 아니면 400.
export function parseChapter(raw: string): number {
  const chapter = Number(raw)
  if (!Number.isInteger(chapter) || chapter < 1) throw new HttpError(400, `장 번호가 잘못되었습니다: ${raw}`)
  return chapter
}

// 본문의 한 장. 본문에 없는 장이면 404.
export async function sourceChapterOf(book: BookId, chapter: number, sourceDir: string | undefined) {
  const found = (await readSource(book, sourceDir)).chapters.find((item) => item.chapter === chapter)
  if (!found) throw new HttpError(404, `${getBook(book).name} 본문에 ${chapter}장이 없습니다`)
  return found
}
