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

// 장 꾸러미. 장면의 그림·낭독은 콘텐츠 뿌리 기준 media/ 경로다.
// 절의 audio는 null이다. 낭독은 장면 낭독(scene.audio)을 재생하고, 절 구간은 절마다 남긴 audioMs로 매긴다(narration.ts의 sceneTrack).
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

// 장면 그림·낭독 파일의 확장자. mp3가 낭독이고 나머지는 그림이다.
export const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'mp3'] as const
export type MediaExt = (typeof MEDIA_EXTENSIONS)[number]
export type MediaKind = 'image' | 'audio'

// 확장자마다 종류를 적어야 해서, 확장자를 더하고 여기를 빠뜨리면 타입 오류가 난다.
const MEDIA_KINDS: Record<MediaExt, MediaKind> = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', mp3: 'audio' }

// contentHash의 12자리(소문자 16진수)
const HASH_PATTERN = /^[0-9a-f]{12}$/
// 장면 id는 파일 이름의 한 조각이다. 소문자·숫자·-만 쓴다(genesis-04-03, 1-samuel-01-02).
const SCENE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
// 영문, 숫자, . _ -와 조각을 가르는 /만 쓰고, 조각은 영문이나 숫자로 시작한다.
const CONTENT_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

function matches(pattern: RegExp, value: unknown): boolean {
  return typeof value === 'string' && pattern.test(value)
}

// 네트워크에서 온 글자를 오류 글에 넣을 때 쓴다. 따옴표로 묶어 줄바꿈 같은 제어 문자를 드러내고, 40자가 넘으면 잘라 …를 붙인다.
// 글자는 코드 포인트로 센다(이모지 같은 글자가 가운데서 잘리지 않는다). 아주 긴 글도 앞 41자만 훑는다.
const SHOWN_MAX = 40
function shown(text: string): string {
  const head: string[] = []
  for (const char of text) {
    if (head.length === SHOWN_MAX) return `${JSON.stringify(head.join(''))}…`
    head.push(char)
  }
  return JSON.stringify(text)
}

