import { Hono } from 'hono'
import type { AppContext } from '../context.ts'
import { readStatus } from '../status.ts'

export function statusRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  app.get('/', async (c) => c.json(await readStatus(ctx.storyBibleDir)))
  return app
}
