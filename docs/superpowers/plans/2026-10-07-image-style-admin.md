# 그림 참고 이미지와 프롬프트 관리 구현 계획

설계: `docs/superpowers/specs/2026-10-07-image-style-admin-design.md`. 두 갈래로 나눠 동시에 진행한다. A는 pipeline과 관리 서버, B는 관리 화면이다. 둘은 아래 "공통 계약"만 공유하고 서로의 파일을 건드리지 않는다. 커밋은 하지 않는다(통합하는 쪽이 한다).

작업 방식: 함수마다 실패하는 시험을 먼저 쓰고 통과시킨다. 한국어 주석, 기존 코드 스타일(2칸 들여쓰기, 세미콜론 없음, 작은따옴표)을 따른다. 끝나면 `npm test -w pipeline`, `npm test -w admin`, `npm run typecheck -w admin`, `npm run lint -w admin`이 모두 통과해야 한다.

## 공통 계약

```ts
// 화풍 (pipeline/src/schema.ts, admin/src/types.ts에 같은 모양)
type StyleReference = { file: string; label: string; source: string }
type Style = {
  description: string
  promptPrefix: string
  promptRules: string
  references: StyleReference[]
  referenceInstruction: string
}
type ImageVersion = { id: string; label: string; note: string }

// 참고 파일 이름 규칙. 폴더 구분자가 들어갈 수 없다.
const REFERENCE_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}\.(jpg|jpeg|png|webp)$/
// 버전 id 규칙
const IMAGE_VERSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
// 올리기 크기 한도
const MAX_REFERENCE_BYTES = 15 * 1024 * 1024
```

API (모든 응답 JSON, 오류는 `{ error }`):

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| GET | `/api/style` | | `Style` |
| PUT | `/api/style` | `Style` | `Style` · 400 스키마 위반, 없는 참고 파일 |
| GET | `/api/style/refs/:file` | | 이미지 바이트, `Content-Type` image/jpeg·png·webp · 400 이름 규칙 위반 · 404 |
| POST | `/api/style/refs` | multipart: `file`(File), `label?`, `source?` | 201 `{ style: Style, added: string }` · 400 파일 없음·형식·크기 |
| POST | `/api/style/refs/import` | `{ url: string, label?: string, source?: string }` | 201 `{ style, added }` · 400 http(s) 아님, 그림 아님, 크기, 받기 실패 |
| DELETE | `/api/style/refs/:file` | | `Style` · 404 목록에 없음 |
| GET | `/api/images/versions` | | `ImageVersion[]` |
| POST | `/api/images/versions` | `ImageVersion` | 201 `ImageVersion[]` · 400 규칙 위반·빈 label · 409 중복 id |
| GET | `/api/images/:version/:file` | | 이미지 바이트 · 400 · 404 |
| GET | `/api/scenes/:chapter` | | `{ chapter, verses, scenes, imageVersions: ImageVersion[], images: Record<sceneId, Record<versionId, string>> }` |
| GET | `/api/scenes/:chapter/:id/prompt` | | `{ prompt: string, references: string[] }` · 404 |
| PUT | `/api/scenes/:chapter/:id` | `Scene` | `Scene` · 400 스키마·id·chapter 불일치 · 404 장면 파일/장면 없음 |

`images`는 각 버전 폴더에서 `<sceneId>.<ext>` 파일이 있을 때만 키가 있다. 썸네일 주소는 `/api/images/<versionId>/<file>`, 참고 이미지 주소는 `/api/style/refs/<file>`.

---

## A. pipeline과 관리 서버

### A1. 스키마와 경로

- `pipeline/src/schema.ts`: `StyleReferenceSchema = z.object({ file: z.string().regex(REFERENCE_FILE_PATTERN), label: z.string(), source: z.string() })`, `StyleSchema.references = z.array(StyleReferenceSchema).default([])`, `ImageVersionSchema.id`에 `IMAGE_VERSION_ID_PATTERN`, `label`은 `min(1)`. 두 패턴과 `MAX_REFERENCE_BYTES`를 여기서 export한다.
- `pipeline/src/paths.ts`: `sceneFilePath(chapter, dir = scenesDir)`.
- `pipeline/test/schema.test.ts`에 참고 객체·버전 id 규칙 시험.

