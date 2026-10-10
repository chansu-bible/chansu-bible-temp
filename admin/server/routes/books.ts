import { Hono } from 'hono'
import { listSourceBooks } from 'pipeline'
import { getBook, isBookId, type BookId } from 'reader-core'
import type { AppContext } from '../context.ts'
import { readSource } from '../content.ts'
import { HttpError } from '../errors.ts'

// chapters는 책의 장 수, sourceChapters는 본문 파일에 든 장 수다.
export type BookSummary = { id: BookId; name: string; chapters: number; sourceChapters: number }

// 주소의 책 id(/api/books/:book/…). 모르는 책이면 404.
export function parseBook(raw: string | undefined): BookId {
  if (raw === undefined || !isBookId(raw)) throw new HttpError(404, `알 수 없는 책입니다: ${raw ?? ''}`)
  return raw
}

export function bookRoutes(ctx: AppContext): Hono {
  const app = new Hono()

  // 본문 파일이 있는 책(성경 순서)
  app.get('/', async (c) => {
    const books = await listSourceBooks(ctx.sourceDir)
    const summaries = await Promise.all(
      books.map(async (book): Promise<BookSummary> => {
        const { name, chapters } = getBook(book)
        const source = await readSource(book, ctx.sourceDir)
        return { id: book, name, chapters, sourceChapters: source.chapters.length }
      }),
    )
    return c.json(summaries)
  })

  return app
}
