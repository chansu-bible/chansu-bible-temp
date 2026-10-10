import {
  createOpenAiDraw,
  createOpenAiSpeak,
  fetchSource,
  generateImages,
  generateSpeech,
  listSourceBooks,
  memoizeFetch,
  originalBooks,
  parseChapterRange,
  runCanon,
  runGloss,
  runOriginal,
  runQuiz,
  runReviewText,
  runScenario,
  writeBundles,
} from 'pipeline'
import { getBook, hasChapter, isBookId, type BookId } from 'reader-core'
import { STAGES, type JobOptions, type Runner, type Stage } from './jobs.ts'

export class JobRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobRequestError'
  }
}

// 단계마다 쓰는 옵션(나머지는 버린다)과 책을 다루는 방식. 옵션에 chapter가 있으면 장 번호가 꼭 있어야 한다.
// book: 'required'는 책이 꼭 있어야 하고, 'optional'은 없으면 본문이 있는 모든 책을 돌린다.
// { refuse }는 모든 책을 함께 다뤄 책을 받지 않는다. 책이 오면 그 글(CLI와 같은 글)로 거절한다.
type StageSpec = {
  options: readonly (keyof JobOptions)[]
  book: 'required' | 'optional' | { refuse: string }
}

const STAGE_SPECS: Record<Stage, StageSpec> = {
  source: { options: ['book', 'chapters'], book: 'required' },
  canon: { options: ['book', 'chapter', 'dryRun'], book: 'required' },
  scenario: { options: ['book', 'chapter', 'force', 'dryRun'], book: 'required' },
  'review-text': { options: ['book', 'chapter', 'scenes', 'dryRun'], book: 'required' },
  images: { options: ['book', 'chapter', 'scenes', 'force', 'allowDraft', 'dryRun', 'limit'], book: 'required' },
  tts: { options: ['book', 'chapter', 'force', 'limit', 'dryRun'], book: 'required' },
  original: { options: ['book'], book: 'optional' },
  'original-gloss': {
    options: ['limit', 'force', 'dryRun'],
    book: { refuse: 'original-gloss는 모든 책이 함께 쓰는 사전을 채웁니다. --book은 받지 않습니다.' },
  },
  quiz: { options: ['book', 'chapter', 'force', 'dryRun'], book: 'required' },
  build: { options: [], book: { refuse: 'build는 본문이 있는 모든 책을 함께 만듭니다. --book은 받지 않습니다.' } },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

function readOption(key: keyof JobOptions, value: unknown): JobOptions[keyof JobOptions] {
  switch (key) {
    case 'book':
      if (typeof value !== 'string' || !isBookId(value)) {
        throw new JobRequestError(`알 수 없는 책입니다: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      }
      return value
    case 'chapter':
      if (!isPositiveInteger(value)) throw new JobRequestError('chapter(장 번호)는 1 이상의 정수여야 합니다')
      return value
    case 'chapters':
      if (typeof value !== 'string') throw new JobRequestError('chapters(장 범위)는 "1-10"이나 "3" 같은 글이어야 합니다')
      // 여기서는 읽을 수 있는지만 본다. 책에 그 장이 있는지는 책을 읽은 뒤 parseJobRequest가 본다.
      try {
        parseChapterRange(value)
      } catch (error) {
        throw new JobRequestError(error instanceof Error ? error.message : String(error))
      }
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
  const spec = STAGE_SPECS[typedStage]
  if (typeof spec.book === 'object' && options.book !== undefined && options.book !== null) {
    throw new JobRequestError(spec.book.refuse)
  }

  const parsed: JobOptions = {}
  for (const key of spec.options) {
    const value = options[key]
    if (value === undefined || value === null) continue
    ;(parsed as Record<string, unknown>)[key] = readOption(key, value)
  }
  if (spec.book === 'required' && parsed.book === undefined) {
    throw new JobRequestError(`${stage} 단계에는 책(book)이 필요합니다`)
  }
  if (spec.options.includes('chapter') && parsed.chapter === undefined) {
    throw new JobRequestError(`${stage} 단계에는 장 번호(chapter)가 필요합니다`)
  }
  checkChapters(parsed)
  return { stage: typedStage, options: parsed }
}

// 장 번호와 장 범위가 그 책에 있는지 본다. 글은 파이프라인(fetchSource, chapterStem)과 같다.
function checkChapters({ book, chapter, chapters }: JobOptions): void {
  if (book === undefined) return
  const { name, chapters: count } = getBook(book)
  if (chapter !== undefined && !hasChapter(book, chapter)) throw new JobRequestError(`${name}에는 ${chapter}장이 없습니다`)
  if (chapters !== undefined) {
    const { from, to } = parseChapterRange(chapters)
    if (!hasChapter(book, from) || !hasChapter(book, to) || from > to) {
      throw new JobRequestError(`${name}의 장 범위가 틀렸습니다: ${from}~${to} (1~${count}장)`)
    }
  }
}

// 책이 꼭 있어야 하는 단계의 책. parseJobRequest가 먼저 보지만, 책 없이 만든 작업이 돌지 않게 여기서도 본다.
function requireBook(stage: Stage, options: JobOptions): BookId {
  if (options.book === undefined) throw new JobRequestError(`${stage} 단계에는 책(book)이 필요합니다`)
  return options.book
}

// 본문이 있는 모든 책(성경 순서). 하나도 없으면 오류다.
async function allSourceBooks(): Promise<BookId[]> {
  const books = await listSourceBooks()
  if (books.length === 0) throw new Error('본문이 있는 책이 없습니다. 먼저 source 작업을 실행하세요.')
  return books
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
    case 'source': {
      const book = requireBook(stage, options)
      return async (log) => {
        log(`${getBook(book).name} 본문을 가져오는 중`)
        // 장 범위(3-7, 3)를 고르지 않으면 책 전체를 받는다. 있던 본문 파일은 받은 장으로 바뀐다.
        const range = options.chapters === undefined ? {} : parseChapterRange(options.chapters)
        const source = await fetchSource(book, range)
        const verseCount = source.chapters.reduce((sum, item) => sum + item.verses.length, 0)
        log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
      }
    }

    case 'canon': {
      const book = requireBook(stage, options)
      return async (log) => {
        await runCanon(book, chapter, { dryRun }, log)
      }
    }

    case 'scenario': {
      const book = requireBook(stage, options)
      return async (log) => {
        await runScenario(book, chapter, { dryRun, force: options.force ?? false }, log)
      }
    }

    case 'review-text': {
      const book = requireBook(stage, options)
      return async (log) => {
        const result = await runReviewText(book, chapter, { dryRun, sceneIds: options.scenes }, log)
        if (result.flagged.length > 0) log(`확인 필요: ${result.flagged.join(', ')}`)
      }
    }

    case 'images': {
      const book = requireBook(stage, options)
      return async (log) => {
        const result = await generateImages(
          {
            book,
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
    }

    case 'tts': {
      const book = requireBook(stage, options)
      return async (log) => {
        const result = await generateSpeech(
          { book, chapter, force: options.force ?? false, dryRun, limit: options.limit },
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
    }

    case 'original':
      return async (log) => {
        // 책을 고르지 않으면 본문이 있는 모든 책을 돌리되 신약 책은 알리고 건너뛴다(CLI와 같다). 고른 신약 책은 runOriginal이 오류를 낸다.
        const books = options.book === undefined ? originalBooks(await allSourceBooks(), log) : [options.book]
        // 스트롱 사전(6MB)과 절 대응표는 모든 책이 같으므로 한 번만 받는다.
        const fetchText = memoizeFetch()
        for (const book of books) {
          const result = await runOriginal(book, { fetchText }, log)
          log(
            `원어 저장 완료: ${result.chapters}장, 낱말 ${result.words}개, 사전 항목 ${result.entries}개(한국어 뜻 있음 ${result.withKorean}개)`,
          )
          if (result.skipped.length > 0) {
            log(`원어 없이 둔 장: ${getBook(book).name} ${result.skipped.map((item) => `${item}장`).join(', ')}`)
          }
        }
      }

    case 'original-gloss':
      return async (log) => {
        const result = await runGloss({ limit: options.limit, force: options.force ?? false, dryRun }, log)
        if (result.dryRun) {
          log(`한국어 뜻을 쓸 사전 항목 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
          return
        }
        if (result.selected === 0) {
          log('한국어 뜻을 쓸 사전 항목이 없습니다. 초안도 다시 쓰려면 force를 켜세요.')
          return
        }
        log(`한국어 뜻 초안: ${result.written}/${result.selected}개. "원어 뜻" 화면에서 검수하세요.`)
        if (result.missing.length > 0) {
          log(`돌려받지 못한 항목: ${result.missing.join(', ')}`)
          throw new Error(`한국어 뜻 ${result.missing.length}개를 돌려받지 못했습니다`)
        }
      }

    case 'quiz': {
      const book = requireBook(stage, options)
      return async (log) => {
        const result = await runQuiz(book, chapter, { force: options.force ?? false, dryRun }, log)
        if (result.skipped || result.dryRun) return
        log(
          `${chapter}장 퀴즈: ${result.written}문제(검수 통과 ${result.reviewed}, 지적 ${result.flagged}). "퀴즈" 화면에서 승인하세요.`,
        )
      }
    }

    case 'build':
      return async (log) => {
        log('묶음을 만드는 중')
        // CLI build처럼 본문이 있는 모든 책을 만든다. 앱 콘텐츠 폴더를 비우고 다시 쓰므로 한 책만 만들면 다른 책 묶음이 지워진다.
        const bundles = await writeBundles(await listSourceBooks())
        for (const bundle of bundles) {
          const sceneCount = bundle.chapters.reduce((sum, item) => sum + item.scenes.length, 0)
          const label = bundles.length > 1 ? `${bundle.book} ` : ''
          log(`${label}묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
        }
      }
  }
}
