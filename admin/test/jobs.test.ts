import { describe, expect, it } from 'vitest'
import { JobBusyError, JobQueue, type Runner } from '../server/jobs.ts'
import { createRunner, JobRequestError, parseJobRequest } from '../server/stages.ts'
import { waitUntilRunning } from './fixtures.ts'

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
    await waitUntilRunning(queue, job.id)
    expect(() => queue.enqueue('build', {}, async () => {})).toThrow(JobBusyError)
    first.finish()
    await queue.wait(job.id)
    expect(() => queue.enqueue('build', {}, async () => {})).not.toThrow()
  })

  it('실패하면 failed와 error를 남긴다', async () => {
    const queue = new JobQueue()
    const job = queue.enqueue('canon', { book: 'genesis', chapter: 1 }, async (log) => {
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
    await waitUntilRunning(queue, job.id)
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
    await waitUntilRunning(queue, job.id)
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
    expect(
      parseJobRequest({ stage: 'canon', options: { book: 'genesis', chapter: 1, dryRun: true, force: true, chapters: '1-3' } }),
    ).toEqual({
      stage: 'canon',
      options: { book: 'genesis', chapter: 1, dryRun: true },
    })
    expect(
      parseJobRequest({
        stage: 'images',
        options: { book: 'exodus', chapter: 2, scenes: ['g2-s1'], force: true, allowDraft: false, dryRun: true, limit: 2 },
      }),
    ).toEqual({
      stage: 'images',
      options: { book: 'exodus', chapter: 2, scenes: ['g2-s1'], force: true, allowDraft: false, dryRun: true, limit: 2 },
    })
    expect(parseJobRequest({ stage: 'build', options: { chapter: 3, chapters: '1-10' } })).toEqual({ stage: 'build', options: {} })
    expect(parseJobRequest({ stage: 'source', options: { book: 'genesis' } })).toEqual({
      stage: 'source',
      options: { book: 'genesis' },
    })
  })

  it('source는 book과 장 범위(chapters)만 쓰고, 장 범위가 없으면 책 전체다', () => {
    expect(parseJobRequest({ stage: 'source', options: { book: 'exodus', chapters: '3-7', chapter: 2, dryRun: true } })).toEqual({
      stage: 'source',
      options: { book: 'exodus', chapters: '3-7' },
    })
    expect(parseJobRequest({ stage: 'source', options: { book: 'ruth', chapters: '3' } }).options.chapters).toBe('3')
    expect(() => parseJobRequest({ stage: 'source', options: { book: 'genesis', chapters: '1~10' } })).toThrow(
      '장 범위는 3-7이나 3처럼 씁니다: 1~10',
    )
    expect(() => parseJobRequest({ stage: 'source', options: { book: 'genesis', chapters: 10 } })).toThrow(/chapters/)
  })

  it('scenario는 book·chapter·force·dryRun, review-text는 book·chapter·scenes·dryRun만 쓴다', () => {
    const options = { book: 'genesis', chapter: 3, scenes: ['genesis-03-01'], force: true, allowDraft: true, dryRun: true, limit: 2 }
    expect(parseJobRequest({ stage: 'scenario', options })).toEqual({
      stage: 'scenario',
      options: { book: 'genesis', chapter: 3, force: true, dryRun: true },
    })
    expect(parseJobRequest({ stage: 'review-text', options })).toEqual({
      stage: 'review-text',
      options: { book: 'genesis', chapter: 3, scenes: ['genesis-03-01'], dryRun: true },
    })
    expect(() => parseJobRequest({ stage: 'scenario', options: { book: 'genesis' } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'review-text', options: { book: 'genesis', dryRun: true } })).toThrow(/장 번호/)
    expect(() =>
      parseJobRequest({ stage: 'review-text', options: { book: 'genesis', chapter: 3, scenes: 'genesis-03-01' } }),
    ).toThrow(/scenes/)
  })

  it('original은 book만(없으면 모든 책), original-gloss는 limit·force·dryRun, quiz는 book·chapter·force·dryRun을 쓴다', () => {
    const options = { chapter: 4, scenes: ['g4-s1'], force: true, allowDraft: true, dryRun: true, limit: 30 }
    expect(parseJobRequest({ stage: 'original', options })).toEqual({ stage: 'original', options: {} })
    expect(parseJobRequest({ stage: 'original', options: { ...options, book: 'genesis' } })).toEqual({
      stage: 'original',
      options: { book: 'genesis' },
    })
    expect(parseJobRequest({ stage: 'original-gloss', options })).toEqual({
      stage: 'original-gloss',
      options: { limit: 30, force: true, dryRun: true },
    })
    expect(parseJobRequest({ stage: 'original-gloss' })).toEqual({ stage: 'original-gloss', options: {} })
    expect(parseJobRequest({ stage: 'quiz', options: { ...options, book: 'genesis' } })).toEqual({
      stage: 'quiz',
      options: { book: 'genesis', chapter: 4, force: true, dryRun: true },
    })
    expect(() => parseJobRequest({ stage: 'quiz', options: { book: 'genesis', force: true } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'original-gloss', options: { limit: 0 } })).toThrow(/limit/)
  })

  it('책이 필요한 단계에 책이 없으면 오류', () => {
    for (const stage of ['source', 'canon', 'scenario', 'review-text', 'images', 'tts', 'quiz']) {
      expect(() => parseJobRequest({ stage, options: { chapter: 1 } })).toThrow(`${stage} 단계에는 책(book)이 필요합니다`)
    }
    expect(() => parseJobRequest({ stage: 'canon', options: { book: null, chapter: 1 } })).toThrow(/책\(book\)이 필요/)
  })

  it('모르는 책은 오류', () => {
    expect(() => parseJobRequest({ stage: 'canon', options: { book: 'genesys', chapter: 1 } })).toThrow(
      '알 수 없는 책입니다: genesys',
    )
    expect(() => parseJobRequest({ stage: 'original', options: { book: 3 } })).toThrow(JobRequestError)
  })

  it('build와 original-gloss는 책을 받지 않는다(CLI와 같은 글)', () => {
    expect(() => parseJobRequest({ stage: 'build', options: { book: 'genesis' } })).toThrow(
      'build는 본문이 있는 모든 책을 함께 만듭니다. --book은 받지 않습니다.',
    )
    expect(() => parseJobRequest({ stage: 'original-gloss', options: { book: 'genesis', limit: 3 } })).toThrow(
      'original-gloss는 모든 책이 함께 쓰는 사전을 채웁니다. --book은 받지 않습니다.',
    )
    expect(parseJobRequest({ stage: 'build', options: { book: null } })).toEqual({ stage: 'build', options: {} })
  })

  it('장 번호가 필요한 단계에 없으면 오류', () => {
    expect(() => parseJobRequest({ stage: 'canon', options: {} })).toThrow(JobRequestError)
    expect(() => parseJobRequest({ stage: 'canon', options: { book: 'genesis' } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'tts', options: { book: 'genesis', chapter: 0 } })).toThrow(/장 번호/)
    expect(() => parseJobRequest({ stage: 'images', options: { book: 'genesis', chapter: '1' } })).toThrow(JobRequestError)
  })

  it('옵션 형식이 틀리면 오류', () => {
    expect(() => parseJobRequest({ stage: 'images', options: { book: 'genesis', chapter: 1, limit: -1 } })).toThrow(/limit/)
    expect(() => parseJobRequest({ stage: 'images', options: { book: 'genesis', chapter: 1, scenes: 'g1-s1' } })).toThrow(
      /scenes/,
    )
    expect(() => parseJobRequest({ stage: 'tts', options: { book: 'genesis', chapter: 1, force: 'yes' } })).toThrow(/force/)
  })

  it('없는 단계는 "아직 없는 단계"', () => {
    expect(() => parseJobRequest({ stage: 'scenes', options: {} })).toThrow(/아직 없는 단계/)
    expect(() => parseJobRequest({ options: {} })).toThrow(JobRequestError)
    expect(() => parseJobRequest(null)).toThrow(JobRequestError)
  })
})

describe('createRunner', () => {
  it('책이 필요한 단계를 책 없이 만들면 오류', () => {
    expect(() => createRunner('canon', { chapter: 1 })).toThrow(JobRequestError)
    expect(() => createRunner('source', {})).toThrow('source 단계에는 책(book)이 필요합니다')
  })

  // runOriginal은 본문을 읽거나 받기 전에 신약 책을 거절하므로 파일도 네트워크도 건드리지 않는다.
  it('original에 고른 신약 책은 파이프라인의 거절 글로 실패한다', async () => {
    const lines: string[] = []
    await expect(createRunner('original', { book: 'matthew' })((line) => lines.push(line))).rejects.toThrow(
      '신약 원어 자료는 아직 정하지 않았어요(마태복음)',
    )
    expect(lines).toEqual([])
  })
})
