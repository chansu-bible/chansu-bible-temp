import { getBook, hasChapter, isBookId, type BookId } from './books.ts'
import type { BundleSource, ImageVersion, LexiconEntry, OriginalVerse, QuizQuestion, Scene, Verse } from './types.ts'

// 공개 목록, 장 꾸러미, 공용 설정집·사전 파일의 형식 버전. 이 앱은 1만 읽는다.
// 형식이 바뀌면 올린다. 키를 더하기만 할 때는 올리지 않는다(옛 독자는 모르는 키를 무시한다).
export const PUBLISH_SCHEMA_VERSION = 1

// file은 콘텐츠 뿌리 기준 경로, size는 바이트 수다.
export type FileRef = { file: string; size: number }

// 장 점검. required가 모두 true여야 공개할 수 있다.
export type ReleaseChecks = {
  required: { scenesApproved: boolean; imagesComplete: boolean; audioComplete: boolean }
  // 승인된 문제 수, 한국어 뜻이 승인된 낱말 번호 수 / 그 장의 낱말 번호 수
  optional: { quizApproved: number; glossesApproved: number; glossesTotal: number }
}

export type CatalogChapter = {
  // 공개 판(공개할 때마다 하나 오른다). 미리 보기 장은 0
  revision: number
  pack: FileRef
  media: FileRef[]
  preview?: true
  checks?: ReleaseChecks
}

export type Catalog = {
  schemaVersion: number
  // 목록 판. 공개, 다시 공개, 공개 취소마다 하나 오른다.
  revision: number
  translation: string
  canon: FileRef
  lexicon: FileRef
  imageVersions: ImageVersion[]
  defaultImageVersion: string | null
  sources: BundleSource[]
  // 책 id → 장 번호(문자열) → 장
  books: Partial<Record<BookId, Record<string, CatalogChapter>>>
}

// 장 꾸러미. 절 낭독(audio)은 null이고 장면의 그림·낭독은 콘텐츠 뿌리 기준 media/ 경로다.
export type ChapterPack = {
  schemaVersion: number
  bookId: BookId
  chapter: number
  verses: Verse[]
  scenes: Scene[]
  original: OriginalVerse[] | null
  quiz: QuizQuestion[]
}

// 공용 설정집. 설정집 모양(파이프라인 schema.ts의 항목에서 status·design·refs를 뺀 것) 그대로 내고, 인용은 책이 붙은 모양("genesis 2:7")이다.
// 앱은 3단계에서 이것으로 책마다 묶음용 설정집을 만든다(canonForBook). 묶음 모양(Place에는 firstAppearance가 없다)으로 내면 그 규칙에 쓸 첫 등장과 근거 절이 빠진다.
export type CanonCharacter = {
  id: string
  name: string
  aliases: string[]
  facts: {
    firstAppearance: string
    gender: '남' | '여' | '불명'
    // 창조 원년 기준 햇수
    years: { born: number | null; died: number | null }
    relations: { type: string; to: string }[]
    attire: { from: string; description: string }[]
    notes: string
    sources: string[]
  }
}

export type CanonPlace = {
  id: string
  name: string
  aliases: string[]
  facts: { firstAppearance: string; description: string; sources: string[] }
  location: { lat: number | null; lng: number | null; certainty: '확실' | '추정' | '불명' }
}

export type CanonEra = {
  id: string
  name: string
  range: { from: string; to: string }
  years: { from: number | null; to: number | null }
  facts: { description: string; present: string[]; absent: string[]; sources: string[] }
}

export type CanonThing = {
  id: string
  name: string
  aliases: string[]
  facts: { description: string; details: string[]; sources: string[] }
}

export type CanonFile = {
  schemaVersion: number
  characters: CanonCharacter[]
  places: CanonPlace[]
  eras: CanonEra[]
  things: CanonThing[]
}

// 공용 사전. 스트롱 번호 → 항목
export type LexiconFile = { schemaVersion: number; entries: Record<string, LexiconEntry> }

// 경로 규칙. 콘텐츠 뿌리(publish/, 서버의 /content/) 기준이고, 경로와 URL에 들어가는 값이라 규칙에 어긋나면 오류를 던진다.

