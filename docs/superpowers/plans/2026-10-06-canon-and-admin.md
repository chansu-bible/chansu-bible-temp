# 1단계: 설정집 DB, canon 단계, 관리 도구 뼈대 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인물·장소·시대·물건의 설정집을 검수 상태와 함께 파일로 두고, LLM이 장 본문에서 설정집 초안을 뽑는 `canon` 단계를 만들고, 로컬 관리 도구에서 상태를 보고 작업을 실행하고 설정집을 편집·승인할 수 있게 한다.

**Architecture:** 설정집은 `content/story-bible/*.json`이다(`facts`와 `design`을 나눈다). 모든 LLM 호출은 `pipeline/src/llm/`을 거치고 `content/runs/`에 기록된다. 관리 도구는 `admin/` 워크스페이스로, Hono 서버가 파이프라인 모듈을 직접 불러 쓰고 React 화면이 그 API를 쓴다. 설계: `docs/superpowers/specs/2026-10-06-canon-pipeline-admin-design.md`.

**Tech Stack:** Node 22, TypeScript 6, zod 4, vitest, openai SDK(Responses API, `zodTextFormat`), Hono + `@hono/node-server`, React 19 + Vite 8, `concurrently`

---

## 작업 순서와 병렬 가능성

- Task 1(스키마·이전)이 먼저다. 그 뒤 Task 2→3(파이프라인), Task 4(서버), Task 5(화면)는 서로 다른 폴더를 만지므로 병렬로 할 수 있다. Task 4와 5는 이 문서의 API 계약에 맞춰 각자 만든다.
- Task 6은 모두 끝난 뒤 통합 확인이다. 실제 `canon` 실행(API 비용 발생)은 조정자가 한다.

## 파일 구조

```
pipeline/src/
  schema.ts                 설정집 스키마 추가 (Citation, ReviewState, Character, Place, Era, Thing, Proposal)
  canon/
    files.ts                설정집 파일 읽기·쓰기 (검증 포함)
    validate.ts             교차 검증 (id 중복, relations.to 존재, 절 인용 범위)
    merge.ts                canon 단계 출력 → 초안 추가 / proposals (순수 함수)
    prompt.ts               canon 단계 프롬프트 조립
    runCanon.ts             canon 단계 실행
  llm/
    models.ts               모델 이름(.env), 가격표, 비용 추정
    client.ts               Responses API 호출 + 실행 기록
    runs.ts                 content/runs/*.jsonl 읽기·쓰기
  index.ts                  관리 서버가 쓰는 공개 함수 모음
pipeline/test/
  canon.test.ts, merge.test.ts, models.test.ts
content/story-bible/
  characters.json, places.json(이전), eras.json(초기 5개), things.json, proposals.json
content/runs/.gitkeep
admin/
  package.json              name: admin. scripts: dev(concurrently), dev:ui, dev:server, build, test, lint
  vite.config.ts            /api → http://127.0.0.1:8787 프록시
  server/
    index.ts                Hono 앱, 127.0.0.1:8787
    routes/*.ts             status, canon, proposals, scenes, jobs, runs, git
    jobs.ts                 작업 큐(한 번에 하나), 로그 수집, SSE
    status.ts               content/를 읽어 대시보드 상태 계산 (순수 부분 분리)
  src/
    main.tsx, App.tsx(라우팅: 해시 기반), api.ts(fetch 래퍼), pages/*.tsx, components/*.tsx, index.css
  test/
    status.test.ts, jobs.test.ts
```

---

## 공통 계약

### 설정집 스키마 (Task 1에서 `pipeline/src/schema.ts`에 추가)

