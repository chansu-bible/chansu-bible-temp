# `scenario`·`review-text` 단계 구현 계획 (2단계 앞부분)

설계: `docs/superpowers/specs/2026-10-06-canon-pipeline-admin-design.md` 4절(LLM 파이프라인)과 "검수 항목". 이 계획은 장면을 쓰는 `scenario`와 글을 검수하는 `review-text`를 만든다. `review-facts`(웹 검색)와 관리 화면의 장면 승인 UI는 다음 계획에서 한다.

작업 방식: 함수마다 실패하는 시험을 먼저 쓰고 통과시킨다. 한국어 주석, 기존 코드 스타일(2칸 들여쓰기, 세미콜론 없음, 작은따옴표). LLM 호출은 `pipeline/src/llm/client.ts`의 `createLlm().parse()`만 쓴다(`runCanon.ts`가 본보기). 커밋은 하지 않는다. 끝나면 `npm test`, `npm run typecheck -w admin`, `npm run lint -w admin`, `cd pipeline && npx tsc --noEmit`이 모두 통과해야 한다.

## 공통 계약

```ts
// 장면 스키마 변경 (pipeline/src/schema.ts, admin/src/types.ts에도 반영)
eraId: z.string().nullable().default(null)   // SceneSchema에 추가. 기존 파일에는 없으므로 default(null)

// scenario 출력 (구조화 출력이라 모든 필드 필수, optional 금지)
const ScenarioSceneSchema = z.object({
  verseStart: z.number().int(), verseEnd: z.number().int(),
  title: z.string(),
  explanation: z.array(z.string()),
  history: z.array(z.object({ text: z.string(), basis: z.string(), certainty: z.enum(['확실', '추정', '견해 갈림']), sources: z.array(z.string()) })),
  glossary: z.array(z.object({ verse: z.number().int(), word: z.string(), meaning: z.string() })),
  visual: z.object({ description: z.string(), shot: z.string(), characters: z.array(z.string()) }),
  placeId: z.string().nullable(),
  eraId: z.string().nullable(),
})
export const ScenarioOutputSchema = z.object({ scenes: z.array(ScenarioSceneSchema) })
export const ReviseOutputSchema = z.object({ scene: ScenarioSceneSchema })     // 다시 쓰기: 장면 하나
export const TextVerdictSchema = z.object({ verdict: z.enum(['pass', 'fail']), issues: z.array(z.string()) })
```

CLI: `scenario --chapter N [--force] [--dry-run]`, `review-text --chapter N [--scene id ...] [--dry-run]`.
관리 서버 단계: `scenario` 옵션 `chapter, force, dryRun`(chapter 필수), `review-text` 옵션 `chapter, scenes, dryRun`(chapter 필수).

## A1. 스키마·승인된 설정집

- `SceneSchema`에 `eraId` 추가(위). `pipeline/test/schema.test.ts`에 "eraId가 없으면 null로 읽는다" 시험.
- `pipeline/src/canon/approved.ts`: `approvedCanon(canon: Canon): Canon` — 네 종류 모두 `status === 'approved'`만 남긴다(proposals는 그대로). 시험.
- `admin/src/types.ts`의 `Scene`에 `eraId: string | null`. `admin/test/fixtures.ts`의 `scene()`에 `eraId: null`.

## A2. `pipeline/src/scenario/prompt.ts`

```ts
export type ScenarioPrompt = { system: string; user: string }
// examples: 말투와 형식의 본보기로 넣을 기존 장면(2장 파일에서 두 개). 낱말 풀이는 앞 6개만 넣어 길이를 줄인다.
export function buildScenarioPrompt(chapter: SourceChapter, canon: Canon /* 승인된 것만 */, style: Style, examples: Scene[]): ScenarioPrompt
// 다시 쓰기: 장면 하나와 지적 사항
export function buildRevisePrompt(chapter: SourceChapter, canon: Canon, style: Style, scene: Scene, issues: string[]): ScenarioPrompt
```

