import {
  createOpenAiDraw,
  createOpenAiSpeak,
  fetchSource,
  generateImages,
  generateSpeech,
  runCanon,
  writeBundle,
} from 'pipeline'
import { STAGES, type JobOptions, type Runner, type Stage } from './jobs.ts'

export class JobRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobRequestError'
  }
}

// 단계마다 쓰는 옵션. 나머지는 버린다.
const stageOptions: Record<Stage, readonly (keyof JobOptions)[]> = {
  source: [],
  canon: ['chapter', 'dryRun'],
  images: ['chapter', 'scenes', 'force', 'allowDraft', 'dryRun', 'limit'],
  tts: ['chapter', 'force', 'limit', 'dryRun'],
  build: [],
}

const needsChapter: readonly Stage[] = ['canon', 'images', 'tts']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

function readOption(key: keyof JobOptions, value: unknown): JobOptions[keyof JobOptions] {
  switch (key) {
    case 'chapter':
      if (!isPositiveInteger(value)) throw new JobRequestError('chapter(장 번호)는 1 이상의 정수여야 합니다')
      return value
    case 'limit':
      if (!isPositiveInteger(value)) throw new JobRequestError('limit은 1 이상의 정수여야 합니다')
      return value
    case 'scenes':
      if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0)) {
        throw new JobRequestError('scenes는 장면 id 문자열 배열이어야 합니다')
      }
      return value as string[]
    case 'force':
    case 'allowDraft':
    case 'dryRun':
      if (typeof value !== 'boolean') throw new JobRequestError(`${key}는 true 또는 false여야 합니다`)
      return value
  }
}

// POST /api/jobs 본문을 검사해 단계와 그 단계가 쓰는 옵션만 돌려준다.
export function parseJobRequest(body: unknown): { stage: Stage; options: JobOptions } {
  if (!isRecord(body)) throw new JobRequestError('본문은 { stage, options } 형태의 JSON이어야 합니다')
  const { stage, options = {} } = body
  if (typeof stage !== 'string' || stage === '') throw new JobRequestError('stage가 필요합니다')
  if (!(STAGES as readonly string[]).includes(stage)) throw new JobRequestError(`아직 없는 단계: ${stage}`)
  if (!isRecord(options)) throw new JobRequestError('options는 객체여야 합니다')

  const typedStage = stage as Stage
  const parsed: JobOptions = {}
  for (const key of stageOptions[typedStage]) {
    const value = options[key]
    if (value === undefined || value === null) continue
    ;(parsed as Record<string, unknown>)[key] = readOption(key, value)
  }
  if (needsChapter.includes(typedStage) && parsed.chapter === undefined) {
    throw new JobRequestError(`${stage} 단계에는 장 번호(chapter)가 필요합니다`)
  }
  return { stage: typedStage, options: parsed }
}

// dry-run에서는 모델을 부르지 않는다. 불리면 오류.
const noDraw = async (): Promise<Uint8Array> => {
  throw new Error('dry-run에서는 그리지 않습니다')
}
const noSpeak = async (): Promise<Uint8Array> => {
  throw new Error('dry-run에서는 음성을 만들지 않습니다')
}

// 단계와 옵션을 파이프라인 함수 실행으로 바꾼다. 줄 출력은 CLI와 같게 맞춘다.
export function createRunner(stage: Stage, options: JobOptions): Runner {
  const chapter = options.chapter ?? 0
  const dryRun = options.dryRun ?? false

  switch (stage) {
    case 'source':
      return async (log) => {
        log('본문을 가져오는 중')
        const source = await fetchSource()
        const verseCount = source.chapters.reduce((sum, item) => sum + item.verses.length, 0)
        log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
      }

    case 'canon':
      return async (log) => {
        await runCanon(chapter, { dryRun }, log)
      }

    case 'images':
      return async (log) => {
        const result = await generateImages(
          {
            chapter,
            allowDraft: options.allowDraft ?? false,
            force: options.force ?? false,
            dryRun,
            limit: options.limit,
            sceneIds: options.scenes,
          },
          dryRun ? noDraw : createOpenAiDraw(),
          log,
        )
        if (result.selected === 0) {
          log('그릴 장면이 없습니다. 검수 전 장면도 그리려면 allowDraft를 켜세요.')
          return
        }
        if (dryRun) {
          log(`그릴 장면 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
          return
        }
        log(`그림 생성 완료: 성공 ${result.drawn.length}개, 실패 ${result.failed.length}개`)
        for (const failure of result.failed) log(`- ${failure.id}: ${failure.reason}`)
        if (result.failed.length > 0) throw new Error(`그림 ${result.failed.length}개를 만들지 못했습니다`)
      }

    case 'tts':
      return async (log) => {
        const result = await generateSpeech(
          { chapter, force: options.force ?? false, dryRun, limit: options.limit },
          dryRun ? noSpeak : createOpenAiSpeak(),
          log,
        )
        if (dryRun) {
          log(`음성을 만들 절 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
          return
        }
        log(`음성 생성 완료: 성공 ${result.spoken}개, 실패 ${result.failed.length}개`)
        for (const failure of result.failed) log(`- ${chapter}:${failure.verse} ${failure.reason}`)
        if (result.failed.length > 0) throw new Error(`음성 ${result.failed.length}개를 만들지 못했습니다`)
      }

    case 'build':
      return async (log) => {
        log('묶음을 만드는 중')
        const bundle = await writeBundle()
        const sceneCount = bundle.chapters.reduce((sum, item) => sum + item.scenes.length, 0)
        log(`묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
      }
  }
}
