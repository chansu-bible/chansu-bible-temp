# 여러 책과 장 공개 2단계: 공개 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 장마다 공개한 것만 앱이 받도록, 공개 상태 파일·점검·publish 단계(꾸러미, 공개 목록, 미리 보기)·관리 도구 공개 화면·서버의 `/content`를 만들고, 질문하기가 공개된 것만 근거로 쓰게 한다.

**Architecture:** 공개 목록과 꾸러미의 형식(타입과 검사)은 `reader-core`의 `publish.ts`에 두어 파이프라인(쓰는 쪽), 서버, 앱(3단계, 읽는 쪽)이 함께 쓴다. 파이프라인의 `release/` 모듈이 공개 상태 파일(`content/releases.json`), 점검, 장 꾸러미(메모리에서 만들고 해시), `publish` 단계를 맡는다. 장 꾸러미는 1단계의 책 묶음과 같은 장 모양을 쓰도록 묶음에서 장 만들기를 떼어 함께 쓴다. 관리 도구는 공개 상태를 고치고 `publish` 작업을 돌린다. 서버는 `publish/`를 `/content`로 낸다.

**Tech Stack:** TypeScript, zod, vitest, tsx, Hono(`@hono/node-server`의 정적 파일), React(관리 도구), Node `crypto`(SHA-256)

**설계:** `docs/superpowers/specs/2026-10-09-books-and-release-design.md` 3절 2단계, 5~7절, 9절, 11절

**브랜치:** `feature/books-and-release`(1단계에 이어서). 세 단계가 끝나면 `docs/git-convention.md`대로 main에 합친다.

**설계에서 정하거나 바꾸는 것:**
- 공개 상태의 장 항목에 부분 해시 `parts`(`text`, `images`, `audio`, `quiz`, `original`)를 더한다. 공개 화면이 "무엇이 바뀌었는지"를 보이려면 공개할 때의 부분 해시가 있어야 한다. 장 `hash`는 꾸러미 파일 내용의 해시다.
- 해시는 쓰는 바이트의 SHA-256 앞 12자리(16진수)다. JSON은 `JSON.stringify(value)`(공백 없이, 키 순서는 만드는 코드가 정한 그대로)로 쓰고 그 바이트로 해시한다.
- 꾸러미의 장 모양은 1단계 묶음의 장(`Chapter`)과 같고 `schemaVersion`, `bookId`, `chapter`가 붙는다. 다른 점: 절의 `audio`는 `null`(앱은 장면 낭독을 재생한다, `audioMs`는 남긴다), 장면의 그림과 낭독은 `media/` 파일 이름이다. 공개 꾸러미의 장면 `images`에는 기본 그림 버전 하나만, 미리 보기 꾸러미에는 모든 버전이 든다(그림 버전 바꿔 보기는 미리 보기에서만).
- 공용 설정집 파일(`canon.<해시>.json`)에는 승인된 항목 가운데 공개된 장에서 처음 나오거나 공개된 장의 장면이 가리키는 것(인물·장소·시대)만 넣는다. 인용은 책이 붙은 모양(`genesis 2:7`) 그대로다(3단계 앱이 책을 알고 비교한다). 미리 보기 설정집은 미리 보기 장까지 넓혀 따로 만든다.
- 공용 사전 파일(`lexicon.<해시>.json`)에는 공개된 꾸러미의 원어 낱말에 나오는 번호만, 한국어 뜻은 승인된 것만 넣는다. `count`는 공개된 꾸러미들에서 센다.
- 공개 목록의 파일 경로는 모두 콘텐츠 뿌리(`publish/`, 서버의 `/content/`) 기준이다. 미리 보기 목록(`preview/catalog.json`)은 공개된 장은 뿌리의 파일을, 미리 보기 장은 `preview/` 아래 파일을 가리킨다.
- 미리 보기 장은 장면 파일이 있는 미공개 장이다(점검을 통과하지 않아도 된다). 미리 보기 목록의 그 장에는 `"preview": true`와 점검 결과가 붙고 `revision`은 0이다.
- `publish/`는 git에서 뺀다(`.gitignore`). `publish`는 매번 처음부터 다시 만든다.
- 공개·다시 공개·공개 취소 CLI: `release --book <id> --chapter N`(공개, 바뀐 것이 있으면 다시 공개), `release --book <id> --chapter N --withdraw`(공개 취소). 둘 다 공개 상태 파일만 고치고, `publish`는 따로 돌린다(관리 도구는 둘을 이어 돈다).

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `packages/reader-core/src/publish.ts` (새) | 공개 목록, 장 꾸러미, 공용 설정집·사전 파일의 타입과 검사(`validateCatalog`, `validatePack`), 경로 규칙(`packPath`, `mediaPath`) |
| `pipeline/src/build/buildBundle.ts` | 장 하나를 만드는 부분을 `buildChapter`로 떼어 묶음과 꾸러미가 함께 쓴다(묶음 결과는 그대로) |
| `pipeline/src/release/hash.ts` (새) | `contentHash(bytes)`, `jsonBytes(value)` |
| `pipeline/src/release/releases.ts` (새) | 공개 상태 파일 스키마, 읽기·쓰기(임시 파일을 거쳐), 공개·공개 취소 |
| `pipeline/src/release/checks.ts` (새) | 장 점검(필수·선택) |
| `pipeline/src/release/pack.ts` (새) | 장 꾸러미와 그 미디어 목록, 부분 해시를 메모리에서 만든다 |
| `pipeline/src/release/inputs.ts` (새) | 꾸러미·점검에 쓰는 콘텐츠(본문, 장면, 설정집, 그림 목록, 낭독 길이, 원어, 사전, 퀴즈)를 한 번 읽어 둔다 |
| `pipeline/src/release/publish.ts` (새) | `runPublish`: `publish/`와 `preview/`를 새로 만든다 |
| `pipeline/src/release/status.ts` (새) | 책의 장마다 공개 상태(공개됨·바뀐 것·점검 미통과·장면 전·본문 전)를 만든다(관리 도구와 CLI가 쓴다) |
| `pipeline/src/cli.ts`, `index.ts`, `paths.ts` | `release`, `publish` 명령, `releasesFile`, `publishDir` |
| `.gitignore` | `publish/` |
| `server/src/content.ts` (새), `server/src/app.ts`, `server/src/config.ts` | `/content/*` 정적 파일, 캐시 머리글, 미리 보기 |
| `server/src/ask/*`, `server/src/index.ts` | 질문하기 대목을 공개 목록의 꾸러미와 공용 설정집에서 만들고, 목록 판이 바뀌면 다시 읽는다 |
| `admin/server/routes/releases.ts` (새), `admin/server/stages.ts`, `admin/server/jobs.ts` | 공개 상태 API, `publish` 작업, 공개 중 저장 막기 |
| `admin/src/pages/Releases.tsx` (새), `admin/src/route.ts`, `admin/src/api.ts` | 공개 화면 |
| `docs/content-publish.md` (새), `README.md`, 설계 문서 | 형식과 명령, 진행 |

