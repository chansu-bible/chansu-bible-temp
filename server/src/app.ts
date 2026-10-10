import { Hono } from 'hono'
import { isBookId } from 'reader-core'
import { z } from 'zod'
import { answerQuestion, type AskModel } from './ask/answer.ts'
import type { PassageIndex } from './ask/retrieve.ts'
import { DEFAULT_DAILY_LIMIT, giveBack, koreaDay, takeAsk, usedToday } from './ask/usage.ts'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { AuthError, type User, type Verify } from './auth.ts'
import type { Sql } from './db.ts'
import { applyChanges, pullChanges, SyncRequestSchema } from './records.ts'

type Env = { Variables: { user: User } }

// 질문하기에 쓰는 것. 없으면(키나 묶음이 없음) /ask는 503이다. 읽어 둔 책은 index.books에 있다.
export type AskDeps = { index: PassageIndex; model: AskModel; dailyLimit?: number; now?: () => number }

// book은 독자가 읽고 있는 책의 id다. 성경 책 id가 아니면 400이다.
const AskRequestSchema = z.object({
  question: z.string().trim().min(1).max(300),
  chapter: z.number().int().positive().optional(),
  book: z.string().optional(),
})

export function createApp(deps: { sql: Sql; verify: Verify; corsOrigins: string[]; ask?: AskDeps | null }) {
  const app = new Hono<Env>()

  app.use(
    '*',
    cors({ origin: deps.corsOrigins, allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 600 }),
  )

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: '서버 오류가 났습니다' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  // 로그인한 사용자만 쓰는 경로에 붙인다.
  const authenticate = createMiddleware<Env>(async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (token === '') return c.json({ error: '로그인이 필요합니다' }, 401)
    try {
      c.set('user', await deps.verify(token))
    } catch (error) {
      if (error instanceof AuthError) return c.json({ error: error.message }, 401)
      throw error
    }
    await next()
  })

  app.get('/me', authenticate, (c) => {
    const user = c.get('user')
    return c.json({ sub: user.sub, name: user.name, username: user.username })
  })

  // 한 번에 올리고 받는다. 받은 줄을 먼저 반영한 뒤 since 다음에 바뀐 줄을 돌려준다(방금 올린 줄도 새 순번으로 돌아온다).
  // 같은 사용자의 동기화는 사용자별 잠금으로 차례로 처리해, 받아 간 순번보다 앞 순번이 늦게 쓰여 빠지는 일이 없게 한다.
  app.post(
    '/sync',
    authenticate,
    bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: '요청이 너무 큽니다' }, 413) }),
    async (c) => {
      const parsed = SyncRequestSchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) return c.json({ error: '요청 형식이 맞지 않습니다', issues: parsed.error.issues.slice(0, 5) }, 400)
      const user = c.get('user')
      const result = await deps.sql.transaction(async (query) => {
        await query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.sub])
        await applyChanges(query, user.sub, parsed.data.changes)
        return pullChanges(query, user.sub, parsed.data.since)
      })
      return c.json(result)
    },
  )

  // 오늘 남은 질문 수
  app.get('/ask/usage', authenticate, async (c) => {
    const limit = deps.ask?.dailyLimit ?? DEFAULT_DAILY_LIMIT
    const used = await usedToday(deps.sql.query, c.get('user').sub, koreaDay(deps.ask?.now?.()))
    return c.json({ available: deps.ask != null, limit, remaining: Math.max(0, limit - used) })
  })

  // 질문하기: 검수된 자료에서 대목을 찾아 그 안에서만 답한다. 문장마다 근거가 없으면 "자료에 없어요"다.
  app.post(
    '/ask',
    authenticate,
    bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: '질문이 너무 깁니다' }, 413) }),
    async (c) => {
      const ask = deps.ask
      if (!ask) return c.json({ error: '질문하기를 지금 쓸 수 없어요' }, 503)
      const parsed = AskRequestSchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) return c.json({ error: '질문은 1자에서 300자 사이로 써 주세요' }, 400)
      const { question, chapter, book } = parsed.data
      if (book !== undefined && !isBookId(book)) return c.json({ error: `알 수 없는 책입니다: ${book}` }, 400)
      const user = c.get('user')
      const limit = ask.dailyLimit ?? DEFAULT_DAILY_LIMIT
      const day = koreaDay(ask.now?.())
      const taken = await takeAsk(deps.sql.query, user.sub, day, limit)
      if (!taken.allowed) return c.json({ error: '오늘 질문을 모두 썼어요. 내일 다시 물어 주세요.', remaining: 0 }, 429)
      try {
        const result = await answerQuestion(ask.index, ask.model, { question, chapter, book })
        return c.json({ ...result, remaining: Math.max(0, limit - taken.count) })
      } catch (error) {
        await giveBack(deps.sql.query, user.sub, day)
        console.error('질문하기 실패:', error instanceof Error ? error.message : error)
        return c.json({ error: '답을 만들지 못했어요. 잠시 뒤에 다시 물어 주세요.' }, 502)
      }
    },
  )

  return app
}
