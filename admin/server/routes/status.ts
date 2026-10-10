import { Hono } from 'hono'
import type { AppContext } from '../context.ts'
import { readStatus } from '../status.ts'
import type { BookEnv } from './params.ts'

// /api/books/:book/status
export function statusRoutes(ctx: AppContext): Hono<BookEnv> {
  const app = new Hono<BookEnv>()
  app.get('/', async (c) => c.json(await readStatus(c.var.book, ctx)))
  return app
}