```ts
export const CitationSchema = z.string().regex(/^\d{1,2}:\d{1,3}(-\d{1,3})?$/)   // "1:26", "2:7-8"
export const ReviewStateSchema = z.enum(['draft', 'approved', 'rejected'])
export const CanonIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/)

export const CharacterSchema = z.object({
  id: CanonIdSchema, name: z.string().min(1), aliases: z.array(z.string()), status: ReviewStateSchema,
  facts: z.object({
    firstAppearance: CitationSchema,
    gender: z.enum(['남', '여', '불명']),
    years: z.object({ born: z.number().int().nullable(), died: z.number().int().nullable() }),
    relations: z.array(z.object({ type: z.string().min(1), to: CanonIdSchema })),
    attire: z.array(z.object({ from: CitationSchema, description: z.string().min(1) })),
    notes: z.string(),
    sources: z.array(CitationSchema).min(1),
  }),
  design: z.object({ build: z.string(), face: z.string(), hair: z.string(), skin: z.string(), ageNotes: z.string(), notes: z.string() }),
  refs: z.array(z.string()),
})

export const PlaceSchema = z.object({                 // 기존 PlaceSchema를 이것으로 바꾼다
  id: CanonIdSchema, name: z.string().min(1), aliases: z.array(z.string()), status: ReviewStateSchema,
  facts: z.object({ firstAppearance: CitationSchema, description: z.string(), sources: z.array(CitationSchema).min(1) }),
  location: z.object({ lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(), certainty: z.enum(['확실', '추정', '불명']) }),
  design: z.object({ landscape: z.string(), notes: z.string() }),
})

export const EraSchema = z.object({
  id: CanonIdSchema, name: z.string().min(1), status: ReviewStateSchema,
  range: z.object({ from: CitationSchema, to: CitationSchema }),
  years: z.object({ from: z.number().int().nullable(), to: z.number().int().nullable() }),
  facts: z.object({ description: z.string(), present: z.array(z.string()), absent: z.array(z.string()), sources: z.array(CitationSchema).min(1) }),
  design: z.object({ visualNotes: z.string() }),
})

export const ThingSchema = z.object({
  id: CanonIdSchema, name: z.string().min(1), aliases: z.array(z.string()), status: ReviewStateSchema,
  facts: z.object({ description: z.string(), details: z.array(z.string()), sources: z.array(CitationSchema).min(1) }),
  design: z.object({ visualNotes: z.string() }),
})

export const ProposalSchema = z.object({
  id: z.string().min(1), createdAt: z.string(),       // ISO 8601
  target: z.string().regex(/^(characters|places|eras|things)\/[a-z][a-z0-9-]*$/),
  field: z.string().min(1),                            // 점 표기 경로. 예: "facts.attire", "design.hair"
  value: z.unknown(), reason: z.string(), sources: z.array(CitationSchema),
  status: z.enum(['open', 'applied', 'dismissed']),
})

export const CanonKindSchema = z.enum(['characters', 'places', 'eras', 'things'])
export type Canon = { characters: Character[]; places: Place[]; eras: Era[]; things: Thing[]; proposals: Proposal[] }
```

앱 묶음의 장소 형식은 바꾸지 않는다. `buildBundle`은 새 `Place`에서 `{ id, name, description: facts.description, estimated: location.certainty !== '확실', lat: location.lat, lng: location.lng }`를 만들어 넣는다(묶음용 스키마는 `BundlePlaceSchema`로 따로 둔다).

### LLM 실행 기록 (`content/runs/YYYY-MM-DD.jsonl`, 한 줄 = 한 호출)

```ts
{ at: string, stage: string, model: string, chapter: number | null, inputTokens: number, outputTokens: number, ms: number, ok: boolean, note: string }
```

### 관리 서버 API 계약 (`http://127.0.0.1:8787`)

모든 응답은 JSON이다. 오류는 `{ error: string }`에 4xx/5xx. 쓰기는 스키마 검증을 통과해야 저장된다.

