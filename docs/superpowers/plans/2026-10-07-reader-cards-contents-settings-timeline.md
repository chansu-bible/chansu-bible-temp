# 읽기 앱에 인물·장소 카드, 목차, 읽기 설정, 연표 붙이기

목업: 사용자가 고른 네 화면(`장면 성경 앱 기능 목업` 캔버스의 1~4번). 설계 원칙은 `docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md`와 `docs/content-bundle.md`를 따른다. 두 갈래로 나눠 동시에 한다. P는 pipeline(묶음에 설정집을 넣음)과 문서, A는 앱이다. 둘은 아래 "공통 계약"만 공유한다. 커밋은 하지 않는다(통합하는 쪽이 한다).

작업 방식: 함수마다 실패하는 시험을 먼저 쓰고 통과시킨다. 한국어 주석, 기존 코드 스타일(2칸 들여쓰기, 세미콜론 없음, 작은따옴표). 앱 화면 글은 기존 앱처럼 "~해요" 체. 끝나면 `npm test`, 각 워크스페이스의 `tsc -b`, `oxlint`가 통과해야 한다.

## 공통 계약: 묶음(genesis.json)에 더하는 것

`schemaVersion`은 1 그대로다(더하기만 하므로 옛 독자는 새 키를 무시하면 된다).

```ts
// pipeline/src/schema.ts, app/src/content/types.ts에 같은 모양
BundleCharacter = {
  id: string; name: string; aliases: string[]; gender: '남' | '여' | '불명'
  firstAppearance: string            // "4:1"
  years: { born: number | null; died: number | null }   // 창조 원년 기준
  relations: { type: string; to: string }[]            // to는 묶음에 있는 인물 id만
  attire: { from: string; description: string }[]
  notes: string                      // 줄바꿈(\n)으로 문단 구분
  sources: string[]
}
BundleEra = {
  id: string; name: string
  range: { from: string; to: string }
  years: { from: number | null; to: number | null }
  description: string; present: string[]; absent: string[]
}
Bundle.characters: BundleCharacter[]   // 승인된(approved) 인물만, 파일 순서
Bundle.eras: BundleEra[]               // 승인된 시대만, 파일 순서
BundleScene.characters: string[]       // 장면의 visual.characters 중 묶음에 있는 인물 id만
```

`places`는 전처럼 승인된 장소만. 관계의 `to`가 승인되지 않은 인물을 가리키면 그 관계는 뺀다.

---

## P. pipeline과 문서

### P1. 스키마와 묶음 만들기

- `pipeline/src/schema.ts`: `BundleCharacterSchema`, `BundleEraSchema` 추가, `BundleSceneSchema`에 `characters: z.array(z.string())`, `BundleSchema`에 `characters`, `eras`.
- `pipeline/src/build/buildBundle.ts`: 서명을 `buildBundle(source, sceneFiles, canon: { characters: Character[]; places: Place[]; eras: Era[] }, audioNames?, catalog?)`로 바꾼다. 승인된 것만 고르고, `toBundleCharacter`, `toBundleEra`, 장면의 `characters` 걸러내기(승인되지 않은 id는 조용히 뺀다. 장소는 지금처럼 없으면 오류).
- `pipeline/src/build/writeBundle.ts`: `readCanon()`에서 characters·places·eras를 넘긴다.
- 시험 `pipeline/test/buildBundle.test.ts`: 승인된 인물·시대만 들어가는지, 승인되지 않은 인물을 가리키는 관계가 빠지는지, 장면 `characters` 걸러내기, 기존 시험 유지(서명 변경 반영).
- `pipeline/src/index.ts` export 확인(`buildBundle` 타입).

### P2. 문서와 실제 묶음

- `docs/content-bundle.md`: `characters`, `eras`, 장면의 `characters`를 표에 더하고, "더한 키라 schemaVersion은 1 그대로이며 옛 독자는 무시한다"고 적는다. 인물 카드·연표가 이 데이터를 쓴다고 한 줄.
- `npm run pipeline -- build`를 돌려 `app/public/content/genesis.json`에 characters 29개, eras 5개, 4장 장면에 `characters`가 들어가는지 확인한다(출력 요약을 보고서에 적는다).

---

## A. 앱

### A1. 타입과 설정 저장소

- `app/src/content/types.ts`: 위 계약의 `Character`, `Era` 타입과 `Scene.characters: string[]`, `Bundle.characters`, `Bundle.eras`. 기존 테스트 픽스처(`route.test.ts` 등)에 새 필드를 더한다.
- `app/src/reader/settings.ts`:
  ```ts
  export type Settings = { fontScale: 1 | 2 | 3 | 4 | 5; theme: 'auto' | 'light' | 'dark'; speed: 0.8 | 1 | 1.2; placeFlash: boolean }
  export const DEFAULT_SETTINGS: Settings = { fontScale: 3, theme: 'auto', speed: 1, placeFlash: true }
  export function loadSettings(): Settings   // localStorage 'reader-settings', 깨진 값은 기본값
  export function saveSettings(settings: Settings): void
  export const FONT_SCALES = { 1: 0.85, 2: 0.93, 3: 1, 4: 1.1, 5: 1.25 } as const
  ```
  `useSettings()` 훅: 상태와 `update(partial)`; `theme`을 `document.documentElement.dataset.theme`에 쓴다(`auto`면 지운다), `fontScale`을 `.reader`의 CSS 변수 `--verse-scale`로 준다. 시험: 기본값, 저장·복원, 깨진 값.