---

### Task 1: 공개 목록과 꾸러미 형식(reader-core)

**Files:**
- Create: `packages/reader-core/src/publish.ts`, `packages/reader-core/src/publish.test.ts`
- Modify: `packages/reader-core/src/index.ts`

- [ ] **Step 1: 타입**

```ts
// publish.ts
import type { BookId } from './books.ts'
import type { BundleSource, ImageVersion, LexiconEntry, OriginalVerse, QuizQuestion, Scene, Verse } from './types.ts'

export const PUBLISH_SCHEMA_VERSION = 1

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
export type CanonCharacter = { id: string; name: string; aliases: string[]; facts: { firstAppearance: string; gender: '남' | '여' | '불명'; years: { born: number | null; died: number | null }; relations: { type: string; to: string }[]; attire: { from: string; description: string }[]; notes: string; sources: string[] } }
export type CanonPlace = { id: string; name: string; aliases: string[]; facts: { firstAppearance: string; description: string; sources: string[] }; location: { lat: number | null; lng: number | null; certainty: '확실' | '추정' | '불명' } }
export type CanonEra = { id: string; name: string; range: { from: string; to: string }; years: { from: number | null; to: number | null }; facts: { description: string; present: string[]; absent: string[]; sources: string[] } }
export type CanonThing = { id: string; name: string; aliases: string[]; facts: { description: string; details: string[]; sources: string[] } }
export type CanonFile = { schemaVersion: number; characters: CanonCharacter[]; places: CanonPlace[]; eras: CanonEra[]; things: CanonThing[] }

// 공용 사전. 스트롱 번호 → 항목
export type LexiconFile = { schemaVersion: number; entries: Record<string, LexiconEntry> }
```

- [ ] **Step 2: 경로 규칙과 검사**