### A2. `pipeline/src/images/style.ts`

```ts
export async function readStyle(file = styleFile): Promise<Style>
// 스키마 검증 + 모든 references[].file이 refsDir에 있는지 확인. 없으면 "화풍 참고 이미지가 없습니다: <file>" 오류.
export async function writeStyle(style: Style, options?: { file?: string; refsDir?: string }): Promise<void>
export function referencePaths(style: Style, dir = refsDir): string[]
export function mimeType(file: string): 'image/jpeg' | 'image/png' | 'image/webp'  // 모르는 확장자는 오류
```

- 쓰기는 `${JSON.stringify(style, null, 2)}\n`.
- `generateImages.ts`는 `readStyle`과 `referencePaths`를 쓰고, 장면 저장은 A4의 `writeSceneFile`로 바꾼다. 동작은 그대로(시험 `images.test.ts` 통과 유지, `references`를 객체로 바꿈).
- `openaiDraw.ts`: `toFile(..., { type: mimeType(file) })`.
- 시험 `pipeline/test/style.test.ts`: 임시 폴더로 읽기·쓰기·없는 파일 거부·`referencePaths`·`mimeType`.

### A3. `pipeline/src/images/versions.ts`

```ts
export async function writeImageVersions(versions: ImageVersion[], file = imageVersionsFile): Promise<void> // 스키마 + id 중복 거부
export async function addImageVersion(version: ImageVersion, options?: { file?: string; imagesDir?: string }): Promise<ImageVersion[]> // 중복이면 오류, 폴더 생성
```

시험: 중복 id 거부, 폴더가 생기는지, 목록이 끝에 붙는지.

### A4. `pipeline/src/scenes/files.ts`

```ts
export async function readSceneFile(chapter: number, dir = scenesDir): Promise<SceneFile | null>
// SceneFileSchema 검증, 모든 scene.chapter === sceneFile.chapter, id 중복 없음. 아니면 오류.
export async function writeSceneFile(sceneFile: SceneFile, dir = scenesDir): Promise<void>
```

시험 `pipeline/test/scenesFiles.test.ts`.

### A5. 공개 함수와 데이터 이전

- `pipeline/src/index.ts`에 export: `readStyle, writeStyle, referencePaths, mimeType`, `buildImagePrompt`, `detectImageExtension`, `writeImageVersions, addImageVersion, versionDir`, `readSceneFile, writeSceneFile`.
- `content/story-bible/style.json`의 `references`를 객체로 바꾼다. 이름표는 `SOURCES.md`의 "잘라 낸 부분", 출처는 "John Singer Sargent, Olive Trees, Corfu (1909). Art Institute of Chicago, Olivia Shaler Swan Memorial Collection. 퍼블릭 도메인. https://www.artic.edu/artworks/14792". `SOURCES.md`는 지운다.
- `README.md` 54행: 출처는 `style.json`의 `references[].source`에 적는다고 고치고, 관리 도구 "그림" 화면에서 화풍·참고 이미지·버전을 관리한다는 한 줄을 더한다. `docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md` 115행의 `SOURCES.md` 언급도 고친다.
- `npm run pipeline -- images --chapter 1 --dry-run`이 전과 같은 프롬프트를 내는지 확인한다.

### A6. 관리 서버