- `app/src/reader/progress.ts`: `loadReadScenes(): Set<string>`, `saveReadScenes(set)`(localStorage `reader-read-scenes`, 장면 id 배열), `markRead(set, sceneId): Set<string>`(새 Set). ReaderScreen이 `position.verse >= scene.verseEnd`가 될 때 그 장면을 읽음으로 적는다. 시험.

### A2. 본문에서 이름 잇기

- `app/src/reader/names.ts`:
  ```ts
  export type Entity = { kind: 'character' | 'place'; id: string }
  export type VersePart = { text: string; gloss?: Gloss; entity?: Entity }
  // 낱말 풀이(splitByGlosses)가 먼저 자리를 잡고, 남은 글 조각 안에서 인물·장소 이름을 찾는다.
  export function splitVerse(text: string, glosses: Gloss[], chapter: number, characters: Character[], places: Place[]): VersePart[]
  export function linkNames(text: string, chapter: number, characters: Character[], places: Place[]): VersePart[]
  ```
  규칙(모두 시험으로 고정):
  - `name`만 찾는다(별칭은 안 찾는다). 그 장 이전이나 그 장에 처음 나오는 인물만(`firstAppearance`의 장 ≤ chapter). 장소는 모두.
  - 경계: 앞 글자가 한글 음절이 아니어야 하고(문장 처음이거나 공백·문장부호), 뒷 글자는 끝이거나 한글이 아니거나 다음 중 하나여야 한다: 이 가 은 는 을 를 의 과 와 도 만 아 야 라 들 에 에게 에서 으로 로 께. 뒷 글자가 "째"면 안 된다. 그래서 "셋째"(2:14), "함께", "취함을"(3:19)은 잇지 않고 "셋이라", "함과", "그룹들과", "에덴에서"는 잇는다.
  - 같은 이름이 둘이면(에녹, 라멕): 그 장에 처음 나오는 인물이 있으면 그것, 없으면 `firstAppearance`가 chapter 이하인 것 중 가장 늦은 것.
  - 같은 이름이 한 절에 여러 번 나오면 모두 잇는다. 낱말 풀이와 겹치면 낱말 풀이가 이긴다.
- `VersePane`: `splitByGlosses` 대신 `splitVerse`를 쓰고, `entity`가 있는 조각은 `<button class="name-link">`로 그려 `onOpenEntity(entity)`를 부른다. 글꼴 크기는 `--verse-scale`을 따른다. 헤더에 "목차"(목록 아이콘)와 "읽기 설정"(톱니 아이콘) 버튼을 더해 `onOpenContents`, `onOpenSettings`를 부른다. `Icon.tsx`에 `list`, `gear`, `person`, `clock` 같은 필요한 아이콘을 더한다(선 아이콘, 기존 방식).

### A3. 인물·장소 카드 `components/EntityCard.tsx`

아래에서 올라오는 시트(기존 `.sheet` 스타일 재사용, `role="dialog"`, 닫기 버튼 autoFocus, Esc 닫기는 ReaderScreen이 함).
- 인물: 머리에 "인물 · 설정집 검수됨" 표시와 이름, 한 줄 요약은 `notes`의 첫 문장. 칩: "처음 등장 4:1", 성별, 연도(둘 다 있으면 "창조 원년 기준 130년 ~ 1042년, 912세", born만 있으면 "…년에 태어남"). 관계: `type`별로 묶어 이름 버튼(누르면 그 인물 카드로 바뀜). 옷차림(`attire`)이 있으면 "옷차림" 목록(절 인용 포함). "본문이 말하는 것": `notes`를 줄바꿈으로 문단 나눔. 맨 아래 "본문 근거: 4:1-5, …". 이 장면에 나오는 인물이면 "이 장면에 나와요" 표시.
- 장소: 이름, `estimated`면 "(추정)" 칩, `description`, "지도에서 보기" 버튼(`onOpenMap`).
- 카드가 가리키는 인물이 묶음에 없으면 "설정집에 아직 없어요"라고 보여 준다(링크는 애초에 묶음에 있는 것만 만들지만 방어).

### A4. 목차와 연표 `components/ContentsScreen.tsx`