system 규칙(이 뜻을 담아 한국어로 쓴다. 문장은 다듬어도 되지만 항목은 빠뜨리지 않는다):

1. 역할: 성경 읽기 앱의 장면 작가. 창세기 한 장을 읽고 장면으로 나눠, 장면마다 제목·해설·낱말 풀이·역사 배경·그림 지시를 쓴다. 독자는 성경을 처음 읽는 한국어 사용자다.
2. 장면 나누기: 보통 4~8개. 족보가 대부분인 장(5장, 10장)은 3~5개. 절 범위는 1절부터 마지막 절까지 빠짐없이, 겹치지 않고 이어진다. 한 장면은 한 사건, 그림 한 장으로 그릴 수 있는 단위다.
3. 제목: 10자 안팎의 명사구.
4. 해설(explanation): 2~4문단, 문단마다 2~4문장, "~해요" 체. 요약이 아니라 읽는 데 도움이 되는 설명(배경, 구절의 뜻, 앞뒤 연결, 반복되는 표현의 의미). 본문에 없는 사건·인물·대사를 지어내지 않는다. 특정 교파의 교리를 단정하지 않고, 해석이 갈리는 곳은 그렇다고 말한다.
5. 낱말 풀이(glossary): 독자가 모를 만한 옛말·한자어·고유명사. `word`는 그 절 본문에 글자 그대로 나오는 표현이어야 한다(띄어쓰기·조사까지 본문 그대로 잘라 쓴다). `meaning`은 한두 문장, 명사형이나 "~다"로 끝낸다. 한 장면에 3~12개.
6. 역사 배경(history): 본문을 이해하는 데 도움이 되는 역사·지리·문화·과학 배경. 있을 때만 쓴다(없으면 []). `text`는 "~해요" 체 2~3문장, `basis`는 무엇에 근거한 말인지, `certainty`는 확실·추정·견해 갈림 중 하나. 수치를 지어내지 않는다. 숫자를 쓰면 확실성을 추정 이하로 두고 basis에 출처 성격을 적는다. `sources`는 확실히 아는 문헌·URL만, 모르면 []. 예: 5장의 900년 넘는 나이는 고대 근동 문헌(수메르 왕 명부)의 긴 재위 기간과 견주어 설명하고 견해가 갈린다고 적는다.
7. 그림 지시(visual.description): 한국어로 보이는 것만 적는다. 그림은 손으로 그린 수채화이고 사람은 작고 멀리, 수풀·그림자·뒷모습으로 가린다. 하나님은 어떤 모습으로도 그리지 않는다. 노출·폭력·피를 그리지 않는다(가인의 살인은 직접 그리지 않고 전이나 후를 그린다). 본문에 없는 것(해·달·별·동물·건물)을 넣지 말고, 헷갈릴 만한 것은 "없다"고 적는다. 설정집 인물에 `design`이 있으면 그 외모를 따르고, 없으면 외모를 자세히 정하지 않는다. `shot`에는 시점·거리·시간대·여백 같은 구도를 장면마다 다르게 적는다. 아래 표현 기준(style.promptRules를 한국어로 풀어 넣음)을 지킨다.
8. 참조 id: `visual.characters`에는 설정집 인물 id만, `placeId`·`eraId`에는 설정집 장소·시대 id만 쓴다. 없으면 null 또는 []. 목록에 없는 id를 만들지 않는다.
9. 모든 필드를 채운다. 비울 때는 "" 또는 [].

user에는: 장 번호, 절 번호가 붙은 본문 전체, 승인된 설정집 요약(인물: id·이름·별칭·성별·관계·옷차림·메모 앞 300자·design; 장소: id·이름·설명; 시대: id·이름·절 범위·있는 것·없는 것; 물건: id·이름·설명), 표현 기준(`style.promptRules`), 본보기 장면 JSON(examples).