```ts
// 콘텐츠 뿌리 기준 경로. hash는 contentHash의 12자리
export function packPath(book: BookId, chapter: number, hash: string, preview = false): string
// "packs/genesis/4.3f9c2a1b7d0e.json", 미리 보기는 "preview/packs/genesis/4.….json"
export function mediaPath(sceneId: string, hash: string, ext: 'jpg' | 'jpeg' | 'png' | 'webp' | 'mp3', preview = false): string
// "media/genesis-04-03.9a8b7c6d5e4f.jpg"
export function validateCatalog(value: unknown): Catalog   // schemaVersion이 1이 아니거나 모양이 틀리면 오류
export function validatePack(value: unknown): ChapterPack
export function catalogChapters(catalog: Catalog, book: BookId): number[]   // 그 책의 목록에 있는 장(오름차순)
export function isPublished(catalog: Catalog, book: BookId, chapter: number): boolean   // 미리 보기 장은 false
```

검사는 `bundle.ts`의 `validateBundle`처럼 손으로 쓴 가벼운 검사다(reader-core는 zod를 쓰지 않는다). 꼭 있어야 하는 키와 형(숫자, 문자열, 배열), `books`의 키가 `isBookId`, 장 키가 그 책의 장(`hasChapter`)인지 본다.

- [ ] **Step 3: 시험**

`publish.test.ts`: 경로 모양(세 자리 장 `psalms` 119장, 미리 보기), 올바른 목록·꾸러미가 통과하고 `schemaVersion: 2`, 알 수 없는 책, 없는 장 키, `pack.size`가 숫자가 아닌 것이 오류, `catalogChapters`, `isPublished`(미리 보기 장은 false).

Run: `npm test -w reader-core && npm run typecheck -w reader-core`

- [ ] **Step 4: 커밋**

```bash
git add packages/reader-core
git commit -m "feat(core): 공개 목록과 장 꾸러미 형식(publish.ts)"
```

---

### Task 2: 묶음의 장 만들기를 떼어 낸다

**Files:**
- Modify: `pipeline/src/build/buildBundle.ts`, `pipeline/test/buildBundle.test.ts`

- [ ] **Step 1:** `buildBundle` 안에서 장 하나를 만드는 부분(절과 절 낭독, 장면 또는 대체 장면, 장면 검사, 장면 낭독, 원어, 승인된 퀴즈)을 `buildChapter(book, sourceChapter, sceneFile | null, ctx)`로 떼어 낸다. `ctx`에는 그림 목록, 낭독 길이, 승인된 장소·인물 id, 원어 파일이 든다. `buildBundle`은 장마다 `buildChapter`를 부른다.
- [ ] **Step 2:** 결과가 그대로인지 본다. 이 작업 전후로 `npm run pipeline -- build`를 돌려 `app/public/content` 365개 파일의 해시가 같아야 한다(바뀌기 전 해시를 시스템 임시 폴더에 남겨 비교한다).

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 3: 커밋**

```bash
git add pipeline
git commit -m "refactor(pipeline): 묶음에서 장 하나를 만드는 buildChapter를 떼어 낸다"
```

---

### Task 3: 해시와 공개 상태 파일

**Files:**
- Create: `pipeline/src/release/hash.ts`, `pipeline/src/release/releases.ts`, `pipeline/test/releases.test.ts`
- Modify: `pipeline/src/paths.ts`(`releasesFile = content/releases.json`, `publishDir = publish`), `pipeline/src/index.ts`

- [ ] **Step 1: 해시**

```ts
// hash.ts
import { createHash } from 'node:crypto'
// 내용의 SHA-256 앞 12자리. 파일 이름에 붙여 내용이 바뀐 파일만 새 이름이 되게 한다.
export function contentHash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}
// 꾸러미·목록을 쓰는 바이트. 해시도 이 바이트로 한다.
export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8')
}
```

- [ ] **Step 2: 공개 상태 파일**

