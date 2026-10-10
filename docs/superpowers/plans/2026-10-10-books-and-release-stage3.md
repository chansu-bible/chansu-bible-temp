# 여러 책과 장 공개 3단계: 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱이 앱에 넣어 둔 묶음 대신 공개 목록과 꾸러미를 받아 읽고, 66권 서재에서 공개된 장만 열며, 꾸러미·그림·낭독을 내려받아 저장 공간을 관리하게 한다. 공개, 다시 공개, 공개 취소가 앱 업데이트 없이 반영된다.

**Architecture:** `reader-core`가 공개 목록·꾸러미·공용 설정집으로 지금 화면들이 쓰는 `Bundle`(책 하나)을 만들어 준다(`bundleFromPacks`). 앱의 콘텐츠 층(`mobile/src/content/`)은 목록을 받고 기기에 두며, 파일을 내용 해시 이름 그대로 앱 문서 폴더에 받아 둔다(웹은 서버에서 바로 읽는다). 화면은 지금처럼 묶음을 받되, 묶음은 "지금 책의 받아 둔 장"으로 만든 것이고, 장 고르기·서재·잠금은 목록의 장 상태를 본다. 기록은 읽던 곳과 계획에 책을 넣는다.

**Tech Stack:** Expo SDK 57(React Native 0.86, expo-router, expo-file-system, expo-sqlite, expo-network), TypeScript, reader-core, vitest(reader-core)

**설계:** `docs/superpowers/specs/2026-10-09-books-and-release-design.md` 3절 3단계, 8절, 10절. 목업(서재, 장 고르기, 잠긴 장, 처음 열 때 받기, 저장 공간, 미공개 미리 보기)의 글과 배치를 따른다.

**앞 단계에서 쓰는 것:** 2단계의 `reader-core` `publish.ts`(`Catalog`, `ChapterPack`, `CanonFile`, `LexiconFile`, `validateCatalog`, `validatePack`, `isPublished`), `publish/`(꾸러미, 미디어, 목록, `preview/`), 서버 `/content`, 1단계 Task 7의 "그 책까지의 설정집" 규칙.

