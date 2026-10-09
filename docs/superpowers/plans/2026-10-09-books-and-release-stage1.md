# 여러 책과 장 공개 1단계: 여러 책 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 창세기 고정을 없애고 성경 66권 어느 책이든 같은 파이프라인, 관리 도구, 서버로 다룰 수 있게 한다. 창세기의 동작과 결과(장면·퀴즈·음성 파일 이름, 앱 묶음)는 그대로다.

**Architecture:** `reader-core`에 66권 목록(`books.ts`)과 절 참조(`refs.ts`)를 두고, 파이프라인이 `reader-core`를 의존해 파일 이름과 id 규칙을 거기서 가져온다. 파이프라인의 모든 단계와 관리 도구, 서버가 책 id를 받는다. 설정집 참조에는 책을 붙이고(한 번 도는 이전 명령), 책마다 만드는 앱 묶음에는 지금처럼 책 없는 참조를 쓴다.

**Tech Stack:** TypeScript, zod, vitest, tsx, Hono, React(관리 도구)

**설계:** `docs/superpowers/specs/2026-10-09-books-and-release-design.md` 3절 1단계, 4절, 10절

**브랜치:** `feature/books-and-release`(main에서). 세 단계가 끝나면 `docs/git-convention.md`대로 main에 합친다.

**설계에서 정하거나 바꾸는 것:**
- 책 id는 영어 소문자이고, 번호가 붙은 책은 `1-samuel`처럼 쓴다. 장면 id·파일 이름은 오른쪽부터 읽는다(`1-samuel-01-03` → 책 `1-samuel`, 1장, 3번 장면).
- 묶음에 `bookId`를 더한다(키 추가라 `schemaVersion`은 1 그대로). 옛 묶음은 `book`(한국어 이름)으로 책을 찾는다.
- 책 묶음에는 그 책에서 처음 나오는 설정집 항목만 넣고, 참조는 책을 떼어 지금과 같은 `장:절`로 쓴다. 다른 책을 가리키는 근거 절은 그 책 묶음에서 뺀다.
- 장을 다루는 단계(canon, scenario, review-text, images, tts, quiz)는 `--book`이 꼭 있어야 한다. `original`은 `--book`이 없으면 본문이 있는 모든 책을 돈다. `build`는 언제나 본문이 있는 모든 책을 함께 만들고 `--book`을 받지 않는다(한 책만 만들면 앱 콘텐츠 폴더를 비우면서 다른 책 묶음이 사라진다). 그래서 Pages 배포 워크플로는 그대로다. `original-gloss`는 모든 책이 함께 쓰는 사전을 채우므로 책을 받지 않는다.
- `source`는 `--book`이 꼭 있어야 하고, `--chapters 1-10`처럼 범위를 줄 수 있다(없으면 책 전체).
- LLM 실행 기록에 `book`을 더한다(옛 줄은 `null`).
- 신약 책에 `original`을 돌리면 "신약 원어 자료는 아직 정하지 않았어요"로 멈춘다.

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `packages/reader-core/src/books.ts` (새) | 66권 목록, 책 찾기, 장 번호 자리수, 장면·음성·퀴즈 id와 파일 이름 규칙 |
| `packages/reader-core/src/refs.ts` (새) | 절 참조 읽기·쓰기·비교, 책 붙이기·떼기 |
| `packages/reader-core/src/{people,names,genealogy,ask}.ts` | 참조 읽기를 `refs.ts`로 모은다(동작 그대로) |
| `packages/reader-core/src/{types,bundle}.ts` | 묶음 `bookId` |
| `pipeline/package.json` | `reader-core` 의존 |
| `pipeline/src/paths.ts` | 책을 받는 경로 함수 |
| `pipeline/src/source/files.ts` (새) | 본문 읽기, 장 읽기, 본문 있는 책 목록, 책별 절 수 |
| `pipeline/src/source/fetchSource.ts`, `parseWikisource.ts` | 책마다 위키문헌 본문 받기, 범용 검증 |
| `pipeline/src/scenes/files.ts`, `quiz/files.ts` | 책을 받는 읽기·쓰기·목록 |
| `pipeline/src/schema.ts` | 책이 붙은 절 인용, 장 안 인용, 퀴즈 id, 묶음 `bookId` |
| `pipeline/src/canon/*` | 책별 절 수로 검증, 모델 인용에 책 붙이기, 프롬프트의 책 이름 |
| `pipeline/src/canon/migrateRefs.ts` (새) | 설정집 참조에 책을 붙이는 이전 |
| `pipeline/src/{scenario,review,images,tts,quiz,original}/*` | 책 인자, 프롬프트의 책 이름, 책별 원어 파일 |
| `pipeline/src/build/*` | 책마다 묶음, 그 책의 설정집만, 책 없는 참조 |
| `pipeline/src/llm/{runs,client}.ts` | 실행 기록의 `book` |
| `pipeline/src/cli.ts`, `index.ts` | `--book`, `--chapters`, `migrate-canon-refs` |
| `admin/**` | 책을 받는 API와 화면의 책 고르기 |
| `server/src/ask/*`, `server/src/config.ts`, `server/src/index.ts` | 모든 책 묶음을 읽고, 책 이름을 쓴다 |
| `mobile/src/content/bundle.ts` | `bookId`를 묶음에서 읽는다 |
| `content/story-bible/*.json` | 참조에 `genesis `를 붙인다(이전 명령 결과) |
| `README.md`, `docs/content-bundle.md`, 설계 문서 | 명령과 진행 |

---

### Task 1: 66권 목록 (`reader-core/books.ts`)

**Files:**
- Create: `packages/reader-core/src/books.ts`
- Create: `packages/reader-core/src/books.test.ts`
- Modify: `packages/reader-core/src/index.ts` (`export * from './books.ts'`를 알파벳 순서 자리에)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
// packages/reader-core/src/books.test.ts
import { describe, expect, it } from 'vitest'
import {
  BOOKS,
  bookByName,
  bookOrder,
  chapterStem,
  fallbackSceneIdOf,
  findBook,
  getBook,
  isBookId,
  parseChapterStem,
  parseSceneId,
  quizQuestionId,
  sceneIdOf,
  verseAudioName,
} from './books.ts'

describe('BOOKS', () => {
  it('66권, 구약 39권 929장, 신약 27권 260장이다', () => {
    expect(BOOKS).toHaveLength(66)
    const old = BOOKS.filter((book) => book.testament === 'old')
    const fresh = BOOKS.filter((book) => book.testament === 'new')
    expect(old).toHaveLength(39)
    expect(fresh).toHaveLength(27)
    expect(old.reduce((sum, book) => sum + book.chapters, 0)).toBe(929)
    expect(fresh.reduce((sum, book) => sum + book.chapters, 0)).toBe(260)
  })

  it('id, 이름, OSIS 코드가 겹치지 않는다', () => {
    for (const key of ['id', 'name', 'osis'] as const) {
      expect(new Set(BOOKS.map((book) => book[key])).size).toBe(66)
    }
    for (const book of BOOKS) expect(book.id).toMatch(/^([1-3]-)?[a-z]+(-[a-z]+)*$/)
  })

  it('책을 찾고 순서를 안다', () => {
    expect(getBook('genesis').name).toBe('창세기')
    expect(findBook('nope')).toBeUndefined()
    expect(isBookId('1-samuel')).toBe(true)
    expect(isBookId('samuel')).toBe(false)
    expect(bookByName('요한계시록')?.id).toBe('revelation')
    expect(bookOrder('genesis')).toBe(0)
    expect(bookOrder('revelation')).toBe(65)
    expect(() => getBook('nope' as never)).toThrow('알 수 없는 책')
  })
})