| 메서드·경로 | 응답 / 본문 |
|---|---|
| `GET /api/status` | `{ chapters: ChapterStatus[], canon: Record<kind, {draft,approved,rejected}>, proposalsOpen: number, imageVersions: ImageVersion[] }` |
| `GET /api/canon/:kind` | 항목 배열 |
| `POST /api/canon/:kind` | 본문: 항목 전체 → 저장, 201, 항목 반환. id 중복이면 409 |
| `PUT /api/canon/:kind/:id` | 본문: 항목 전체(id 일치) → 저장, 항목 반환 |
| `POST /api/canon/:kind/:id/approve` · `/reject` | status 변경, 항목 반환 |
| `GET /api/canon/:kind/:id/usage` | `{ scenes: [{ chapter, id, title }] }` (visual.characters, placeId, eraId로 찾는다) |
| `GET /api/proposals` | proposals 배열 |
| `POST /api/proposals/:id/apply` · `/dismiss` | apply: target 항목의 field에 value를 넣고(점 경로) 항목 검증 후 저장, proposal을 applied로. dismiss: dismissed로 |
| `GET /api/scenes/:chapter` | `{ chapter, verses: Verse[], scenes: Scene[] \| null }` (장면 파일이 없으면 null) |
| `GET /api/jobs` | `Job[]` 최근 50개 |
| `POST /api/jobs` | 본문 `{ stage, options }` → `{ id }` 202. 실행 중인 작업이 있으면 409 |
| `GET /api/jobs/:id` | `Job` |
| `GET /api/jobs/:id/events` | SSE. `data: {"line": "..."}` 줄마다, 끝나면 `event: end` + `data: {"status": "done"\|"failed"}` |
| `GET /api/runs?days=7` | `{ runs: Run[], totals: { inputTokens, outputTokens, estimatedUsd } }` |
| `GET /api/git/status` | `{ branch: string, changes: [{ path, status }] }` |

```ts
type ChapterStatus = {
  chapter: number; verses: number; hasSceneFile: boolean;
  scenes: { total: number; draft: number; reviewed: number; flagged: number; approved: number };
  images: Record<string, number>;      // 버전 id → 그림 있는 장면 수
  audio: { have: number; total: number };
}
type Job = {
  id: string; stage: Stage; options: JobOptions; status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: string; startedAt: string | null; endedAt: string | null; lines: string[]; error: string | null;
}
type Stage = 'source' | 'canon' | 'images' | 'tts' | 'build'    // 1단계에서 실행 가능한 것. 나머지는 400 "아직 없는 단계"
type JobOptions = { chapter?: number; scenes?: string[]; force?: boolean; allowDraft?: boolean; dryRun?: boolean; limit?: number }
```

`options`는 단계별로 쓰는 것만 쓴다. `canon`: chapter(필수), dryRun. `images`: chapter(필수), scenes, force, allowDraft, dryRun, limit. `tts`: chapter(필수), force, limit, dryRun. `source`, `build`: 없음.

---

### Task 1: 설정집 스키마, 파일 모듈, 교차 검증, places 이전, 시대 초기값

**Files:**
- Modify: `pipeline/src/schema.ts` (위 스키마 추가, `PlaceSchema` 교체, `BundlePlaceSchema` 추가)
- Create: `pipeline/src/canon/files.ts`, `pipeline/src/canon/validate.ts`
- Modify: `pipeline/src/build/buildBundle.ts`, `pipeline/src/build/writeBundle.ts`, `pipeline/src/paths.ts`
- Modify: `content/story-bible/places.json` (이전), Create: `characters.json`(`[]`), `things.json`(`[]`), `proposals.json`(`[]`), `eras.json`(아래 5개)
- Test: `pipeline/test/canon.test.ts`, 기존 `buildBundle.test.ts` 갱신