**설계에서 정하거나 바꾸는 것:**
- 1단계 Task 7에서 파이프라인에 둔 "책 묶음에 넣는 설정집과 인용 모양" 규칙을 `reader-core`로 옮겨(`canonForBook`) 파이프라인과 앱이 함께 쓴다. 앱은 공용 설정집(책이 붙은 인용)에서 지금 책의 묶음용 설정집을 만든다.
- 앱의 "지금 책"은 읽던 곳의 책이다. 읽던 곳 기록 `{ book, chapter, verse }`, 책이 없는 옛 기록은 창세기다(다음 저장 때 책을 넣는다). 계획 기록에도 책을 넣는다.
- 받은 파일은 `expo-file-system`의 문서 폴더 `content/` 아래 목록의 경로 그대로 둔다(`content/packs/genesis/4.<해시>.json`). 이름에 해시가 있으므로 이미 있는 파일은 다시 받지 않는다. 목록에 없는 파일은 목록을 받은 뒤 지운다(공개 취소, 다시 공개 전의 옛 파일).
- 꾸러미와 공용 설정집·사전은 목록을 받으면 저절로 받는다(작다). 그림은 장을 열 때(설정에 따라 다음 장도), 낭독은 재생할 때 받는다. 받는 동안 낭독은 서버 주소로 바로 재생한다. "와이파이에서만 받기"가 켜져 있으면 모바일 데이터로는 그림·낭독을 받지 않는다(글은 받는다). 웹은 받지 않고 서버 주소로 읽는다.
- 콘텐츠 주소는 `EXPO_PUBLIC_CONTENT_URL`(기본 `http://localhost:8790/content`), 미리 보기는 `EXPO_PUBLIC_CONTENT_PREVIEW=1`(목록을 `preview/catalog.json`에서 받는다).
- 시작 꾸러미: 빌드할 때 `publish/`의 공개 목록과 공개된 창세기 앞 장들의 꾸러미·그림·낭독(합계 30 MB까지)을 앱에 넣는다. 앱은 처음 켤 때 시작 꾸러미를 문서 폴더로 옮겨 쓰고, 더 새 목록을 받으면 바꾼다. 공개된 장이 없으면 시작 꾸러미도 비어 있다(그때 앱은 목록을 받아야 열린다).
- 앱의 질문하기는 지금 책을 함께 보낸다.

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `packages/reader-core/src/canonForBook.ts` (새) | 공용 설정집 → 그 책 묶음용 설정집(그 책까지 나온 항목, 같은 책 인용은 책 없이, 앞 책은 책 이름, 뒤 책은 뺌, 시대 끝 맞춤). 파이프라인 `buildBundle`도 쓴다 |
| `packages/reader-core/src/packs.ts` (새) | `bundleFromPacks`, `chapterStates`, `readableRange`, `nextReadable` |
| `packages/reader-core/src/position.ts`, `plan.ts` | 책이 든 읽던 곳·계획, 옛 기록 읽기 |
| `mobile/src/content/config.ts` (새) | 콘텐츠 주소, 미리 보기 |
| `mobile/src/content/files.ts`, `files.web.ts` (새) | 받은 파일 저장소(문서 폴더) / 웹은 서버 주소 |
| `mobile/src/content/catalog.ts` (새) | 목록 받기(ETag), 기기에 두기, 시작 꾸러미 |
| `mobile/src/content/ContentContext.tsx` (새) | 목록·설정집·사전·꾸러미 상태와 받기, 지금 책의 묶음 |
| `mobile/src/content/bundle.ts`, `BundleGate.tsx` | 앱에 넣은 묶음 대신 ContentContext의 지금 책 묶음 |
| `mobile/src/library/*` | 66권 서재와 읽는 책 카드 |
| `mobile/src/reader/ChapterPicker.tsx`, `LockedSheet.tsx` (새), `ReaderScreen.tsx`, `VersePane.tsx`, `ScenePane.tsx` | 장 상태, 잠긴 장, 처음 열 때 받기, 책 바꾸기 |
| `mobile/src/settings/StorageScreen.tsx` (새), `mobile/src/app/storage.tsx` (새) | 저장 공간 |
| `mobile/src/narration/*`, `mobile/src/player/*` | 낭독 주소(받아 둔 파일 또는 서버) |
| `mobile/src/data/reading.ts` | 읽던 곳·계획의 책 |
| `mobile/scripts/sync-starter.mjs` (새), `mobile/package.json` | 시작 꾸러미 |
| `README.md`, `docs/content-publish.md`, 설계 문서 | 앱 실행(콘텐츠 주소, 미리 보기), 진행 |

---

### Task 1: 책 묶음 규칙과 꾸러미로 묶음 만들기(reader-core)

**Files:**
- Create: `packages/reader-core/src/canonForBook.ts`, `packages/reader-core/src/packs.ts`와 시험
- Modify: `packages/reader-core/src/index.ts`, `pipeline/src/build/buildBundle.ts`(옮긴 규칙을 쓴다)

