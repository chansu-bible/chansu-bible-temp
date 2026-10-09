import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { AuthError, type User, type Verify } from './auth.ts'
import type { Sql } from './db.ts'
import { applyChanges, pullChanges, SyncRequestSchema } from './records.ts'

type Env = { Variables: { user: User } }

export function createApp(deps: { sql: Sql; verify: Verify; corsOrigins: string[] }) {
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

  return app
}
