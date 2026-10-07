import { randomUUID } from 'node:crypto'

// 1단계에서 실행할 수 있는 단계
export const STAGES = ['source', 'canon', 'images', 'tts', 'build'] as const
export type Stage = (typeof STAGES)[number]

export type JobOptions = {
  chapter?: number
  scenes?: string[]
  force?: boolean
  allowDraft?: boolean
  dryRun?: boolean
  limit?: number
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: string
  stage: Stage
  options: JobOptions
  status: JobStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  lines: string[]
  error: string | null
}

// 작업 본체. log로 넘긴 줄이 작업 로그에 쌓인다.
export type Runner = (log: (line: string) => void) => Promise<void>

export type Subscriber = {
  onLine: (line: string) => void
  onEnd: (status: 'done' | 'failed') => void
}

export class JobBusyError extends Error {
  constructor(job: Job) {
    super(`이미 실행 중인 작업이 있습니다 (${job.stage}, ${job.id})`)
    this.name = 'JobBusyError'
  }
}

const finished = (job: Job) => job.status === 'done' || job.status === 'failed'

// 작업 큐. 한 번에 하나만 실행하고, 최근 keep개만 메모리에 남긴다.
export class JobQueue {
  private jobs: Job[] = []
  private subscribers = new Map<string, Set<Subscriber>>()
  private endings = new Map<string, Promise<void>>()
  private readonly keep: number

  constructor(keep = 50) {
    this.keep = keep
  }

  // 최신 순
  list(): Job[] {
    return [...this.jobs].reverse()
  }

  get(id: string): Job | undefined {
    return this.jobs.find((job) => job.id === id)
  }

  // 실행 중이거나 기다리는 작업
  active(): Job | undefined {
    return this.jobs.find((job) => !finished(job))
  }

  enqueue(stage: Stage, options: JobOptions, runner: Runner): Job {
    const busy = this.active()
    if (busy) throw new JobBusyError(busy)

    const job: Job = {
      id: randomUUID(),
      stage,
      options,
      status: 'queued',
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      lines: [],
      error: null,
    }
    this.jobs.push(job)
    this.trim()
    // 요청에 먼저 답하고, 다음 차례에 실행한다.
    this.endings.set(
      job.id,
      new Promise<void>((resolve) => setImmediate(resolve)).then(() => this.run(job, runner)),
    )
    return job
  }

  // 작업이 끝날 때까지 기다린다(시험용). 없는 작업이면 바로 끝난다.
  async wait(id: string): Promise<void> {
    await this.endings.get(id)
  }

  // 지금까지 쌓인 줄을 먼저 보내고, 이후 줄과 끝을 보낸다. 이미 끝난 작업이면 끝도 바로 보낸다.
  // 돌려준 함수를 부르면 구독을 끊는다.
  subscribe(id: string, subscriber: Subscriber): () => void {
    const job = this.get(id)
    if (!job) throw new Error(`작업이 없습니다: ${id}`)
    for (const line of job.lines) subscriber.onLine(line)
    if (finished(job)) {
      subscriber.onEnd(job.status as 'done' | 'failed')
      return () => {}
    }
    let set = this.subscribers.get(id)
    if (!set) this.subscribers.set(id, (set = new Set()))
    set.add(subscriber)
    return () => {
      set.delete(subscriber)
    }
  }

  private async run(job: Job, runner: Runner): Promise<void> {
    job.status = 'running'
    job.startedAt = new Date().toISOString()
    const log = (text: string) => {
      const lines = String(text).split(/\r?\n/)
      if (lines.length > 1 && lines.at(-1) === '') lines.pop()
      for (const line of lines) {
        job.lines.push(line)
        for (const subscriber of this.subscribers.get(job.id) ?? []) subscriber.onLine(line)
      }
    }
    try {
      await runner(log)
      job.status = 'done'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`오류: ${message}`)
      job.error = message
      job.status = 'failed'
    }
    job.endedAt = new Date().toISOString()
    const status = job.status
    for (const subscriber of this.subscribers.get(job.id) ?? []) subscriber.onEnd(status)
    this.subscribers.delete(job.id)
    this.endings.delete(job.id)
  }

  private trim(): void {
    while (this.jobs.length > this.keep) {
      const index = this.jobs.findIndex(finished)
      if (index < 0) break
      const [removed] = this.jobs.splice(index, 1)
      this.subscribers.delete(removed!.id)
    }
  }
}