- [ ] **Step 0: 앞 책 같은 이름 인물** — 1단계의 묶음 규칙은 앞 책 인용을 책 이름 모양("창세기 5:21")으로 써서 `reader-core`가 0장(이미 만남)으로 읽는다. 그래서 나중 책 묶음에서는 같은 이름의 앞 책 인물(셋 계열 에녹과 가인 계열 에녹)을 처음 나온 곳으로 가르지 못하고 첫 후보를 고른다(1단계 Task 7 검토, 알려진 한계로 시험이 있다). 앱이 공용 설정집을 쓰는 이 단계에서는, 묶음의 인물에 책이 붙은 첫 등장(`genesis 5:21`)을 함께 넘기고 `names.ts`·`people.ts`·`genealogy.ts`가 `compareRefs`로 책 순서까지 보아 고르게 바꾼다. 그 시험을 바른 결과로 뒤집는다.
- [ ] **Step 1: `canonForBook(canon, book, lastVerse)`** — 1단계 Task 7의 규칙(파이프라인 `build/canonForBook.ts`와 `canon/citations.ts`)을 그대로 옮긴다. 입력은 승인된 항목만 든 공용 설정집(`CanonFile`, 인용은 책이 붙은 모양), 출력은 묶음용 `places`, `characters`, `eras`, `things`. 파이프라인의 `buildBundle`은 이 함수를 쓰도록 바꾸고, `npm run pipeline -- build` 결과가 바이트까지 같은지 본다.
- [ ] **Step 2: `bundleFromPacks({ catalog, book, packs, canon, lexicon })`** — 목록에 있는 그 책의 장 가운데 꾸러미가 있는 장으로 `Bundle`을 만든다. `book`(한국어 이름), `bookId`, `translation`(목록), 설정집(`canonForBook`, 마지막 절은 받은 장 가운데 마지막 장의 마지막 절), `imageVersions`·`defaultImageVersion`(목록), `lexicon`(공용 사전에서 그 묶음의 원어에 나오는 번호만, `count`는 그 묶음에서 센다), `sources`(목록), `chapters`(꾸러미의 장, 장 번호 순서). 그림·낭독 경로는 꾸러미의 `media/` 경로 그대로다(앱이 주소로 바꾼다).
- [ ] **Step 3: 장 상태** — `chapterStates(catalog, book, has: (path) => boolean)`: 그 책의 1장부터 마지막 장까지 `downloaded`(꾸러미와 그 장의 그림이 모두 있음), `published`(목록에 있으나 다 받지 않음), `preview`(미리 보기 장), `locked`. `readableRange(states)`는 "창세기 1~4장" 같은 안내 글에 쓸 연속 범위들, `nextReadable(states, chapter)`/`lastReadable(states)`.
- [ ] **Step 4: 시험** — 고정값 목록·꾸러미(창세기 1, 2, 4장 공개, 3장 미리 보기)로 묶음의 장, 설정집, 사전 횟수, 장 상태, 안내 범위(1~2장, 4장), 공개 취소된 장이 빠지는지.

Run: `npm test -w reader-core && npm run typecheck -w reader-core && npm test -w pipeline`

- [ ] **Step 5: 커밋**

```bash
git add packages/reader-core pipeline
git commit -m "feat(core): 공개 목록과 꾸러미로 책 묶음을 만든다(설정집 규칙을 reader-core로 옮김)"
```

---

### Task 2: 읽던 곳과 계획에 책

**Files:** `packages/reader-core/src/{position,plan,readingPosition}.ts`와 시험, `mobile/src/data/reading.ts`, 읽던 곳을 쓰는 화면

- [ ] **Step 1:** `Position`에 `book: BookId`를 더한다. `parsePosition`은 책이 없거나 모르는 책이면 `'genesis'`로 읽는다. 계획 기록에 `book`(없으면 `'genesis'`).
- [ ] **Step 2:** 앱이 읽던 곳을 저장할 때 책을 넣는다. 이어 읽기, 위젯, 홈의 계획은 기록의 책을 쓴다.
- [ ] **Step 3: 시험** — 옛 기록(`{chapter, verse}`)이 창세기로 읽힌다, 저장하면 책이 들어간다, 동기화 기록의 모양이 바뀌어도 서버 컬렉션은 그대로다.

Run: `npm test -w reader-core && npm run typecheck -w mobile`

```bash
git add packages/reader-core mobile
git commit -m "feat: 읽던 곳과 계획 기록에 책을 넣는다(책 없는 옛 기록은 창세기)"
```

---

### Task 3: 콘텐츠 층(목록, 파일, ContentContext)

**Files:** `mobile/src/content/{config,files,files.web,catalog,ContentContext}.ts(x)`, `mobile/src/content/{bundle,BundleGate}.ts(x)`, `mobile/src/app/_layout.tsx`, `mobile/package.json`(`expo-network`)