describe('id와 파일 이름', () => {
  it('장 번호를 그 책의 장 수 자리수로 채운다', () => {
    expect(chapterStem('genesis', 4)).toBe('genesis-04')
    expect(chapterStem('psalms', 1)).toBe('psalms-001')
    expect(chapterStem('psalms', 119)).toBe('psalms-119')
    expect(chapterStem('obadiah', 1)).toBe('obadiah-1')
    expect(() => chapterStem('genesis', 51)).toThrow('창세기에는 51장이 없습니다')
  })

  it('장면, 대체 장면, 절 낭독, 퀴즈 id는 지금 창세기 이름과 같다', () => {
    expect(sceneIdOf('genesis', 4, 3)).toBe('genesis-04-03')
    expect(fallbackSceneIdOf('genesis', 6)).toBe('genesis-06-00')
    expect(verseAudioName('genesis', 1, 1)).toBe('genesis-01-001.mp3')
    expect(quizQuestionId('genesis', 4, 1)).toBe('genesis-04-q1')
    expect(sceneIdOf('1-samuel', 1, 2)).toBe('1-samuel-01-02')
  })

  it('오른쪽부터 읽어 책과 장을 되찾는다', () => {
    expect(parseChapterStem('genesis-04')).toEqual({ book: 'genesis', chapter: 4 })
    expect(parseChapterStem('1-samuel-01')).toEqual({ book: '1-samuel', chapter: 1 })
    expect(parseChapterStem('genesis-4')).toBeNull()
    expect(parseChapterStem('genesis-51')).toBeNull()
    expect(parseChapterStem('nope-01')).toBeNull()
    expect(parseSceneId('genesis-04-03')).toEqual({ book: 'genesis', chapter: 4, index: 3 })
    expect(parseSceneId('psalms-119-02')).toEqual({ book: 'psalms', chapter: 119, index: 2 })
    expect(parseSceneId('genesis-04')).toBeNull()
  })
})
```

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `npx vitest run --root packages/reader-core src/books.test.ts`
Expected: FAIL (`./books.ts`가 없다)

- [ ] **Step 3: 구현한다**

```ts
// packages/reader-core/src/books.ts
// 성경 66권. id는 파일 이름과 장면 id에 쓰는 영어 소문자, name은 개역한글 책 이름,
// osis는 원어 자료 파일 이름(OSHB의 Gen.xml 등)이다. 장마다 절 수는 본문에서 센다.
export type Testament = 'old' | 'new'

export const BOOKS = [
  { id: 'genesis', name: '창세기', testament: 'old', chapters: 50, osis: 'Gen' },
  { id: 'exodus', name: '출애굽기', testament: 'old', chapters: 40, osis: 'Exod' },
  { id: 'leviticus', name: '레위기', testament: 'old', chapters: 27, osis: 'Lev' },
  { id: 'numbers', name: '민수기', testament: 'old', chapters: 36, osis: 'Num' },
  { id: 'deuteronomy', name: '신명기', testament: 'old', chapters: 34, osis: 'Deut' },
  { id: 'joshua', name: '여호수아', testament: 'old', chapters: 24, osis: 'Josh' },
  { id: 'judges', name: '사사기', testament: 'old', chapters: 21, osis: 'Judg' },
  { id: 'ruth', name: '룻기', testament: 'old', chapters: 4, osis: 'Ruth' },
  { id: '1-samuel', name: '사무엘상', testament: 'old', chapters: 31, osis: '1Sam' },
  { id: '2-samuel', name: '사무엘하', testament: 'old', chapters: 24, osis: '2Sam' },
  { id: '1-kings', name: '열왕기상', testament: 'old', chapters: 22, osis: '1Kgs' },
  { id: '2-kings', name: '열왕기하', testament: 'old', chapters: 25, osis: '2Kgs' },
  { id: '1-chronicles', name: '역대상', testament: 'old', chapters: 29, osis: '1Chr' },
  { id: '2-chronicles', name: '역대하', testament: 'old', chapters: 36, osis: '2Chr' },
  { id: 'ezra', name: '에스라', testament: 'old', chapters: 10, osis: 'Ezra' },
  { id: 'nehemiah', name: '느헤미야', testament: 'old', chapters: 13, osis: 'Neh' },
  { id: 'esther', name: '에스더', testament: 'old', chapters: 10, osis: 'Esth' },
  { id: 'job', name: '욥기', testament: 'old', chapters: 42, osis: 'Job' },
  { id: 'psalms', name: '시편', testament: 'old', chapters: 150, osis: 'Ps' },
  { id: 'proverbs', name: '잠언', testament: 'old', chapters: 31, osis: 'Prov' },
  { id: 'ecclesiastes', name: '전도서', testament: 'old', chapters: 12, osis: 'Eccl' },
  { id: 'song-of-songs', name: '아가', testament: 'old', chapters: 8, osis: 'Song' },
  { id: 'isaiah', name: '이사야', testament: 'old', chapters: 66, osis: 'Isa' },
  { id: 'jeremiah', name: '예레미야', testament: 'old', chapters: 52, osis: 'Jer' },
  { id: 'lamentations', name: '예레미야애가', testament: 'old', chapters: 5, osis: 'Lam' },
  { id: 'ezekiel', name: '에스겔', testament: 'old', chapters: 48, osis: 'Ezek' },
  { id: 'daniel', name: '다니엘', testament: 'old', chapters: 12, osis: 'Dan' },
  { id: 'hosea', name: '호세아', testament: 'old', chapters: 14, osis: 'Hos' },
  { id: 'joel', name: '요엘', testament: 'old', chapters: 3, osis: 'Joel' },
  { id: 'amos', name: '아모스', testament: 'old', chapters: 9, osis: 'Amos' },
  { id: 'obadiah', name: '오바댜', testament: 'old', chapters: 1, osis: 'Obad' },
  { id: 'jonah', name: '요나', testament: 'old', chapters: 4, osis: 'Jonah' },
  { id: 'micah', name: '미가', testament: 'old', chapters: 7, osis: 'Mic' },
  { id: 'nahum', name: '나훔', testament: 'old', chapters: 3, osis: 'Nah' },
  { id: 'habakkuk', name: '하박국', testament: 'old', chapters: 3, osis: 'Hab' },
  { id: 'zephaniah', name: '스바냐', testament: 'old', chapters: 3, osis: 'Zeph' },
  { id: 'haggai', name: '학개', testament: 'old', chapters: 2, osis: 'Hag' },
  { id: 'zechariah', name: '스가랴', testament: 'old', chapters: 14, osis: 'Zech' },
  { id: 'malachi', name: '말라기', testament: 'old', chapters: 4, osis: 'Mal' },
  { id: 'matthew', name: '마태복음', testament: 'new', chapters: 28, osis: 'Matt' },
  { id: 'mark', name: '마가복음', testament: 'new', chapters: 16, osis: 'Mark' },
  { id: 'luke', name: '누가복음', testament: 'new', chapters: 24, osis: 'Luke' },
  { id: 'john', name: '요한복음', testament: 'new', chapters: 21, osis: 'John' },
  { id: 'acts', name: '사도행전', testament: 'new', chapters: 28, osis: 'Acts' },
  { id: 'romans', name: '로마서', testament: 'new', chapters: 16, osis: 'Rom' },
  { id: '1-corinthians', name: '고린도전서', testament: 'new', chapters: 16, osis: '1Cor' },
  { id: '2-corinthians', name: '고린도후서', testament: 'new', chapters: 13, osis: '2Cor' },
  { id: 'galatians', name: '갈라디아서', testament: 'new', chapters: 6, osis: 'Gal' },
  { id: 'ephesians', name: '에베소서', testament: 'new', chapters: 6, osis: 'Eph' },
  { id: 'philippians', name: '빌립보서', testament: 'new', chapters: 4, osis: 'Phil' },
  { id: 'colossians', name: '골로새서', testament: 'new', chapters: 4, osis: 'Col' },
  { id: '1-thessalonians', name: '데살로니가전서', testament: 'new', chapters: 5, osis: '1Thess' },
  { id: '2-thessalonians', name: '데살로니가후서', testament: 'new', chapters: 3, osis: '2Thess' },
  { id: '1-timothy', name: '디모데전서', testament: 'new', chapters: 6, osis: '1Tim' },
  { id: '2-timothy', name: '디모데후서', testament: 'new', chapters: 4, osis: '2Tim' },
  { id: 'titus', name: '디도서', testament: 'new', chapters: 3, osis: 'Titus' },
  { id: 'philemon', name: '빌레몬서', testament: 'new', chapters: 1, osis: 'Phlm' },
  { id: 'hebrews', name: '히브리서', testament: 'new', chapters: 13, osis: 'Heb' },
  { id: 'james', name: '야고보서', testament: 'new', chapters: 5, osis: 'Jas' },
  { id: '1-peter', name: '베드로전서', testament: 'new', chapters: 5, osis: '1Pet' },
  { id: '2-peter', name: '베드로후서', testament: 'new', chapters: 3, osis: '2Pet' },
  { id: '1-john', name: '요한일서', testament: 'new', chapters: 5, osis: '1John' },
  { id: '2-john', name: '요한이서', testament: 'new', chapters: 1, osis: '2John' },
  { id: '3-john', name: '요한삼서', testament: 'new', chapters: 1, osis: '3John' },
  { id: 'jude', name: '유다서', testament: 'new', chapters: 1, osis: 'Jude' },
  { id: 'revelation', name: '요한계시록', testament: 'new', chapters: 22, osis: 'Rev' },
] as const satisfies readonly { id: string; name: string; testament: Testament; chapters: number; osis: string }[]

