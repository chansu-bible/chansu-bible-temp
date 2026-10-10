// 작업 실행 폼 → JobOptions. 단계마다 쓰는 옵션만 보낸다(계획 문서의 "공통 계약").
import { BOOKS, findBook, getBook, isBookId, josa } from 'reader-core'
import { splitIds } from './ids.ts'
import type { BookId, BookSummary, JobOptions, Stage } from './types.ts'

export type OptionKey = keyof JobOptions

export const STAGE_OPTIONS: Record<Stage, OptionKey[]> = {
  source: ['book', 'chapters'],
  canon: ['book', 'chapter', 'dryRun'],
  scenario: ['book', 'chapter', 'force', 'dryRun'],
  'review-text': ['book', 'chapter', 'scenes', 'dryRun'],
  images: ['book', 'chapter', 'scenes', 'force', 'allowDraft', 'dryRun', 'limit'],
  tts: ['book', 'chapter', 'force', 'limit', 'dryRun'],
  original: ['book'],
  'original-gloss': ['limit', 'force', 'dryRun'],
  quiz: ['book', 'chapter', 'force', 'dryRun'],
  build: [],
}

// 책을 꼭 골라야 하는 단계. original은 고르지 않으면(모든 책) 본문이 있는 모든 책을 돌린다.
// build와 original-gloss는 모든 책을 함께 다뤄 책을 받지 않는다.
export function bookRequired(stage: Stage): boolean {
  return STAGE_OPTIONS[stage].includes('book') && stage !== 'original'
}

// chapter를 쓰는 단계에서는 장 번호가 꼭 있어야 한다.
export function chapterRequired(stage: Stage): boolean {
  return STAGE_OPTIONS[stage].includes('chapter')
}

export type BookChoice = { value: string; label: string }

// 단계마다 고를 수 있는 책. source는 본문을 새로 받을 수 있게 66권 모두, 다른 단계는 본문을 읽을 수 있는 책(sourceBooks)이다.
// original은 맨 앞에 "모든 책"(값 '')이 있다. 책을 받지 않는 단계와, 본문이 있어야 하는데 그런 책이 없는 단계는 빈 목록이다.
export function bookChoices(stage: Stage, sourceBooks: readonly BookId[]): BookChoice[] {
  if (!STAGE_OPTIONS[stage].includes('book')) return []
  if (stage === 'source') return BOOKS.map((book) => ({ value: book.id, label: book.name }))
  if (sourceBooks.length === 0) return []
  const withSource = sourceBooks.map((id) => ({ value: id, label: getBook(id).name }))
  return stage === 'original' ? [{ value: '', label: '모든 책' }, ...withSource] : withSource
}

export const NO_SOURCE_BOOKS = '본문이 있는 책이 없어요. 먼저 source를 실행하세요.'

// 책 칸을 채울 수 없는 까닭: 책을 쓰는 단계인데 고를 책이 없으면(본문이 있는 책이 없으면) 안내 글, 아니면 null
export function bookChoiceProblem(stage: Stage, choices: readonly BookChoice[]): string | null {
  return STAGE_OPTIONS[stage].includes('book') && choices.length === 0 ? NO_SOURCE_BOOKS : null
}

// 범위를 "3장", "1~10장"으로 쓴다.
function spanLabel(from: number, to: number): string {
  return from === to ? `${from}장` : `${from}~${to}장`
}

// source 폼에 보이는 책의 지금 본문: "1~10장 (10장)". 본문이 없으면 "없음", 본문 파일을 읽지 못하면 "읽지 못함"
export function currentSourceLabel(book: BookSummary | undefined): string {
  if (!book) return '없음'
  if (book.error) return '읽지 못함'
  if (!book.sourceRange) return '장 없음'
  return `${spanLabel(book.sourceRange.from, book.sourceRange.to)} (${book.sourceChapters}장)`
}

// source가 장 범위(range)를 받으면 지금 본문(current)에서 없어질 장. 본문 파일은 받은 장으로 바뀐다.
// 범위가 지금 본문의 장을 다 덮거나, 범위나 본문이 없으면 null이다. 예: 지금 1~10장, 범위 3-7 → "1~2장, 8~10장"
export function droppedChapters(
  range: { from: number; to: number } | null,
  current: { from: number; to: number } | null,
): string | null {
  if (!range || !current) return null
  const dropped: string[] = []
  if (current.from < range.from) dropped.push(spanLabel(current.from, Math.min(current.to, range.from - 1)))
  if (current.to > range.to) dropped.push(spanLabel(Math.max(current.from, range.to + 1), current.to))
  return dropped.length > 0 ? dropped.join(', ') : null
}