- [ ] **Step 1: 설정과 파일 저장소** — `config.ts`(주소, 미리 보기). `files.ts`(네이티브): `has(path)`, `uri(path)`, `download(path, { onProgress })`(임시 이름으로 받고 끝나면 옮긴다), `remove(paths)`, `sizeOf(paths)`, `list()`. `files.web.ts`: 받지 않고 `uri(path)`는 서버 주소, `has`는 늘 참(웹은 서버에서 바로 읽는다).
- [ ] **Step 2: 목록** — `loadCatalog()`: 기기에 둔 마지막 목록(문서 폴더의 `catalog.json` 또는 웹은 kv) → 서버에서 `If-None-Match`로 받기 → 바뀌었으면 검사(`validateCatalog`)하고 저장. 연결이 안 되면 마지막 목록. 목록 판이 바뀌면 공용 설정집·사전과 꾸러미를 받고, 목록에 없는 받은 파일을 지운다.
- [ ] **Step 3: ContentContext** — 상태: `catalog`, `canon`, `lexicon`, 책마다 받은 꾸러미, `status`(`loading`·`ready`·`offline`·`empty`·`error`). 함수: `bundleFor(book)`(Task 1의 `bundleFromPacks`, 꾸러미가 바뀔 때만 다시 만든다), `chapterStates(book)`, `ensureChapter(book, chapter, onProgress)`(꾸러미와 그 장 그림 받기), `mediaUri(path)`, `downloadBook(book)`, `removeBook(book)`, `usage()`. 앱을 켤 때와 다시 앞으로 올 때 목록을 받는다(`AppState`).
- [ ] **Step 4: 지금 책 묶음** — `BundleGate`는 ContentContext의 지금 책(읽던 곳의 책) 묶음을 넘긴다. 받은 장이 없으면 상태에 맞는 안내(목록을 받는 중, 연결 없음, 공개된 장 없음)를 보인다. 그림·낭독 경로는 `mediaUri`로 바꾼다(지금 `imageSource`, `audioSource`를 쓰는 곳). 앱에 넣던 묶음과 `assets.generated.ts`는 다음 Task 9(시작 꾸러미)에서 지운다. 이 작업 동안은 둘 다 둔다.
- [ ] **Step 5: 확인** — 서버(`npm run server`)와 2단계의 `publish/`(미리 보기)로 Expo 웹을 띄워(`EXPO_PUBLIC_CONTENT_PREVIEW=1`) 창세기 1~5장이 지금처럼 읽히는지 브라우저에서 본다.

Run: `npm run typecheck -w mobile && npm test -w reader-core`

```bash
git add mobile package-lock.json
git commit -m "feat(mobile): 공개 목록을 받고 꾸러미로 지금 책을 읽는 콘텐츠 층"
```

---

### Task 4: 장 고르기, 잠긴 장, 처음 열 때 받기

**Files:** `mobile/src/reader/{ChapterPicker,LockedSheet,ReaderScreen,VersePane,ScenePane}.tsx`