export type Book = (typeof BOOKS)[number]
export type BookId = Book['id']

const byId = new Map<string, Book>(BOOKS.map((book) => [book.id, book]))
const byName = new Map<string, Book>(BOOKS.map((book) => [book.name, book]))
const order = new Map<string, number>(BOOKS.map((book, index) => [book.id, index]))

export function findBook(id: string): Book | undefined {
  return byId.get(id)
}

export function isBookId(value: string): value is BookId {
  return byId.has(value)
}

export function getBook(id: BookId): Book {
  const book = byId.get(id)
  if (!book) throw new Error(`알 수 없는 책입니다: ${id}`)
  return book
}

export function bookByName(name: string): Book | undefined {
  return byName.get(name)
}

// 성경 순서(0부터)
export function bookOrder(id: BookId): number {
  return order.get(id) ?? -1
}

// 장 번호를 그 책의 장 수 자리수로 채운 파일 줄기: genesis-04, psalms-119, obadiah-1
export function chapterStem(id: BookId, chapter: number): string {
  const book = getBook(id)
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    throw new Error(`${book.name}에는 ${chapter}장이 없습니다`)
  }
  return `${book.id}-${String(chapter).padStart(String(book.chapters).length, '0')}`
}

// index는 1부터 센 장면 순서
export function sceneIdOf(book: BookId, chapter: number, index: number): string {
  return `${chapterStem(book, chapter)}-${String(index).padStart(2, '0')}`
}

// 장면 파일이 없는 장에 묶음이 넣는 장 하나짜리 장면
export function fallbackSceneIdOf(book: BookId, chapter: number): string {
  return `${chapterStem(book, chapter)}-00`
}

export function verseAudioName(book: BookId, chapter: number, verse: number): string {
  return `${chapterStem(book, chapter)}-${String(verse).padStart(3, '0')}.mp3`
}

export function quizQuestionId(book: BookId, chapter: number, number: number): string {
  return `${chapterStem(book, chapter)}-q${number}`
}

// "genesis-04" → { book: 'genesis', chapter: 4 }. 자리수가 규칙과 다르거나 장이 없으면 null
export function parseChapterStem(stem: string): { book: BookId; chapter: number } | null {
  const match = /^(.+)-(\d+)$/.exec(stem)
  if (!match) return null
  const book = findBook(match[1]!)
  if (!book) return null
  const chapter = Number(match[2])
  if (chapter < 1 || chapter > book.chapters) return null
  return chapterStem(book.id, chapter) === stem ? { book: book.id, chapter } : null
}

// "genesis-04-03" → { book: 'genesis', chapter: 4, index: 3 }
export function parseSceneId(id: string): { book: BookId; chapter: number; index: number } | null {
  const match = /^(.+)-(\d{2})$/.exec(id)
  if (!match) return null
  const stem = parseChapterStem(match[1]!)
  return stem ? { ...stem, index: Number(match[2]) } : null
}
```

- [ ] **Step 4: 돌려서 통과를 본다**

Run: `npx vitest run --root packages/reader-core src/books.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/reader-core/src/books.ts packages/reader-core/src/books.test.ts packages/reader-core/src/index.ts
git commit -m "feat(core): 성경 66권 목록과 장면·음성·퀴즈 id 규칙"
```

---

### Task 2: 절 참조 (`reader-core/refs.ts`)와 묶음의 책

**Files:**
- Create: `packages/reader-core/src/refs.ts`, `packages/reader-core/src/refs.test.ts`
- Modify: `packages/reader-core/src/people.ts`, `names.ts`, `genealogy.ts`, `ask.ts`(참조 읽기를 `parseRef`로), `types.ts`(`Bundle.bookId`), `bundle.ts`(`bookId` 채우기·검사), `bundle.test.ts`, `index.ts`
- Modify: 묶음 시험 고정값(`bookId: 'genesis'`를 더한다): reader-core·app·mobile의 시험 묶음

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
// packages/reader-core/src/refs.test.ts
import { describe, expect, it } from 'vitest'
import { compareRefs, formatRef, localRef, parseRef, qualifyRef } from './refs.ts'

describe('parseRef', () => {
  it('책이 붙은 참조와 책 없는 참조를 읽는다', () => {
    expect(parseRef('genesis 4:1-5')).toEqual({ book: 'genesis', chapter: 4, verse: 1, verseEnd: 5 })
    expect(parseRef('4:1')).toEqual({ book: null, chapter: 4, verse: 1, verseEnd: 1 })
    expect(parseRef('psalms 119:105')).toEqual({ book: 'psalms', chapter: 119, verse: 105, verseEnd: 105 })
    expect(parseRef('1-samuel 3:10')?.book).toBe('1-samuel')
  })

  it('틀린 참조는 null', () => {
    expect(parseRef('nope 1:1')).toBeNull()
    expect(parseRef('4:5-3')).toBeNull()
    expect(parseRef('4')).toBeNull()
    expect(parseRef('0:1')).toBeNull()
  })
})

describe('formatRef', () => {
  it('저장용 id, 화면용 이름, 장:절만 쓴다', () => {
    const ref = parseRef('genesis 4:1-5')!
    expect(formatRef(ref)).toBe('genesis 4:1-5')
    expect(formatRef(ref, 'name')).toBe('창세기 4:1-5')
    expect(formatRef(ref, 'bare')).toBe('4:1-5')
    expect(formatRef(parseRef('2:7')!, 'name')).toBe('2:7')
  })
})

describe('책 붙이기와 떼기', () => {
  it('책 없는 참조에 책을 붙이고, 이미 붙은 것은 그대로 둔다', () => {
    expect(qualifyRef('2:7-8', 'genesis')).toBe('genesis 2:7-8')
    expect(qualifyRef('exodus 3:2', 'genesis')).toBe('exodus 3:2')
    expect(qualifyRef('엉터리', 'genesis')).toBeNull()
  })

  it('같은 책이면 떼고, 다른 책이면 null', () => {
    expect(localRef('genesis 4:1', 'genesis')).toBe('4:1')
    expect(localRef('4:1', 'genesis')).toBe('4:1')
    expect(localRef('exodus 3:2', 'genesis')).toBeNull()
  })
})

describe('compareRefs', () => {
  it('책 순서, 장, 절 순서로 비교한다', () => {
    const at = (text: string) => parseRef(text)!
    expect(compareRefs(at('genesis 4:1'), at('genesis 4:2'))).toBeLessThan(0)
    expect(compareRefs(at('genesis 5:1'), at('genesis 4:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('exodus 1:1'), at('genesis 50:26'))).toBeGreaterThan(0)
    expect(compareRefs(at('4:1'), at('genesis 4:1'), 'genesis')).toBe(0)
  })
})
```

`bundle.test.ts`에 더한다:

```ts
it('bookId가 없는 옛 묶음은 책 이름으로 책을 찾는다', () => {
  const old = { ...sampleBundle, bookId: undefined } as unknown as Bundle
  expect(fillMissing(validateBundle(old)).bookId).toBe('genesis')
})

it('책을 알 수 없는 묶음은 받지 않는다', () => {
  const unknown = { ...sampleBundle, bookId: undefined, book: '없는 책' } as unknown as Bundle
  expect(() => validateBundle(unknown)).toThrow('묶음의 책을 알 수 없습니다')
})
```

