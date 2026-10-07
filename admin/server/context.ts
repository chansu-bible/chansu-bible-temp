import type { JobOptions, JobQueue, Runner, Stage } from './jobs.ts'

// 라우트가 함께 쓰는 것들. 시험에서는 설정집 폴더와 작업 실행을 바꿔 끼운다.
export type AppContext = {
  // 비우면 content/story-bible
  storyBibleDir?: string
  queue: JobQueue
  createRunner: (stage: Stage, options: JobOptions) => Runner
}