```ts
// releases.ts
export const ReleasePartsSchema = z.object({ text: z.string(), images: z.string(), audio: z.string(), quiz: z.string(), original: z.string() })
export const ReleaseEntrySchema = z.object({
  revision: z.number().int().positive(),
  publishedAt: z.string(),
  hash: z.string().regex(/^[0-9a-f]{12}$/),
  parts: ReleasePartsSchema,
})
export const ReleasesSchema = z.object({
  revision: z.number().int().nonnegative(),
  // 책 id → 장 번호(문자열) → 공개 항목
  books: z.record(z.string(), z.record(z.string(), ReleaseEntrySchema)),
})
export type Releases = z.infer<typeof ReleasesSchema>

export async function readReleases(file?: string): Promise<Releases>   // 없으면 { revision: 0, books: {} }. 책 키는 isBookId, 장 키는 hasChapter를 검사한다
export async function writeReleases(releases: Releases, file?: string): Promise<void>   // .tmp를 거쳐 쓴다
// 공개(처음이면 revision 1, 이미 공개된 장은 revision+1). 해시가 같으면 바꾸지 않고 { changed: false }
export function publishChapter(releases: Releases, book: BookId, chapter: number, pack: { hash: string; parts: ReleaseParts }, now: string): { releases: Releases; changed: boolean }
// 공개 취소. 공개되지 않은 장이면 오류
export function withdrawChapter(releases: Releases, book: BookId, chapter: number): Releases
```

공개, 다시 공개, 공개 취소는 맨 위 `revision`을 하나 올린다. 순수 함수(`publishChapter`, `withdrawChapter`)는 받은 객체를 바꾸지 않는다.

- [ ] **Step 3: 시험** — 처음 공개(revision 1, 목록 판 1), 같은 해시로 다시 공개(바뀌지 않음), 다른 해시로 다시 공개(장 revision 2, 목록 판 2), 공개 취소(항목이 지워지고 목록 판이 오름), 공개되지 않은 장 취소는 오류, 파일이 없으면 빈 상태, 잘못된 책 키·장 키는 오류, 쓰기는 임시 파일을 남기지 않는다.

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 4: 커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): 공개 상태 파일(content/releases.json)과 내용 해시"
```

---

### Task 4: 콘텐츠 읽기와 장 점검

**Files:**
- Create: `pipeline/src/release/inputs.ts`, `pipeline/src/release/checks.ts`, `pipeline/test/releaseChecks.test.ts`

- [ ] **Step 1: 콘텐츠 한 번 읽기**

`readReleaseInputs(options)`: 본문 있는 책 목록, 책마다 본문·장면 파일·퀴즈 파일·원어 파일, 설정집(`readCanon`), 그림 목록(`readImageCatalog`), 낭독 이름과 길이(지금 `writeBundle.ts`의 `readAudioCatalog`를 옮겨 함께 쓴다), 사전, 화풍(`style`)을 읽어 돌려준다. 폴더는 모두 옵션으로 바꿀 수 있다(시험용).

- [ ] **Step 2: 점검**

```ts
// checks.ts
export function chapterChecks(inputs: ReleaseInputs, book: BookId, chapter: number): ReleaseChecks
```
- `scenesApproved`: 장면 파일이 있고 장면이 하나 이상이며 모두 `review.status === 'approved'`.
- `imagesComplete`: 기본 그림 버전(그림 버전 목록의 마지막)에 장면마다 그림이 있다(파일 이름의 확장자를 뗀 것이 장면 id).
- `audioComplete`: 그 장의 모든 절에 낭독 파일(`verseAudioName`)이 있다.
- 선택: `quizApproved`(승인된 문제 수), `glossesTotal`(그 장 원어의 서로 다른 스트롱 번호 수), `glossesApproved`(그 가운데 한국어 뜻이 승인된 수).

- [ ] **Step 3: 시험** — 고정값 폴더(임시 폴더에 본문 2장, 장면 파일, 그림 버전 둘, 낭독 몇 개)로: 모두 갖춘 장, 장면 하나가 `reviewed`, 장면 파일 없음, 기본 버전에 그림 하나 빠짐(앞 버전에는 있음), 절 낭독 하나 빠짐, 퀴즈·뜻 개수.

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 4: 커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): 공개 점검(장면 승인, 기본 그림, 절 낭독)과 콘텐츠 읽기"
```

---

### Task 5: 장 꾸러미

**Files:**
- Create: `pipeline/src/release/pack.ts`, `pipeline/test/releasePack.test.ts`

- [ ] **Step 1:**

