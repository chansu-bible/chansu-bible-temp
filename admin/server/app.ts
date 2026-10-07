import { Hono } from 'hono'
import type { AppContext } from './context.ts'
import { errorMessage, HttpError } from './errors.ts'
import { JobQueue } from './jobs.ts'
import { canonRoutes } from './routes/canon.ts'
import { gitRoutes } from './routes/git.ts'
import { imageRoutes } from './routes/images.ts'
import { jobRoutes } from './routes/jobs.ts'
import { proposalRoutes } from './routes/proposals.ts'
import { runRoutes } from './routes/runs.ts'
import { sceneRoutes } from './routes/scenes.ts'
import { statusRoutes } from './routes/status.ts'
import { styleRoutes } from './routes/style.ts'
import { createRunner } from './stages.ts'

// 관리 서버 앱. 모든 응답은 JSON이고, 오류는 { error }다.
export function createApp(overrides: Partial<AppContext> = {}): Hono {
  const ctx: AppContext = { queue: new JobQueue(50), createRunner, ...overrides }
  const app = new Hono()

  app.route('/api/status', statusRoutes(ctx))
  app.route('/api/canon', canonRoutes(ctx))
  app.route('/api/proposals', proposalRoutes(ctx))
  app.route('/api/scenes', sceneRoutes(ctx))
  app.route('/api/style', styleRoutes(ctx))
  app.route('/api/images', imageRoutes(ctx))
  app.route('/api/jobs', jobRoutes(ctx))
  app.route('/api/runs', runRoutes())
  app.route('/api/git', gitRoutes())

  app.notFound((c) => c.json({ error: `없는 경로입니다: ${c.req.method} ${c.req.path}` }, 404))
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: errorMessage(error, '서버에서 검증에 실패했습니다') }, 500)
  })
  return app
}