- [ ] **Step 1: 장 고르기(목업 "장 고르기")** — 책 이름과 "50장 중 4장 공개 · 3장 받아 둠", 범례(받아 둠 ✓, 공개됨·열면 받아요 ↓, 준비 중 🔒), 다섯 줄 격자(받아 둠: 진한 테두리와 ✓, 공개됨: 점선 테두리와 ↓, 준비 중: 흐린 칸과 자물쇠), 아래 "남은 공개 장 받아 두기 · N MB"(받을 것이 있을 때), "준비 중인 장은 공개되면 이 화면에서 바로 열려요." 다 읽은 장 표시는 지금처럼 둔다.
- [ ] **Step 2: 잠긴 장(목업 "잠긴 장을 눌렀을 때")** — 시트: 자물쇠, "창세기 5장은 준비 중이에요", "장면 글과 그림, 낭독을 만들고 검수하고 있어요. 공개되면 이 장이 바로 열려요.", "지금 읽을 수 있는 곳: 창세기 1~4장"(`readableRange`), 단추 "닫기"와 "4장 이어 읽기"(`nextReadable` 또는 `lastReadable`). 다음 장 단추, 목차, 검색 결과, 이어 읽기에서 잠긴 장으로 가려 하면 같은 시트.
- [ ] **Step 3: 처음 열 때 받기(목업 "공개된 장을 처음 열 때")** — 공개됐지만 받지 않은 장을 열면 글은 바로(꾸러미는 이미 받아 둠) 보이고, 그림 자리는 흐리게 두고 "장면 그림 받는 중 · 8장 중 5장 · 1.4 / 2.2 MB" 진행을 보인다. 아래에 "글은 미리 받아 두어 바로 읽을 수 있어요. 낭독은 재생을 누르면 받아요(3.4 MB)." 설정이 켜져 있으면 다음 장 그림을 이어 받는다. 와이파이에서만 받기가 켜져 있고 모바일 데이터면 그림 대신 "와이파이에 연결하면 그림을 받아요"를 보인다.
- [ ] **Step 4: 공개 취소** — 읽던 장이 목록에서 빠지면 그 책의 마지막 읽을 수 있는 장으로 옮기고 짧게 알린다("창세기 5장이 공개 취소되어 4장으로 옮겼어요"). 받은 파일은 지우고 기록은 둔다.
- [ ] **Step 5: 확인** — 브라우저에서 미리 보기 목록과 공개 목록으로 각각 장 고르기, 잠긴 장 시트, 처음 열 때 받기를 본다(웹은 받기 진행이 짧게 지나간다. 네이티브 받기는 Task 10에서 본다).

```bash
git add mobile
git commit -m "feat(mobile): 장 고르기의 장 상태, 잠긴 장 시트, 처음 열 때 그림 받기"
```

---

### Task 5: 66권 서재와 책 바꾸기

**Files:** `mobile/src/library/LibraryScreen.tsx` 등, `mobile/src/home/HomeScreen.tsx`

- [ ] **Step 1(목업 "서재")** — 맨 위 "공개된 장부터 읽을 수 있어요. 나머지 장과 책은 준비되는 대로 열려요." 읽는 책 카드(그림, "읽는 중 · 3장", "50장 중 4장 공개", 받아 둠·공개·준비 중 막대와 범례). 구약·신약 격자(세 줄): 열린 책은 테두리와 "4/50장", 준비 중인 책은 흐린 칸과 자물쇠. 머리글 "39권 중 1권 열림", "27권 모두 준비 중". 아래 안내 글.
- [ ] **Step 2** — 열린 책을 누르면 그 책의 장 고르기, 장을 고르면 그 책으로 읽기(읽던 곳의 책이 바뀐다). 준비 중인 책을 누르면 "출애굽기는 준비 중이에요" 시트(잠긴 장 시트와 같은 모양, 읽을 수 있는 책 안내).
- [ ] **Step 3** — 홈의 이어 읽기와 계획은 지금 책 기준이다.
- [ ] **Step 4: 다른 책 기록과 근거** (1단계 Task 10 검토)
  - `reader-core`의 `sortMarks`는 장·절만 보아, 여러 책의 메모가 섞이면 출애굽기 1:1이 창세기 2:1보다 앞에 온다. 책 순서(`bookOrder`)를 먼저 보고, 모르는 책 id는 맨 뒤에 두게 하고 시험을 더한다.
  - 1단계에서는 내 메모의 다른 책 줄과 질문하기의 다른 책 근거를 열 수 없게만 해 두었다(`NotesScreen`의 `here`, `AskScreen`의 `opensHere`). 이제는 "그 책의 그 장을 읽을 수 있는가"(`chapterStates`)로 가린다. 읽을 수 있으면 그 책으로 바꿔 열고, 잠긴 장이면 잠긴 장 시트를 띄운다.

```bash
git add mobile packages/reader-core
git commit -m "feat(mobile): 66권 서재(읽는 책 카드, 열린 책·준비 중인 책)와 책 바꾸기"
```

---

### Task 6: 낭독 받기와 바로 재생

**Files:** `mobile/src/narration/NarrationContext.tsx`, `mobile/src/player/*`, `mobile/src/content/ContentContext.tsx`

