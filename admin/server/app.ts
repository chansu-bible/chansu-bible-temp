import { Hono } from 'hono'
import type { AppContext } from './context.ts'
import { errorMessage, HttpError } from './errors.ts'
import { JobQueue } from './jobs.ts'
import { bookRoutes } from './routes/books.ts'
import { canonRoutes } from './routes/canon.ts'
import { gitRoutes } from './routes/git.ts'
import { imageRoutes } from './routes/images.ts'
import { jobRoutes } from './routes/jobs.ts'
import { lexiconRoutes } from './routes/lexicon.ts'
import { proposalRoutes } from './routes/proposals.ts'
import { quizRoutes } from './routes/quiz.ts'
import { runRoutes } from './routes/runs.ts'
import { sceneRoutes } from './routes/scenes.ts'
import { statusRoutes } from './routes/status.ts'
import { styleRoutes } from './routes/style.ts'
import { createRunner } from './stages.ts'

// 관리 서버 앱. 모든 응답은 JSON이고, 오류는 { error }다.
export function createApp(overrides: Partial<AppContext> = {}): Hono {
  const ctx: AppContext = { queue: new JobQueue(50), createRunner, ...overrides }
  const app = new Hono()

  // 책을 가리는 API. 모르는 책은 404다.
  app.route('/api/books', bookRoutes(ctx))
  app.route('/api/books/:book/status', statusRoutes(ctx))
  app.route('/api/books/:book/scenes', sceneRoutes(ctx))
  app.route('/api/books/:book/quiz', quizRoutes(ctx))
  // 설정집·원어 사전·그림·작업·실행 기록·저장소는 모든 책이 함께 쓴다.
  app.route('/api/canon', canonRoutes(ctx))
  app.route('/api/proposals', proposalRoutes(ctx))
  app.route('/api/style', styleRoutes(ctx))
  app.route('/api/images', imageRoutes(ctx))
  app.route('/api/lexicon', lexiconRoutes(ctx))
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