```ts
// pack.ts
export type PackMedia = { from: string; to: string; bytes?: Buffer }   // from: 원본 파일(그림) 또는 없음(낭독은 이은 바이트), to: media/ 경로
export type BuiltPack = { pack: ChapterPack; bytes: Buffer; hash: string; parts: ReleaseParts; media: PackMedia[] }
export async function buildPack(inputs: ReleaseInputs, book: BookId, chapter: number, options: { preview: boolean }): Promise<BuiltPack>
```
- 장 모양은 Task 2의 `buildChapter`로 만든다. 절 `audio`는 `null`.
- 장면 그림: 공개 꾸러미는 기본 버전 그림 하나, 미리 보기는 모든 버전. 파일 바이트의 해시로 `mediaPath(sceneId, hash, ext)`를 만들고 장면 `images`를 그 경로로 바꾼다.
- 장면 낭독: 절 낭독을 이은 바이트(`joinMp3`)의 해시로 `mediaPath(sceneId, hash, 'mp3')`. 길이(`audioMs`)는 지금처럼 절 낭독 길이의 합.
- 부분 해시: `text`(절 본문과 장면의 글: 제목, 해설, 낱말 풀이, 역사 배경, 장소, 인물), `images`(그림 미디어 경로 목록), `audio`(낭독 미디어 경로 목록과 길이), `quiz`, `original`을 각각 `contentHash(jsonBytes(…))`.
- `hash`는 꾸러미 바이트의 해시다.
- 같은 콘텐츠면 같은 바이트·해시가 나온다(시각, 순서가 정해지지 않은 것을 쓰지 않는다).

- [ ] **Step 2: 시험** — 고정값 폴더로: 같은 입력이면 해시가 같다, 장면 해설 한 글자가 바뀌면 `text` 부분과 `hash`만 바뀐다, 그림 파일이 바뀌면 그 그림 경로와 `images`, `hash`가 바뀐다, 공개 꾸러미에는 기본 버전 그림만, 미리 보기에는 모든 버전, 절 `audio`는 null이고 장면 낭독 경로가 붙는다, 승인된 퀴즈만 들어간다.

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 3: 커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): 장 꾸러미와 그림·낭독 미디어(내용 해시 이름)"
```

---

### Task 6: 공개 상태 보기와 release 명령

**Files:**
- Create: `pipeline/src/release/status.ts`, `pipeline/test/releaseStatus.test.ts`
- Modify: `pipeline/src/cli.ts`, `pipeline/src/index.ts`

- [ ] **Step 1: 장마다 상태**

```ts
// status.ts
export type ChapterReleaseState = 'published' | 'changed' | 'unpublished' | 'failing' | 'no-scenes' | 'no-source'
export type ChapterRelease = {
  chapter: number
  state: ChapterReleaseState
  checks: ReleaseChecks | null           // 본문이 없으면 null
  release: ReleaseEntry | null            // 공개된 장이면 그 항목
  changedParts: (keyof ReleaseParts)[]    // 공개된 장의 지금 부분 해시와 다른 것
}
export async function bookReleaseStatus(inputs: ReleaseInputs, releases: Releases, book: BookId): Promise<ChapterRelease[]>
```
장은 그 책의 1장부터 마지막 장까지 모두 돌려준다(본문에 없는 장은 `no-source`). 공개된 장은 지금 꾸러미를 메모리에서 만들어 해시가 같으면 `published`, 다르면 `changed`. 공개되지 않은 장은 장면 파일이 없으면 `no-scenes`, 필수 점검이 하나라도 거짓이면 `failing`, 아니면 `unpublished`(공개할 수 있음).

- [ ] **Step 2: CLI**
- `release --book <id> --chapter N`: 점검을 통과하지 않으면 무엇이 빠졌는지 적고 멈춘다. 공개된 장이 바뀌지 않았으면 "바뀐 것이 없어 그대로 둡니다". 아니면 공개 상태 파일을 고치고 `${책 이름} ${장}장 공개(판 n). npm run pipeline -- publish로 꾸러미를 만드세요.`를 찍는다.
- `release --book <id> --chapter N --withdraw`: 공개 취소.
- `release --book <id>`(장 없이): 장마다 상태를 표로 찍는다(공개됨·판, 바뀐 것, 점검, 장면 전, 본문 전).

- [ ] **Step 3: 시험** — 상태 여섯 가지가 고정값에서 각각 나온다, 바뀐 부분 목록, CLI 인자 검사(`--withdraw`에 장 번호가 없으면 오류).

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 4: 커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): 장마다 공개 상태와 release 명령(공개, 다시 공개, 공개 취소)"
```

---

### Task 7: publish 단계

