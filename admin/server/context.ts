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
  // 본문 폴더(<책 id>.json). 설정집의 절 인용도 이 폴더의 본문으로 검증한다.
  sourceDir?: string
  // 음성 폴더(genesis-01-001.mp3)
  audioDir?: string
  // 원어 사전(lexicon.json)과 퀴즈 폴더(<책 id>-NN.json)
  lexiconFile?: string
  quizDir?: string
  // 주소로 참고 이미지를 가져올 때 쓴다. 비우면 전역 fetch.
  fetchImpl?: typeof fetch
  queue: JobQueue
  createRunner: (stage: Stage, options: JobOptions) => Runner
}