// 책 칸의 값. 고른 값(picked)이 이 단계의 목록에 없으면 기본 책(머리에서 고른 책), 그것도 없으면 목록의 첫 값이다.
export function pickBookChoice(choices: BookChoice[], picked: string | null, fallback: string | null): string {
  const has = (value: string | null): value is string => value !== null && choices.some((choice) => choice.value === value)
  if (has(picked)) return picked
  if (has(fallback)) return fallback
  return choices[0]?.value ?? ''
}

export type JobForm = {
  book: string // 책 id. original에서 ''은 모든 책
  chapter: string
  chapters: string // source의 장 범위(1-10, 3). 비우면 책 전체
  scenes: string // 쉼표·공백·줄바꿈으로 구분한 장면 id
  force: boolean
  allowDraft: boolean
  dryRun: boolean
  limit: string
}

export const EMPTY_JOB_FORM: JobForm = {
  book: '',
  chapter: '1',
  chapters: '',
  scenes: '',
  force: false,
  allowDraft: false,
  dryRun: false,
  limit: '',
}

export type BuildResult = { ok: true; options: JobOptions } | { ok: false; error: string }

// 장 범위 "3-7"이나 "3"을 읽는다(앞뒤 공백은 뗀다). 서버(pipeline의 parseChapterRange)와 같은 모양만 받는다. 읽을 수 없으면 null
export function readChapterRange(text: string): { from: number; to: number } | null {
  const match = /^(\d+)(?:-(\d+))?$/.exec(text.trim())
  if (!match) return null
  const from = Number(match[1])
  return { from, to: match[2] === undefined ? from : Number(match[2]) }
}

export function buildJobOptions(stage: Stage, form: JobForm): BuildResult {
  const keys = STAGE_OPTIONS[stage]
  const options: JobOptions = {}

  if (keys.includes('book')) {
    const book = form.book.trim()
    if (isBookId(book)) options.book = book
    else if (book) return { ok: false, error: `모르는 책이에요 (${book})` }
    else if (bookRequired(stage)) return { ok: false, error: '책을 고르세요' }
  }
  const chapterCount = options.book ? getBook(options.book).chapters : null
  const bookLabel = options.book ? getBook(options.book).name : ''

  if (keys.includes('chapter')) {
    const n = Number(form.chapter.trim())
    if (!form.chapter.trim() || !Number.isInteger(n) || n < 1) return { ok: false, error: '장 번호를 넣으세요' }
    if (chapterCount !== null && n > chapterCount) {
      return { ok: false, error: `${josa(bookLabel, '은는')} ${chapterCount}장까지 있어요` }
    }
    options.chapter = n
  }
  if (keys.includes('chapters') && form.chapters.trim()) {
    const text = form.chapters.trim()
    const range = readChapterRange(text)
    if (!range) return { ok: false, error: '장 범위는 3-7이나 3처럼 써요' }
    if (range.from < 1 || range.from > range.to || (chapterCount !== null && range.to > chapterCount)) {
      return { ok: false, error: `장 범위가 맞지 않아요: ${text} (${bookLabel} 1~${chapterCount}장)` }
    }
    options.chapters = text
  }
  if (keys.includes('scenes')) {
    const ids = splitIds(form.scenes)
    if (ids.length) options.scenes = ids
  }
  if (keys.includes('limit') && form.limit.trim()) {
    const n = Number(form.limit.trim())
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: '최대 개수는 1 이상의 정수여야 해요' }
    options.limit = n
  }
  if (keys.includes('force') && form.force) options.force = true
  if (keys.includes('allowDraft') && form.allowDraft) options.allowDraft = true
  if (keys.includes('dryRun') && form.dryRun) options.dryRun = true

  return { ok: true, options }
}

export function describeOptions(options: JobOptions): string {
  const parts: string[] = []
  if (options.chapter !== undefined) parts.push(`${options.chapter}장`)
  if (options.chapters !== undefined) parts.push(`${options.chapters.replace('-', '~')}장`)
  if (options.scenes?.length) parts.push(`장면 ${options.scenes.join(', ')}`)
  if (options.limit !== undefined) parts.push(`최대 ${options.limit}`)
  if (options.force) parts.push('다시 만들기')
  if (options.allowDraft) parts.push('초안 허용')
  if (options.dryRun) parts.push('미리 보기')
  return parts.join(' · ') || '—'
}

// 작업 목록의 책 칸. 책을 고른 작업은 책 이름이고, 책 없는 작업(original의 "모든 책", build, original-gloss)은
// 모든 책을 함께 다루므로 "모든 책"이다.
export function jobBookLabel(options: JobOptions): string {
  return options.book ? (findBook(options.book)?.name ?? options.book) : '모든 책'
}
