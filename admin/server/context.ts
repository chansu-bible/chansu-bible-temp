import type { JobOptions, JobQueue, Runner, Stage } from './jobs.ts'

// 라우트가 함께 쓰는 것들. 시험에서는 content 폴더들과 작업 실행, fetch를 바꿔 끼운다.
// 경로를 비우면 pipeline의 paths 기본값을 쓴다.
export type AppContext = {
  // 비우면 content/story-bible
  storyBibleDir?: string
  styleFile?: string
  refsDir?: string
  imagesDir?: string
  imageVersionsFile?: string
  scenesDir?: string
  sourceFile?: string
  // 주소로 참고 이미지를 가져올 때 쓴다. 비우면 전역 fetch.
  fetchImpl?: typeof fetch
  queue: JobQueue
  createRunner: (stage: Stage, options: JobOptions) => Runner
}