- [ ] **Step 1** — 장면 낭독을 재생하면, 받아 둔 파일이 있으면 그 파일을, 없으면 서버 주소로 바로 재생하면서 뒤에서 받는다(와이파이에서만 받기를 따른다). 잠금 화면 정보와 장면 넘김은 지금처럼.
- [ ] **Step 2** — 미니 플레이어와 플레이어 화면은 지금 책의 장면만 넘긴다. 다음 장이 잠겨 있으면 그 장에서 멈춘다.

```bash
git add mobile
git commit -m "feat(mobile): 낭독은 받아 둔 파일이 없으면 서버에서 바로 재생하며 받는다"
```

---

### Task 7: 저장 공간

**Files:** `mobile/src/settings/StorageScreen.tsx`, `mobile/src/app/storage.tsx`, 설정 시트(`mobile/src/reader/SettingsSheet.tsx`), `packages/reader-core/src/settings.ts`(받기 설정)

- [ ] **Step 1(목업 "저장 공간")** — "이 기기에 받아 둔 것 N MB"와 설명, 책마다 카드(받은 크기, "받아 둠 1~3장 · 공개 4장", "남은 공개 장: 4장 · 5.6 MB", "전부 받아 두기", "지우기"), "와이파이에서만 받기", "다음 장 그림 미리 받기" 스위치, "지운 장은 다시 열 때 받아요. 밑줄, 메모, 읽은 기록은 지워지지 않아요." 설정 시트에서 연다.
- [ ] **Step 2** — 받기 설정 둘은 기기 설정(kv)에 둔다(동기화하지 않는다). 지우기는 그 책의 그림·낭독 파일만 지운다(꾸러미는 남긴다, 글은 늘 받아 둔다).
- [ ] **Step 3** — 웹에서는 저장 공간 화면 대신 "웹은 서버에서 바로 읽어요"를 보인다.

```bash
git add mobile packages/reader-core
git commit -m "feat(mobile): 저장 공간(받아 둔 용량, 책마다 받기·지우기, 와이파이·미리 받기 설정)"
```

---

### Task 8: 공개된 장만 쓰는 기능들과 미리 보기

**Files:** 검색, 인물 사전, 가계도, 연표, 지도, 질문하기, 위젯, `mobile/src/reader/*`(미리 보기 띠)

- [ ] **Step 1** — 검색, 인물, 가계도, 연표, 지도는 지금 책 묶음(받아 둔 장)만 쓴다. 지금 책 묶음으로 바뀌었으므로 대부분 그대로 맞다. 각 화면에서 받지 않은 장의 내용이 보이지 않는지 확인한다.
  - 인물 화면은 인물을 처음 만난 장으로 묶는다(`PeopleScreen`). 0장은 "앞 책에서 만남"으로, 맨 앞에 온다. 이 묶기와 이름표를 `reader-core`의 순수 함수로 옮기고 `people.test.ts`로 고정한다.
- [ ] **Step 2** — 질문하기는 지금 책을 보낸다(1단계 Task 10에서 넣은 것이 지금 책을 따르는지 본다).
  - 근거 모양은 서버(`server/src/ask/answer.ts`)와 앱(`mobile/src/ask/askApi.ts`)이 따로 정해 두어서, `book`도 두 곳에 손으로 더했다. `reader-core`에 공용 형을 두고 둘 다 그 형을 쓰게 한다.
- [ ] **Step 3: 미리 보기(목업 "미공개 미리 보기")** — 미리 보기 빌드에서 미리 보기 장을 열면 맨 위 "미공개 미리 보기 · 개발 빌드에서만 보여요" 띠, 장면 그림 위 "미공개" 표시, 점검 칩(장면 승인 3/5, 그림 5/5, 낭독 32/32), 아래 "읽는 사람에게는 이 장이 잠겨 보여요. 관리 도구에서 공개하면 그때부터 모두에게 열려요." 그림 버전 바꿔 보기는 미리 보기에서만 보인다.

```bash
git add mobile packages/reader-core server
git commit -m "feat(mobile): 공개되고 받은 장만 쓰는 기능들과 미공개 미리 보기"
```