**Files:**
- Create: `pipeline/src/release/publish.ts`, `pipeline/test/publish.test.ts`
- Modify: `pipeline/src/cli.ts`, `pipeline/src/index.ts`, `.gitignore`, `pipeline/src/build/sources.ts`(필요하면)

- [ ] **Step 1:** `runPublish({ outDir = publishDir, … })`:
1. 공개 상태 파일과 콘텐츠를 읽는다(`readReleaseInputs`).
2. 공개된 장마다 공개 꾸러미를 만든다. 지금 꾸러미의 해시가 공개 상태 파일의 `hash`와 다르면 멈춘다(`${책} ${장}장이 공개한 뒤 바뀌었습니다. 관리 도구에서 다시 공개하거나 공개 취소하세요`). 공개 상태가 공개한 내용과 맞을 때만 그 내용을 낸다.
3. 공용 설정집: 승인된 항목 가운데 처음 나오는 곳(인물·장소는 `firstAppearance`, 시대는 `range.from`, 물건은 가장 앞선 `sources`)이 공개된 장이거나 공개된 꾸러미의 장면이 가리키는(인물, 장소) 것. 인물의 관계는 넣은 인물만 가리킨다. 인용은 그대로(책이 붙은 모양).
4. 공용 사전: 공개된 꾸러미의 원어 낱말에 나오는 번호만, 한국어 뜻은 승인된 것만, `count`는 공개된 꾸러미들에서 센다.
5. `outDir`을 비우고 꾸러미·미디어·설정집·사전·`catalog.json`을 쓴다. 목록의 `sources`는 공개된 책마다의 개역한글판 출처와 원어·그림 참고 출처다. `buildSources`는 책마다 개역한글판 출처의 id를 같은 `krv`로 내므로(1단계 묶음은 책 하나라 그대로 둔다), 목록에서는 개역한글판 출처의 id를 `krv-<책 id>`로 바꿔 책마다 하나씩 두고, 나머지(원어, 그림 참고)는 id가 같으면 한 번만 둔다.
6. 미리 보기: 장면 파일이 있는 미공개 장마다 미리 보기 꾸러미(모든 그림 버전)를 `preview/` 아래에 쓰고, 미리 보기 설정집·사전(공개 장 + 미리 보기 장 기준)과 `preview/catalog.json`(공개된 장은 뿌리의 파일을 가리키고, 미리 보기 장은 `preview: true`, `revision: 0`, 점검 결과)을 쓴다.
7. 쓴 파일 수와 크기를 돌려준다.

CLI `publish`(책을 받지 않는다). `.gitignore`에 `/publish/`.

- [ ] **Step 2: 시험(임시 폴더)** — 공개된 장 둘과 미리 보기 장 하나인 고정값으로: 목록에는 공개된 장만, 경로의 해시가 파일 내용과 맞다, 같은 내용으로 다시 돌리면 파일 이름이 모두 같다, 장면 해설 하나를 바꾸고 다시 공개하면 그 꾸러미 파일 이름만 바뀌고 그림·낭독·다른 장은 그대로다, 공개 뒤 바뀐 장은 멈춘다, 공개 취소한 장은 목록과 파일에서 빠진다, 미리 보기 목록에는 미리 보기 장이 `preview: true`로 있고 뿌리 목록에는 없다, 설정집에는 공개된 장에서 나오는 항목만, 사전 `count`.

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

- [ ] **Step 3: 실제 콘텐츠로 확인** — 지금은 승인된 장면이 없어 공개된 장이 없다(설계 11절). `npm run pipeline -- publish` 뒤 `publish/catalog.json`의 `books`가 비어 있고 `publish/preview/catalog.json`에 창세기 1~5장이 미리 보기로 있는지 본다(`publish/`는 커밋하지 않는다).

- [ ] **Step 4: 커밋**

```bash
git add pipeline .gitignore
git commit -m "feat(pipeline): publish 단계(꾸러미, 공용 설정집·사전, 공개 목록, 미리 보기)"
```

---

### Task 8: 서버의 /content

**Files:**
- Create: `server/src/content.ts`, `server/test/content.test.ts`
- Modify: `server/src/app.ts`, `server/src/config.ts`, `server/src/index.ts`