- [ ] **Step 1: 실패하는 테스트** — `validateCanon(canon)`이 돌려주는 문제 목록을 검사한다: id 중복(같은 kind 안), `relations.to`가 없는 인물, 절 인용이 1~10장과 절 수(31,25,24,26,32,22,24,22,29,32)를 벗어남, 시대 `range.from`이 `to`보다 뒤. 문제가 없으면 `[]`.
- [ ] **Step 2: 스키마 추가** — 위 계약대로. `PlaceSchema`를 새 형식으로 바꾸고, 묶음용 `BundlePlaceSchema = z.object({ id, name, description, estimated, lat, lng })`를 추가해 `BundleSchema.places`가 이것을 쓰게 한다.
- [ ] **Step 3: `canon/files.ts`** — `readCanon(): Promise<Canon>`(없는 파일은 `[]`), `writeCanonKind(kind, items)`, `writeProposals(items)`. 읽을 때 스키마와 `validateCanon`을 통과하지 못하면 파일 이름과 함께 오류.
- [ ] **Step 4: `canon/validate.ts`** — Step 1의 함수.
- [ ] **Step 5: places 이전과 초기 파일** — `places.json`의 `eden`을 새 형식으로: `facts.firstAppearance "2:8"`, `facts.description` 기존 문장, `sources ["2:8", "2:10-14"]`, `location { lat 31.02, lng 47.43, certainty "추정" }`, `design.landscape "강이 흐르는 평야. 큰 나무가 많은 동산"`, `status "approved"`(지금 그림에 이미 쓰고 있다). `eras.json`에 다섯 시대를 `draft`로 넣는다. 각 시대의 `present`/`absent`는 본문 근거만 적고 `sources`에 절을 단다:
  - `creation-week` 창조 주간 1:1~2:3, years 0~0. present: 빛(1:3), 하늘(1:8), 땅과 바다(1:10), 식물(1:12), 해·달·별(1:16), 물고기와 새(1:21), 짐승과 육축(1:25), 사람(1:27). absent: 성읍, 농사, 옷, 연장.
  - `eden` 에덴 2:4~3:24, years null. present: 동산과 네 강(2:8-14), 생명나무와 선악을 알게 하는 나무(2:9), 짐승과 새(2:19), 뱀(3:1), 무화과 잎 치마(3:7), 가죽옷(3:21). absent: 비(2:5), 농사(3:23 전까지), 성읍.
  - `before-flood` 추방 후·홍수 전 4:1~6:8, years null~1656. present: 농사와 양 치기(4:2), 제단과 제물(4:3-4), 첫 성읍 에녹(4:17), 장막과 가축(4:20), 수금과 퉁소(4:21), 구리와 쇠 연장(4:22), 긴 수명(5장). absent: 비는 언급 없음.
  - `flood` 홍수 6:9~8:22, years 1656~1657. present: 방주(6:14-16), 비 40일(7:12), 물이 150일 넘침(7:24), 아라랏 산(8:4), 까마귀와 비둘기(8:7-12), 제단(8:20).
  - `after-flood` 홍수 후 9:1~10:32, years 1657~null. present: 고기 먹기 허락(9:3), 무지개(9:13), 포도원과 포도주(9:20-21), 장막(9:21), 민족과 성읍(10:10-12), 사냥꾼 니므롯(10:9).
  - 연도는 창조 원년 기준이며 5장 족보로 계산한 홍수 해 1656(아담 130 → 셋 105 → 에노스 90 → 게난 70 → 마할랄렐 65 → 야렛 162 → 에녹 65 → 므두셀라 187 → 라멕 182 → 노아 600)을 `facts.description`에 계산 근거로 적는다.
- [ ] **Step 6: 묶음 생성 연결** — `writeBundle`은 `readCanon()`으로 places를 읽고, `buildBundle`은 새 `Place`를 묶음용 장소로 바꾼다. `buildBundle.test.ts`의 places 픽스처를 새 형식으로 고친다. `npm run pipeline -- build`가 전과 같은 묶음(장소 1개)을 만들어야 한다.
- [ ] **Step 7: 검사** — `npm test -w pipeline`, `npm run typecheck -w pipeline`, `npm run pipeline -- build`, `npm test -w app`(묶음 형식 유지 확인).
- [ ] **Step 8: 커밋** — `feat: 설정집 스키마와 파일 모듈, places 이전, 시대 초기값`

---

### Task 2: LLM 공용 모듈과 실행 기록