// 네트워크에서 온 값(형을 모르는 값)을 오류 글에 넣을 때 쓴다. 글자는 shown으로, 수·참거짓·null·undefined는 String으로 쓴다.
// 객체 같은 나머지는 형 이름만 쓴다. 객체를 String()에 넘기면 toString이 함수가 아닐 때 영어 TypeError가 나기 때문이다.
function shownValue(value: unknown): string {
  if (typeof value === 'string') return shown(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return String(value)
  return typeof value
}

// 12자리 소문자 16진수(contentHash)인지 본다. packPath, mediaPath, canonPath, lexiconPath가 모두 이 규칙을 쓴다.
export function isContentHash(value: unknown): value is string {
  return matches(HASH_PATTERN, value)
}

// 콘텐츠 뿌리 아래의 상대 경로인지 본다. 절대 경로, 역슬래시, 빈 조각, ., ..는 받지 않는다.
// 목록의 파일 경로와 꾸러미의 장면 그림·낭독 경로가 모두 이 규칙을 따른다. 앱이 이 값으로 기기의 파일 경로와 내려받을 주소를 만든다.
export function isContentPath(value: unknown): value is string {
  return matches(CONTENT_PATH_PATTERN, value)
}

// 점 없이 소문자로 쓴 미디어 확장자(MEDIA_EXTENSIONS)인지 본다.
export function isMediaExt(value: string): value is MediaExt {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(value)
}

function checkHash(hash: string): void {
  if (!isContentHash(hash)) throw new Error(`해시는 12자리 소문자 16진수여야 합니다: ${String(hash)}`)
}

// 미리 보기 파일은 콘텐츠 뿌리의 preview/ 아래에 둔다.
function previewDir(preview: boolean): string {
  return preview ? 'preview/' : ''
}

// 장 꾸러미 경로: "packs/genesis/4.3f9c2a1b7d0e.json". 장 번호는 0을 채우지 않는다(4, 119).
// 미리 보기는 앞에 "preview/"가 붙는다. 모르는 책이나 그 책에 없는 장이면 오류를 던진다.
export function packPath(book: BookId, chapter: number, hash: string, preview = false): string {
  if (!hasChapter(book, chapter)) throw new Error(`${getBook(book).name}에는 ${String(chapter)}장이 없습니다`)
  checkHash(hash)
  return `${previewDir(preview)}packs/${book}/${chapter}.${hash}.json`
}

// 장면 그림·낭독 경로: "media/genesis-04-03.9a8b7c6d5e4f.jpg". 미리 보기는 앞에 "preview/"가 붙는다.
export function mediaPath(sceneId: string, hash: string, ext: MediaExt, preview = false): string {
  if (!matches(SCENE_ID_PATTERN, sceneId)) throw new Error(`장면 id가 올바르지 않습니다: ${String(sceneId)}`)
  checkHash(hash)
  if (!isMediaExt(ext)) throw new Error(`미디어 확장자가 올바르지 않습니다: ${String(ext)}`)
  return `${previewDir(preview)}media/${sceneId}.${hash}.${ext}`
}

// 공용 설정집 경로: "canon.a1b2c3d4e5f6.json". 미리 보기는 앞에 "preview/"가 붙는다.
export function canonPath(hash: string, preview = false): string {
  checkHash(hash)
  return `${previewDir(preview)}canon.${hash}.json`
}

// 공용 사전 경로: "lexicon.0f1e2d3c4b5a.json". 미리 보기는 앞에 "preview/"가 붙는다.
export function lexiconPath(hash: string, preview = false): string {
  checkHash(hash)
  return `${previewDir(preview)}lexicon.${hash}.json`
}

// 공개 목록 경로: "catalog.json". 다른 파일과 달리 이름에 해시가 없다. 미리 보기 목록은 "preview/catalog.json"이다.
export function catalogPath(preview = false): string {
  return `${previewDir(preview)}catalog.json`
}

// 파일 이름 끝의 미디어 확장자(MEDIA_EXTENSIONS). 그 밖의 확장자이거나 확장자가 없으면 null이다.
// 이름이 점으로 시작하면(.mp3) 확장자가 없는 것으로 본다. 목록 검사, 꾸러미 검사, mediaKind가 같은 규칙을 쓴다.
function mediaExtOf(file: string): MediaExt | null {
  const name = file.slice(file.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1) : ''
  return isMediaExt(ext) ? ext : null
}

// 미디어 파일의 종류. .mp3는 낭독('audio'), 그림 확장자는 그림('image')이다. 그 밖의 확장자이거나 확장자가 없으면 오류를 던진다.
// validateCatalog를 통과한 목록의 media 파일은 던지지 않는다.
export function mediaKind(file: string): MediaKind {
  const ext = mediaExtOf(file)
  if (ext === null) throw new Error(`미디어 파일의 종류를 알 수 없습니다: ${shown(file)}`)
  return MEDIA_KINDS[ext]
}

// 콘텐츠 경로이면서 확장자가 kind(그림 또는 낭독)의 것인지 본다.
function isMediaFileOf(kind: MediaKind, value: unknown): boolean {
  if (!isContentPath(value)) return false
  const ext = mediaExtOf(value)
  return ext !== null && MEDIA_KINDS[ext] === kind
}

// 검사. bundle.ts의 validateBundle처럼 꼭 있어야 하는 키와 그 형만 가볍게 본다. 모르는 키는 무시한다.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 0 이상의 정수. 2^53 - 1(Number.MAX_SAFE_INTEGER)을 넘는 수는 정확히 나타낼 수 없어 받지 않는다.
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

// 장 키는 앞에 0이 없는 정수의 기본 표기다('4'만 받고 '04', '4.0'은 받지 않는다).
const CHAPTER_KEY_PATTERN = /^[1-9][0-9]*$/

function isFileRef(value: unknown): value is FileRef {
  return isObject(value) && isContentPath(value.file) && isCount(value.size)
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

function checkSchemaVersion(where: string, value: Record<string, unknown>): void {
  if (value.schemaVersion !== PUBLISH_SCHEMA_VERSION) {
    throw new Error(`${where} 형식이 다릅니다 (schemaVersion ${shownValue(value.schemaVersion)})`)
  }
}

function checkCatalogChapter(where: string, value: unknown): void {
  if (!isObject(value)) throw new Error(`${where}의 정보가 비어 있습니다`)
  if (!isCount(value.revision)) throw invalid(where, 'revision')
  if (!isFileRef(value.pack)) throw invalid(where, 'pack')
  if (!Array.isArray(value.media) || !value.media.every((ref) => isFileRef(ref) && mediaExtOf(ref.file) !== null)) throw invalid(where, 'media')
  if (value.preview !== undefined && value.preview !== true) throw invalid(where, 'preview')
  if (value.checks !== undefined && !isReleaseChecks(value.checks)) throw invalid(where, 'checks')
}

// 공개 목록이 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// 책 키는 알려진 책, 장 키는 그 책에 있는 장이어야 한다. 파일이 실제로 있는지는 보지 않는다.
// 장의 media 파일은 확장자가 미디어 확장자(MEDIA_EXTENSIONS)여야 한다. 앱이 목록의 media 전체에 mediaKind를 부르니, 던지게 될 목록은 여기서 거른다.
// imageVersions와 sources는 배열인지만 보고 안의 항목은 보지 않는다.
// defaultImageVersion도 글자나 null인지만 보고 imageVersions에 있는지는 보지 않는다.
export function validateCatalog(value: unknown): Catalog {
  const where = '공개 목록'
  if (!isObject(value)) throw new Error('공개 목록이 비어 있습니다')
  checkSchemaVersion(where, value)
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
    if (!isBookId(bookKey)) throw new Error(`공개 목록의 책을 알 수 없습니다: ${shown(bookKey)}`)
    const name = getBook(bookKey).name
    if (!isObject(chapters)) throw new Error(`${where}의 ${name} 장 목록이 올바르지 않습니다`)
    for (const [chapterKey, chapter] of Object.entries(chapters)) {
      if (!CHAPTER_KEY_PATTERN.test(chapterKey) || !hasChapter(bookKey, Number(chapterKey))) {
        throw new Error(`공개 목록의 ${name} 장 번호가 올바르지 않습니다: ${shown(chapterKey)}`)
      }
      checkCatalogChapter(`${where}의 ${name} ${chapterKey}장`, chapter)
    }
  }
  return value as Catalog
}

// 절 하나의 낭독을 본다. 꾸러미의 절 낭독(audio)은 키가 있고 null이어야 한다. 앱은 장면 낭독을 재생하고, 절 낭독 경로는 내려받지 않는다.
function checkPackVerse(verse: unknown, index: number): void {
  if (!isObject(verse)) throw new Error(`꾸러미의 ${index + 1}번째 절이 비어 있습니다`)
  if (verse.audio !== null) {
    // 오류 글에는 절 번호를 넣고, 절 번호가 안전한 정수가 아니면 몇 번째 절인지를 넣는다.
    const label = typeof verse.verse === 'number' && Number.isSafeInteger(verse.verse) ? verse.verse : index + 1
    throw new Error(`꾸러미 ${label}절의 낭독은 null이어야 합니다`)
  }
}

// 장면 하나의 그림·낭독 경로를 본다. 앱이 이 값으로 기기의 파일 경로와 내려받을 주소를 만드니, 목록의 파일 경로와 같은 규칙(isContentPath)을 따라야 한다.
// 그림은 그림 확장자, 낭독은 .mp3여야 한다(앱이 확장자로 종류를 안다).
function checkPackScene(scene: unknown, index: number): void {
  if (!isObject(scene)) throw new Error(`꾸러미의 ${index + 1}번째 장면이 비어 있습니다`)
  const { id, images, audio } = scene
  // 오류 글에는 장면 id를 넣고, id가 글자가 아니면 몇 번째 장면인지를 넣는다.
  const label = typeof id === 'string' ? `꾸러미 장면 ${shown(id)}` : `꾸러미의 ${index + 1}번째 장면`
  if (!isObject(images) || !Object.values(images).every((file) => isMediaFileOf('image', file))) {
    throw new Error(`${label}의 그림 경로가 올바르지 않습니다`)
  }
  if (audio !== null && !isMediaFileOf('audio', audio)) throw new Error(`${label}의 낭독 경로가 올바르지 않습니다`)
}

function chapterLabel(book: BookId, chapter: number): string {
  return `${getBook(book).name} ${chapter}장`
}

// 장 꾸러미가 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// expected를 주면 꾸러미의 책·장이 목록이 가리킨 책·장과 같은지도 본다.
// 퀴즈는 배열인지만 보고, 안의 항목은 보지 않는다.
// 절은 배열이고 각 항목이 객체이며 낭독(audio)이 null인지까지 본다. 절의 나머지 키는 보지 않는다.
// 장면은 배열이고 각 항목이 객체이며 그림·낭독 경로가 콘텐츠 뿌리 아래의 상대 경로(그림은 그림 확장자, 낭독은 .mp3)인지까지 본다. 장면의 나머지 키는 보지 않는다.
export function validatePack(value: unknown, expected?: { book: BookId; chapter: number }): ChapterPack {
  const where = '꾸러미'
  if (!isObject(value)) throw new Error('꾸러미가 비어 있습니다')
  checkSchemaVersion(where, value)
  const { bookId, chapter } = value
  if (typeof bookId !== 'string' || !isBookId(bookId)) throw new Error('꾸러미의 책을 알 수 없습니다')
  if (typeof chapter !== 'number' || !hasChapter(bookId, chapter)) {
    throw new Error(`꾸러미의 장 번호가 올바르지 않습니다: ${getBook(bookId).name} ${shownValue(chapter)}`)
  }
  if (expected && (bookId !== expected.book || chapter !== expected.chapter)) {
    throw new Error(`꾸러미의 책·장(${chapterLabel(bookId, chapter)})이 목록(${chapterLabel(expected.book, expected.chapter)})과 다릅니다`)
  }
  for (const key of ['verses', 'scenes', 'quiz']) {
    if (!Array.isArray(value[key])) throw invalid(where, key)
  }
  if (value.original !== null && !Array.isArray(value.original)) throw invalid(where, 'original')
  const verses = value.verses as unknown[]
  verses.forEach(checkPackVerse)
  const scenes = value.scenes as unknown[]
  scenes.forEach(checkPackScene)
  return value as ChapterPack
}

// 공용 설정집이 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// 맨 위만 본다. 인물·장소·시대·물건은 배열인지만 보고, 안의 항목은 보지 않는다.
export function validateCanonFile(value: unknown): CanonFile {
  const where = '공용 설정집'
  if (!isObject(value)) throw new Error(`${where}이 비어 있습니다`)
  checkSchemaVersion(where, value)
  for (const key of ['characters', 'places', 'eras', 'things']) {
    if (!Array.isArray(value[key])) throw invalid(where, key)
  }
  return value as CanonFile
}

// 공용 사전이 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다.
// 맨 위만 본다. entries는 객체(배열이 아닌)인지만 보고, 안의 항목은 보지 않는다.
export function validateLexiconFile(value: unknown): LexiconFile {
  const where = '공용 사전'
  if (!isObject(value)) throw new Error(`${where}이 비어 있습니다`)
  checkSchemaVersion(where, value)
  if (!isObject(value.entries)) throw invalid(where, 'entries')
  return value as LexiconFile
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
