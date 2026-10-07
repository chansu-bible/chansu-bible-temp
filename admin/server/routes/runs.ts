import { Hono } from 'hono'
import { readRuns, summarizeRuns } from 'pipeline'
import { HttpError } from '../errors.ts'

export function runRoutes(): Hono {
  const app = new Hono()

  // 최근 days일(기본 7)의 LLM 호출 기록과 합계
  app.get('/', async (c) => {
    const raw = c.req.query('days')
    const days = raw === undefined || raw === '' ? 7 : Number(raw)
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new HttpError(400, `days는 1 이상의 정수여야 합니다: ${raw}`)
    }
    const runs = await readRuns(days)
    return c.json({ runs, totals: summarizeRuns(runs) })
  })

  return app
}