## A3. `pipeline/src/scenario/assemble.ts`

```ts
export type AssembleResult = { scenes: Scene[]; warnings: string[]; problems: string[] }
// 출력 장면을 저장할 Scene으로 바꾼다. id는 genesis-CC-NN(순서대로), chapter, commentary null, image null,
// review { status 'draft', text null, facts null, image null, attempts 0 }.
// - glossary: 절이 범위 밖이거나 낱말이 그 절 본문에 없으면 그 낱말을 빼고 warnings에 적는다.
// - visual.characters: 승인된 인물 id가 아니면 빼고 warning. placeId·eraId: 승인된 id가 아니면 null로 하고 warning.
// - visual.shot이 ""이면 필드를 뺀다.
// - 절 범위 문제(findCoverageProblems, pipeline/src/scenes/coverage.ts)는 problems에 넣는다(고쳐 쓰게 하려고 따로 둔다).
export function assembleScenes(chapter: SourceChapter, output: ScenarioOutput, canon: Canon /* 승인된 것만 */): AssembleResult
// 다시 쓴 장면 하나를 기존 장면 자리에 맞춘다. id·image·review는 기존 값을 두고 attempts는 그대로(호출하는 쪽이 올린다).
export function assembleRevision(chapter: SourceChapter, before: Scene, revised: ScenarioScene, canon: Canon): { scene: Scene; warnings: string[] }
```

시험 `pipeline/test/scenarioAssemble.test.ts`: id 부여, 기본값, 낱말 걸러내기, 모르는 id 걸러내기, 범위 문제 보고, 다시 쓰기에서 id·image 유지.

## A4. `pipeline/src/scenario/runScenario.ts`

```ts
export type ScenarioRunOptions = { dryRun?: boolean; force?: boolean; llm?: Llm; storyBibleDir?: string; sourceFile?: string; scenesDir?: string; styleFile?: string; examplesFile?: string }
export type ScenarioRunResult = { chapter: number; dryRun: boolean; prompt: ScenarioPrompt; scenes: Scene[]; warnings: string[] }
export async function runScenario(chapter: number, options?: ScenarioRunOptions, log?: (line: string) => void): Promise<ScenarioRunResult>
```

- 장면 파일이 이미 있고 `force`가 아니면 "이미 N장 장면 파일이 있습니다. 다시 쓰려면 --force" 오류.
- 본보기는 `examplesFile`(기본 `content/scenes/genesis-02.json`)의 1번째·3번째 장면. 쓰려는 장이 2장이면 1장 파일을 쓴다. 없으면 본보기 없이 간다.
- 승인된 설정집만 넘긴다(`approvedCanon`).
- dryRun이면 프롬프트만 출력. 아니면 작성 모델 호출 → `assembleScenes`. `problems`가 있으면 문제 목록을 붙여 한 번 다시 부른다(user 끝에 "## 고칠 것" 절). 그래도 problems가 있으면 오류.
- `writeSceneFile`로 저장. 로그: 장면 수, 장면마다 "id 제목 (절 범위) 낱말 n 역사 n", 경고.
- 시험 `pipeline/test/runScenario.test.ts`: 가짜 llm으로 dry-run, 저장, force 없이 덮어쓰기 거부, 범위 문제 때 두 번째 호출.

## A5. `pipeline/src/review/prompt.ts`와 `pipeline/src/review/reviewText.ts`

```ts
export function buildReviewTextPrompt(chapter: SourceChapter, canon: Canon, style: Style, scene: Scene): ScenarioPrompt
export type ReviewTextOptions = { dryRun?: boolean; sceneIds?: string[]; reviewer?: Llm; writer?: Llm; maxAttempts?: number /* 기본 2 */; storyBibleDir?; sourceFile?; scenesDir?; styleFile? }
export type ReviewTextResult = { chapter: number; dryRun: boolean; reviewed: string[]; flagged: string[]; skipped: string[]; warnings: string[] }
export async function runReviewText(chapter: number, options?: ReviewTextOptions, log?): Promise<ReviewTextResult>
```

