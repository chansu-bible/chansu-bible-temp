import { Hono } from 'hono'
import type { AppContext } from '../context.ts'
import { readStatus } from '../status.ts'
import { parseBook } from './books.ts'

// /api/books/:book/status
export function statusRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  app.get('/', async (c) => c.json(await readStatus(parseBook(c.req.param('book')), ctx)))
  return app
}