**Files:**
- Create: `pipeline/src/llm/models.ts`, `pipeline/src/llm/client.ts`, `pipeline/src/llm/runs.ts`
- Create: `content/runs/.gitkeep`; `.gitignore`에 `content/runs/*.jsonl` 추가(실행 기록은 커밋하지 않는다)
- Modify: `.env.example`에 `OPENAI_WRITER_MODEL=`, `OPENAI_REVIEWER_MODEL=` 추가(기본값 주석: gpt-6.1-sol, gpt-6-astra)
- Test: `pipeline/test/models.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `estimateUsd(model, inputTokens, outputTokens)`: 가격표(`gpt-6-astra` 10/50, `gpt-6.1-sol` 2/10, `gpt-6-luna` 0.1/0.5 달러/백만 토큰)로 계산, 모르는 모델은 `null`. `formatRun(run)` 한 줄 JSON 직렬화·역직렬화.
- [ ] **Step 2: `models.ts`** — `writerModel()`, `reviewerModel()`(환경 변수 우선), 가격표, `estimateUsd`.
- [ ] **Step 3: `client.ts`** — `createLlm({ stage, chapter, log })` → `{ parse<T>(schema: ZodType<T>, { system, user, model?, tools? }): Promise<T> }`. 내부에서 `client.responses.parse({ model, input: [{role:'system',...},{role:'user',...}], text: { format: zodTextFormat(schema, name) }, tools })`를 쓰고, `output_parsed`가 없거나 거부(refusal)면 오류를 던진다. 호출마다 `runs.ts`로 기록(토큰은 `response.usage`). 재시도는 SDK `maxRetries: 3`.
- [ ] **Step 4: `runs.ts`** — `appendRun(run)`(날짜별 jsonl), `readRuns(days)`, `summarizeRuns(runs)`(토큰 합계, 추정 비용 합계; 순수).
- [ ] **Step 5: 검사와 커밋** — `feat: LLM 공용 모듈과 실행 기록`

---

### Task 3: `canon` 단계

**Files:**
- Create: `pipeline/src/canon/prompt.ts`, `pipeline/src/canon/merge.ts`, `pipeline/src/canon/runCanon.ts`
- Modify: `pipeline/src/cli.ts`(`canon` 명령), `pipeline/src/index.ts`(공개 함수)
- Test: `pipeline/test/merge.test.ts`

- [ ] **Step 1: 실패하는 테스트(merge)** — `mergeCanon(existing: Canon, output: CanonOutput, now: string)`:
  - 새 id는 `draft`로 추가된다. `status`는 출력에 있어도 무시하고 `draft`로 둔다.
  - 출력 항목의 id나 name(별칭 포함)이 기존 항목과 같으면 추가하지 않고, 달라진 필드마다 proposal(`open`)을 만든다. 기존 항목이 `draft`면 proposal 대신 그 항목을 덮어쓴다(아직 사람이 보지 않았으므로).
  - 출력의 `relations.to`가 기존·새 항목 어디에도 없으면 그 relation은 버리고 경고 목록에 적는다.
  - 돌려주는 값: `{ canon, added: {kind,id}[], proposals: Proposal[], warnings: string[] }`.
- [ ] **Step 2: 출력 스키마** — `CanonOutputSchema`: `characters`, `places`, `eras`, `things` 각각 해당 스키마에서 `status`와 `refs`를 뺀 형태 + `design`은 포함(제안). 모든 필드는 필수(구조화 출력 제약). 빈 값은 `""`/`[]`/`null`.
- [ ] **Step 3: 프롬프트** — system: 역할(성경 본문에서 설정집을 뽑는 편집자), 규칙: ① `facts`에는 본문에 적힌 것만, 항목마다 절 인용 ② 인상착의 같은 `design`은 본문에 없으므로 "제작 제안"이며 고대 근동 배경에 맞게 간결히 ③ 이미 있는 id·이름 목록을 주고 중복 생성 금지, 같은 인물이면 같은 id ④ id는 영문 소문자(예: adam, eve, cain, abel, seth, enoch, noah, shem, ham, japheth, eden, nod, ararat, shinar, ark) ⑤ 한국어로 쓴다. user: 장 번호, 절 번호가 붙은 본문 전체, 기존 항목 목록(kind, id, name, aliases, status).
- [ ] **Step 4: `runCanon(chapter, { dryRun }, log)`** — 본문·설정집을 읽고, dryRun이면 프롬프트만 로그에 출력. 아니면 작성 모델로 호출 → `mergeCanon` → 파일 저장(`writeCanonKind`, `writeProposals`) → 결과 요약(추가 n개, 제안 n개, 경고)을 로그와 반환값으로.
- [ ] **Step 5: CLI와 index** — `npm run pipeline -- canon --chapter 1 [--dry-run]`. `pipeline/src/index.ts`가 `fetchSource, writeBundle, generateImages, createOpenAiDraw, generateSpeech, createOpenAiSpeak, runCanon, readCanon, writeCanonKind, writeProposals, validateCanon, readImageVersions, readRuns, summarizeRuns, sceneFilePath, paths`를 내보낸다. `pipeline/package.json`에 `"exports": { ".": "./src/index.ts" }`를 넣는다.
- [ ] **Step 6: 검사** — 테스트, 타입 검사, `canon --chapter 1 --dry-run`이 프롬프트를 출력한다(API 호출 없음). 실제 호출은 조정자가 한다.
- [ ] **Step 7: 커밋** — `feat: 본문에서 설정집 초안을 뽑는 canon 단계`

---

### Task 4: 관리 서버

**Files:**
- Create: `admin/package.json`, `admin/tsconfig.json`(server용 nodenext), `admin/server/index.ts`, `admin/server/jobs.ts`, `admin/server/status.ts`, `admin/server/routes/{status,canon,proposals,scenes,jobs,runs,git}.ts`
- Modify: 루트 `package.json`(workspaces에 `admin`, 스크립트 `"admin": "npm run dev -w admin"`)
- Test: `admin/test/status.test.ts`, `admin/test/jobs.test.ts`

- [ ] **Step 1: 패키지** — `npm install -w admin hono @hono/node-server` , `-D concurrently tsx vitest typescript@~6.0.2 @types/node`. `admin/package.json` scripts: `dev:server: tsx watch server/index.ts`, `dev:ui: vite`, `dev: concurrently -k "npm:dev:server" "npm:dev:ui"`, `test: vitest run`, `typecheck: tsc --noEmit -p tsconfig.server.json`. 의존성 `pipeline`은 워크스페이스 참조(`"pipeline": "*"`)로 넣고 `import { ... } from 'pipeline'`으로 쓴다.
- [ ] **Step 2: 실패하는 테스트(status)** — `computeChapterStatus(source, sceneFiles, imageCatalog, audioNames)`가 계약의 `ChapterStatus[]`를 만든다(장면 파일 없는 장은 total 0, hasSceneFile false). `summarizeCanon(canon)`이 kind별 상태 수를 센다.
- [ ] **Step 3: 실패하는 테스트(jobs)** — `JobQueue`: `enqueue(stage, options, runner)`는 실행 중이면 오류, `lines`가 쌓이고 구독자(`subscribe(id, cb)`)가 줄과 종료를 받는다, 실패하면 `status: 'failed'`와 `error`. runner는 `(log) => Promise<void>` 형태의 가짜 함수로 시험한다.
- [ ] **Step 4: 구현** — 계약대로 라우트. 작업 실행은 `pipeline`의 함수를 stage별로 매핑하고 `log` 콜백으로 줄을 모은다(`fetchSource`처럼 `log`가 없는 함수는 결과 요약을 한 줄로). SSE는 Hono의 `streamSSE`. `git status --porcelain -b`를 `child_process.execFile`로 읽는다. 서버는 `127.0.0.1:8787`에만 바인딩한다. `.env`는 `pipeline`과 같은 방식으로 `process.loadEnvFile`.
- [ ] **Step 5: 검사** — `npm test -w admin`, `npm run typecheck -w admin`, 서버를 띄우고 `curl http://127.0.0.1:8787/api/status`가 10개 장을 돌려준다. `POST /api/jobs {stage:"build"}` 후 `GET /api/jobs/:id`가 `done`이고 로그에 "묶음 생성 완료"가 있다.
- [ ] **Step 6: 커밋** — `feat: 관리 서버 (상태, 설정집, 제안, 작업, 실행 기록, git)`