검수 system 규칙(설계의 "검수 항목"): 본문에 없는 사건·인물·대사를 지어냈는가; 해설이 요약에 그치는가; 특정 교파 교리를 단정하는가; 낱말 풀이의 뜻이 틀렸는가; 역사 배경이 사실과 다르거나 확실성 표시가 과한가; 그림 묘사가 설정집(인상착의, 시대의 있는 것/없는 것, 옷차림)과 맞는가; 표현 기준(하나님을 사람 모습으로 그리지 않음, 노출·폭력 없음, 본문에 없는 것 넣지 않음)을 지키는가; "~해요" 체가 유지되는가. 사소한 문체 차이는 지적하지 않는다. `issues`는 절 번호를 붙여 구체적으로, 고칠 수 있게 쓴다. 통과면 `issues`는 [].

흐름(장면마다):
1. 코드 검사: 절 범위가 장면 파일 전체로 맞는지(`findCoverageProblems`), 낱말이 본문에 있는지, 참조 id가 승인된 설정집에 있는지. 문제가 있으면 LLM을 부르지 않고 그 문제들을 `issues`로 삼아 바로 fail 처리한다.
2. 검수 모델(`reviewerModel()`) 호출 → verdict.
3. pass: `review.status = 'reviewed'`, `review.text = verdict`.
4. fail: `attempts < maxAttempts`면 작성 모델에 `buildRevisePrompt`로 다시 쓰게 하고(`assembleRevision`, `attempts += 1`) 1~2를 반복. 넘으면 `status = 'flagged'`, `review.text`에 마지막 verdict.
5. 장면 하나가 끝날 때마다 `writeSceneFile`로 저장한다(중간에 멈춰도 이어서 할 수 있게).
6. `sceneIds`가 있으면 그 장면만. 이미 `approved`인 장면은 건너뛰고 `skipped`에 넣는다. `reviewed`·`flagged`·`draft`는 다시 검수한다.
7. dryRun: 첫 장면의 검수 프롬프트만 출력하고 모델을 부르지 않는다.

시험 `pipeline/test/reviewText.test.ts`: 가짜 reviewer·writer로 pass→reviewed, fail→revise→pass(attempts 1), 두 번 fail→flagged, 코드 검사 실패는 모델을 부르지 않음, approved 건너뜀, 장면마다 저장.

## A6. CLI·공개 함수·관리 서버

- `pipeline/src/cli.ts`: `scenario`, `review-text` 명령. `--force`는 이미 있다.
- `pipeline/src/index.ts`: `runScenario, runReviewText, approvedCanon, ScenarioOutputSchema, buildScenarioPrompt, buildReviewTextPrompt` 등 export.
- `admin/server/jobs.ts`: `STAGES`에 `'scenario', 'review-text'`(순서: source, canon, scenario, review-text, images, tts, build). `admin/server/stages.ts`: 옵션 표와 `needsChapter`, `createRunner` 분기(로그는 CLI와 같은 문장). `admin/test/jobs.test.ts` 또는 `routes.test.ts`에 옵션 검사 시험.
- `admin/src/types.ts` `Stage`·`STAGES`, `admin/src/jobForm.ts` `STAGE_OPTIONS`, `admin/src/labels.ts` `STAGE_LABEL`(`scenario · 장면 쓰기`, `review-text · 글 검수`). `admin/src/logic.test.ts`에 두 단계의 옵션 조립 시험.

## 통합(계획을 합치는 쪽이 한다)

1. 전체 테스트·타입·린트.
2. `npm run pipeline -- scenario --chapter 3 --dry-run`으로 프롬프트를 읽고 이상하면 고친다.
3. 3~5장 `scenario` → `review-text` → 결과를 읽고 고친다 → `images --chapter N` → `build` → 커밋·푸시.