- `admin/server/context.ts`의 `AppContext`에 선택 필드: `styleFile?`, `refsDir?`, `imagesDir?`, `imageVersionsFile?`, `scenesDir?`, `sourceFile?`, `fetchImpl?: typeof fetch`. 비우면 pipeline `paths` 기본값·전역 `fetch`.
- `admin/server/content.ts`: `readSource(file = paths.sourceFile)`, `readSceneFile(chapter, dir = paths.scenesDir)`(pipeline의 것을 쓰거나 감싼다). 기존 호출은 기본값으로 그대로 동작.
- `admin/server/files.ts`: `sanitizeReferenceName(original: string, ext: 'jpg'|'png'|'webp'): string`(소문자, `[^a-z0-9._-]`→`-`, 연속 `-` 하나로, 비면 `ref-<YYYYMMDD-HHMMSS>`, 확장자는 ext로), `uniqueName(dir, name)`(있으면 `-2`, `-3`), `serveImage(c, filePath)`(Content-Type은 `mimeType`, 없으면 404).
- `admin/server/routes/style.ts`: 표의 `/api/style*`. 올리기는 `await c.req.parseBody()`에서 `file`이 `File`인지 확인하고 `new Uint8Array(await file.arrayBuffer())`, 크기 검사, `detectImageExtension`으로 형식 판별(실패 400). 가져오기는 `ctx.fetchImpl ?? fetch`로 받고 `console.log`에 주소를 남긴다. `label`·`source`는 문자열, 비면 `''`(가져오기의 `source`가 비면 url).
- `admin/server/routes/images.ts`: `/api/images/versions`(GET·POST)와 `/api/images/:version/:file`. 버전은 목록에 있어야 하고 파일은 `REFERENCE_FILE_PATTERN`을 따라야 한다.
- `admin/server/routes/scenes.ts`: 기존 GET에 `imageVersions`·`images`를 더하고(버전 폴더를 읽어 `<sceneId>.` 로 시작하는 파일을 찾는다), `/:chapter/:id/prompt`(`readStyle` + `buildImagePrompt`), `PUT /:chapter/:id`(`SceneSchema.parse` → 400은 `errorMessage`, id·chapter 불일치 400, 없는 장면 404, `writeSceneFile`).
- `admin/server/app.ts`에 라우트 연결.
- 시험 `admin/test/style.test.ts`, `admin/test/images.test.ts`, `admin/test/scenes.test.ts`: 임시 폴더에 작은 PNG(89 50 4E 47 0D 0A 1A 0A + 아무 바이트)와 JPEG(FF D8 FF E0 …)를 만들어 올리기·내보내기·삭제·가져오기(가짜 fetch가 PNG 바이트를 돌려줌, 텍스트를 돌려주면 400, http 아닌 주소 400)·버전 추가(400·409)·장면 프롬프트·장면 저장(400·404)을 확인한다.

---

## B. 관리 화면

### B1. 타입·API·라우트

- `admin/src/types.ts`: `StyleReference`, `Style`, `PromptResponse = { prompt: string; references: string[] }`, `ScenesResponse`에 `imageVersions: ImageVersion[]`, `images: Record<string, Record<string, string>>`.
- `admin/src/api.ts`: `request`가 `FormData` 본문이면 `Content-Type`을 붙이지 않게 고친다. 추가: `style()`, `styleSave(style)`, `styleUpload(file: File, label: string, source: string)`, `styleImport(body)`, `styleDeleteRef(file)`, `imageVersions()`, `imageVersionCreate(v)`, `scenePrompt(chapter, id)`, `sceneSave(chapter, scene)`, 주소 함수 `refUrl(file)`, `imageUrl(version, file)`.
- `admin/src/ids.ts`: `splitIds(text: string): string[]`(쉼표·공백·줄바꿈으로 나누고 빈 것 제거). `jobForm.ts`의 같은 로직을 이것으로 바꾼다.
- `admin/src/route.ts`: `{ page: 'images' }`, `#/images`. `App.tsx` 메뉴에 "그림"(장면 다음, 작업 앞)과 `Page` 분기.
- `admin/src/logic.test.ts`: `parseRoute('#/images')`, `splitIds`.

### B2. 그림 화면 `admin/src/pages/Images.tsx`

`useLoad(api.style)`, `useLoad(api.status)`(버전별 그림 수 = `chapters[].images[versionId]` 합).

