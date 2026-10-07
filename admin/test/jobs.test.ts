import { describe, expect, it } from 'vitest'
import { JobBusyError, JobQueue, type Runner } from '../server/jobs.ts'
import { JobRequestError, parseJobRequest } from '../server/stages.ts'

// 끝날 때를 밖에서 정하는 가짜 작업
function controlled() {
  let finish!: () => void
  let log!: (line: string) => void
  const runner: Runner = (logLine) => {
    log = logLine
    return new Promise<void>((resolve) => {
      finish = resolve
    })
  }
  return { runner, finish: () => finish(), log: (line: string) => log(line) }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('JobQueue', () => {
  it('작업을 실행하고 줄을 모은 뒤 done이 된다', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('build', {}, async (log) => {
      log('하나')
      log('둘\n셋')
    })
    expect(['queued', 'running']).toContain(job.status)
    await queue.wait(job.id)
    const done = queue.get(job.id)!
    expect(done.status).toBe('done')
    expect(done.lines).toEqual(['하나', '둘', '셋'])
    expect(done.startedAt).not.toBeNull()
    expect(done.endedAt).not.toBeNull()
    expect(done.error).toBeNull()
  })

  it('실행 중이면 새 작업을 받지 않는다', async () => {
    const queue = new JobQueue()
    const first = controlled()
    const job = queue.enqueue('build', {}, first.runner)
    expect(() => queue.enqueue('build', {}, async () => {})).toThrow(JobBusyError)
    await tick()
    expect(queue.get(job.id)!.status).toBe('running')
    expect(() => queue.enqueue('build', {}, async () => {})).toThrow(JobBusyError)
    first.finish()
    await queue.wait(job.id)
    expect(() => queue.enqueue('build', {}, async () => {})).not.toThrow()
  })

  it('실패하면 failed와 error를 남긴다', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('canon', { chapter: 1 }, async (log) => {
      log('시작')
      throw new Error('망가짐')
    })
    await queue.wait(job.id)
    const failed = queue.get(job.id)!
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('망가짐')
    expect(failed.lines[0]).toBe('시작')
    expect(failed.lines.at(-1)).toContain('망가짐')
  })

  it('구독자는 이미 쌓인 줄을 먼저 받고, 새 줄과 끝을 받는다', async () => {
    const queue = new JobQueue()
    const run = controlled()
    const job = queue.enqueue('build', {}, run.runner)
    await tick()
    run.log('앞')
    const lines: string[] = []
    const ends: string[] = []
    queue.subscribe(job.id, { onLine: (line) => lines.push(line), onEnd: (status) => ends.push(status) })
    expect(lines).toEqual(['앞'])
    run.log('뒤')
    expect(lines).toEqual(['앞', '뒤'])
    run.finish()
    await queue.wait(job.id)
    expect(ends).toEqual(['done'])
  })

  it('끝난 작업을 구독하면 줄과 끝을 바로 받는다', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('build', {}, async (log) => log('끝난 줄'))
    await queue.wait(job.id)
    const got: string[] = []
    queue.subscribe(job.id, { onLine: (line) => got.push(line), onEnd: (status) => got.push(`end:${status}`) })
    expect(got).toEqual(['끝난 줄', 'end:done'])
  })

  it('구독을 끊으면 더 받지 않는다', async () => {
    const queue = new JobQueue()
    const run = controlled()
    const job = queue.enqueue('build', {}, run.runner)
    await tick()
    const lines: string[] = []
    const stop = queue.subscribe(job.id, { onLine: (line) => lines.push(line), onEnd: () => {} })
    stop()
    run.log('안 받음')
    run.finish()
    await queue.wait(job.id)
    expect(lines).toEqual([])
  })

  it('최근 작업만 남기고 최신 순으로 돌려준다', async () => {
    const queue = new JobQueue(3)
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const job = queue.enqueue('build', {}, async () => {})
      ids.push(job.id)
      await queue.wait(job.id)
    }
    expect(queue.list().map((job) => job.id)).toEqual([ids[4], ids[3], ids[2]])
    expect(queue.get(ids[0]!)).toBeUndefined()
  })
})

describe('parseJobRequest', () => {
  it('단계에서 쓰는 옵션만 남긴다', () => {
    expect(parseJobRequest({ stage: 'canon', options: { chapter: 1, dryRun: true, force: true } })).toEqual({
      stage: 'canon',
      options: { chapter: 1, dryRun: true },
    })
    expect(
      parseJobRequest({
        stage: 'images',
        options: { chapter: 2, scenes: ['g2-s1'], force: true, allowDraft: false, dryRun: true, limit: 2 },
      }),
    ).toEqual({
      stage: 'images',
      options: { chapter: 2, scenes: ['g2-s1'], force: true, allowDraft: false, dryRun: true, limit: 2 },
    })
    expect(parseJobRequest({ stage: 'build', options: { chapter: 3 } })).toEqual({ stage: 'build', options: {} })
    expect(parseJobRequest({ stage: 'source' })).toEqual({ stage: 'source', options: {} })
  })

  it('scenario는 chapter·force·dryRun, review-text는 chapter·scenes·dryRun만 쓴다', () => {
    const options = { chapter: 3, scenes: ['genesis-03-01'], force: true, allowDraft: true, dryRun: true, limit: 2 }
    expect(parseJobRequest({ stage: 'scenario', options })).toEqual({
      stage: 'scenario',
      options: { chapter: 3, force: true, dryRun: true },
    })
    expect(parseJobRequest({ stage: 'review-text', options })).toEqual({
      stage: 'review-text',
      options: { chapter: 3, scenes: ['genesis-03-01'], dryRun: true },
    })
    expect(() => parseJobRequest({ stage: 'scenario', options: {} })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'review-text', options: { dryRun: true } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'review-text', options: { chapter: 3, scenes: 'genesis-03-01' } })).toThrow(
      /scenes/,
    )
  })

  it('장 번호가 필요한 단계에 없으면 오류', () => {
    expect(() => parseJobRequest({ stage: 'canon', options: {} })).toThrow(JobRequestError)
    expect(() => parseJobRequest({ stage: 'tts', options: { chapter: 0 } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'images', options: { chapter: '1' } })).toThrow(JobRequestError)
  })

  it('옵션 형식이 틀리면 오류', () => {
    expect(() => parseJobRequest({ stage: 'images', options: { chapter: 1, limit: -1 } })).toThrow(/limit/)
    expect(() => parseJobRequest({ stage: 'images', options: { chapter: 1, scenes: 'g1-s1' } })).toThrow(/scenes/)
    expect(() => parseJobRequest({ stage: 'tts', options: { chapter: 1, force: 'yes' } })).toThrow(/force/)
  })

  it('없는 단계는 "아직 없는 단계"', () => {
    expect(() => parseJobRequest({ stage: 'scenes', options: {} })).toThrow(/아직 없는 단계/)
    expect(() => parseJobRequest({ options: {} })).toThrow(JobRequestError)
    expect(() => parseJobRequest(null)).toThrow(JobRequestError)
  })
})
