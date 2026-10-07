import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../context.ts'
import { HttpError } from '../errors.ts'
import { JobBusyError } from '../jobs.ts'
import { JobRequestError, parseJobRequest } from '../stages.ts'

export function jobRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const { queue } = ctx

  const getJob = (id: string) => {
    const job = queue.get(id)
    if (!job) throw new HttpError(404, `작업이 없습니다: ${id}`)
    return job
  }

  app.get('/', (c) => c.json(queue.list()))

  app.post('/', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HttpError(400, '본문이 JSON이 아닙니다')
    }
    try {
      const { stage, options } = parseJobRequest(body)
      const job = queue.enqueue(stage, options, ctx.createRunner(stage, options))
      return c.json({ id: job.id }, 202)
    } catch (error) {
      if (error instanceof JobRequestError) throw new HttpError(400, error.message)
      if (error instanceof JobBusyError) throw new HttpError(409, error.message)
      throw error
    }
  })

  app.get('/:id', (c) => c.json(getJob(c.req.param('id'))))

  // 쌓인 줄을 먼저 보내고 새 줄을 이어 보낸다. 끝나면 event: end를 보내고 닫는다.
  app.get('/:id/events', (c) => {
    const job = getJob(c.req.param('id'))
    return streamSSE(c, async (stream) => {
      await new Promise<void>((resolve) => {
        let chain = Promise.resolve()
        const send = (message: { data: string; event?: string }) => {
          chain = chain.then(() => stream.writeSSE(message)).catch(() => {})
        }
        let stop = () => {}
        stream.onAbort(() => {
          stop()
          resolve()
        })
        stop = queue.subscribe(job.id, {
          onLine: (line) => send({ data: JSON.stringify({ line }) }),
          onEnd: (status) => {
            send({ event: 'end', data: JSON.stringify({ status }) })
            void chain.then(resolve)
          },
        })
      })
    })
  })

  return app
}