(`sampleBundle`은 그 시험 파일에 이미 있는 묶음 고정값이다. 이름이 다르면 그 고정값을 쓴다.)

- [ ] **Step 2: 돌려서 실패를 본다**

Run: `npx vitest run --root packages/reader-core src/refs.test.ts src/bundle.test.ts`
Expected: FAIL

- [ ] **Step 3: `refs.ts`를 구현한다**

```ts
// packages/reader-core/src/refs.ts
import { bookOrder, findBook, getBook, type BookId } from './books.ts'

// 절 참조. 책이 붙은 "genesis 4:1-5"는 책을 넘나드는 곳(설정집)에, 책 없는 "4:1"은 한 책 안(장면, 책 묶음)에 쓴다.
export type VerseRef = { book: BookId | null; chapter: number; verse: number; verseEnd: number }

const PATTERN = /^(?:([a-z0-9-]+) )?(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/

export function parseRef(text: string): VerseRef | null {
  const match = PATTERN.exec(text.trim())
  if (!match) return null
  let book: BookId | null = null
  if (match[1] !== undefined) {
    const found = findBook(match[1])
    if (!found) return null
    book = found.id
  }
  const chapter = Number(match[2])
  const verse = Number(match[3])
  const verseEnd = match[4] === undefined ? verse : Number(match[4])
  if (chapter < 1 || verse < 1 || verseEnd < verse) return null
  return { book, chapter, verse, verseEnd }
}

// 'id': "genesis 4:1-5"(저장), 'name': "창세기 4:1-5"(화면), 'bare': "4:1-5"
export function formatRef(ref: VerseRef, style: 'id' | 'name' | 'bare' = 'id'): string {
  const bare = ref.verseEnd === ref.verse ? `${ref.chapter}:${ref.verse}` : `${ref.chapter}:${ref.verse}-${ref.verseEnd}`
  if (style === 'bare' || ref.book === null) return bare
  return `${style === 'name' ? getBook(ref.book).name : ref.book} ${bare}`
}

// 책 없는 참조에 책을 붙인다. 이미 책이 있으면 그대로(정리한 모양으로) 돌려준다. 읽을 수 없으면 null
export function qualifyRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  return ref ? formatRef({ ...ref, book: ref.book ?? book }) : null
}

// 그 책 안의 참조로 바꾼다. 다른 책을 가리키면 null
export function localRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  if (!ref || (ref.book !== null && ref.book !== book)) return null
  return formatRef(ref, 'bare')
}

// 책 순서, 장, 절 순서. 책이 없는 참조는 fallback 책으로 본다(없으면 같은 책으로 친다).
export function compareRefs(a: VerseRef, b: VerseRef, fallback?: BookId): number {
  const bookA = a.book ?? fallback ?? null
  const bookB = b.book ?? fallback ?? null
  const byBook = bookA !== null && bookB !== null ? bookOrder(bookA) - bookOrder(bookB) : 0
  return byBook || a.chapter - b.chapter || a.verse - b.verse
}
```

- [ ] **Step 4: 참조 읽기를 모은다(동작 그대로)**

- `people.ts`: `chapterOfReference(reference)`는 `parseRef(reference)?.chapter ?? 0`, `verseOfReference`는 `parseRef(reference)?.verse ?? 0`로 바꾸고 둘 다 내보낸다(모바일 인물 사전이 `chapterOfReference`를 쓴다).
- `names.ts`: 파일 안의 `chapterOf`, `verseOf`를 지우고 `people.ts`의 `chapterOfReference`, `verseOfReference`를 쓴다.
- `genealogy.ts`의 `appearance()`: `const ref = parseRef(character.firstAppearance)`로 읽고 `ref ? ref.chapter * 1000 + ref.verse : 999_000`을 돌려준다.
- `ask.ts`의 처음 나오는 인물: `parseRef(character.firstAppearance)?.chapter === chapter`.

- [ ] **Step 5: 묶음의 책**

`types.ts`의 `Bundle`에 `book` 아래로 더한다:

```ts
  // 책 id(books.ts). 옛 묶음에는 없어서 불러올 때 book(한국어 이름)으로 채운다.
  bookId: BookId
```

`bundle.ts`:

```ts
import { bookByName, findBook } from './books.ts'

// validateBundle의 마지막 return 앞에
  const bookId = typeof bundle.bookId === 'string' ? bundle.bookId : bookByName(bundle.book)?.id
  if (!bookId || !findBook(bookId)) throw new Error('묶음의 책을 알 수 없습니다')

// fillMissing의 반환 객체에
    bookId: (typeof bundle.bookId === 'string' ? bundle.bookId : bookByName(bundle.book)!.id),
```

시험 묶음 고정값(`packages/reader-core/src/*.test.ts`, `app/src/**/*.test.ts*`, `mobile`이 쓰는 고정값)에 `bookId: 'genesis'`를 더한다. `npm run typecheck -w mobile`과 `npm run build -w app`이 고정값을 찾아 준다.

- [ ] **Step 6: 돌려서 통과를 본다**