const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'mp3'] as const
export type MediaExt = (typeof MEDIA_EXTENSIONS)[number]

// contentHash의 12자리(소문자 16진수)
const HASH_PATTERN = /^[0-9a-f]{12}$/
// 장면 id는 파일 이름의 한 조각이다. 소문자·숫자·-만 쓴다(genesis-04-03, 1-samuel-01-02).
const SCENE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

function matches(pattern: RegExp, value: unknown): boolean {
  return typeof value === 'string' && pattern.test(value)
}

function checkHash(hash: string): void {
  if (!matches(HASH_PATTERN, hash)) throw new Error(`해시는 12자리 소문자 16진수여야 합니다: ${String(hash)}`)
}

// 장 꾸러미 경로: "packs/genesis/4.3f9c2a1b7d0e.json". 장 번호는 0을 채우지 않는다(4, 119).
// 미리 보기는 앞에 "preview/"가 붙는다. 모르는 책이나 그 책에 없는 장이면 오류를 던진다.
export function packPath(book: BookId, chapter: number, hash: string, preview = false): string {
  if (!hasChapter(book, chapter)) throw new Error(`${getBook(book).name}에는 ${String(chapter)}장이 없습니다`)
  checkHash(hash)
  return `${preview ? 'preview/' : ''}packs/${book}/${chapter}.${hash}.json`
}

// 장면 그림·낭독 경로: "media/genesis-04-03.9a8b7c6d5e4f.jpg". 미리 보기는 앞에 "preview/"가 붙는다.
export function mediaPath(sceneId: string, hash: string, ext: MediaExt, preview = false): string {
  if (!matches(SCENE_ID_PATTERN, sceneId)) throw new Error(`장면 id가 올바르지 않습니다: ${String(sceneId)}`)
  checkHash(hash)
  if (!MEDIA_EXTENSIONS.includes(ext)) throw new Error(`미디어 확장자가 올바르지 않습니다: ${String(ext)}`)
  return `${preview ? 'preview/' : ''}media/${sceneId}.${hash}.${ext}`
}

// 검사. bundle.ts의 validateBundle처럼 꼭 있어야 하는 키와 그 형만 가볍게 본다. 모르는 키는 무시한다.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 0 이상의 정수
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

// 콘텐츠 뿌리 아래의 상대 경로. 영문, 숫자, . _ -와 조각을 가르는 /만 쓰고, 조각은 영문이나 숫자로 시작한다.
// 그래서 절대 경로, 역슬래시, 빈 조각, ., ..는 받지 않는다.
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/
// 장 키는 앞에 0이 없는 정수의 기본 표기다('4'만 받고 '04', '4.0'은 받지 않는다).
const CHAPTER_KEY_PATTERN = /^[1-9][0-9]*$/

function isFileRef(value: unknown): value is FileRef {
  return isObject(value) && matches(FILE_PATTERN, value.file) && isCount(value.size)
}

const REQUIRED_CHECKS = ['scenesApproved', 'imagesComplete', 'audioComplete'] as const
const OPTIONAL_CHECKS = ['quizApproved', 'glossesApproved', 'glossesTotal'] as const

function isReleaseChecks(value: unknown): value is ReleaseChecks {
  if (!isObject(value)) return false
  const { required, optional } = value
  return (
    isObject(required) &&
    isObject(optional) &&
    REQUIRED_CHECKS.every((key) => typeof required[key] === 'boolean') &&
    OPTIONAL_CHECKS.every((key) => isCount(optional[key]))
  )
}

function invalid(where: string, field: string): Error {
  return new Error(`${where}의 ${field} 값이 올바르지 않습니다`)
}

function checkCatalogChapter(where: string, value: unknown): void {
  if (!isObject(value)) throw new Error(`${where}의 정보가 비어 있습니다`)
  if (!isCount(value.revision)) throw invalid(where, 'revision')
  if (!isFileRef(value.pack)) throw invalid(where, 'pack')
  if (!Array.isArray(value.media) || !value.media.every(isFileRef)) throw invalid(where, 'media')
  if (value.preview !== undefined && value.preview !== true) throw invalid(where, 'preview')
  if (value.checks !== undefined && !isReleaseChecks(value.checks)) throw invalid(where, 'checks')
}