- `components/StyleForm.tsx`: 네 `TextAreaField`(설명·앞말·표현 기준·참고 지시문) + 참고 이미지 격자 안의 이름표·출처 입력. 한 폼 상태 `Style`을 들고 `dirty`면 저장 버튼 활성. 저장 성공 시 "저장했어요", 실패 시 `form-error`. 조립 순서 안내: "참고 지시문(참고 이미지가 있을 때) → 앞말 → 구도 → 장면 묘사 → 표현 기준".
- `components/ReferenceGrid.tsx`: 참고 이미지마다 `<img src={refUrl(file)} alt={label || file}>`, 파일 이름 `<code>`, 이름표·출처 `TextField`, 삭제 버튼(`window.confirm('…을 지울까요? 파일도 지워져요.')` 뒤 `api.styleDeleteRef` → 부모가 폼을 서버 값으로 갈아끼움. 저장하지 않은 변경이 있으면 삭제 버튼을 끄고 이유를 `title`로). 아래에 올리기(`<input type="file" accept="image/jpeg,image/png,image/webp">` + 이름표·출처 + 버튼)와 주소로 가져오기(주소·이름표·출처 + 버튼). 성공하면 폼을 서버가 돌려준 `style`로 바꾼다(저장하지 않은 변경이 있으면 먼저 저장하라고 안내하고 막는다). 안내문: "퍼블릭 도메인이나 사용 허가가 있는 그림만 올리세요. 출처를 적어 두세요."
- `components/VersionList.tsx`: `DataTable`로 id·이름·메모·그림 수. 마지막 행에 "지금 그리는 버전" 표시. 아래 새 버전 폼(id·이름·메모, id 규칙 안내) → `api.imageVersionCreate` → 목록 다시 읽기.

### B3. 장면 화면

`admin/src/pages/Scenes.tsx`의 "그림 지시" 구역을 `components/SceneVisualEditor.tsx`로 뺀다.

- 입력: `scene`, `chapter`, `images: Record<versionId, string>`, `imageVersions`, `onSaved(scene)`.
- 묘사(`TextAreaField`), 구도(`TextField`), 인물 id(`TextField`, 쉼표 구분 → `splitIds`). 저장은 `api.sceneSave(chapter, { ...scene, visual: {...} })`(`shot`이 비면 필드를 뺀다). 인물·장소 링크는 유지.
- "최종 프롬프트 보기" 토글: 누르면 `api.scenePrompt`로 받아 `<pre className="prompt">`에 보여 주고 참고 파일 목록을 아래 적는다. 저장하지 않은 변경이 있으면 "저장한 내용 기준"이라고 적는다.
- "이 장면만 다시 그리기": `api.startJob('images', { chapter, scenes: [scene.id], allowDraft: true })`. 성공하면 "작업을 시작했어요 → 작업 로그 보기(`#/jobs`)" 링크, 409면 서버 문장을 그대로 보여 준다.
- 썸네일 한 줄(`.thumb-row`): 버전마다 `<figure>`에 `<img src={imageUrl(v, file)}>` 또는 "없음", `<figcaption>`에 버전 이름. 그림은 120px 정사각으로 `object-fit: cover`.
- 카드 머리의 "그림 있음/없음"은 유지.

### B4. 스타일

`admin/src/index.css`에 `.ref-grid`(auto-fill 180px), `.ref-card`(썸네일 160px 정사각 `object-fit: cover`, 아래 입력), `.thumb-row`, `.thumb`, `.prompt`(`white-space: pre-wrap`, 작은 글씨, 연한 배경), `.uploader`(폼 한 줄). 기존 색·간격 변수를 쓴다.

---

## 통합 (계획을 합치는 쪽)

1. A·B가 끝나면 `npm test`, `npm run typecheck -w admin`, `npm run lint -w admin`, `npm run pipeline -- images --chapter 1 --dry-run`.
2. 관리 도구를 띄워 브라우저로 확인: 그림 화면에서 참고 이미지 3장과 출처가 보이고, 이름표를 고쳐 저장되고, 작은 PNG를 올렸다 지워지고, 새 버전을 만들면 폴더가 생기고, 장면 화면에서 최종 프롬프트가 CLI dry-run과 같고, 묘사를 고쳐 저장되고, 썸네일 세 버전이 보인다.
3. 설계 문서의 상태를 적고 커밋, `main`에 푸시(푸시 전 diff에 비밀 값 검사).