- [ ] **Step 1:** 설정 `contentDir`(`CONTENT_DIR`, 기본 리포 루트의 `publish`)와 `contentPreview`(`CONTENT_PREVIEW=1`).
- [ ] **Step 2:** `GET /content/*`:
- 폴더 밖을 가리키는 경로(`..`, 절대 경로, 역슬래시)는 404.
- `catalog.json`, `preview/catalog.json`: `Cache-Control: no-cache`, 내용 해시로 만든 `ETag`, `If-None-Match`가 같으면 304.
- 그 밖의 파일(이름에 해시가 든 것): `Cache-Control: public, max-age=31536000, immutable`.
- `Content-Type`: json, jpg/jpeg, png, webp, mp3.
- `preview/` 아래는 `contentPreview`가 켜져 있을 때만, 아니면 404.
- 인증은 받지 않는다(공개된 콘텐츠다). CORS는 지금 설정을 따른다.
- [ ] **Step 3: 시험** — 임시 폴더로: 목록 200과 ETag, 같은 ETag는 304, 꾸러미의 캐시 머리글, 없는 파일 404, `..` 404, 미리 보기는 꺼져 있으면 404·켜져 있으면 200.

Run: `npm test -w server && npm run typecheck -w server`

- [ ] **Step 4: 커밋**

```bash
git add server
git commit -m "feat(server): 공개 콘텐츠를 /content로 낸다(목록은 매번 확인, 해시 파일은 오래 캐시)"
```

---

### Task 9: 질문하기가 공개된 것만 쓴다

**Files:**
- Modify: `server/src/ask/passages.ts`, `server/src/index.ts`, `server/src/app.ts`, `server/test/ask.test.ts`

- [ ] **Step 1:** 대목을 공개 목록에서 만든다. `readPublished(contentDir)`: `catalog.json`을 읽고(없으면 질문하기를 끈다), 목록의 꾸러미와 공용 설정집을 읽어 책마다 `AskBundle` 모양(1단계 Task 9에서 정한 것)으로 모은다. 설정집 인용은 책이 붙은 모양이므로 `parseRef`가 책과 장을 그대로 읽는다. 장면은 꾸러미에 든 것(공개된 장은 모두 사람 승인)만 쓴다.
- [ ] **Step 2:** 다시 읽기: `/ask` 요청마다 `catalog.json`의 수정 시각을 보고 바뀌었으면 다시 읽는다(목록 판을 로그에 남긴다). 다시 읽는 동안 지금 색인으로 답하고, 새 색인은 다 만든 뒤 바꾼다(요청을 막지 않는다).
- [ ] **Step 2b: 성경 전체 크기** — 1단계 Task 9 검토에서 66권 가정으로 잰 값: 색인 만들기 0.7초, 색인 메모리 140~170 MB(대목마다 바이그램 Map), 질문마다 검색 45 ms(동기화 서버의 이벤트 루프에서 동기). 바이그램 → (대목, 횟수) 묶음의 역색인으로 바꾸고, 꾸러미에서 질문하기가 쓰는 필드만 남겨(원어·사전·퀴즈는 버린다) 메모리를 줄인다. 공용 설정집 항목의 책은 그 항목이 실린 꾸러미가 아니라 인용(`ref.book`)으로 정하고, `index.books`는 절·장면 대목의 책으로만 센다.
- [ ] **Step 3:** 1단계의 묶음 읽기(`BUNDLE_DIR`)는 지운다. 공개된 장이 없으면 질문하기는 503(지금과 같은 글). 미리 보기가 켜져 있으면(`CONTENT_PREVIEW=1`, 개발용) `preview/catalog.json`을 읽어 미리 보기 장도 근거로 쓴다(지금은 공개된 장이 없으므로 개발 중 질문하기는 미리 보기로 확인한다).
- [ ] **Step 4: 시험** — 임시 콘텐츠 폴더(목록, 꾸러미 둘, 설정집)로: 공개된 장의 대목만 있다, 미리 보기 장은 없다, 목록을 바꾸면 다음 요청에서 다시 읽는다, 목록이 없으면 503.

Run: `npm test -w server && npm run typecheck -w server`

- [ ] **Step 5: 커밋**

```bash
git add server
git commit -m "feat(server): 질문하기가 공개 목록의 꾸러미와 공용 설정집만 근거로 쓴다"
```

---

### Task 10: 관리 도구의 공개 API와 publish 작업

**Files:**
- Create: `admin/server/routes/releases.ts`, `admin/test/releases.test.ts`
- Modify: `admin/server/app.ts`, `admin/server/stages.ts`, `admin/server/jobs.ts`, `admin/server/context.ts`