// 공개 목록이 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// 책 키는 알려진 책, 장 키는 그 책에 있는 장이어야 한다. 파일이 실제로 있는지는 보지 않는다.
export function validateCatalog(value: unknown): Catalog {
  if (!isObject(value)) throw new Error('공개 목록이 비어 있습니다')
  if (value.schemaVersion !== PUBLISH_SCHEMA_VERSION) {
    throw new Error(`공개 목록 형식이 다릅니다 (schemaVersion ${String(value.schemaVersion)})`)
  }
  const where = '공개 목록'
  if (!isCount(value.revision)) throw invalid(where, 'revision')
  if (typeof value.translation !== 'string') throw invalid(where, 'translation')
  if (!isFileRef(value.canon)) throw invalid(where, 'canon')
  if (!isFileRef(value.lexicon)) throw invalid(where, 'lexicon')
  if (!Array.isArray(value.imageVersions)) throw invalid(where, 'imageVersions')
  if (value.defaultImageVersion !== null && typeof value.defaultImageVersion !== 'string') throw invalid(where, 'defaultImageVersion')
  if (!Array.isArray(value.sources)) throw invalid(where, 'sources')
  const books = value.books
  if (!isObject(books)) throw invalid(where, 'books')
  for (const [bookKey, chapters] of Object.entries(books)) {
    if (!isBookId(bookKey)) throw new Error(`공개 목록의 책을 알 수 없습니다: ${bookKey}`)
    if (!isObject(chapters)) throw invalid(where, bookKey)
    const name = getBook(bookKey).name
    for (const [chapterKey, chapter] of Object.entries(chapters)) {
      if (!CHAPTER_KEY_PATTERN.test(chapterKey) || !hasChapter(bookKey, Number(chapterKey))) {
        throw new Error(`공개 목록의 ${name} 장 번호가 올바르지 않습니다: ${chapterKey}`)
      }
      checkCatalogChapter(`${where}의 ${name} ${chapterKey}장`, chapter)
    }
  }
  return value as Catalog
}

// 장 꾸러미가 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// 절·장면·퀴즈는 배열인지만 보고, 안의 항목은 보지 않는다.
export function validatePack(value: unknown): ChapterPack {
  const where = '꾸러미'
  if (!isObject(value)) throw new Error('꾸러미가 비어 있습니다')
  if (value.schemaVersion !== PUBLISH_SCHEMA_VERSION) {
    throw new Error(`꾸러미 형식이 다릅니다 (schemaVersion ${String(value.schemaVersion)})`)
  }
  const { bookId, chapter } = value
  if (typeof bookId !== 'string' || !isBookId(bookId)) throw new Error('꾸러미의 책을 알 수 없습니다')
  if (typeof chapter !== 'number' || !hasChapter(bookId, chapter)) {
    throw new Error(`꾸러미의 장 번호가 올바르지 않습니다: ${getBook(bookId).name} ${String(chapter)}`)
  }
  for (const key of ['verses', 'scenes', 'quiz']) {
    if (!Array.isArray(value[key])) throw invalid(where, key)
  }
  if (value.original !== null && !Array.isArray(value.original)) throw invalid(where, 'original')
  return value as ChapterPack
}

// 그 책의 목록에 있는 장 번호(오름차순). 미리 보기 장도 든다. 목록에 없는 책이면 []이다.
export function catalogChapters(catalog: Catalog, book: BookId): number[] {
  return Object.keys(catalog.books[book] ?? {})
    .map(Number)
    .sort((a, b) => a - b)
}

// 공개된 장인지 본다. 목록에 있어도 미리 보기 장이면 false다.
export function isPublished(catalog: Catalog, book: BookId, chapter: number): boolean {
  const entry = catalog.books[book]?.[String(chapter)]
  return entry !== undefined && entry.preview !== true
}
