import { Hono } from 'hono'
import { listSourceBooks } from 'pipeline'
import { getBook, type BookId } from 'reader-core'
import type { AppContext } from '../context.ts'
import { readSource } from '../content.ts'
import { errorMessage } from '../errors.ts'
import { parseBook, type BookEnv } from './params.ts'
import { quizRoutes } from './quiz.ts'
import { sceneRoutes } from './scenes.ts'
import { statusRoutes } from './status.ts'

export type BookSummary = {
  id: BookId
  name: string
  // 책의 장 수
  chapters: number
  // 본문 파일에 든 장 수와 그 첫 장·끝 장. 장이 없거나 본문을 읽지 못하면 sourceRange는 null이다.
  sourceChapters: number
  sourceRange: { from: number; to: number } | null
  // 본문 파일을 읽지 못한 까닭(파일 이름이 든다). 읽었으면 없다.
  error?: string
}

// 책 하나의 요약. 본문을 읽지 못해도 던지지 않고 error에 담아, 다른 책은 그대로 쓰게 한다.
async function summarize(book: BookId, sourceDir: string | undefined): Promise<BookSummary> {
  const { name, chapters } = getBook(book)
  try {
    const numbers = (await readSource(book, sourceDir)).chapters.map((item) => item.chapter)
    const sourceRange = numbers.length > 0 ? { from: Math.min(...numbers), to: Math.max(...numbers) } : null
    return { id: book, name, chapters, sourceChapters: numbers.length, sourceRange }
  } catch (error) {
    return { id: book, name, chapters, sourceChapters: 0, sourceRange: null, error: errorMessage(error) }
  }
}

// /api/books: 본문 파일이 있는 책(성경 순서). 본문을 읽지 못한 책도 error와 함께 넣는다.
export function bookRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  app.get('/', async (c) => {
    const books = await listSourceBooks(ctx.sourceDir)
    return c.json(await Promise.all(books.map((book) => summarize(book, ctx.sourceDir))))
  })
  return app
}

// 책을 가리는 API(/api/books/:book/…). 주소의 책을 한 번 읽어 c.var.book에 두고, 모르는 책이면 404다.
export function bookScopedRoutes(ctx: AppContext): Hono<BookEnv> {
  const app = new Hono<BookEnv>()
  app.use(async (c, next) => {
    c.set('book', parseBook(c.req.param('book')))
    await next()
  })
  app.route('/status', statusRoutes(ctx))
  app.route('/scenes', sceneRoutes(ctx))
  app.route('/quiz', quizRoutes(ctx))
  return app
}