- [ ] **Step 1:** 작업 단계에 `publish`(책을 받지 않는다)를 더한다.
- [ ] **Step 2:** API(책은 1단계 Task 8의 `/api/books/:book/…` 규칙):
- `GET /api/books/:book/releases` → `bookReleaseStatus` 결과와 목록 판.
- `POST /api/books/:book/releases/:chapter` → 공개(또는 다시 공개). 점검 미통과면 400(빠진 것), 바뀐 것이 없으면 200 `{ changed: false }`. 공개 상태 파일을 고친 뒤 `publish` 작업을 넣고 `{ changed: true, jobId }`를 202로 돌려준다.
- `DELETE /api/books/:book/releases/:chapter` → 공개 취소 뒤 `publish` 작업, 202.
- 공개 상태 파일을 고치는 동안 `publish` 작업이 실행 중이거나 다른 작업이 실행 중이면(작업 큐는 하나씩) 409(지금 원어 뜻·퀴즈 저장과 같은 방식).
- [ ] **Step 3: 시험** — 임시 콘텐츠로: 상태 목록, 점검 미통과 400, 공개 뒤 공개 상태 파일과 작업, 같은 내용 다시 공개는 바뀐 것 없음, 공개 취소, 실행 중 409, 알 수 없는 책 404.

Run: `npm test -w admin && npm run typecheck -w admin && npm run lint -w admin`

- [ ] **Step 4: 커밋**

```bash
git add admin
git commit -m "feat(admin): 장 공개·다시 공개·공개 취소 API와 publish 작업"
```

---

### Task 11: 관리 도구의 공개 화면

**Files:**
- Create: `admin/src/pages/Releases.tsx`
- Modify: `admin/src/route.ts`, `admin/src/api.ts`, `admin/src/App.tsx`(내비), `admin/src/logic.test.ts`

- [ ] **Step 1:** 화면(목업의 "관리 도구 공개 화면"): 주소 `#/<book>/releases`. 고른 책의 장마다 한 줄: 장 번호, 상태 칩(공개됨 · 판 n / 바뀐 것 있음 / 점검 미통과 / 장면 쓰기 전 / 본문 받기 전), 필수 점검 셋(통과 ✓, 빠짐 ✗과 무엇이), 선택(퀴즈 승인 n개, 원어 뜻 n/m), 단추(공개 / 다시 공개 / 공개 취소). 다시 공개 단추 옆에 바뀐 부분(글, 그림, 낭독, 퀴즈, 원어 뜻). 공개 취소는 화면 안의 확인 단계를 거친다(브라우저 `confirm`을 쓰지 않는다). 누른 뒤에는 작업 진행(작업 화면의 SSE 로그를 짧게)과 끝나면 목록을 다시 읽는다. 맨 위에 목록 판과 마지막 공개 시각.
- [ ] **Step 2:** 브라우저에서 확인한다(관리 도구를 띄우고 임시로 장면 하나를 승인한 고정값이 아니라, 지금 콘텐츠로 상태 칩과 점검 표시가 맞는지, 공개 단추가 꺼져 있는지 본다).

Run: `npm test -w admin && npm run typecheck -w admin && npm run lint -w admin && npm run build -w admin`

- [ ] **Step 3: 커밋**

```bash
git add admin
git commit -m "feat(admin): 공개 화면(장마다 점검과 공개 상태, 공개·다시 공개·공개 취소)"
```

---

### Task 12: 문서와 전체 확인

- [ ] **Step 1:** `docs/content-publish.md`(새): 공개 상태 파일, 공개 목록, 꾸러미, 공용 설정집·사전, 미디어 이름, 미리 보기, 서버의 캐시 규칙.
- [ ] **Step 2:** `README.md`: `release`, `publish` 명령, 관리 도구 공개 화면, `CONTENT_DIR`/`CONTENT_PREVIEW`.
- [ ] **Step 3:** 설계 문서 3절 표 아래에 2단계 진행(완료일, 만들면서 정한 것: 부분 해시, 미리 보기 꾸러미의 그림 버전, 공용 설정집 범위).
- [ ] **Step 4:** 전체 확인

```bash
npm test && npm run typecheck -w pipeline && npm run typecheck -w server && npm run typecheck -w admin && npm run lint -w admin && npm run typecheck -w mobile && npm run build -w app
```

- [ ] **Step 5: 커밋**

```bash
git add README.md docs
git commit -m "docs: 여러 책과 장 공개 2단계(공개) 완료"
```