Run: `npm test -w reader-core && npm test -w app && npm run typecheck -w mobile`
Expected: 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add packages/reader-core app mobile
git commit -m "feat(core): 절 참조(책이 붙은 참조, 비교)와 묶음 bookId"
```

---

### Task 3: 파이프라인의 책 인자

동작은 그대로 두고, 모든 파일 경로와 id가 책을 받게 한다. 프롬프트의 "창세기"는 Task 6에서 바꾼다.

**Files:**
- Modify: `pipeline/package.json`(`"dependencies"`에 `"reader-core": "*"`), 저장소 루트에서 `npm install`
- Modify: `pipeline/src/paths.ts`
- Create: `pipeline/src/source/files.ts`, `pipeline/test/sourceFiles.test.ts`
- Modify: `pipeline/src/scenes/files.ts`, `pipeline/src/quiz/files.ts`, `pipeline/src/tts/select.ts`, `pipeline/src/scenario/assemble.ts`, `pipeline/src/quiz/runQuiz.ts`, `pipeline/src/schema.ts`, `pipeline/src/llm/runs.ts`, `pipeline/src/llm/client.ts`
- Modify: 단계마다 실행 함수(`canon/runCanon.ts`, `scenario/runScenario.ts`, `review/reviewText.ts`, `images/generateImages.ts`, `tts/generateSpeech.ts`, `quiz/runQuiz.ts`, `original/runOriginal.ts`, `original/runGloss.ts`, `build/writeBundle.ts`), `cli.ts`, `index.ts`
- Modify: `pipeline/test/*`의 호출(책 인자 `'genesis'`를 넣는다)

- [ ] **Step 0: 고치기 전 묶음을 남긴다**

창세기 결과가 그대로인지 Task 3과 Task 7 끝에 비교한다. `build`는 `app/public/content/`를 비우고 다시 만들므로 사본은 시스템 임시 폴더에 둔다.

```bash
npm run pipeline -- build
node -e "const fs=require('fs'),os=require('os'),path=require('path');fs.copyFileSync('app/public/content/genesis.json',path.join(os.tmpdir(),'genesis.before.json'))"
```

- [ ] **Step 1: 경로 함수**

`paths.ts`에서 `sourceFile`, `originalFile` 상수를 지우고 아래로 바꾼다. 다른 상수는 그대로다.

```ts
import { chapterStem, type BookId } from 'reader-core'

export const sourceDir = path.join(contentDir, 'source')
export function sourceFilePath(book: BookId, dir: string = sourceDir): string {
  return path.join(dir, `${book}.json`)
}
export function sceneFilePath(book: BookId, chapter: number, dir: string = scenesDir): string {
  return path.join(dir, `${chapterStem(book, chapter)}.json`)
}
export function originalFilePath(book: BookId, dir: string = originalDir): string {
  return path.join(dir, `${book}.json`)
}
export function quizFilePath(book: BookId, chapter: number, dir: string = quizDir): string {
  return path.join(dir, `${chapterStem(book, chapter)}.json`)
}
```

- [ ] **Step 2: 본문 파일 모듈과 시험**

```ts
// pipeline/src/source/files.ts
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { bookOrder, findBook, getBook, type BookId } from 'reader-core'
import { sourceDir as defaultSourceDir, sourceFilePath } from '../paths.ts'
import { SourceSchema, type Source, type SourceChapter } from '../schema.ts'

// 책의 본문. 없으면 source 단계를 먼저 돌리라는 오류를 낸다. 파일의 book(한국어 이름)이 책과 다르면 오류다.
export async function readSource(book: BookId, dir: string = defaultSourceDir): Promise<Source> {
  const file = sourceFilePath(book, dir)
  if (!existsSync(file)) throw new Error(`${getBook(book).name} 본문이 없습니다. 먼저 source --book ${book}를 실행하세요.`)
  const source = SourceSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  if (source.book !== getBook(book).name) throw new Error(`${file}의 책 이름(${source.book})이 ${getBook(book).name}이 아닙니다`)
  return source
}

export async function readSourceChapter(book: BookId, chapter: number, dir: string = defaultSourceDir): Promise<SourceChapter> {
  const found = (await readSource(book, dir)).chapters.find((item) => item.chapter === chapter)
  if (!found) throw new Error(`${getBook(book).name} 본문에 ${chapter}장이 없습니다. 먼저 source 단계를 실행하세요.`)
  return found
}

// 본문 파일이 있는 책, 성경 순서로
export async function listSourceBooks(dir: string = defaultSourceDir): Promise<BookId[]> {
  if (!existsSync(dir)) return []
  const names = await readdir(dir)
  const books = names.flatMap((name) => {
    const book = name.endsWith('.json') ? findBook(name.slice(0, -'.json'.length)) : undefined
    return book ? [book] : []
  })
  return books.sort((a, b) => bookOrder(a.id) - bookOrder(b.id)).map((book) => book.id)
}

// 책마다 장별 절 수(설정집 인용 검증용). 장 번호 n의 절 수는 counts[n - 1]이다(없는 장은 0).
export async function readVerseCounts(dir: string = defaultSourceDir): Promise<Map<BookId, number[]>> {
  const counts = new Map<BookId, number[]>()
  for (const book of await listSourceBooks(dir)) {
    const source = await readSource(book, dir)
    const list: number[] = []
    for (const chapter of source.chapters) list[chapter.chapter - 1] = chapter.verses.length
    counts.set(book, Array.from(list, (count) => count ?? 0))
  }
  return counts
}
```

`pipeline/test/sourceFiles.test.ts`: 임시 폴더에 `genesis.json`(book `창세기`)과 `exodus.json`(book `출애굽기`), 엉뚱한 `notes.json`을 쓰고 `listSourceBooks`가 `['genesis', 'exodus']`, `readVerseCounts`가 장별 절 수, `readSource('genesis')`가 이름이 다르면 오류를 내는지 본다. 임시 폴더는 다른 시험처럼 `mkdtemp(path.join(os.tmpdir(), 'pipeline-'))`로 만든다.

- [ ] **Step 3: 장면·퀴즈 파일**

```ts
// scenes/files.ts
export async function readSceneFile(book: BookId, chapter: number, dir: string = scenesDir): Promise<SceneFile | null>
export async function writeSceneFile(book: BookId, sceneFile: SceneFile, dir: string = scenesDir): Promise<void>
// 그 책의 장면 파일이 있는 장 번호(오름차순)
export async function listSceneChapters(book: BookId, dir: string = scenesDir): Promise<number[]>
```

```ts
// quiz/files.ts
export async function readQuizFile(book: BookId, chapter: number, dir: string = defaultQuizDir): Promise<QuizFile | null>
export async function writeQuizFile(book: BookId, quizFile: QuizFile, dir: string = defaultQuizDir): Promise<void>
export async function listQuizChapters(book: BookId, dir: string = defaultQuizDir): Promise<number[]>
```

목록 함수는 폴더의 `.json` 이름에서 `.json`을 떼고 `parseChapterStem`으로 읽어 그 책인 것만 고른다. `writeSceneFile`은 장면 id가 모두 그 책·그 장의 id(`parseSceneId`)인지 검사한다.

- [ ] **Step 4: id 규칙을 `reader-core`에서 가져온다**

- `tts/select.ts`의 `audioName`을 지우고 `verseAudioName(book, chapter, verse)`를 쓴다. `selectVersesToSpeak(book, chapter, verses, existing, options)`.
- `scenario/assemble.ts`의 `sceneId`를 지우고 `sceneIdOf(book, chapter, index)`를 쓴다. `assembleScenes(book, chapter, output, canon)`.
- `quiz/runQuiz.ts`의 문제 id는 `quizQuestionId(book, chapter, number)`.
- `schema.ts`의 퀴즈 id 정규식은 `/^[a-z0-9-]+-\d{1,3}-q\d+$/`로 넓힌다.
- `build/writeBundle.ts`의 `/^genesis-(\d+)\.json$/`, `/^genesis-\d{2}\.json$/`는 `listSceneChapters(book)`, `listQuizChapters(book)`로 바꾼다.

- [ ] **Step 5: 실행 기록의 책**

`llm/runs.ts`의 `RunSchema`에 `book: z.string().nullable().default(null)`를 더한다(옛 줄도 읽힌다). `createLlm({ stage, book, chapter, log })`가 기록에 `book`을 적는다.

- [ ] **Step 6: 단계 실행 함수가 책을 받는다**

첫 인자로 책을 받는다. 옵션의 파일·폴더 기본값은 그대로 둔다.

| 함수 | 새 모양 |
|---|---|
| `runCanon` | `runCanon(book, chapter, options, log)` |
| `runScenario` | `runScenario(book, chapter, options, log)` |
| `readSourceChapter` | `source/files.ts`로 옮긴다(위) |
| `runReviewText` | `runReviewText(book, chapter, options, log)` |
| `generateImages` | 옵션에 `book` |
| `generateSpeech` | 옵션에 `book` |
| `runQuiz` | `runQuiz(book, chapter, options, log)` |
| `runOriginal` | `runOriginal(book, options, log)`(OSIS 파일은 Task 6, 지금은 `getBook(book).osis`로 주소를 만든다) |
| `runGloss` | 그대로(사전은 책을 가리지 않는다) |
| `writeBundle` | `writeBundles(books)`: 앱 콘텐츠 폴더를 한 번 비우고 그림·낭독을 한 번 복사한 뒤, 책마다 `<book>.json`과 장면 낭독을 쓴다(책마다 지우면 마지막 책만 남는다) |

- [ ] **Step 7: CLI**

`parseArgs` 옵션에 `book: { type: 'string' }`, `chapters: { type: 'string' }`를 더한다.

```ts
function requireBook(flags: Flags): BookId {
  if (flags.book === undefined) throw new Error('--book <책 id>가 필요합니다(예: --book genesis)')
  if (!isBookId(flags.book)) throw new Error(`알 수 없는 책입니다: ${flags.book}. 책 id는 reader-core의 books.ts에 있습니다.`)
  return flags.book
}

async function booksOrAll(flags: Flags): Promise<BookId[]> {
  return flags.book === undefined ? listSourceBooks() : [requireBook(flags)]
}
```

`canon`, `scenario`, `review-text`, `images`, `tts`, `quiz`, `source`는 `requireBook`, `original`은 `booksOrAll`로 책을 돌며 실행한다. `build`는 `listSourceBooks()`의 모든 책을 `writeBundles`로 만들고 `--book`이 오면 오류를 낸다. `original-gloss`는 책을 받지 않는다.

(실행 결과: 30a86f1, build 고침은 그다음 커밋. `writeBundles`는 모든 책을 만들고 검증한 뒤에 폴더를 비운다. `buildBundle`은 아직 `source.book`(한국어 이름)으로 책을 찾고, `runGloss`는 예문을 창세기 파일에서 읽는다. 둘은 Task 7과 Task 6에서 고친다.)

- [ ] **Step 8: 시험을 고치고 돌린다**

`pipeline/test/*`의 호출에 `'genesis'`를 넣는다. 결과가 바뀌는 시험은 없어야 한다.

Run: `npm test -w pipeline && npm run typecheck -w pipeline`
Expected: 통과

- [ ] **Step 9: 창세기 결과가 그대로인지 본다**

```bash
npm run pipeline -- build --book genesis
node -e "const fs=require('fs'),os=require('os'),path=require('path');console.log(fs.readFileSync('app/public/content/genesis.json','utf8')===fs.readFileSync(path.join(os.tmpdir(),'genesis.before.json'),'utf8')?'same':'DIFFERENT')"
```

Expected: `same` (묶음 `bookId`는 Task 7에서 더한다).

- [ ] **Step 10: 커밋**

```bash
git add package-lock.json pipeline
git commit -m "refactor(pipeline): 모든 단계가 책 id를 받고 파일 이름·id 규칙을 reader-core에서 가져온다"
```

---

### Task 4: 책마다 본문 받기

**Files:**
- Modify: `pipeline/src/source/fetchSource.ts`, `pipeline/src/source/parseWikisource.ts`, `pipeline/test/parseWikisource.test.ts`, `pipeline/src/cli.ts`

- [ ] **Step 1: 범용 검증 시험을 쓴다**

`findSourceProblems(chapters, { from, to })`: 받은 장이 `from..to`로 빠짐없이 이어지는지, 장마다 절이 1부터 빠짐없이 이어지는지, 빈 절이 없는지 본다. 창세기 절 수 표(`expectedVerseCounts`)는 지운다.

```ts
it('장과 절이 빠짐없이 이어지는지 본다', () => {
  const chapter = (number: number, verses: number[]) => ({ chapter: number, verses: verses.map((verse) => ({ verse, text: '본문' })) })
  expect(findSourceProblems([chapter(1, [1, 2]), chapter(2, [1])], { from: 1, to: 2 })).toEqual([])
  expect(findSourceProblems([chapter(1, [1, 3])], { from: 1, to: 1 })).toEqual(['1장: 2절이 없습니다'])
  expect(findSourceProblems([chapter(1, [1])], { from: 1, to: 2 })).toEqual(['2장이 없습니다'])
})
```

- [ ] **Step 2: 구현**

```ts
// fetchSource.ts
export async function fetchSource(book: BookId, range: { from?: number; to?: number } = {}): Promise<Source> {
  const { name, chapters } = getBook(book)
  const from = range.from ?? 1
  const to = range.to ?? chapters
  if (from < 1 || to > chapters || from > to) throw new Error(`${name}의 장 범위가 틀렸습니다: ${from}~${to} (1~${chapters}장)`)
  const pageTitle = `개역한글판/${name}`
  const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`
  // 받기, parseWikisource(text, from, to), findSourceProblems(parsed, { from, to }) 검증은 지금과 같다
  const source = SourceSchema.parse({ book: name, translation: '개역한글', chapters: parsed })
  // sourceFilePath(book)에 쓴다
}
```

CLI: `source --book <id> [--chapters 3-7]`. `--chapters`는 `/^(\d+)-(\d+)$/` 또는 한 장 `/^\d+$/`만 받는다. 읽는 함수 `parseChapterRange(text)`는 `fetchSource.ts`에 두고 `index.ts`로 내보낸다(Task 8의 작업 폼이 쓴다).

위키문헌에서 66권을 받아 확인한 것(2026-10-09):
- 63권은 지금 규칙(`== N장 ==`, `{{절|…}}`)으로 장과 절이 빠짐없이 읽힌다. 시편도 `N장`이고, 한 장짜리 책도 `== 1장 ==`이 있다.
- 요한일서·요한이서·요한삼서는 `개역한글판/요한일서`가 없고(404) `개역한글판/요한1서`·`요한2서`·`요한3서`에 있다. `fetchSource.ts`에 이 세 권만 쪽 이름을 바꾸는 표를 둔다. 본문 파일의 `book`은 그대로 책 이름(요한일서)이다.
- 요한계시록에는 앞 절이 이어지는 줄 29개가 있다(`<br> &nbsp;&nbsp;그 천사를 …`). `parseWikisource`는 이 줄을 앞 절 끝에 빈칸 하나로 붙인다. 장에서 절보다 먼저 나오면 지금처럼 오류다.
- `[없음]`, `[25절과 같음]`, 괄호는 개역한글 본문이므로 그대로 둔다.
- 오늘 받은 창세기 1~10장은 커밋된 `content/source/genesis.json`과 같다.

관리 도구의 본문 작업은 Task 8 전까지 `fetchSource(ADMIN_BOOK, { from: 1, to: 10 })`으로 지금처럼 1~10장을 받는다.

- [ ] **Step 3: 확인**

Run: `npm test -w pipeline`
Expected: 통과. (네트워크가 되는 곳에서) `source --book ruth`(4장), `source --book 1-john`(5장, 책 이름 요한일서), `source --book revelation --chapters 1`(20절, 1절이 "지시하신 것이라"로 끝남)을 받아 보고 지운다(커밋하지 않는다). `source --book genesis --chapters 1-10` 뒤 `git diff --quiet content/source/genesis.json`이 바뀐 것이 없어야 한다. 받은 본문 파일이 남아 있는 동안 `build`를 돌리지 않는다.

- [ ] **Step 4: 커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): source 단계가 책마다 위키문헌 본문을 받는다(--book, --chapters)"
```

---

### Task 5: 설정집 참조에 책

**Files:**
- Modify: `pipeline/src/schema.ts`, `pipeline/src/canon/{validate,merge,files,prompt,runCanon}.ts`, 관련 시험
- Create: `pipeline/src/canon/migrateRefs.ts`, `pipeline/test/migrateRefs.test.ts`
- Modify: `pipeline/src/cli.ts`(`migrate-canon-refs`), `pipeline/src/index.ts`
- Data: `content/story-bible/{characters,places,eras,things,proposals}.json`

- [ ] **Step 1: 스키마**

```ts
// schema.ts
// 설정집의 절 인용. "책 장:절" 또는 "책 장:절-절" (예: "genesis 1:26", "genesis 2:7-8")
export const CitationSchema = z.string().refine((value) => parseRef(value)?.book != null, '절 인용은 "책 장:절" 모양이어야 합니다')
// 모델 출력처럼 한 장 안의 인용(책 없음). 합칠 때 책을 붙인다.
export const ChapterCitationSchema = z.string().regex(/^\d{1,3}:\d{1,3}(-\d{1,3})?$/)
```

- [ ] **Step 2: 검증**

`validateCanon(canon, verseCounts: ReadonlyMap<BookId, readonly number[]>)`로 바꾼다. 인용마다 `parseRef`로 읽고, 책이 없거나 본문이 없는 책이거나 절 범위를 벗어나면 문제로 적는다. 시대 범위는 `compareRefs`로 앞뒤를 본다. `GENESIS_VERSE_COUNTS`를 지운다(`index.ts`에서도). 시험의 절 수는 `new Map([['genesis', [31, 25, 24, 26, 32, 22, 24, 22, 29, 32]]])`로 넘긴다.

`canon/files.ts`의 `readCanon`은 `readVerseCounts()`를 읽어 넘긴다(옵션 `sourceDir`).

- [ ] **Step 3: 합치기**

`mergeCanon(existing, output, now, { book, verseCounts })`: 모델 출력의 인용(`firstAppearance`, `sources`, `attire[].from`, `range.from/to`)에 `qualifyRef(text, book)`로 책을 붙인 뒤 지금처럼 검증하고 합친다(`qualifyRef`가 null이면 그 인용은 검증에서 걸린다). `earlierCitation(a, b)`는 둘을 `parseRef`로 읽어 하나라도 null이면 기존 값 `a`를 지키고, 둘 다 읽히면 `compareRefs`로 앞선 것을 고른다. 이때 둘 다 책이 붙어 있어야 한다(`compareRefs`는 책이 섞이면 fallback 없이 오류를 낸다). `runCanon`은 `readVerseCounts()`를 넘긴다.

- [ ] **Step 4: 프롬프트**

`buildCanonPrompt(book, chapter, canon)`: 기존 항목을 보여 줄 때 같은 책 참조는 `localRef`로 책을 떼고, 다른 책 참조는 `formatRef(ref, 'name')`(창세기 2:7)로 보인다. "창세기 1~10장 안의 절만 쓴다"는 "이 장(책 이름 N장) 안의 절만 장:절로 쓴다"로 바꾼다.

- [ ] **Step 5: 이전 명령과 시험**

```ts
// canon/migrateRefs.ts
// 책 없는 설정집 인용("2:7")에 책을 붙인다. 이미 책이 있는 인용은 그대로 둔다. 바뀐 인용 수를 돌려준다.
export function migrateCanonRefs(canon: Canon, proposals: Proposal[], book: BookId): { canon: Canon; proposals: Proposal[]; changed: number }
```

시험: `firstAppearance: '2:7'`, `sources: ['2:7-8', 'genesis 3:1']`, `attire: [{ from: '3:21' }]`, 시대 `range: { from: '1:1', to: '5:32' }`, 제안 `sources: ['4:1']`가 모두 `genesis …`가 되고 `changed`가 바뀐 수인지, 두 번 돌려도 그대로(`changed` 0)인지 본다.

CLI `migrate-canon-refs --book genesis`는 파일을 읽어(검증 없이 원시 JSON으로) 고친 뒤 `writeCanonKind`, `writeProposals`로 쓰고 바뀐 수를 찍는다. `--dry-run`이면 쓰지 않는다.

- [ ] **Step 6: 이전을 돌리고 확인**

```bash
npm run pipeline -- migrate-canon-refs --book genesis --dry-run
npm run pipeline -- migrate-canon-refs --book genesis
npm test -w pipeline
```

Expected: 인용 수가 찍히고, 두 번째 실행 뒤 `content/story-bible/*.json`의 인용이 모두 `genesis …`이다. 시험 통과.

- [ ] **Step 7: 커밋(코드와 자료를 나눈다)**

```bash
git add pipeline
git commit -m "feat(pipeline): 설정집 절 인용에 책을 붙이고 책별 절 수로 검증한다"
git add content/story-bible
git commit -m "data(canon): 설정집 절 인용에 genesis를 붙임(migrate-canon-refs)"
```

---

### Task 6: 프롬프트의 책 이름과 책별 원어

**Files:**
- Modify: `pipeline/src/scenario/prompt.ts`, `pipeline/src/review/prompt.ts`, `pipeline/src/quiz/prompt.ts`, `pipeline/src/original/glossPrompt.ts`, `pipeline/src/original/runGloss.ts`, `pipeline/src/original/runOriginal.ts`, 관련 시험

- [ ] **Step 1: 프롬프트**

프롬프트 함수가 책 이름을 받는다. 시스템 글의 "창세기 한 장"은 "성경 한 장", 사용자 글의 머리는 `${getBook(book).name} ${chapter}장`이다.
- `buildScenarioPrompt(book, chapter, canon, style, examples)`, `buildRevisePrompt(book, …)`, `verseLines`는 그대로
- `buildReviewTextPrompt(book, chapter, canon, style, scene)`
- `buildQuizPrompt(book, chapter, scenes)`, `buildQuizReviewPrompt(book, chapter, questions)`
- `glossPrompt.ts`: "창세기 1~10장의 쓰임에서"는 "이 앱에 있는 장의 쓰임에서". `runGloss`는 Task 3의 `EXAMPLE_BOOK`(창세기 고정)을 지우고, `original/` 안의 모든 책 원어 파일에서 예문을 모은다. 예문 머리는 `${책 이름} ${장}:${절}`이다.
- `runScenario`의 예시 장면: 그 책에 쓴 장면이 아직 없으면(새 책의 첫 장) 다듬어 둔 창세기 2장 장면을 예시로 쓴다. 그 책에 장면이 있으면 지금처럼 그 책의 장면을 쓴다.

시험: 프롬프트 시험의 기대 글에서 "창세기"가 책 이름으로 들어가는지(창세기로 부르면 지금과 같은 글), 다른 책(`exodus`)이면 "출애굽기 3장"이 들어가는지 본다.

- [ ] **Step 2: 책별 원어**

`OSHB_BASE`와 `oshbUrl`은 Task 3에서 이미 만들었다. 이 작업 전에는 본문이 있는 책이 둘 이상일 때 `original`을 돌리지 않는다(사전을 마지막 책으로만 다시 쓴다).

```ts
// runOriginal.ts
export const OSHB_BASE = 'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc'
export function oshbUrl(book: BookId): string {
  return `${OSHB_BASE}/${getBook(book).osis}.xml`
}
```

`runOriginal(book, options, log)`:
1. 신약 책이면 `신약 원어 자료는 아직 정하지 않았어요(${책 이름})`로 멈춘다.
2. 그 책의 OSHB를 받아 `original/<book>.json`에 쓴다(지금처럼 본문과 절 수를 맞춰 본다).
3. 사전은 `original/` 안의 모든 책 파일에서 번호마다 나온 횟수를 다시 세고, 그 번호들로 스트롱 사전 항목을 만든다. 이미 있는 한국어 뜻은 지킨다.

시험(`pipeline/test/original.test.ts`에 더한다): 가짜 `fetchText`로 창세기·출애굽기 원어 파일을 차례로 만들면, 사전 항목의 `count`가 두 책을 합친 횟수이고 창세기만 돌린 뒤의 한국어 뜻이 남는지 본다. 신약 책은 오류인지 본다.

- [ ] **Step 3: 확인과 커밋**

Run: `npm test -w pipeline && npm run typecheck -w pipeline`

```bash
git add pipeline
git commit -m "feat(pipeline): 프롬프트에 책 이름을 쓰고 원어를 책마다 만든다(사전은 모든 책에서 센다)"
```

---

### Task 7: 책마다 묶음

**Files:**
- Modify: `pipeline/src/build/{buildBundle,writeBundle,sources}.ts`, `pipeline/src/schema.ts`(`BundleSchema.bookId`), `pipeline/test/buildBundle.test.ts`, `pipeline/test/sources.test.ts`, `docs/content-bundle.md`

- [ ] **Step 0: 고치기 전 묶음을 다시 남긴다**

Task 3의 사본은 지웠으므로, 이 작업을 시작하기 전 상태로 `npm run pipeline -- build`를 돌려 `genesis.json`을 시스템 임시 폴더(`genesis.before.json`)에 다시 남긴다(Task 3 Step 0과 같은 명령).

- [ ] **Step 1: 시험을 쓴다**

`buildBundle.test.ts`에 더한다:

```ts
it('책 id를 넣고, 그 책에서 처음 나오는 설정집 항목만 책 없는 참조로 넣는다', () => {
  // 설정집 고정값에 인물 둘: 아담(firstAppearance 'genesis 2:7', sources ['genesis 2:7', 'exodus 1:1'])
  // 모세(firstAppearance 'exodus 2:10')
  const bundle = buildBundle('genesis', source, sceneFiles, canonWithMoses, audio, catalog)
  expect(bundle.bookId).toBe('genesis')
  expect(bundle.characters.map((item) => item.id)).toEqual(['adam'])
  expect(bundle.characters[0]!.firstAppearance).toBe('2:7')
  expect(bundle.characters[0]!.sources).toEqual(['2:7'])
})

it('장면 파일이 없는 장의 대체 장면 id와 제목에 책을 쓴다', () => {
  const bundle = buildBundle('genesis', sourceWithChapter6, [], canon, audio, catalog)
  const fallback = bundle.chapters.find((chapter) => chapter.chapter === 6)!.scenes[0]!
  expect(fallback.id).toBe('genesis-06-00')
  expect(fallback.title).toBe('창세기 6장')
})
```

`sources.test.ts`: `buildSources('exodus', style)`의 개역한글판 출처 주소가 `https://ko.wikisource.org/wiki/개역한글판/출애굽기`이고 설명이 "개역한글판/출애굽기"인지 본다.

- [ ] **Step 2: 구현**

- `buildBundle(book, source, sceneFiles, canon, audio, catalog, extras)`: 책을 인자로 받는다(Task 3까지는 `source.book`으로 찾았다). `bookId: book`을 넣고, `fallbackScene`은 `fallbackSceneIdOf(book, chapter)`와 `${getBook(book).name} ${chapter}장`. 설정집 항목은 `parseRef(firstAppearance)?.book === book`인 것만(시대는 `range.from`, 물건은 첫 `sources`) 넣고, 넣는 항목의 인용은 `localRef(text, book)`로 바꾸며 `null`(다른 책)은 뺀다.
- `writeBundles(books)`(Task 3에서 만든 것): 책마다 `buildBundle(book, …)`의 결과를 `<book>.json`으로 쓴다.
- `buildSources(book, style)`: 개역한글판 출처를 책 이름으로 만든다.
- `docs/content-bundle.md`: 맨 위 키 표에 `bookId`(책 id, `reader-core`의 `books.ts`)를 더한다.

- [ ] **Step 3: 창세기 묶음이 `bookId` 말고는 그대로인지 본다**

```bash
npm run pipeline -- build
node -e "const fs=require('fs'),os=require('os'),path=require('path');const a=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'genesis.before.json'),'utf8'));const b=JSON.parse(fs.readFileSync('app/public/content/genesis.json','utf8'));delete b.bookId;console.log(JSON.stringify(a)===JSON.stringify(b)?'same':'DIFFERENT')"
```

Expected: `same` (사본은 Task 3 Step 0에서 남긴 것). 확인한 뒤 사본을 지운다.

- [ ] **Step 4: 확인과 커밋**

Run: `npm test -w pipeline && npm run typecheck -w pipeline && npm test -w app`

```bash
git add pipeline docs/content-bundle.md
git commit -m "feat(pipeline): 책마다 묶음(bookId, 그 책의 설정집, 책 없는 참조)"
```

---

### Task 8: 관리 도구의 책

**Files:** `admin/server/**`, `admin/src/**`, `admin/test/**`

**계약(하위 에이전트에게 그대로 준다):**
- `admin/package.json`의 `dependencies`에 `"reader-core": "*"`를 더한다(책 목록과 참조 함수).
- `GET /api/books` → 본문 파일이 있는 책 `[{ id, name, chapters, sourceChapters }]`(성경 순서). `sourceChapters`는 본문에 있는 장 수.
- 책을 가리는 API는 `/api/books/:book/…`로 옮긴다. 알 수 없는 책은 404.
  - `/api/status` → `/api/books/:book/status`(지금 응답과 같은 모양, 그 책의 장만)
  - `/api/scenes/:chapter…` → `/api/books/:book/scenes/:chapter…`
  - `/api/quiz`, `/api/quiz/:chapter`, `/api/quiz/:chapter/:id` → `/api/books/:book/quiz…`
  - 설정집, 원어 뜻(사전), 그림, 작업, 실행 기록, 저장소 API는 그대로다(책을 가리지 않는다).
- 작업 옵션에 `book`. `original`은 `book`이 없으면 모든 책, `build`는 언제나 모든 책(`book`을 받지 않는다), 나머지 단계는 `book`이 필요하다(없으면 400). `source` 작업은 `chapters`(예: `1-10`, `parseChapterRange`로 읽는다. 없으면 책 전체)를 받는다. 작업 폼에 책 고르기를 둔다. 실행 중 작업이 같은 책·같은 파일을 쓰면 저장을 막는 지금 규칙(409)은 책까지 보고 판단한다.
- `admin/server/book.ts`(`ADMIN_BOOK`, Task 3의 임시 상수)를 지우고, `admin/server/status.ts`에 남은 음성 파일 이름 규칙(`genesis-NN-VVV.mp3` 정규식)은 `reader-core`의 `verseAudioName`·`parseChapterStem`으로 바꾼다.
- 화면: 머리(내비)에 책 고르기를 두고 고른 책을 `localStorage`에 기억한다. 책을 가리는 화면의 주소는 `#/<book>/dashboard`, `#/<book>/scenes/4`, `#/<book>/quiz/4`이고, 옛 주소(`#/scenes/4`, `#/quiz/4`, `#/`)는 고른 책(없으면 첫 책) 주소로 넘긴다.
- 설정집 화면의 인용은 `formatRef(parseRef(text), 'name')`으로 보인다(창세기 2:7). 고칠 때 넣는 인용은 `genesis 2:7`이나 책 없는 `2:7`(고르고 있는 책을 붙인다)을 받는다.
- 시험: 지금 시험을 새 주소로 옮기고, 알 수 없는 책 404, `GET /api/books`, `book` 없는 단계 작업 400을 더한다.

- [ ] **Step 1:** 하위 에이전트가 위 계약대로 고친다(`admin/`만).
- [ ] **Step 2:** `npm test -w admin && npm run typecheck -w admin && npm run lint -w admin` 통과, 관리 도구를 띄워 대시보드·장면·퀴즈·작업 폼이 창세기로 그대로 동작하는지 본다.
- [ ] **Step 3: 커밋**

```bash
git add admin
git commit -m "feat(admin): 책 고르기와 책을 가리는 API(/api/books/:book/…)"
```

---

### Task 9: 서버의 질문하기

**Files:** `server/src/ask/{answer,passages}.ts`, `server/src/config.ts`, `server/src/index.ts`, `server/src/app.ts`, `server/test/ask.test.ts`

- [ ] **Step 1:** `config.ts`의 `bundleFile`을 `bundleDir`(`BUNDLE_DIR`, 기본 `app/public/content`)로 바꾼다. 서버는 그 폴더의 `<책 id>.json`(`isBookId`인 이름만)을 모두 읽는다.
- [ ] **Step 2:** `passages.ts`의 자체 `chapterOf`(`/^(\d+):/`)를 지우고 `reader-core`의 `parseRef`로 읽는다(`server/package.json`에 `"reader-core": "*"`). `AskBundle`에 `bookId`. 대목 id는 `v:<book>:4:15`, `s:<장면 id>`, `c:character:<id>`. 이름표는 지금처럼 `본문 4:15`이되, 묶음이 둘 이상이면 `본문 창세기 4:15`. `Citation`에 `book`을 더한다.
- [ ] **Step 3:** 요청에 `book`(선택). `chapter` 가중은 `book`과 `chapter`가 둘 다 맞는 대목에만 준다. `book`이 없고 묶음이 하나면 그 책으로 본다.
- [ ] **Step 4:** 시스템 글의 "독자가 창세기에 대해 물으면"은 "독자가 성경에 대해 물으면"으로, 사용자 글의 읽는 곳은 `${책 이름} ${장}장`.
- [ ] **Step 5:** 시험: 지금 시험이 그대로 통과하고, 묶음 둘(창세기·출애굽기 고정값)에서 `book`이 출애굽기인 질문의 장 가중이 출애굽기 대목에만 가는지 본다.

Run: `npm test -w server && npm run typecheck -w server`

```bash
git add server
git commit -m "feat(server): 질문하기가 모든 책 묶음을 읽고 책을 가린다"
```

---

### Task 10: 앱의 책 id

**Files:** `mobile/src/content/bundle.ts`

- [ ] **Step 1:** `export const bookId = 'genesis'`를 지운다. `bookId`를 import하던 화면은 모두 묶음을 받는 컴포넌트 안이므로(묶음이 없으면 오류 화면이라 닿지 않는다) `bundle.bookId`로 바꾼다. 형 검사가 고칠 곳을 모두 알려 준다.

Run: `npm run typecheck -w mobile`

```bash
git add mobile
git commit -m "refactor(mobile): 기록 키의 책 id를 묶음에서 읽는다"
```

---

### Task 11: 문서와 전체 확인

- [ ] **Step 1:** `README.md`의 명령 표: `source --book genesis --chapters 1-10`, `canon --book genesis --chapter 1`처럼 모든 장 단계에 `--book`, `original`·`build`는 "`--book`이 없으면 본문이 있는 모든 책", `migrate-canon-refs`를 더한다.
- [ ] **Step 2:** 설계 문서 3절 표 아래에 1단계 진행을 적는다(완료일, 만들면서 바꾼 것).
- [ ] **Step 3:** 전체 확인

```bash
npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run typecheck -w pipeline && npm run build -w app
```

Expected: 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add README.md docs
git commit -m "docs: 여러 책과 장 공개 1단계(여러 책 기반) 완료"
```