---

### Task 9: 시작 꾸러미

**Files:** `mobile/scripts/sync-starter.mjs`(새), `mobile/package.json`(`starter`, `eas-build-post-install`), `mobile/src/content/starter.generated.ts`(만들어짐), 앱에 넣던 묶음 지우기(`sync-content.mjs`, `assets.generated.ts`, `assets/content`)

- [ ] **Step 1** — `npm run starter -w mobile`: `publish/catalog.json`과 공용 설정집·사전, 공개된 창세기 앞 장부터 꾸러미·그림·낭독을 합계 30 MB가 넘지 않을 때까지 `mobile/assets/starter/`에 복사하고 `require()` 표(`starter.generated.ts`)를 만든다. 앱은 처음 켤 때 시작 꾸러미 파일을 문서 폴더로 옮기고 시작 목록을 마지막 목록으로 둔다.
- [ ] **Step 2** — `eas-build-post-install`은 `npm run pipeline -- publish && npm run starter -w mobile`. 앱에 넣던 묶음(`sync-content.mjs`, `assets.generated.ts`, `assets/content`)과 그 스크립트를 지운다. 위젯용 작은 그림은 시작 꾸러미 스크립트가 만든다(지금 `sync-content.mjs`가 하는 일을 옮긴다).
- [ ] **Step 3** — 공개된 장이 없으면 시작 꾸러미는 빈 목록이다. 그때 앱은 목록을 받아야 열린다는 안내를 보인다.

```bash
git add mobile
git commit -m "feat(mobile): 시작 꾸러미(공개 목록과 앞 장들, 30 MB까지)로 첫 실행을 연다"
```

---

### Task 10: 공개 흐름 확인과 문서

- [ ] **Step 1: 공개 흐름** — 실제 콘텐츠에는 승인된 장면이 없으므로, 콘텐츠를 임시 폴더에 복사해 창세기 1·2장 장면을 승인으로 바꾼 고정값으로 공개 상태를 만들고 `publish`를 그 임시 폴더의 `publish/`로 돌린다(실제 `content/`는 건드리지 않는다). 서버를 `CONTENT_DIR`로 그 폴더에 붙이고 Expo 웹에서 본다: 1·2장만 열림 → 3장 공개 뒤 앱을 다시 앞으로 오면 3장이 열림 → 2장 해설을 바꿔 다시 공개하면 2장 꾸러미만 새로 받음 → 3장 공개 취소하면 3장이 잠기고 읽던 곳이 2장으로 옮겨짐.
- [ ] **Step 2: 네이티브** — 개발 빌드(EAS development 또는 미리 보기 APK)에서 받기, 저장 공간, 와이파이에서만 받기를 사용자가 폰으로 확인할 목록을 README에 적는다(이 PC에는 안드로이드 SDK가 없다).
- [ ] **Step 3: 문서** — README(앱 실행: 콘텐츠 주소, 미리 보기, 시작 꾸러미), `docs/content-publish.md`(앱이 받는 방법, 파일 저장소), 설계 문서 3절 표 아래 3단계 진행.
- [ ] **Step 4: 전체 확인**

```bash
npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run typecheck -w pipeline && npm run typecheck -w admin && npm run lint -w admin && npm run build -w app
```

- [ ] **Step 5: 커밋과 합치기** — `docs: 여러 책과 장 공개 3단계(앱) 완료`. 세 단계가 끝났으므로 `docs/git-convention.md`대로 main에 `--no-ff`로 합친다(`merge: 여러 책과 장 공개 (feature/books-and-release)`). 푸시는 사용자가 정한다.
  - 합치기 전에 리눅스 컨테이너(도커 `node:22-bookworm-slim`, `npm ci`)에서 `npm test -w server`를 한 번 돌린다. `server/test/bundles.test.ts`의 링크 시험은 이 PC의 Windows 계정에서 링크를 만들 수 없어 건너뛰는데, Pages 배포는 main에 푸시할 때 Ubuntu에서 `npm test`를 돌리기 때문이다.
