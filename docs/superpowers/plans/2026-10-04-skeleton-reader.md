# 뼈대: 본문 데이터와 읽기 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 창세기 1~10장 본문을 읽기 화면(위 그림 칸, 아래 본문, 지도, `?` 시트)에서 읽을 수 있게 하고, `source`·`build` 명령을 동작시킨다.

**Architecture:** npm 워크스페이스 두 개(`pipeline`, `app`)와 데이터 폴더 `content/`로 나눈다. `pipeline`의 `source`가 위키문헌에서 개역한글 본문을 받아 `content/source/genesis.json`에 저장하고, `build`가 본문·장면·장소를 합쳐 `app/public/content/genesis.json` 묶음을 만든다. `app`은 이 묶음만 읽는다.

**Tech Stack:** Node 22, TypeScript 6, tsx, zod 4, vitest 5, React 19, Vite 8, oxlint

---

## 이 계획의 범위

설계 문서(`docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md`) 10절의 1단계 "뼈대"만 다룬다. LLM과 이미지 API는 부르지 않는다.

다음은 두 번째 계획에서 다룬다: `scenario`, 설정집의 `style.json`·`characters.json`, `review-text`, `review-facts`, `refs`, `images`, `review-image`, `review-report.md`, `--force`, `--dry-run`, `.env`.

화면을 확인할 수 있도록 1~2장의 장면 파일은 손으로 쓴 샘플을 넣는다. 검수 상태는 `draft`이고, 두 번째 계획에서 파이프라인이 만든 것으로 바뀐다.

모든 명령은 리포 루트에서 Git Bash로 실행한다.

## 파일 구조

```
package.json                       워크스페이스 루트, 공통 명령
.gitignore
.gitattributes
README.md
content/
  source/genesis.json              `source`가 만든 본문 (커밋한다)
  story-bible/places.json          장소와 지도 좌표
  scenes/genesis-01.json           1장 장면 (샘플)
  scenes/genesis-02.json           2장 장면 (샘플)
  images/.gitkeep
pipeline/
  package.json
  tsconfig.json
  src/schema.ts                    콘텐츠 파일과 묶음의 형식
  src/paths.ts                     파일 위치
  src/source/parseWikisource.ts    위키문헌 글 → 장·절, 절 수 검증
  src/source/fetchSource.ts        본문 내려받아 저장
  src/scenes/coverage.ts           장면의 절 범위 검증
  src/build/buildBundle.ts         본문 + 장면 + 장소 → 묶음 (계산만)
  src/build/writeBundle.ts         파일 읽고 쓰기
  src/cli.ts                       명령 분기
  test/schema.test.ts
  test/parseWikisource.test.ts
  test/coverage.test.ts
  test/buildBundle.test.ts
app/
  index.html
  src/main.tsx
  src/App.tsx                      묶음 불러오기, 로딩·오류 화면
  src/index.css
  src/content/types.ts             묶음 형식 (앱 쪽)
  src/content/loadBundle.ts
  src/reader/activeScene.ts        스크롤 위치 → 현재 장면
  src/reader/activeScene.test.ts
  src/reader/route.ts              지나온 장소 경로
  src/reader/route.test.ts
  src/reader/position.ts           읽던 위치 저장
  src/components/Icon.tsx
  src/components/ScenePane.tsx     위 절반: 그림, 버튼, 제목
  src/components/VersePane.tsx     아래 절반: 장 선택, 본문
  src/components/MapScreen.tsx
  src/components/BackgroundSheet.tsx
  src/components/ReaderScreen.tsx  위 조각들을 묶는 화면
```

---

### Task 1: 리포 뼈대와 pipeline 패키지

**Files:**
- Create: `package.json`, `.gitignore`, `.gitattributes`, `README.md`
- Create: `pipeline/package.json`, `pipeline/tsconfig.json`

- [ ] **Step 1: 루트 `package.json`을 만든다**

```json
{
  "name": "chansu-bible",
  "private": true,
  "type": "module",
  "workspaces": ["pipeline"],
  "scripts": {
    "pipeline": "npm run cli -w pipeline --",
    "test": "npm test -w pipeline"
  }
}
```

- [ ] **Step 2: `.gitignore`와 `.gitattributes`를 만든다**

`.gitignore`:

```
node_modules/
dist/
*.local
.env
.claude/
app/public/content/
```

`.gitattributes`:

```
* text=auto eol=lf
```

- [ ] **Step 3: `pipeline/package.json`을 만든다**

```json
{
  "name": "pipeline",
  "private": true,
  "type": "module",
  "scripts": {
    "cli": "tsx src/cli.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: `pipeline/tsconfig.json`을 만든다**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: 의존성을 설치한다**

Run:

```bash
npm install -w pipeline zod
npm install -w pipeline -D tsx typescript@~6.0.2 vitest @types/node
```

Expected: 오류 없이 끝나고 루트에 `package-lock.json`과 `node_modules/`가 생긴다.

- [ ] **Step 6: 설치를 확인한다**

Run: `npm ls -w pipeline --depth=0`
Expected: `zod`, `tsx`, `typescript`, `vitest`, `@types/node`가 목록에 보인다.

- [ ] **Step 7: `README.md`를 만든다**

````markdown
# chansu-bible

장면으로 읽는 성경 목업입니다. 화면 위 절반에 장면 그림, 아래 절반에 성경 본문(개역한글)이 있고, 본문을 내려 읽으면 그림이 장면에 맞춰 바뀝니다.

설계 문서: [docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md](docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md)

## 구조

| 폴더 | 내용 |
|---|---|
| `app/` | 읽기 화면 (React + Vite + TypeScript) |
| `pipeline/` | 콘텐츠 생성 스크립트 (Node + TypeScript) |
| `content/` | 본문, 설정집, 장면, 그림 |

## 실행

```bash
npm install
npm run dev
```

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 묶음을 만들고 읽기 화면을 띄운다 |
| `npm test` | 전체 테스트 |
| `npm run pipeline -- source` | 개역한글 창세기 1~10장을 받아 `content/source/genesis.json`에 저장한다 |
| `npm run pipeline -- build` | 본문·장면·장소를 합쳐 `app/public/content/`에 묶음을 만든다 |
````

- [ ] **Step 8: 커밋한다**

```bash
git add package.json package-lock.json .gitignore .gitattributes README.md pipeline/package.json pipeline/tsconfig.json
git commit -m "chore: 리포 뼈대와 pipeline 패키지 추가"
```

---

### Task 2: 콘텐츠 스키마와 경로

**Files:**
- Create: `pipeline/src/schema.ts`, `pipeline/src/paths.ts`
- Test: `pipeline/test/schema.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`pipeline/test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SceneFileSchema } from '../src/schema.ts'

const scene = {
  id: 'genesis-01-01',
  chapter: 1,
  verseStart: 1,
  verseEnd: 2,
  title: '태초에',
  commentary: '성경의 첫 문장이에요.',
  background: { what: '무슨 일', who: '누가', where: '어디서', terms: [] },
  history: [],
  visual: { description: '어두운 물', characters: [] },
  placeId: null,
  image: null,
  review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
}

describe('SceneFileSchema', () => {
  it('올바른 장면 파일을 받아들인다', () => {
    const file = SceneFileSchema.parse({ chapter: 1, scenes: [scene] })
    expect(file.scenes[0].id).toBe('genesis-01-01')
  })

  it('알 수 없는 검수 상태를 거부한다', () => {
    const bad = { ...scene, review: { ...scene.review, status: 'done' } }
    expect(() => SceneFileSchema.parse({ chapter: 1, scenes: [bad] })).toThrow()
  })

  it('역사 배경의 확실성 표시가 정해진 값이 아니면 거부한다', () => {
    const bad = { ...scene, history: [{ text: '내용', basis: '근거', certainty: '아마도', sources: [] }] }
    expect(() => SceneFileSchema.parse({ chapter: 1, scenes: [bad] })).toThrow()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w pipeline -- test/schema.test.ts`
Expected: FAIL. `../src/schema.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `pipeline/src/schema.ts`를 쓴다**

```ts
import { z } from 'zod'

// 본문
export const VerseSchema = z.object({
  verse: z.number().int().positive(),
  text: z.string().min(1),
})

export const SourceChapterSchema = z.object({
  chapter: z.number().int().positive(),
  verses: z.array(VerseSchema).min(1),
})

export const SourceSchema = z.object({
  book: z.string(),
  translation: z.string(),
  chapters: z.array(SourceChapterSchema),
})

// 설정집
export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  estimated: z.boolean(),
  x: z.number().min(0).max(1).nullable(),
  y: z.number().min(0).max(1).nullable(),
})

// 장면
export const TermSchema = z.object({ word: z.string(), meaning: z.string() })

export const BackgroundSchema = z.object({
  what: z.string(),
  who: z.string(),
  where: z.string(),
  terms: z.array(TermSchema),
})

export const HistoryNoteSchema = z.object({
  text: z.string(),
  basis: z.string(),
  certainty: z.enum(['확실', '추정', '견해 갈림']),
  sources: z.array(z.string()),
})

export const ReviewStatusSchema = z.enum(['draft', 'reviewed', 'flagged', 'approved'])

export const VerdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  issues: z.array(z.string()),
})