---

### Task 5: 관리 화면

**Files:**
- Create: `admin/index.html`, `admin/vite.config.ts`, `admin/tsconfig.json`(ui), `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/api.ts`, `admin/src/types.ts`(계약 타입), `admin/src/pages/{Dashboard,Canon,Scenes,Jobs,Queue,Repo}.tsx`, `admin/src/components/*.tsx`, `admin/src/index.css`

- [ ] **Step 1: 뼈대** — React 19 + Vite(앱과 같은 버전). 라우팅은 해시(`#/`, `#/canon/characters`, `#/scenes/1`, `#/jobs`, `#/queue`, `#/repo`)로 하고 라이브러리를 추가하지 않는다. 왼쪽 세로 메뉴 + 본문. 한국어 UI. 도구다운 밀도(14px, 표와 폼), 앱의 따뜻한 색을 쓰되 상태색(초안 회색, 승인 초록, 확인 필요 주황, 반려 빨강)을 둔다.
- [ ] **Step 2: 대시보드** — `/api/status`를 표로: 행 = 장, 열 = 절 수, 장면(총/초안/검수/확인 필요/승인), 그림(버전별), 음성(있음/전체). 아래에 설정집 kind별 상태 수와 열린 제안 수. 30초마다 새로 고침.
- [ ] **Step 3: 설정집** — kind 탭. 목록(이름, id, 상태, 첫 등장, 쓰이는 장면 수). 상세 패널: 폼으로 편집. 문자열은 input/textarea, 문자열 배열은 줄바꿈으로 구분한 textarea, `relations`·`attire`는 행 추가/삭제 표, 숫자는 number(비우면 null). `facts`와 `design`을 시각적으로 구분하고 `design`에는 "본문 근거 없음 · 제작 결정" 표시. 저장(PUT), 승인, 반려, 새 항목(POST). 저장 실패 시 서버 오류 메시지를 폼 위에 표시. 항목 옆에 열린 proposals: 필드·값·이유·근거를 보여 주고 적용/버리기.
- [ ] **Step 4: 장면(읽기 전용)** — 장 선택 → 장면 카드: 제목, 절 범위, 상태, 그림 유무(버전별), 해설 문단 수, 낱말 수. 카드 펼치면 본문과 글 전체. 편집은 2단계에서 한다.
- [ ] **Step 5: 작업** — 단계 선택, 단계별 옵션 입력(장 번호, 장면 id 여러 개, force, allowDraft, dryRun, limit), 실행 버튼. 실행 중이면 버튼 비활성과 "실행 중" 표시. 로그 패널은 SSE로 줄이 붙고 자동 스크롤. 아래에 최근 작업 이력(단계, 옵션, 상태, 시각) 클릭하면 그 로그. 옆에 `/api/runs` 요약: 최근 7일 호출 수, 토큰, 추정 비용.
- [ ] **Step 6: 검수 대기열** — 세 묶음: `flagged` 장면, 초안 설정집 항목, 열린 proposals. 각 항목은 해당 화면으로 가는 링크.
- [ ] **Step 7: 저장소** — 브랜치와 바뀐 파일 목록. "커밋과 푸시는 터미널에서" 안내.
- [ ] **Step 8: 검사** — `npm run build -w admin`(tsc + vite), 서버와 함께 띄워 브라우저로 각 화면 확인(조정자가 한다). 테스트는 순수 함수(예: 폼 ↔ 항목 변환)가 있으면 vitest로.
- [ ] **Step 9: 커밋** — `feat: 관리 화면 (대시보드, 설정집, 장면, 작업, 대기열, 저장소)`

