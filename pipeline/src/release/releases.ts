import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, hasChapter, isBookId, isContentHash, type BookId } from 'reader-core'
import { z } from 'zod'
import { displayPath, releasesFile } from '../paths.ts'

// 공개 상태 파일(content/releases.json). 어느 장이 어떤 꾸러미로 공개돼 있는지의 기준이다.
// 공개, 다시 공개, 공개 취소는 이 파일만 고치고, 공개 폴더(publish/)는 publish 명령이 이 파일을 보고 만든다.

// 공개할 때의 부분 해시. 공개 화면이 지금 내용과 견주어 무엇이 바뀌었는지 보이는 데 쓴다.
export const ReleasePartsSchema = z.object({
  text: z.string(),
  images: z.string(),
  audio: z.string(),
  quiz: z.string(),
  original: z.string(),
})

export const ReleaseEntrySchema = z.object({
  // 이 장의 공개 판. 처음 공개하면 1이고, 내용이 바뀌어 다시 공개할 때마다 하나 오른다.
  revision: z.number().int().positive(),
  publishedAt: z.string(),
  // 꾸러미 파일 내용의 해시
  hash: z.string().refine(isContentHash, '해시는 12자리 소문자 16진수여야 합니다'),
  parts: ReleasePartsSchema,
})

// 모양만 본다. 책 키와 장 키가 실제 책·장인지는 readReleases와 writeReleases가 더 본다.
export const ReleasesSchema = z.object({
  // 목록 판. 공개, 다시 공개, 공개 취소마다 하나 오른다.
  revision: z.number().int().nonnegative(),
  // 책 id → 장 번호(문자열) → 공개 항목
  books: z.record(z.string(), z.record(z.string(), ReleaseEntrySchema)),
})

export type ReleaseParts = z.infer<typeof ReleasePartsSchema>
export type ReleaseEntry = z.infer<typeof ReleaseEntrySchema>
export type Releases = z.infer<typeof ReleasesSchema>

// 장 키는 앞에 0이 없는 정수의 기본 표기다('4'만 받고 '04', '4.0'은 받지 않는다). reader-core의 공개 목록 검사와 같은 규칙이다.
const CHAPTER_KEY_PATTERN = /^[1-9][0-9]*$/

// 모양에 더해 책 키가 책 id이고 장 키가 그 책에 있는 장 번호(기본 표기)인지 본다.
function parseReleases(value: unknown): Releases {
  const releases = ReleasesSchema.parse(value)
  for (const [book, chapters] of Object.entries(releases.books)) {
    if (!isBookId(book)) throw new Error(`알 수 없는 책입니다: ${book}`)
    for (const key of Object.keys(chapters)) {
      if (!CHAPTER_KEY_PATTERN.test(key) || !hasChapter(book, Number(key))) {
        throw new Error(`${getBook(book).name}의 장 번호가 올바르지 않습니다: ${key}`)
      }
    }
  }
  return releases
}

// 공개 상태 파일을 읽는다. 없으면 아무것도 공개하지 않은 빈 상태(목록 판 0)이고, 검증에 걸리면 파일 이름과 함께 오류를 낸다.
export async function readReleases(file: string = releasesFile): Promise<Releases> {
  if (!existsSync(file)) return { revision: 0, books: {} }
  try {
    return parseReleases(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 검증한 뒤 쓴다. 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거치고, 쓰다 실패하면 임시 파일을 지운다.
export async function writeReleases(releases: Releases, file: string = releasesFile): Promise<void> {
  const parsed = parseReleases(releases)
  const temp = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  try {
    await writeFile(temp, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    await rename(temp, file)
  } catch (error) {
    // 지우다 난 오류가 쓰다 난 오류를 가리지 않게 한다.
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

// 그 책에 있는 장 번호인지 본다. 모르는 책이면 getBook이 오류를 던진다.
function checkChapter(book: BookId, chapter: number): void {
  if (!hasChapter(book, chapter)) throw new Error(`${getBook(book).name}에는 ${chapter}장이 없습니다`)
}

// 장을 공개한다. 처음이면 장 판 1이고, 이미 공개된 장은 장 판이 하나 오른다. 어느 쪽이든 목록 판이 하나 오른다.
// 꾸러미 해시가 지금 공개된 것과 같으면 바뀐 것이 없어 아무것도 바꾸지 않는다(changed: false).
// 받은 객체는 바꾸지 않고 새 상태를 돌려준다. 파일에 쓰는 일은 부르는 쪽이 한다(writeReleases).
export function publishChapter(
  releases: Releases,
  book: BookId,
  chapter: number,
  pack: { hash: string; parts: ReleaseParts },
  now: string,
): { releases: Releases; changed: boolean } {
  checkChapter(book, chapter)
  const key = String(chapter)
  const current: ReleaseEntry | undefined = releases.books[book]?.[key]
  if (current?.hash === pack.hash) return { releases, changed: false }
  // 해시와 부분 해시를 검사하고, 받은 부분 해시 객체를 끼워 두지 않도록 복사한다.
  const entry = ReleaseEntrySchema.parse({
    revision: (current?.revision ?? 0) + 1,
    publishedAt: now,
    hash: pack.hash,
    parts: pack.parts,
  })
  return {
    releases: { revision: releases.revision + 1, books: { ...releases.books, [book]: { ...releases.books[book], [key]: entry } } },
    changed: true,
  }
}

// 공개를 취소한다. 항목을 지우고(책의 마지막 공개 장이면 책 항목도) 목록 판을 하나 올린다. 공개되지 않은 장이면 오류를 던진다.
// 받은 객체는 바꾸지 않고 새 상태를 돌려준다.
export function withdrawChapter(releases: Releases, book: BookId, chapter: number): Releases {
  checkChapter(book, chapter)
  const key = String(chapter)
  const chapters: Record<string, ReleaseEntry> | undefined = releases.books[book]
  if (chapters?.[key] === undefined) throw new Error(`${getBook(book).name} ${chapter}장은 공개되지 않았습니다`)
  const { [key]: _withdrawn, ...rest } = chapters
  const books = { ...releases.books, [book]: rest }
  if (Object.keys(rest).length === 0) delete books[book]
  return { revision: releases.revision + 1, books }
}