전체 화면 오버레이(`.overlay`), 머리에 닫기 버튼과 제목 "목차", 아래 두 탭 "장면" / "연표"(`role="tablist"`).
- 장면 탭: 장 칩(모든 장, 현재 장 강조, 읽은 장면이 전부면 초록), "4장 · 장면 8개 · 26절", 진도(읽은 장면 n / m)와 막대, 장면 목록: 썸네일(현재 그림 버전의 그림, 없으면 `hueOf` 바탕에 번호), 제목, 절 범위, 장소 칩(장소 이름), 상태("읽음"/"읽는 중"/빈칸). 누르면 `onJump({ chapter, verse: scene.verseStart })` 뒤 닫힌다. 장 칩을 누르면 그 장의 목록을 보여 준다(이동은 장면을 눌렀을 때만).
- 연표 탭 `components/TimelineView.tsx`: `app/src/reader/timeline.ts`의 순수 함수 `timelineLayout(characters, eras, { height })`가 세로 눈금(0, 500, 1000, 1500, 2000년)과 막대(`born`이 있는 인물만, born 순)와 띠(years가 있는 시대: 홍수 1656~1657은 파란 줄)를 픽셀로 바꾼다. `died`가 null이면 점선 막대를 born+120년 길이로 그리고 "데려감" 표시(에녹). 현재 장면의 `characters`에 든 인물은 진한 색, 나머지는 옅은 색. 이름은 아래에 세로쓰기. 막대나 이름을 누르면 인물 카드가 열린다(`onOpenEntity`). 아래 안내: "창조 원년 기준. 5장의 나이를 더해 계산했고 번역·사본에 따라 다를 수 있어요." 시험: 눈금 위치, 막대 top/height, null 처리, 정렬.

### A5. 읽기 설정 `components/SettingsSheet.tsx`

시트: "글" 묶음(글자 크기 슬라이더 1~5와 현재 절로 미리 보기, 어두운 화면: 기기 따름/밝게/어둡게 세그먼트), "낭독" 묶음(속도 느리게 0.8/보통 1/빠르게 1.2, "그림 위 자막" 토글은 기존 `subtitles` 저장소와 같은 값), "그림과 지도" 묶음("장소가 바뀌면 지도 보여 주기" 토글). 맨 아래 "본문은 개역한글(퍼블릭 도메인), 그림은 이 앱에서 만든 것. 설정은 이 기기에만 저장돼요."
- `useNarration(onVerseEnd, rate)`: `audio.playbackRate = rate`를 재생 시와 rate가 바뀔 때 적용.
- ReaderScreen: `settings.placeFlash`가 꺼져 있으면 장소 전환 지도를 열지 않는다. 자막 토글은 ScenePane의 것과 같은 저장소라 둘 중 어디서 바꿔도 맞아야 한다(ScenePane의 자막 상태를 ReaderScreen으로 올려 공유).

### A6. 어두운 화면과 글자 크기 CSS

`app/src/index.css`: 색을 모두 `:root` 변수로 쓰고 있으니 `:root[data-theme="dark"]`와 `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`에 어두운 값(종이 #1d1a17, 표면 #2a2521, 글 #efe9e0, 연한 글 #b8ad9f, 희미한 글 #857b6f, 선 #3a342e, 강조 #d6a56f, 강조 연함 #3d3128)을 둔다. 그림 위 요소와 지도 툴팁도 읽히는지 본다. 절 글꼴: `font-size: calc(17px * var(--verse-scale, 1))`, 자막도 같은 변수 사용. 새 요소(`.name-link`, 카드, 목차 목록, 탭, 연표 막대, 설정 세그먼트·슬라이더)의 스타일을 기존 변수로 만든다. 폰 너비에서 가로 스크롤이 없어야 한다.

### A7. ReaderScreen 묶기

- 오버레이 상태를 `'none' | 'map' | 'sheet' | 'contents' | 'settings' | { kind: 'entity', entity: Entity }`로 넓힌다. 열기·닫기·Esc·포커스 되돌리기는 지금 방식 그대로.
- ScenePane에 설정 버튼은 두지 않는다(헤더의 톱니로 연다). ScenePane의 자막 상태는 ReaderScreen이 들고 내려 준다.
- `markRead`는 position이 바뀔 때마다 검사한다.

### A8. 시험과 검사

- `names.test.ts`, `settings.test.ts`, `progress.test.ts`, `timeline.test.ts`를 더하고 기존 시험을 새 타입에 맞춘다.
- `npm test -w app`, `cd app && npx tsc -b`, `npx oxlint`, `npm run build -w app` 통과. 브라우저 확인은 통합하는 쪽이 한다.

---

## 통합(계획을 합치는 쪽)

1. P의 묶음을 만든 뒤 앱 dev 서버에서: 4장 본문에서 "가인"을 눌러 카드가 뜨는지, 관계의 "아담"을 눌러 카드가 바뀌는지, 2:14 "셋째"와 3:19 "취함을"이 링크가 아닌지, 목차에서 장면을 눌러 이동하는지, 연표가 그려지는지, 설정에서 글자 크기·어두운 화면·속도가 바로 반영되는지, 장소 전환 지도 끄기가 먹는지.
2. 스펙(`2026-10-04` 앱 절)에 네 기능을 적고 커밋, `main`에 푸시(비밀 값 검사 뒤), CI 확인.