---

### Task 6: 통합 확인과 문서

- [ ] `npm run admin`으로 서버와 화면이 함께 뜬다. 대시보드가 10개 장을 보여 준다.
- [ ] 작업 화면에서 `build`를 실행하면 로그가 실시간으로 붙고 `done`이 된다.
- [ ] 설정집에서 `eden`을 열어 `design.landscape`를 고치고 저장 → `places.json`이 바뀐다. 시대 하나를 승인 → `eras.json`의 status가 `approved`.
- [ ] `canon --chapter 1 --dry-run`을 작업 화면에서 실행 → 프롬프트가 로그에 보인다.
- [ ] README에 `npm run admin`과 설정집 설명을 더한다. 설계 문서의 6절 진행 단계 1을 "완료"로 표시한다.
- [ ] 커밋 후 `main`에 올린다(관리 도구는 Pages 배포와 무관하다. 워크플로의 `npm test`가 admin 테스트까지 돌므로 통과해야 한다).

## 조정자가 할 일

- Task 1 완료 후 Task 2·3(한 에이전트), Task 4, Task 5를 병렬로 맡긴다.
- 모두 끝나면 Task 6을 직접 하고, 실제 `canon`을 1장부터 10장까지 돌려 결과를 관리 도구에서 본다. 비용은 장당 1달러 미만으로 예상한다.