export const SceneSchema = z.object({
  id: z.string(),
  chapter: z.number().int().positive(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  title: z.string(),
  commentary: z.string(),
  background: BackgroundSchema,
  history: z.array(HistoryNoteSchema),
  visual: z.object({ description: z.string(), characters: z.array(z.string()) }),
  placeId: z.string().nullable(),
  image: z.string().nullable(),
  review: z.object({
    status: ReviewStatusSchema,
    text: VerdictSchema.nullable(),
    facts: VerdictSchema.nullable(),
    image: VerdictSchema.nullable(),
    attempts: z.number().int().min(0),
  }),
})

export const SceneFileSchema = z.object({
  chapter: z.number().int().positive(),
  scenes: z.array(SceneSchema),
})

// 앱용 묶음
export const BundleSceneSchema = z.object({
  id: z.string(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  title: z.string(),
  commentary: z.string().nullable(),
  background: BackgroundSchema.nullable(),
  history: z.array(HistoryNoteSchema),
  placeId: z.string().nullable(),
  image: z.string().nullable(),
  reviewStatus: z.enum(['none', 'draft', 'reviewed', 'flagged', 'approved']),
})

export const BundleSchema = z.object({
  book: z.string(),
  translation: z.string(),
  places: z.array(PlaceSchema),
  chapters: z.array(
    z.object({
      chapter: z.number().int().positive(),
      verses: z.array(VerseSchema).min(1),
      scenes: z.array(BundleSceneSchema).min(1),
    }),
  ),
})

export type Verse = z.infer<typeof VerseSchema>
export type SourceChapter = z.infer<typeof SourceChapterSchema>
export type Source = z.infer<typeof SourceSchema>
export type Place = z.infer<typeof PlaceSchema>
export type Scene = z.infer<typeof SceneSchema>
export type SceneFile = z.infer<typeof SceneFileSchema>
export type BundleScene = z.infer<typeof BundleSceneSchema>
export type Bundle = z.infer<typeof BundleSchema>
```

- [ ] **Step 4: `pipeline/src/paths.ts`를 쓴다**

```ts
import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const contentDir = path.join(repoRoot, 'content')
export const sourceFile = path.join(contentDir, 'source', 'genesis.json')
export const placesFile = path.join(contentDir, 'story-bible', 'places.json')
export const scenesDir = path.join(contentDir, 'scenes')
export const imagesDir = path.join(contentDir, 'images')
export const appContentDir = path.join(repoRoot, 'app', 'public', 'content')
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npm test -w pipeline -- test/schema.test.ts`
Expected: PASS, 테스트 3개.

- [ ] **Step 6: 타입 검사를 한다**

Run: `npm run typecheck -w pipeline`
Expected: 출력 없이 끝난다.

- [ ] **Step 7: 커밋한다**

```bash
git add pipeline/src/schema.ts pipeline/src/paths.ts pipeline/test/schema.test.ts
git commit -m "feat: 콘텐츠 파일과 묶음의 스키마 추가"
```

---

### Task 3: 본문 파서

위키문헌 `개역한글판/창세기`의 원문은 이런 형식이다.

```
== 1장 ==
{{절|1|1}} 태초에 하나님이 천지를 창조하시니라

{{절||2}} 땅이 혼돈하고 공허하며 …

== 2장 ==
{{절|2|}} 천지와 만물이 다 이루니라
```

2장부터는 첫 절이 `{{절|2|}}`처럼 절 번호가 비어 있다. 이때 절 번호는 1이다.

**Files:**
- Create: `pipeline/src/source/parseWikisource.ts`
- Test: `pipeline/test/parseWikisource.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`pipeline/test/parseWikisource.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findSourceProblems, parseWikisource } from '../src/source/parseWikisource.ts'

const wikitext = [
  '{{머리말',
  '|제목 = [[../]]',
  '}}',
  '',
  '== 1장 ==',
  '{{절|1|1}} 태초에 하나님이 천지를 창조하시니라',
  '',
  '{{절||2}} 땅이 혼돈하고 공허하며',
  '',
  '== 2장 ==',
  '{{절|2|}} 천지와 만물이 다 이루니라',
  '',
  '{{절||2}} 하나님의 지으시던 일이',
  '',
  '== 3장 ==',
  '{{절|3|}} 여호와 하나님의 지으신 들짐승 중에',
].join('\n')

describe('parseWikisource', () => {
  it('장과 절을 순서대로 읽는다', () => {
    const chapters = parseWikisource(wikitext, 1, 2)
    expect(chapters).toEqual([
      {
        chapter: 1,
        verses: [
          { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
          { verse: 2, text: '땅이 혼돈하고 공허하며' },
        ],
      },
      {
        chapter: 2,
        verses: [
          { verse: 1, text: '천지와 만물이 다 이루니라' },
          { verse: 2, text: '하나님의 지으시던 일이' },
        ],
      },
    ])
  })

  it('범위 밖의 장은 읽지 않는다', () => {
    const chapters = parseWikisource(wikitext, 2, 2)
    expect(chapters.map((c) => c.chapter)).toEqual([2])
  })
})

describe('findSourceProblems', () => {
  const chapters = parseWikisource(wikitext, 1, 2)

  it('절 수가 맞으면 문제가 없다', () => {
    expect(findSourceProblems(chapters, { 1: 2, 2: 2 })).toEqual([])
  })

  it('절 수가 다르면 알려준다', () => {
    expect(findSourceProblems(chapters, { 1: 3, 2: 2 })).toEqual(['1장은 3절이어야 하는데 2절입니다'])
  })

  it('장이 없으면 알려준다', () => {
    expect(findSourceProblems(chapters, { 1: 2, 2: 2, 3: 1 })).toEqual(['3장이 없습니다'])
  })

  it('절 번호가 순서대로가 아니면 알려준다', () => {
    const broken = [{ chapter: 1, verses: [{ verse: 1, text: '가' }, { verse: 3, text: '나' }] }]
    expect(findSourceProblems(broken, { 1: 2 })).toEqual(['1장 2번째 절의 번호가 3입니다'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w pipeline -- test/parseWikisource.test.ts`
Expected: FAIL. `../src/source/parseWikisource.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `pipeline/src/source/parseWikisource.ts`를 쓴다**

```ts
import type { SourceChapter } from '../schema.ts'

const chapterHeading = /^==\s*(\d+)장\s*==$/
const verseLine = /^\{\{절\|(\d*)\|(\d*)\}\}\s*(.+)$/

export const expectedVerseCounts: Record<number, number> = {
  1: 31,
  2: 25,
  3: 24,
  4: 26,
  5: 32,
  6: 22,
  7: 24,
  8: 22,
  9: 29,
  10: 32,
}

export function parseWikisource(wikitext: string, chapterFrom: number, chapterTo: number): SourceChapter[] {
  const chapters: SourceChapter[] = []
  let current: SourceChapter | null = null

  for (const rawLine of wikitext.split(/\r?\n/)) {
    const line = rawLine.trim()
    const heading = line.match(chapterHeading)
    if (heading) {
      const chapter = Number(heading[1])
      current = chapter >= chapterFrom && chapter <= chapterTo ? { chapter, verses: [] } : null
      if (current) chapters.push(current)
      continue
    }
    if (!current) continue
    const verse = line.match(verseLine)
    if (!verse) continue
    // 2장부터는 첫 절의 번호가 비어 있다: {{절|2|}}
    current.verses.push({ verse: verse[2] ? Number(verse[2]) : 1, text: verse[3].trim() })
  }

  return chapters
}

export function findSourceProblems(chapters: SourceChapter[], expected: Record<number, number>): string[] {
  const problems: string[] = []

  for (const [key, count] of Object.entries(expected)) {
    const chapter = Number(key)
    const found = chapters.find((c) => c.chapter === chapter)
    if (!found) {
      problems.push(`${chapter}장이 없습니다`)
      continue
    }
    if (found.verses.length !== count) {
      problems.push(`${chapter}장은 ${count}절이어야 하는데 ${found.verses.length}절입니다`)
    }
    found.verses.forEach((verse, index) => {
      if (verse.verse !== index + 1) {
        problems.push(`${chapter}장 ${index + 1}번째 절의 번호가 ${verse.verse}입니다`)
      }
    })
  }

  return problems
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -w pipeline -- test/parseWikisource.test.ts`
Expected: PASS, 테스트 6개.

- [ ] **Step 5: 커밋한다**

```bash
git add pipeline/src/source/parseWikisource.ts pipeline/test/parseWikisource.test.ts
git commit -m "feat: 위키문헌 본문 파서와 절 수 검증 추가"
```

---

### Task 4: `source` 명령

네트워크를 쓰는 부분이라 단위 테스트 대신 실제로 실행해서 확인한다.

**Files:**
- Create: `pipeline/src/source/fetchSource.ts`, `pipeline/src/cli.ts`
- Create (명령 실행 결과): `content/source/genesis.json`

- [ ] **Step 1: `pipeline/src/source/fetchSource.ts`를 쓴다**

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sourceFile } from '../paths.ts'
import { SourceSchema, type Source } from '../schema.ts'
import { expectedVerseCounts, findSourceProblems, parseWikisource } from './parseWikisource.ts'

const pageTitle = '개역한글판/창세기'
const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`

export async function fetchSource(): Promise<Source> {
  const response = await fetch(url, { headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' } })
  if (!response.ok) throw new Error(`본문을 가져오지 못했습니다 (HTTP ${response.status})`)

  const chapters = parseWikisource(await response.text(), 1, 10)
  const problems = findSourceProblems(chapters, expectedVerseCounts)
  if (problems.length > 0) throw new Error(`본문 검증에 실패했습니다:\n${problems.join('\n')}`)

  const source = SourceSchema.parse({ book: '창세기', translation: '개역한글', chapters })
  await mkdir(path.dirname(sourceFile), { recursive: true })
  await writeFile(sourceFile, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  return source
}
```

- [ ] **Step 2: `pipeline/src/cli.ts`를 쓴다**

```ts
import { fetchSource } from './source/fetchSource.ts'

const commands: Record<string, () => Promise<void>> = {
  async source() {
    const source = await fetchSource()
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
  },
}

const command = commands[process.argv[2] ?? '']
if (!command) {
  console.error(`사용법: npm run pipeline -- <${Object.keys(commands).join(' | ')}>`)
  process.exit(1)
}

try {
  await command()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
```

- [ ] **Step 3: 명령을 실행한다**

Run: `npm run pipeline -- source`
Expected: `본문 저장 완료: 10장 267절`

- [ ] **Step 4: 저장된 본문을 확인한다**

Run: `node -e "const s=JSON.parse(require('fs').readFileSync('content/source/genesis.json','utf8'));console.log(s.chapters[0].verses[0].text);console.log(s.chapters[9].verses[31].text)"`
Expected: 첫 줄은 `태초에 하나님이 천지를 창조하시니라`. 둘째 줄은 `이들은 노아 자손의 족속들이요`로 시작하는 10장 32절이다.

- [ ] **Step 5: 없는 명령의 안내를 확인한다**

Run: `npm run pipeline -- nothing`
Expected: `사용법: npm run pipeline -- <source>`가 출력되고 종료 코드가 1이다.

- [ ] **Step 6: 타입 검사를 한다**

Run: `npm run typecheck -w pipeline`
Expected: 출력 없이 끝난다.

- [ ] **Step 7: 커밋한다**

```bash
git add pipeline/src/source/fetchSource.ts pipeline/src/cli.ts content/source/genesis.json
git commit -m "feat: 개역한글 창세기 1~10장 본문을 받는 source 명령 추가"
```

---

### Task 5: 절 범위 검증

한 장의 장면들은 1절부터 마지막 절까지를 순서대로, 빠짐없이, 겹치지 않게 덮어야 한다.

**Files:**
- Create: `pipeline/src/scenes/coverage.ts`
- Test: `pipeline/test/coverage.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`pipeline/test/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findCoverageProblems } from '../src/scenes/coverage.ts'

describe('findCoverageProblems', () => {
  it('모든 절을 순서대로 덮으면 문제가 없다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 2 },
      { id: 'b', verseStart: 3, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual([])
  })

  it('절이 빠지면 알려준다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 2 },
      { id: 'b', verseStart: 4, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual(['b: 3절에서 시작해야 하는데 4절에서 시작합니다'])
  })

  it('절이 겹치면 알려준다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 3 },
      { id: 'b', verseStart: 3, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual(['b: 4절에서 시작해야 하는데 3절에서 시작합니다'])
  })

  it('마지막 절까지 덮지 않으면 알려준다', () => {
    const scenes = [{ id: 'a', verseStart: 1, verseEnd: 4 }]
    expect(findCoverageProblems(scenes, 5)).toEqual(['마지막 장면이 5절에서 끝나야 하는데 4절에서 끝납니다'])
  })

  it('끝 절이 시작 절보다 앞이면 알려준다', () => {
    const scenes = [{ id: 'a', verseStart: 3, verseEnd: 2 }]
    expect(findCoverageProblems(scenes, 2)).toEqual([
      'a: 끝 절(2)이 시작 절(3)보다 앞입니다',
      'a: 1절에서 시작해야 하는데 3절에서 시작합니다',
    ])
  })

  it('장면이 없으면 알려준다', () => {
    expect(findCoverageProblems([], 5)).toEqual(['장면이 하나도 없습니다'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w pipeline -- test/coverage.test.ts`
Expected: FAIL. `../src/scenes/coverage.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `pipeline/src/scenes/coverage.ts`를 쓴다**

```ts
export type VerseRange = { id: string; verseStart: number; verseEnd: number }

export function findCoverageProblems(scenes: VerseRange[], verseCount: number): string[] {
  if (scenes.length === 0) return ['장면이 하나도 없습니다']

  const problems: string[] = []
  let expectedStart = 1

  for (const scene of scenes) {
    if (scene.verseEnd < scene.verseStart) {
      problems.push(`${scene.id}: 끝 절(${scene.verseEnd})이 시작 절(${scene.verseStart})보다 앞입니다`)
    }
    if (scene.verseStart !== expectedStart) {
      problems.push(`${scene.id}: ${expectedStart}절에서 시작해야 하는데 ${scene.verseStart}절에서 시작합니다`)
    }
    expectedStart = scene.verseEnd + 1
  }

  if (expectedStart !== verseCount + 1) {
    problems.push(`마지막 장면이 ${verseCount}절에서 끝나야 하는데 ${expectedStart - 1}절에서 끝납니다`)
  }

  return problems
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -w pipeline -- test/coverage.test.ts`
Expected: PASS, 테스트 6개.

- [ ] **Step 5: 커밋한다**

```bash
git add pipeline/src/scenes/coverage.ts pipeline/test/coverage.test.ts
git commit -m "feat: 장면의 절 범위 검증 추가"
```

---

### Task 6: 묶음 만들기

본문, 장면 파일, 장소를 합쳐 앱이 읽을 묶음을 만든다. 장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나로 채워서, 앱이 모든 장을 같은 방식으로 다룰 수 있게 한다.

**Files:**
- Create: `pipeline/src/build/buildBundle.ts`
- Test: `pipeline/test/buildBundle.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`pipeline/test/buildBundle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/build/buildBundle.ts'
import type { Place, Scene, Source } from '../src/schema.ts'

const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    {
      chapter: 1,
      verses: [
        { verse: 1, text: '가' },
        { verse: 2, text: '나' },
        { verse: 3, text: '다' },
      ],
    },
    {
      chapter: 2,
      verses: [
        { verse: 1, text: '라' },
        { verse: 2, text: '마' },
      ],
    },
  ],
}

const places: Place[] = [{ id: 'eden', name: '에덴', description: '동산', estimated: true, x: 0.5, y: 0.5 }]

function scene(overrides: Partial<Scene>): Scene {
  return {
    id: 'genesis-01-01',
    chapter: 1,
    verseStart: 1,
    verseEnd: 3,
    title: '제목',
    commentary: '해설',
    background: { what: '무슨 일', who: '누가', where: '어디서', terms: [] },
    history: [],
    visual: { description: '그림', characters: [] },
    placeId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

describe('buildBundle', () => {
  it('본문은 원본 그대로 들어간다', () => {
    const bundle = buildBundle(source, [], places)
    expect(bundle.chapters[0].verses).toEqual(source.chapters[0].verses)
  })

  it('장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나를 만든다', () => {
    const bundle = buildBundle(source, [], places)
    expect(bundle.chapters[1].scenes).toEqual([
      {
        id: 'genesis-02-00',
        verseStart: 1,
        verseEnd: 2,
        title: '창세기 2장',
        commentary: null,
        background: null,
        history: [],
        placeId: null,
        image: null,
        reviewStatus: 'none',
      },
    ])
  })

  it('장면 파일이 있으면 장면을 옮기고 검수 상태와 그림 경로를 바꿔 넣는다', () => {
    const file = {
      chapter: 1,
      scenes: [
        scene({ verseEnd: 2, image: 'genesis-01-01.png', placeId: 'eden' }),
        scene({ id: 'genesis-01-02', verseStart: 3, verseEnd: 3 }),
      ],
    }
    const [first, second] = buildBundle(source, [file], places).chapters[0].scenes
    expect(first.image).toBe('content/images/genesis-01-01.png')
    expect(first.reviewStatus).toBe('draft')
    expect(first.placeId).toBe('eden')
    expect(first).not.toHaveProperty('visual')
    expect(second.image).toBeNull()
  })

  it('절 범위가 맞지 않으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2 })] }
    expect(() => buildBundle(source, [file], places)).toThrow('1장 장면의 절 범위가 맞지 않습니다')
  })

  it('없는 장소를 가리키면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ placeId: 'nowhere' })] }
    expect(() => buildBundle(source, [file], places)).toThrow('genesis-01-01: 장소 nowhere가 places.json에 없습니다')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w pipeline -- test/buildBundle.test.ts`
Expected: FAIL. `../src/build/buildBundle.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `pipeline/src/build/buildBundle.ts`를 쓴다**

```ts
import type { Bundle, BundleScene, Place, Scene, SceneFile, Source } from '../schema.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'

export function buildBundle(source: Source, sceneFiles: SceneFile[], places: Place[]): Bundle {
  const placeIds = new Set(places.map((place) => place.id))

  const chapters = source.chapters.map((sourceChapter) => {
    const { chapter, verses } = sourceChapter
    const sceneFile = sceneFiles.find((file) => file.chapter === chapter)
    if (!sceneFile) return { chapter, verses, scenes: [fallbackScene(chapter, verses.length)] }

    const problems = findCoverageProblems(sceneFile.scenes, verses.length)
    if (problems.length > 0) {
      throw new Error(`${chapter}장 장면의 절 범위가 맞지 않습니다:\n${problems.join('\n')}`)
    }
    for (const scene of sceneFile.scenes) {
      if (scene.placeId && !placeIds.has(scene.placeId)) {
        throw new Error(`${scene.id}: 장소 ${scene.placeId}가 places.json에 없습니다`)
      }
    }
    return { chapter, verses, scenes: sceneFile.scenes.map(toBundleScene) }
  })

  return { book: source.book, translation: source.translation, places, chapters }
}

function fallbackScene(chapter: number, verseCount: number): BundleScene {
  return {
    id: `genesis-${String(chapter).padStart(2, '0')}-00`,
    verseStart: 1,
    verseEnd: verseCount,
    title: `창세기 ${chapter}장`,
    commentary: null,
    background: null,
    history: [],
    placeId: null,
    image: null,
    reviewStatus: 'none',
  }
}

function toBundleScene(scene: Scene): BundleScene {
  return {
    id: scene.id,
    verseStart: scene.verseStart,
    verseEnd: scene.verseEnd,
    title: scene.title,
    commentary: scene.commentary,
    background: scene.background,
    history: scene.history,
    placeId: scene.placeId,
    image: scene.image ? `content/images/${scene.image}` : null,
    reviewStatus: scene.review.status,
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -w pipeline -- test/buildBundle.test.ts`
Expected: PASS, 테스트 5개.

- [ ] **Step 5: 커밋한다**

```bash
git add pipeline/src/build/buildBundle.ts pipeline/test/buildBundle.test.ts
git commit -m "feat: 본문과 장면을 앱용 묶음으로 합치는 buildBundle 추가"
```

---

### Task 7: 샘플 콘텐츠와 `build` 명령

**Files:**
- Create: `content/story-bible/places.json`, `content/scenes/genesis-01.json`, `content/scenes/genesis-02.json`, `content/images/.gitkeep`
- Create: `pipeline/src/build/writeBundle.ts`
- Modify: `pipeline/src/cli.ts`

- [ ] **Step 1: `content/story-bible/places.json`을 만든다**

좌표는 지도 그림의 왼쪽 위를 (0, 0), 오른쪽 아래를 (1, 1)로 본 값이다.

```json
[
  {
    "id": "eden",
    "name": "에덴",
    "description": "여호와 하나님이 동쪽에 만드신 동산이에요. 어디였는지는 알려지지 않았어요.",
    "estimated": true,
    "x": 0.77,
    "y": 0.73
  }
]
```

- [ ] **Step 2: `content/scenes/genesis-01.json`을 만든다**

```json
{
  "chapter": 1,
  "scenes": [
    {
      "id": "genesis-01-01",
      "chapter": 1,
      "verseStart": 1,
      "verseEnd": 2,
      "title": "태초에",
      "commentary": "성경의 첫 문장이에요. 땅은 아직 모양이 없고 비어 있었으며, 어둠이 깊음 위에 있었다고 해요.",
      "background": {
        "what": "하나님이 하늘과 땅을 창조하세요. 땅은 아직 비어 있고 어둠에 덮여 있어요.",
        "who": "하나님",
        "where": "아직 모양을 갖추기 전의 땅",
        "terms": [
          { "word": "태초", "meaning": "맨 처음, 모든 것이 시작된 때" },
          { "word": "혼돈하고 공허하며", "meaning": "모양이 잡히지 않고 비어 있다는 뜻" },
          { "word": "흑암", "meaning": "깊은 어둠" },
          { "word": "깊음", "meaning": "깊은 물" }
        ]
      },
      "history": [],
      "visual": { "description": "빛이 없는 어두운 물이 끝없이 펼쳐져 있고, 그 위로 바람결 같은 움직임이 지나간다. 사람이나 형상은 없다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-02",
      "chapter": 1,
      "verseStart": 3,
      "verseEnd": 5,
      "title": "빛이 있으라",
      "commentary": "첫째 날이에요. 하나님이 말씀하시자 빛이 있었고, 빛과 어둠이 낮과 밤으로 나뉘었어요.",
      "background": {
        "what": "하나님이 빛이 있으라 하시자 빛이 있었어요. 빛과 어둠을 나누시고 빛은 낮, 어둠은 밤이라고 부르세요.",
        "who": "하나님",
        "where": "어둠이 깊음 위에 있던 때",
        "terms": [
          { "word": "가라사대", "meaning": "'말씀하시기를'의 옛말" },
          { "word": "칭하시니라", "meaning": "이름을 붙이셨다는 뜻" }
        ]
      },
      "history": [],
      "visual": { "description": "어두운 물 위로 밝은 빛이 퍼지고, 화면이 밝은 쪽과 어두운 쪽으로 나뉜다. 사람이나 형상은 없다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-03",
      "chapter": 1,
      "verseStart": 6,
      "verseEnd": 8,
      "title": "하늘이 생기다",
      "commentary": "둘째 날이에요. 물이 위와 아래로 나뉘었고, 하나님이 그 사이의 궁창을 하늘이라고 부르셨어요.",
      "background": {
        "what": "하나님이 물 가운데 궁창을 만들어 궁창 아래의 물과 위의 물을 나누시고, 궁창을 하늘이라고 부르세요.",
        "who": "하나님",
        "where": "물과 물 사이",
        "terms": [
          { "word": "궁창", "meaning": "하늘을 가리키는 옛말. 위의 물과 아래의 물 사이에 펼쳐진 공간" }
        ]
      },
      "history": [],
      "visual": { "description": "아래에는 넓은 물, 위에는 구름이 있고 그 사이에 맑은 공간이 넓게 펼쳐진다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-04",
      "chapter": 1,
      "verseStart": 9,
      "verseEnd": 13,
      "title": "땅과 바다, 풀과 나무",
      "commentary": "셋째 날이에요. 물이 한곳으로 모여 뭍이 드러났고, 땅이 풀과 채소와 열매 맺는 나무를 냈어요.",
      "background": {
        "what": "하나님이 물을 한곳에 모아 뭍이 드러나게 하시고 뭍을 땅, 모인 물을 바다라고 부르세요. 땅은 풀과 채소와 열매 맺는 나무를 내요.",
        "who": "하나님",
        "where": "새로 드러난 땅과 바다",
        "terms": [
          { "word": "천하", "meaning": "하늘 아래" },
          { "word": "뭍", "meaning": "물에 잠기지 않은 땅, 육지" },
          { "word": "과목", "meaning": "열매를 맺는 나무" }
        ]
      },
      "history": [],
      "visual": { "description": "바다에서 드러난 땅 위에 풀밭과 열매 달린 나무들이 자라 있다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-05",
      "chapter": 1,
      "verseStart": 14,
      "verseEnd": 19,
      "title": "해와 달과 별",
      "commentary": "넷째 날이에요. 낮을 주관하는 큰 광명과 밤을 주관하는 작은 광명, 그리고 별들이 하늘에 놓였어요.",
      "background": {
        "what": "하나님이 두 큰 광명과 별들을 만들어 하늘의 궁창에 두시고, 낮과 밤을 주관하며 땅을 비추게 하세요.",
        "who": "하나님",
        "where": "하늘의 궁창",
        "terms": [
          { "word": "광명", "meaning": "빛을 내는 것" },
          { "word": "징조와 사시와 일자와 연한", "meaning": "표시와 계절과 날과 해" },
          { "word": "주관하게", "meaning": "맡아 다스리게" }
        ]
      },
      "history": [],
      "visual": { "description": "한쪽 하늘에는 해가, 다른 쪽 하늘에는 달과 별들이 떠 있고 아래로 땅과 바다가 보인다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-06",
      "chapter": 1,
      "verseStart": 20,
      "verseEnd": 23,
      "title": "물고기와 새",
      "commentary": "다섯째 날이에요. 물에는 생물이, 하늘에는 새가 생겼고 하나님이 그들에게 복을 주셨어요.",
      "background": {
        "what": "하나님이 물에서 움직이는 생물과 날개 있는 새를 종류대로 창조하시고, 생육하고 번성하라고 복을 주세요.",
        "who": "하나님",
        "where": "바다와 하늘",
        "terms": [
          { "word": "번성", "meaning": "수가 많아지고 널리 퍼지는 것" },
          { "word": "생육", "meaning": "낳아서 기르는 것" },
          { "word": "충만하라", "meaning": "가득 차라" }
        ]
      },
      "history": [],
      "visual": { "description": "바다에는 큰 물고기와 물고기 떼가 헤엄치고, 하늘에는 새들이 날아간다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-07",
      "chapter": 1,
      "verseStart": 24,
      "verseEnd": 25,
      "title": "땅의 짐승들",
      "commentary": "여섯째 날의 앞부분이에요. 땅의 짐승과 육축과 땅에 기는 것이 종류대로 만들어졌어요.",
      "background": {
        "what": "하나님이 땅의 짐승과 육축과 땅에 기는 모든 것을 종류대로 만드세요.",
        "who": "하나님",
        "where": "땅",
        "terms": [
          { "word": "육축", "meaning": "집에서 기르는 짐승, 가축" },
          { "word": "기는 것", "meaning": "땅 위를 기어 다니는 동물" }
        ]
      },
      "history": [],
      "visual": { "description": "풀밭과 숲에 소와 양, 들짐승, 땅을 기는 작은 동물들이 어울려 있다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-01-08",
      "chapter": 1,
      "verseStart": 26,
      "verseEnd": 31,
      "title": "사람을 창조하시다",
      "commentary": "여섯째 날의 마지막이에요. 하나님이 자기 형상대로 사람을 남자와 여자로 창조하셨고, 지으신 모든 것을 보시니 심히 좋았다고 해요.",
      "background": {
        "what": "하나님이 자기 형상대로 사람을 남자와 여자로 창조하시고 복을 주세요. 생물을 다스리게 하시고, 씨 맺는 채소와 열매를 먹을거리로 주세요.",
        "who": "하나님, 처음 창조된 남자와 여자",
        "where": "땅",
        "terms": [
          { "word": "형상", "meaning": "모습, 닮은 꼴" },
          { "word": "식물", "meaning": "여기서는 풀과 나무가 아니라 '먹을거리'라는 뜻" },
          { "word": "심히", "meaning": "매우" }
        ]
      },
      "history": [],
      "visual": { "description": "동물들이 있는 푸른 땅에 남자와 여자가 멀리 작게 서 있다. 두 사람은 수풀에 가려 자세히 보이지 않는다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    }
  ]
}
```

- [ ] **Step 3: `content/scenes/genesis-02.json`을 만든다**

```json
{
  "chapter": 2,
  "scenes": [
    {
      "id": "genesis-02-01",
      "chapter": 2,
      "verseStart": 1,
      "verseEnd": 3,
      "title": "일곱째 날",
      "commentary": "천지와 만물이 다 이루어졌어요. 하나님은 일곱째 날에 안식하시고, 그 날을 복 주사 거룩하게 하셨어요.",
      "background": {
        "what": "하나님이 지으시던 일을 마치시고 일곱째 날에 안식하세요. 그 날을 복 주시고 거룩하게 하세요.",
        "who": "하나님",
        "where": "다 이루어진 하늘과 땅",
        "terms": [
          { "word": "안식", "meaning": "일을 멈추고 쉬는 것" },
          { "word": "거룩하게", "meaning": "구별해서 특별하게" }
        ]
      },
      "history": [],
      "visual": { "description": "해 질 녘, 땅과 바다와 하늘이 고요하게 펼쳐져 있다. 사람이나 형상은 없다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-02-02",
      "chapter": 2,
      "verseStart": 4,
      "verseEnd": 7,
      "title": "흙으로 사람을 지으시다",
      "commentary": "아직 들에 초목이 없고 안개만 땅을 적시던 때예요. 여호와 하나님이 흙으로 사람을 지으시고 코에 생기를 불어넣으시니 사람이 생령이 되었어요.",
      "background": {
        "what": "여호와 하나님이 흙으로 사람을 지으시고 생기를 그 코에 불어넣으세요.",
        "who": "여호와 하나님, 처음 사람",
        "where": "안개가 올라와 땅을 적시던 들",
        "terms": [
          { "word": "대략", "meaning": "간추린 줄거리, 내력" },
          { "word": "경작", "meaning": "땅을 갈아 농사짓는 것" },
          { "word": "생기", "meaning": "살아 있게 하는 숨" },
          { "word": "생령", "meaning": "살아 있는 존재" }
        ]
      },
      "history": [],
      "visual": { "description": "안개가 낮게 깔린 들판의 흙바닥에 사람의 형체가 누워 있고, 위에서 부드러운 빛이 내려온다.", "characters": [] },
      "placeId": null,
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-02-03",
      "chapter": 2,
      "verseStart": 8,
      "verseEnd": 14,
      "title": "에덴 동산과 네 강",
      "commentary": "여호와 하나님이 동방의 에덴에 동산을 만드시고 사람을 거기 두셨어요. 동산 가운데에는 생명나무와 선악을 알게 하는 나무가 있었고, 강이 에덴에서 흘러나와 네 줄기로 갈라졌어요.",
      "background": {
        "what": "여호와 하나님이 에덴에 동산을 만들어 사람을 두시고, 보기에 아름답고 먹기에 좋은 나무가 나게 하세요. 에덴에서 흘러나온 강이 네 근원으로 갈라져요.",
        "who": "여호와 하나님, 처음 사람",
        "where": "동방의 에덴 동산",
        "terms": [
          { "word": "동방", "meaning": "동쪽" },
          { "word": "근원", "meaning": "강이 시작되는 줄기" },
          { "word": "힛데겔", "meaning": "티그리스 강의 히브리어 이름" },
          { "word": "유브라데", "meaning": "유프라테스 강" }
        ]
      },
      "history": [
        {
          "text": "힛데겔(티그리스)과 유브라데(유프라테스)는 지금도 흐르는 강이에요. 튀르키예 동부의 산지에서 시작해 이라크를 지나 페르시아 만으로 흘러요.",
          "basis": "현재의 지리. 히브리어 성경의 '힛데겔'은 티그리스 강을 가리키는 이름이에요.",
          "certainty": "확실",
          "sources": []
        },
        {
          "text": "비손과 기혼이 어느 강인지는 밝혀지지 않았어요. 그래서 에덴이 어디였는지도 알 수 없고, 학자마다 추정하는 곳이 달라요.",
          "basis": "성경 지리 연구. 본문의 설명과 맞는 강을 확정하지 못했어요.",
          "certainty": "견해 갈림",
          "sources": []
        }
      ],
      "visual": { "description": "나무가 우거진 동산 한가운데 큰 나무 두 그루가 서 있고, 동산에서 흘러나온 강이 멀리서 네 줄기로 갈라진다. 사람이 동산 안에 멀리 작게 보인다.", "characters": [] },
      "placeId": "eden",
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-02-04",
      "chapter": 2,
      "verseStart": 15,
      "verseEnd": 17,
      "title": "동산을 맡기시다",
      "commentary": "여호와 하나님이 사람에게 에덴 동산을 다스리며 지키게 하셨어요. 동산 각종 나무의 실과는 먹어도 되지만, 선악을 알게 하는 나무의 실과는 먹지 말라고 명하셨어요.",
      "background": {
        "what": "여호와 하나님이 사람을 에덴 동산에 두어 다스리며 지키게 하시고, 선악을 알게 하는 나무의 실과는 먹지 말라고 명하세요.",
        "who": "여호와 하나님, 처음 사람",
        "where": "에덴 동산",
        "terms": [
          { "word": "실과", "meaning": "나무 열매" },
          { "word": "임의로", "meaning": "마음대로" },
          { "word": "정녕", "meaning": "반드시" }
        ]
      },
      "history": [],
      "visual": { "description": "동산 가운데 열매 달린 큰 나무 앞에 사람이 서서 나무를 올려다본다. 위에서 부드러운 빛이 비친다.", "characters": [] },
      "placeId": "eden",
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    },
    {
      "id": "genesis-02-05",
      "chapter": 2,
      "verseStart": 18,
      "verseEnd": 25,
      "title": "돕는 배필",
      "commentary": "여호와 하나님은 사람이 독처하는 것이 좋지 못하다고 하셨어요. 아담이 모든 짐승에게 이름을 주었지만 돕는 배필이 없었고, 하나님이 그의 갈빗대로 여자를 만들어 그에게로 이끌어 오셨어요.",
      "background": {
        "what": "아담이 육축과 새와 들짐승에게 이름을 줘요. 여호와 하나님이 아담을 깊이 잠들게 하시고 갈빗대 하나로 여자를 만들어 그에게로 이끌어 오세요.",
        "who": "여호와 하나님, 아담, 여자",
        "where": "에덴 동산",
        "terms": [
          { "word": "독처", "meaning": "혼자 사는 것" },
          { "word": "배필", "meaning": "짝, 함께하는 사람" },
          { "word": "연합하여", "meaning": "하나로 합하여" }
        ]
      },
      "history": [],
      "visual": { "description": "동산의 나무 아래 남자와 여자가 마주 서 있고 주변에 여러 짐승과 새가 있다. 두 사람은 수풀과 나뭇가지에 가려져 있다.", "characters": [] },
      "placeId": "eden",
      "image": null,
      "review": { "status": "draft", "text": null, "facts": null, "image": null, "attempts": 0 }
    }
  ]
}
```

- [ ] **Step 4: 그림 폴더를 만든다**

Run: `mkdir -p content/images && touch content/images/.gitkeep`

- [ ] **Step 5: `pipeline/src/build/writeBundle.ts`를 쓴다**

```ts
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { appContentDir, imagesDir, placesFile, scenesDir, sourceFile } from '../paths.ts'
import { BundleSchema, PlaceSchema, SceneFileSchema, SourceSchema, type Bundle, type SceneFile } from '../schema.ts'
import { buildBundle } from './buildBundle.ts'

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function readSceneFiles(): Promise<SceneFile[]> {
  if (!existsSync(scenesDir)) return []
  const names = (await readdir(scenesDir)).filter((name) => name.endsWith('.json')).sort()
  return Promise.all(names.map(async (name) => SceneFileSchema.parse(await readJson(path.join(scenesDir, name)))))
}

export async function writeBundle(): Promise<Bundle> {
  const source = SourceSchema.parse(await readJson(sourceFile))
  const places = z.array(PlaceSchema).parse(await readJson(placesFile))
  const bundle = BundleSchema.parse(buildBundle(source, await readSceneFiles(), places))

  await rm(appContentDir, { recursive: true, force: true })
  await mkdir(appContentDir, { recursive: true })
  await writeFile(path.join(appContentDir, 'genesis.json'), JSON.stringify(bundle), 'utf8')
  await cp(imagesDir, path.join(appContentDir, 'images'), { recursive: true })
  return bundle
}
```

- [ ] **Step 6: `pipeline/src/cli.ts`에 `build`를 추가한다**

파일 전체를 아래로 바꾼다.

```ts
import { writeBundle } from './build/writeBundle.ts'
import { fetchSource } from './source/fetchSource.ts'

const commands: Record<string, () => Promise<void>> = {
  async source() {
    const source = await fetchSource()
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
  },
  async build() {
    const bundle = await writeBundle()
    const sceneCount = bundle.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
    console.log(`묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
  },
}

const command = commands[process.argv[2] ?? '']
if (!command) {
  console.error(`사용법: npm run pipeline -- <${Object.keys(commands).join(' | ')}>`)
  process.exit(1)
}

try {
  await command()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
```

- [ ] **Step 7: 명령을 실행한다**

Run: `npm run pipeline -- build`
Expected: `묶음 생성 완료: 10장, 장면 21개` (1장 8개, 2장 5개, 3~10장은 기본 장면 1개씩)

- [ ] **Step 8: 묶음을 확인한다**

Run: `node -e "const b=JSON.parse(require('fs').readFileSync('app/public/content/genesis.json','utf8'));console.log(b.chapters[1].scenes[2].title,b.chapters[1].scenes[2].placeId,b.chapters[2].scenes[0].id)"`
Expected: `에덴 동산과 네 강 eden genesis-03-00`

- [ ] **Step 9: 전체 테스트와 타입 검사를 한다**

Run: `npm test -w pipeline && npm run typecheck -w pipeline`
Expected: 테스트 20개 PASS, 타입 오류 없음.

- [ ] **Step 10: 커밋한다**

`app/public/content/`는 `.gitignore`에 있어 커밋되지 않는다.

```bash
git add content/story-bible/places.json content/scenes content/images/.gitkeep pipeline/src/build/writeBundle.ts pipeline/src/cli.ts
git commit -m "feat: 1~2장 샘플 장면과 build 명령 추가"
```

---

### Task 8: 앱 뼈대

**Files:**
- Create (템플릿 생성): `app/` 전체
- Delete: `app/README.md`, `app/src/App.css`, `app/src/assets/`, `app/public/icons.svg`
- Modify: `package.json`, `app/package.json`, `app/index.html`, `app/src/App.tsx`, `app/src/index.css`
- Create: `app/src/content/types.ts`, `app/src/content/loadBundle.ts`

- [ ] **Step 1: Vite 템플릿으로 `app/`을 만든다**

Task 7의 `build`가 `app/public/content/`를 만들어 두었다. 템플릿은 빈 폴더에만 만들 수 있고 이 폴더는 다시 만들 수 있으므로, 먼저 지운다.

Run: `rm -rf app && npm create vite@latest app -- --template react-ts --no-interactive`
Expected: `app/` 아래에 `index.html`, `package.json`, `src/`, `vite.config.ts` 등이 생긴다.

- [ ] **Step 2: 쓰지 않는 템플릿 파일을 지운다**

Run: `rm app/README.md app/src/App.css app/public/icons.svg && rm -r app/src/assets`

- [ ] **Step 3: `app/package.json`의 이름과 테스트 명령을 고친다**

Run: `(cd app && npm pkg set name=app "scripts.test=vitest run")`

- [ ] **Step 4: 루트 `package.json`을 아래로 바꾼다**

```json
{
  "name": "chansu-bible",
  "private": true,
  "type": "module",
  "workspaces": ["pipeline", "app"],
  "scripts": {
    "pipeline": "npm run cli -w pipeline --",
    "dev": "npm run pipeline -- build && npm run dev -w app",
    "build": "npm run pipeline -- build && npm run build -w app",
    "test": "npm test -w pipeline && npm test -w app"
  }
}
```

- [ ] **Step 5: 의존성을 설치한다**

Run:

```bash
npm install
npm install -w app -D vitest
```

Expected: 오류 없이 끝난다.

- [ ] **Step 6: `app/index.html`을 아래로 바꾼다**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>장면으로 읽는 성경</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: `app/src/content/types.ts`를 쓴다**

앱은 파이프라인 코드를 import하지 않는다. 묶음 파일의 형식을 앱 쪽에서 따로 적는다.

```ts
export type Verse = { verse: number; text: string }

export type Term = { word: string; meaning: string }

export type Background = { what: string; who: string; where: string; terms: Term[] }

export type HistoryNote = {
  text: string
  basis: string
  certainty: '확실' | '추정' | '견해 갈림'
  sources: string[]
}

export type ReviewStatus = 'none' | 'draft' | 'reviewed' | 'flagged' | 'approved'

export type Scene = {
  id: string
  verseStart: number
  verseEnd: number
  title: string
  commentary: string | null
  background: Background | null
  history: HistoryNote[]
  placeId: string | null
  image: string | null
  reviewStatus: ReviewStatus
}

export type Place = {
  id: string
  name: string
  description: string
  estimated: boolean
  x: number | null
  y: number | null
}

export type Chapter = { chapter: number; verses: Verse[]; scenes: Scene[] }

export type Bundle = { book: string; translation: string; places: Place[]; chapters: Chapter[] }
```

- [ ] **Step 8: `app/src/content/loadBundle.ts`를 쓴다**

```ts
import type { Bundle } from './types.ts'

export async function loadBundle(): Promise<Bundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}content/genesis.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return (await response.json()) as Bundle
}
```

- [ ] **Step 9: `app/src/index.css`를 아래로 바꾼다**

```css
:root {
  --paper: #faf7f2;
  --surface: #ffffff;
  --ink: #2b2622;
  --ink-soft: #6f665e;
  --ink-faint: #a39a90;
  --line: #e7e0d6;
  --accent: #8a5a2b;
  --accent-soft: #f3e9dc;
  --warn: #9a5b00;
  --warn-soft: #fbefd6;
  --serif: 'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif;
  --sans: system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: #ece7df;
  color: var(--ink);
  font-family: var(--sans);
  -webkit-text-size-adjust: 100%;
}

button,
select {
  font: inherit;
  color: inherit;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.status {
  height: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ink-soft);
}

.status button {
  padding: 10px 18px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  cursor: pointer;
}
```

- [ ] **Step 10: `app/src/App.tsx`를 아래로 바꾼다**

읽기 화면은 Task 12에서 붙인다. 지금은 묶음을 불러왔는지만 보여준다.

```tsx
import { useEffect, useState } from 'react'
import { loadBundle } from './content/loadBundle.ts'
import type { Bundle } from './content/types.ts'

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; bundle: Bundle }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadBundle().then(
      (bundle) => {
        if (!cancelled) setState({ kind: 'ready', bundle })
      },
      () => {
        if (!cancelled) setState({ kind: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (state.kind === 'loading') return <p className="status">불러오는 중이에요</p>

  if (state.kind === 'error') {
    return (
      <div className="status">
        <p>콘텐츠를 불러오지 못했어요</p>
        <button type="button" onClick={retry}>
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <p className="status">
      {state.bundle.book} {state.bundle.chapters.length}장을 불러왔어요
    </p>
  )
}
```

- [ ] **Step 11: 빌드와 린트를 확인한다**

Run: `npm run build && npm run lint -w app`
Expected: `묶음 생성 완료: 10장, 장면 21개`가 먼저 나오고, 타입 검사와 Vite 빌드가 오류 없이 끝난다. 린트 경고와 오류가 0개다.

- [ ] **Step 12: 브라우저에서 확인한다**

Run: `npm run dev`
`http://localhost:5173`을 연다.
Expected: 화면 가운데에 `창세기 10장을 불러왔어요`가 보인다.

- [ ] **Step 13: 커밋한다**

```bash
git add package.json package-lock.json app
git commit -m "feat: 묶음을 불러오는 앱 뼈대 추가"
```

---

### Task 9: 현재 장면 계산

본문 스크롤 영역의 위에서 조금 내려온 곳에 기준선이 있다. 장면 블록의 위쪽이 이 기준선을 지나면 그 장면이 현재 장면이다. 끝까지 스크롤했는데 마지막 장면이 기준선에 닿지 못한 경우에는 마지막 장면을 현재 장면으로 본다.

**Files:**
- Create: `app/src/reader/activeScene.ts`
- Test: `app/src/reader/activeScene.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/reader/activeScene.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findActiveIndex } from './activeScene.ts'

// 장면 블록 세 개의 위쪽 위치
const offsets = [0, 200, 500]

describe('findActiveIndex', () => {
  it('맨 위에서는 첫 장면이다', () => {
    expect(findActiveIndex(offsets, 0, 24, false)).toBe(0)
  })

  it('기준선이 둘째 장면의 시작에 닿으면 둘째 장면이다', () => {
    expect(findActiveIndex(offsets, 176, 24, false)).toBe(1)
  })

  it('기준선이 둘째 장면에 닿기 전에는 첫 장면이다', () => {
    expect(findActiveIndex(offsets, 175, 24, false)).toBe(0)
  })

  it('끝까지 스크롤하면 기준선에 닿지 않았어도 마지막 장면이다', () => {
    expect(findActiveIndex(offsets, 300, 24, true)).toBe(2)
  })

  it('장면이 없으면 0이다', () => {
    expect(findActiveIndex([], 0, 24, false)).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w app -- src/reader/activeScene.test.ts`
Expected: FAIL. `./activeScene.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `app/src/reader/activeScene.ts`를 쓴다**

```ts
// offsets: 장면 블록마다 스크롤 영역 안에서의 위쪽 위치(px). 작은 값부터 순서대로다.
export function findActiveIndex(offsets: number[], scrollTop: number, lineOffset: number, atBottom: boolean): number {
  if (offsets.length === 0) return 0
  if (atBottom) return offsets.length - 1

  const line = scrollTop + lineOffset
  let active = 0
  for (let index = 0; index < offsets.length; index++) {
    if (offsets[index] > line) break
    active = index
  }
  return active
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -w app -- src/reader/activeScene.test.ts`
Expected: PASS, 테스트 5개.

- [ ] **Step 5: 커밋한다**

```bash
git add app/src/reader/activeScene.ts app/src/reader/activeScene.test.ts
git commit -m "feat: 스크롤 위치로 현재 장면을 찾는 계산 추가"
```

---

### Task 10: 지도 경로 계산

창세기 1장 첫 장면부터 현재 장면까지 지나온 장소를 순서대로 모은다.

- 같은 장소가 연달아 나오면 하나로 합친다.
- 장소가 없는 장면에서는 직전 위치가 현재 위치다.
- 좌표가 없는 장소는 지도에 그릴 수 없으므로 건너뛴다.
- 다음 장소는 현재 위치와 다른 첫 장소 하나다. 아직 지나온 장소가 없으면 다음 장소도 보여주지 않는다.

**Files:**
- Create: `app/src/reader/route.ts`
- Test: `app/src/reader/route.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/reader/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Chapter, Place, Scene } from '../content/types.ts'
import { buildRoute } from './route.ts'

function scene(id: string, placeId: string | null): Scene {
  return {
    id,
    verseStart: 1,
    verseEnd: 1,
    title: id,
    commentary: null,
    background: null,
    history: [],
    placeId,
    image: null,
    reviewStatus: 'none',
  }
}

function chapter(number: number, scenes: Scene[]): Chapter {
  return { chapter: number, verses: [], scenes }
}

const eden: Place = { id: 'eden', name: '에덴', description: '', estimated: true, x: 0.7, y: 0.7 }
const nod: Place = { id: 'nod', name: '놋', description: '', estimated: true, x: 0.8, y: 0.7 }
const ararat: Place = { id: 'ararat', name: '아라랏 산', description: '', estimated: false, x: 0.6, y: 0.2 }
const unmapped: Place = { id: 'somewhere', name: '어딘가', description: '', estimated: true, x: null, y: null }
const places = [eden, nod, ararat, unmapped]

describe('buildRoute', () => {
  it('아직 장소가 나오지 않았으면 비어 있고 다음 장소도 없다', () => {
    const chapters = [chapter(1, [scene('a', null), scene('b', 'eden')])]
    expect(buildRoute(chapters, places, 'a')).toEqual({ visited: [], current: null, next: null })
  })

  it('같은 장소가 연달아 나오면 하나로 합친다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'eden'), scene('c', 'nod')])]
    expect(buildRoute(chapters, places, 'b').visited).toEqual([eden])
  })

  it('장소가 없는 장면에서는 직전 위치를 유지한다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', null)])]
    expect(buildRoute(chapters, places, 'b').current).toEqual(eden)
  })

  it('장을 넘어가며 지나온 장소를 순서대로 모은다', () => {
    const chapters = [chapter(1, [scene('a', 'eden')]), chapter(2, [scene('b', 'nod'), scene('c', 'ararat')])]
    const route = buildRoute(chapters, places, 'c')
    expect(route.visited).toEqual([eden, nod, ararat])
    expect(route.current).toEqual(ararat)
    expect(route.next).toBeNull()
  })

  it('다음 장소는 현재 위치와 다른 첫 장소다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'eden'), scene('c', null), scene('d', 'nod')])]
    expect(buildRoute(chapters, places, 'a').next).toEqual(nod)
  })

  it('다시 돌아온 장소는 한 번 더 넣는다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'nod'), scene('c', 'eden')])]
    expect(buildRoute(chapters, places, 'c').visited).toEqual([eden, nod, eden])
  })

  it('좌표가 없는 장소는 건너뛴다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'somewhere')])]
    expect(buildRoute(chapters, places, 'b').visited).toEqual([eden])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -w app -- src/reader/route.test.ts`
Expected: FAIL. `./route.ts`를 찾지 못한다는 오류가 난다.

- [ ] **Step 3: `app/src/reader/route.ts`를 쓴다**

```ts
import type { Chapter, Place } from '../content/types.ts'

export type MappedPlace = Place & { x: number; y: number }

export type Route = { visited: MappedPlace[]; current: MappedPlace | null; next: MappedPlace | null }

function isMapped(place: Place): place is MappedPlace {
  return place.x !== null && place.y !== null
}

export function buildRoute(chapters: Chapter[], places: Place[], currentSceneId: string): Route {
  const mapped = new Map(places.filter(isMapped).map((place) => [place.id, place]))
  const visited: MappedPlace[] = []
  let next: MappedPlace | null = null
  let reachedCurrent = false

  for (const scene of chapters.flatMap((chapter) => chapter.scenes)) {
    const place = scene.placeId ? (mapped.get(scene.placeId) ?? null) : null
    if (reachedCurrent) {
      if (place && visited.length > 0 && place.id !== visited.at(-1)?.id) {
        next = place
        break
      }
      continue
    }
    if (place && place.id !== visited.at(-1)?.id) visited.push(place)
    if (scene.id === currentSceneId) reachedCurrent = true
  }

  return { visited, current: visited.at(-1) ?? null, next }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -w app -- src/reader/route.test.ts`
Expected: PASS, 테스트 7개.

- [ ] **Step 5: 커밋한다**

```bash
git add app/src/reader/route.ts app/src/reader/route.test.ts
git commit -m "feat: 지나온 장소 경로 계산 추가"
```

---

### Task 11: 지도 화면과 해설 시트

두 화면 모두 받은 값을 그리기만 한다. 화면에 붙이는 것은 Task 12에서 하므로, 이 작업은 타입 검사와 린트로 확인한다.

버튼 아이콘은 기본 선 아이콘이다. Higgsfield로 만든 UI 그래픽이 들어오면 `Icon.tsx`만 바꾼다.

**Files:**
- Create: `app/src/components/Icon.tsx`, `app/src/components/MapScreen.tsx`, `app/src/components/BackgroundSheet.tsx`
- Modify: `app/src/index.css` (끝에 추가)

- [ ] **Step 1: `app/src/components/Icon.tsx`를 쓴다**

```tsx
import type { ReactNode } from 'react'

type IconName = 'map' | 'question' | 'close' | 'back'

const paths: Record<IconName, ReactNode> = {
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  question: (
    <>
      <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4" />
      <path d="M12 18h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
}

export default function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
```

- [ ] **Step 2: `app/src/components/MapScreen.tsx`를 쓴다**

지도 바탕은 경도 30°~52°E, 위도 42°~27°N을 1000×700 칸에 단순하게 옮긴 약도다.

```tsx
import type { MappedPlace, Route } from '../reader/route.ts'
import Icon from './Icon.tsx'

const width = 1000
const height = 700

function label(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

export default function MapScreen({ route, onClose }: { route: Route; onClose: () => void }) {
  const { visited, current, next } = route
  const passed = visited.slice(0, -1)
  const path = visited.map((place) => `${place.x * width},${place.y * height}`).join(' ')

  return (
    <div className="overlay map-screen" role="dialog" aria-modal="true" aria-label="여정 지도">
      <header className="overlay-header">
        <button type="button" className="icon-button" aria-label="지도 닫기" onClick={onClose}>
          <Icon name="back" />
        </button>
        여정 지도
      </header>

      <svg className="map-canvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="고대 근동 약도">
        <path className="map-sea" d="M0,230 L230,235 Q270,300 255,380 Q240,460 215,515 L150,530 L0,530 Z" />
        <path className="map-sea" d="M840,560 Q900,600 1000,640 L1000,700 L860,700 Q830,620 840,560 Z" />
        <polyline className="map-river" points="432,140 386,233 455,303 545,373 655,443 773,513 841,560" />
        <polyline className="map-river" points="455,187 568,233 595,266 655,406 773,490 791,525" />
        <text className="map-label" x="60" y="400">
          지중해
        </text>
        <text className="map-label" x="870" y="680">
          페르시아 만
        </text>
        <text className="map-label" x="300" y="330">
          유프라테스 강
        </text>
        <text className="map-label" x="640" y="300">
          티그리스 강
        </text>

        {visited.length > 1 && <polyline className="map-route" points={path} />}
        {current && next && (
          <line
            className="map-route next"
            x1={current.x * width}
            y1={current.y * height}
            x2={next.x * width}
            y2={next.y * height}
          />
        )}
        {passed.map((place, index) => (
          <g key={`${place.id}-${index}`}>
            <circle className="map-dot" cx={place.x * width} cy={place.y * height} r="9" />
            <text className="map-place passed" x={place.x * width} y={place.y * height + 40}>
              {label(place)}
            </text>
          </g>
        ))}
        {next && (
          <g>
            <circle className="map-dot next" cx={next.x * width} cy={next.y * height} r="9" />
            <text className="map-place passed" x={next.x * width} y={next.y * height + 40}>
              {label(next)}
            </text>
          </g>
        )}
        {current && (
          <g>
            <circle className="map-halo" cx={current.x * width} cy={current.y * height} r="26" />
            <circle className="map-dot" cx={current.x * width} cy={current.y * height} r="13" />
            <text className="map-place" x={current.x * width} y={current.y * height - 36}>
              {label(current)}
            </text>
          </g>
        )}
      </svg>

      {current ? (
        <div className="map-info">
          <span className="map-info-label">지금 위치</span>
          <span className="map-info-name">{label(current)}</span>
          <span className="map-info-desc">{current.description}</span>
        </div>
      ) : (
        <p className="map-info empty">아직 지도에 표시할 장소가 없어요</p>
      )}
      <p className="map-note">단순하게 그린 약도예요. 실제 거리와 다를 수 있어요.</p>
    </div>
  )
}
```

- [ ] **Step 3: `app/src/components/BackgroundSheet.tsx`를 쓴다**

```tsx
import type { Scene } from '../content/types.ts'
import Icon from './Icon.tsx'

export default function BackgroundSheet({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const { background, history } = scene

  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="sheet-title" className="sheet-title">
            {scene.title}
          </h2>
          <button type="button" className="icon-button" aria-label="해설 닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {background ? (
          <>
            <dl>
              <div>
                <dt>무슨 일</dt>
                <dd>{background.what}</dd>
              </div>
              <div>
                <dt>누가</dt>
                <dd>{background.who}</dd>
              </div>
              <div>
                <dt>어디서</dt>
                <dd>{background.where}</dd>
              </div>
            </dl>
            {background.terms.length > 0 && (
              <>
                <h3>낱말 풀이</h3>
                {background.terms.map((term) => (
                  <div key={term.word} className="term">
                    <b>{term.word}</b>
                    {term.meaning}
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <p className="empty">이 장면의 해설은 아직 준비 중이에요.</p>
        )}

        {history.length > 0 && (
          <>
            <h3>역사 배경</h3>
            {history.map((note) => (
              <div key={note.text} className="history-note">
                <span className="certainty">{note.certainty}</span>
                <span>{note.text}</span>
                <span className="history-basis">근거: {note.basis}</span>
                {note.sources.length > 0 && (
                  <span className="history-sources">
                    {note.sources.map((url, index) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        출처 {index + 1}
                      </a>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `app/src/index.css` 끝에 아래를 추가한다**

```css
.overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
}

.overlay-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  font-weight: 600;
}

.icon-button {
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.empty {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}

.map-screen {
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.map-canvas {
  width: 100%;
  height: auto;
  display: block;
  background: #f1ead9;
}

.map-sea {
  fill: #cfe0e6;
}

.map-river {
  fill: none;
  stroke: #9dbccb;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-label {
  font-size: 24px;
  fill: #7f95a0;
}

.map-route {
  fill: none;
  stroke: var(--accent);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.map-route.next {
  stroke-dasharray: 10 12;
  opacity: 0.5;
}

.map-dot {
  fill: var(--accent);
}

.map-dot.next {
  fill: none;
  stroke: var(--accent);
  stroke-width: 4;
  opacity: 0.5;
}

.map-halo {
  fill: var(--accent);
  opacity: 0.2;
}

.map-place {
  font-size: 30px;
  font-weight: 600;
  fill: var(--ink);
  text-anchor: middle;
}

.map-place.passed {
  font-size: 26px;
  font-weight: 400;
  fill: var(--ink-soft);
}

.map-info {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.map-info-label {
  font-size: 12px;
  color: var(--ink-faint);
}

.map-info-name {
  font-family: var(--serif);
  font-size: 18px;
}

.map-info-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-soft);
}

.map-note {
  margin: auto 0 0;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--ink-faint);
}

.sheet-backdrop {
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 0.35);
}

.sheet {
  width: 100%;
  max-height: 80%;
  overflow-y: auto;
  padding: 16px 16px 24px;
  border-radius: 18px 18px 0 0;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet-title {
  margin: 0;
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 600;
}

.sheet dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.sheet dd {
  margin: 2px 0 0;
  font-size: 15px;
  line-height: 1.6;
}

.sheet h3 {
  margin: 6px 0 0;
  font-size: 14px;
}

.term {
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--paper);
  font-size: 14px;
  line-height: 1.5;
}

.term b {
  margin-right: 6px;
}

.history-note {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  line-height: 1.6;
}

.certainty {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--accent-soft);
  color: var(--accent);
}

.history-basis {
  font-size: 12px;
  color: var(--ink-soft);
}

.history-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}
```

- [ ] **Step 5: 타입 검사와 린트를 한다**

Run: `npm run build -w app && npm run lint -w app`
Expected: 오류 없이 끝난다. 린트 경고와 오류가 0개다.

- [ ] **Step 6: 커밋한다**

```bash
git add app/src/components app/src/index.css
git commit -m "feat: 지도 화면과 해설 시트 추가"
```

---

### Task 12: 읽기 화면 조립

**Files:**
- Create: `app/src/reader/position.ts`, `app/src/components/ScenePane.tsx`, `app/src/components/VersePane.tsx`, `app/src/components/ReaderScreen.tsx`
- Modify: `app/src/App.tsx`, `app/src/index.css` (끝에 추가)

- [ ] **Step 1: `app/src/reader/position.ts`를 쓴다**

```ts
export type Position = { chapter: number; sceneId: string }

const key = 'reader-position'

export function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Position>
    if (typeof value.chapter !== 'number' || typeof value.sceneId !== 'string') return null
    return { chapter: value.chapter, sceneId: value.sceneId }
  } catch {
    return null
  }
}

export function savePosition(position: Position): void {
  try {
    localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 위치 저장을 건너뛴다.
  }
}
```

- [ ] **Step 2: `app/src/components/ScenePane.tsx`를 쓴다**

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ReviewStatus, Scene } from '../content/types.ts'
import Icon from './Icon.tsx'

const badgeText: Partial<Record<ReviewStatus, string>> = { draft: '검수 전', flagged: '확인 필요' }

type Props = {
  scene: Scene
  sceneNumber: number
  sceneCount: number
  onOpenMap: () => void
  onOpenSheet: () => void
}

export default function ScenePane({ scene, sceneNumber, sceneCount, onOpenMap, onOpenSheet }: Props) {
  const [shown, setShown] = useState(scene)
  const [previous, setPrevious] = useState<Scene | null>(null)

  // 장면이 바뀌면 이전 그림을 아래에 깔아 두고 새 그림을 위에서 서서히 나타나게 한다.
  if (scene.id !== shown.id) {
    setPrevious(shown)
    setShown(scene)
  }

  const badge = badgeText[shown.reviewStatus]

  return (
    <section className="scene-pane" aria-label="장면 그림">
      {previous && <SceneLayer key={previous.id} scene={previous} />}
      <SceneLayer key={shown.id} scene={shown} entering={previous !== null} />

      <div className="scene-buttons">
        <button type="button" className="round-button" aria-label="여정 지도 보기" onClick={onOpenMap}>
          <Icon name="map" />
        </button>
        <button type="button" className="round-button" aria-label="이 장면 해설 보기" onClick={onOpenSheet}>
          <Icon name="question" />
        </button>
      </div>

      {badge && <div className="review-badge">{badge}</div>}

      <div className="scene-caption">
        <span className="scene-title">{shown.title}</span>
        <span className="scene-count">
          {sceneNumber} / {sceneCount}
        </span>
      </div>
    </section>
  )
}

function SceneLayer({ scene, entering = false }: { scene: Scene; entering?: boolean }) {
  return (
    <div className={entering ? 'scene-layer entering' : 'scene-layer'}>
      {scene.image ? (
        <img src={import.meta.env.BASE_URL + scene.image} alt={scene.title} />
      ) : (
        <div className="scene-placeholder" style={{ '--hue': hueOf(scene.id) } as CSSProperties}>
          그림 준비 중
        </div>
      )}
    </div>
  )
}

// 그림이 없는 동안에도 장면이 바뀌는 것이 보이도록 장면마다 다른 바탕색을 쓴다.
function hueOf(id: string): number {
  let sum = 0
  for (const char of id) sum += char.charCodeAt(0)
  return (sum * 47) % 360
}
```

- [ ] **Step 3: `app/src/components/VersePane.tsx`를 쓴다**

```tsx
import { useLayoutEffect, useRef } from 'react'
import type { Chapter } from '../content/types.ts'
import { findActiveIndex } from '../reader/activeScene.ts'

// 스크롤 영역의 위에서 이만큼 내려온 곳이 기준선이다.
const lineOffset = 24

type Props = {
  chapter: Chapter
  chapterNumbers: number[]
  restoreSceneId: string | null
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onChapterChange: (chapter: number) => void
}

export default function VersePane({
  chapter,
  chapterNumbers,
  restoreSceneId,
  activeIndex,
  onActiveIndexChange,
  onChapterChange,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<(HTMLElement | null)[]>([])
  const nextChapter = chapterNumbers.find((number) => number > chapter.chapter)

  // 마지막으로 읽던 장면으로 스크롤을 옮긴다.
  useLayoutEffect(() => {
    const index = chapter.scenes.findIndex((scene) => scene.id === restoreSceneId)
    const block = blockRefs.current[index]
    if (index > 0 && block && scrollRef.current) {
      scrollRef.current.scrollTop = block.offsetTop - lineOffset + 1
    }
  }, [chapter.scenes, restoreSceneId])

  function handleScroll() {
    const scroller = scrollRef.current
    if (!scroller) return
    const offsets = blockRefs.current.slice(0, chapter.scenes.length).map((block) => block?.offsetTop ?? 0)
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
    const next = findActiveIndex(offsets, scroller.scrollTop, lineOffset, atBottom)
    if (next !== activeIndex) onActiveIndexChange(next)
  }

  return (
    <section className="verse-pane" aria-label="본문">
      <header className="verse-header">
        <label>
          <span className="sr-only">장 선택</span>
          <select value={chapter.chapter} onChange={(event) => onChapterChange(Number(event.target.value))}>
            {chapterNumbers.map((number) => (
              <option key={number} value={number}>
                창세기 {number}장
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="verse-scroll" ref={scrollRef} onScroll={handleScroll}>
        {chapter.scenes.map((scene, index) => (
          <section
            key={scene.id}
            ref={(element) => {
              blockRefs.current[index] = element
            }}
            className={index === activeIndex ? 'scene-block active' : 'scene-block'}
          >
            {chapter.verses
              .filter((verse) => verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd)
              .map((verse) => (
                <p key={verse.verse} className="verse">
                  <span className="verse-number">{verse.verse}</span>
                  {verse.text}
                </p>
              ))}
            {scene.commentary && <p className="commentary">{scene.commentary}</p>}
          </section>
        ))}

        {nextChapter !== undefined && (
          <button type="button" className="next-chapter" onClick={() => onChapterChange(nextChapter)}>
            창세기 {nextChapter}장으로
          </button>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: `app/src/components/ReaderScreen.tsx`를 쓴다**

```tsx
import { useEffect, useState } from 'react'
import type { Bundle } from '../content/types.ts'
import { loadPosition, savePosition, type Position } from '../reader/position.ts'
import { buildRoute } from '../reader/route.ts'
import BackgroundSheet from './BackgroundSheet.tsx'
import MapScreen from './MapScreen.tsx'
import ScenePane from './ScenePane.tsx'
import VersePane from './VersePane.tsx'

type Overlay = 'none' | 'map' | 'sheet'

function initialChapterNumber(bundle: Bundle, saved: Position | null): number {
  return bundle.chapters.find((chapter) => chapter.chapter === saved?.chapter)?.chapter ?? bundle.chapters[0].chapter
}

export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  const [saved] = useState(loadPosition)
  const [chapterNumber, setChapterNumber] = useState(() => initialChapterNumber(bundle, saved))
  const [restoreSceneId, setRestoreSceneId] = useState(saved?.sceneId ?? null)
  const chapter = bundle.chapters.find((c) => c.chapter === chapterNumber) ?? bundle.chapters[0]
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      chapter.scenes.findIndex((scene) => scene.id === saved?.sceneId),
    ),
  )
  const [overlay, setOverlay] = useState<Overlay>('none')

  const sceneIndex = Math.min(activeIndex, chapter.scenes.length - 1)
  const scene = chapter.scenes[sceneIndex]

  useEffect(() => {
    savePosition({ chapter: chapter.chapter, sceneId: scene.id })
  }, [chapter.chapter, scene.id])

  function goToChapter(next: number) {
    setChapterNumber(next)
    setActiveIndex(0)
    setRestoreSceneId(null)
  }

  return (
    <div className="reader">
      <ScenePane
        scene={scene}
        sceneNumber={sceneIndex + 1}
        sceneCount={chapter.scenes.length}
        onOpenMap={() => setOverlay('map')}
        onOpenSheet={() => setOverlay('sheet')}
      />
      <VersePane
        key={chapter.chapter}
        chapter={chapter}
        chapterNumbers={bundle.chapters.map((c) => c.chapter)}
        restoreSceneId={restoreSceneId}
        activeIndex={sceneIndex}
        onActiveIndexChange={setActiveIndex}
        onChapterChange={goToChapter}
      />
      {overlay === 'map' && (
        <MapScreen route={buildRoute(bundle.chapters, bundle.places, scene.id)} onClose={() => setOverlay('none')} />
      )}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={() => setOverlay('none')} />}
    </div>
  )
}
```

- [ ] **Step 5: `app/src/App.tsx`에서 읽기 화면을 보여준다**

import에 한 줄을 추가한다.

```tsx
import ReaderScreen from './components/ReaderScreen.tsx'
```

파일 맨 끝의 `return` 문을 아래로 바꾼다.

```tsx
  return <ReaderScreen bundle={state.bundle} />
```

- [ ] **Step 6: `app/src/index.css` 끝에 아래를 추가한다**

```css
.reader {
  position: relative;
  height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
}

.scene-pane {
  position: relative;
  flex: 0 0 50%;
  overflow: hidden;
  background: var(--accent-soft);
}

.scene-layer {
  position: absolute;
  inset: 0;
}

.scene-layer.entering {
  animation: scene-in 0.3s ease-out;
}

.scene-layer img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.scene-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--hue) 32% 84%);
  color: hsl(var(--hue) 30% 32%);
  font-size: 13px;
}

@keyframes scene-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-layer.entering {
    animation: none;
  }
}

.scene-buttons {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.round-button {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 0.9);
  color: var(--ink);
  cursor: pointer;
}

.review-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--warn-soft);
  color: var(--warn);
}

.scene-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28px 14px 10px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  color: #fff;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.45));
}

.scene-title {
  font-family: var(--serif);
  font-size: 17px;
}

.scene-count {
  font-size: 12px;
  white-space: nowrap;
}

.verse-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.verse-header {
  padding: 6px 14px;
  border-bottom: 1px solid var(--line);
}

.verse-header select {
  padding: 4px 0;
  border: 0;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
}

.verse-scroll {
  position: relative;
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px 24px;
}

.scene-block {
  padding: 10px 0 10px 12px;
  border-left: 2px solid transparent;
}

.scene-block.active {
  border-left-color: var(--accent);
}

.verse {
  margin: 0 0 8px;
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.75;
  color: var(--ink-soft);
}

.scene-block.active .verse {
  color: var(--ink);
}

.verse-number {
  margin-right: 6px;
  font-family: var(--sans);
  font-size: 11px;
  color: var(--accent);
  vertical-align: 2px;
}

.commentary {
  margin: 10px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--accent-soft);
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-soft);
}

.next-chapter {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 7: 빌드와 린트를 확인한다**

Run: `npm run build && npm run lint -w app`
Expected: 오류 없이 끝난다. 린트 경고와 오류가 0개다.

- [ ] **Step 8: 브라우저에서 확인한다**

Run: `npm run dev`
`http://localhost:5173`을 모바일 크기(390×844)로 연다. 아래를 하나씩 확인한다.

1. 위 절반에 "그림 준비 중" 색 칸이 있고, 왼쪽 위에 버튼 두 개, 오른쪽 위에 "검수 전", 아래에 제목 "태초에"와 `1 / 8`이 보인다. 아래 절반에 창세기 1장 본문이 1절부터 보인다.
2. 본문을 내려 3절이 위로 올라가면 제목이 "빛이 있으라", 번호가 `2 / 8`로 바뀌고 색 칸의 색이 바뀐다.
3. 끝까지 내리면 `8 / 8`이 되고 "창세기 2장으로" 버튼이 보인다. 누르면 2장이 맨 위부터 보인다.
4. 1장에서 지도 버튼을 누르면 "아직 지도에 표시할 장소가 없어요"가 보인다.
5. 2장 "에덴 동산과 네 강"(`3 / 5`)에서 지도 버튼을 누르면 "에덴 (추정)" 점과 "지금 위치"가 보인다. 뒤로 버튼으로 닫힌다.
6. 같은 장면에서 `?`를 누르면 무슨 일 / 누가 / 어디서 / 낱말 풀이와 역사 배경 2개가 보인다. 바깥을 누르면 닫힌다.
7. 새로 고침하면 같은 장, 같은 장면에서 이어진다.
8. 장 선택에서 3장을 고르면 제목이 "창세기 3장", 번호가 `1 / 1`이고 "검수 전" 표시가 없다. `?`를 누르면 "이 장면의 해설은 아직 준비 중이에요."가 보인다.

- [ ] **Step 9: 커밋한다**

```bash
git add app/src
git commit -m "feat: 읽기 화면 조립 (그림 칸, 본문, 지도, 해설)"
```

---

### Task 13: 마무리 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: 전체 테스트를 돌린다**

Run: `npm test`
Expected: pipeline 테스트 20개, app 테스트 12개 PASS.

- [ ] **Step 2: 타입 검사, 빌드, 린트를 돌린다**

Run: `npm run typecheck -w pipeline && npm run build && npm run lint -w app`
Expected: 오류 없이 끝난다.

- [ ] **Step 3: 새로 받은 리포에서도 동작하는지 확인한다**

`app/public/content/`는 커밋되지 않으므로, 지우고 다시 만들어지는지 본다.

Run: `rm -rf app/public/content && npm run build`
Expected: `묶음 생성 완료: 10장, 장면 21개`가 나오고 빌드가 끝난다.

- [ ] **Step 4: 작업 폴더가 깨끗한지 확인한다**

Run: `git status --short`
Expected: 출력이 없다.

- [ ] **Step 5: 푸시한다**

```bash
git push origin main
```
