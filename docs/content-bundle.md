# 콘텐츠 묶음 형식 (schemaVersion 1)

읽기 앱(웹, 나중의 iOS/Android)이 읽는 것은 이 묶음뿐이다. 묶음은 `npm run pipeline -- build`가 `content/`에서 만들며, 앱은 설정집·장면 파일·파이프라인을 직접 읽지 않는다. 형식의 기준은 `pipeline/src/schema.ts`의 `BundleSchema`이고, 앱의 타입은 웹·네이티브가 함께 쓰는 `packages/reader-core/src/types.ts`에 있다.

## 파일 배치

```
app/public/                     웹 앱의 사이트 루트. 아래 "경로"의 기준 폴더
  content/                      묶음 폴더. 빌드할 때마다 지우고 다시 만든다
    <bookId>.json               책마다 묶음 본체 (예: genesis.json). 본문이 있는 책마다 하나
    images/<versionId>/<sceneId>.<ext>   장면 그림 (png, jpg 등)
    audio/<bookId>-<장>-<절 3자리>.mp3  절 낭독 (예: genesis-01-001.mp3). 장은 그 책의 장 수 자리수로 채운다
    audio/scenes/<sceneId>.mp3   장면 낭독. 장면에 든 절 낭독을 차례로 이은 것
```

**경로 주의.** 묶음 안의 그림·음성 경로는 `content/`로 시작한다(예: `content/images/v1/genesis-01-01.png`). 즉 묶음 폴더가 아니라 그 부모 폴더 기준이다. 웹 앱은 `BASE_URL + 경로`로 불러온다. 네이티브 앱은 묶음 폴더를 `content/`라는 이름으로 두고 그 부모를 기준으로 풀거나, 앞의 `content/`를 떼고 묶음 폴더 기준으로 풀면 된다.

## 필드

**형식 버전.** 키를 더하기만 할 때는 `schemaVersion`을 올리지 않는다. `bookId`, `characters`, `eras`, `things`, 장면의 `characters`·`audio`·`audioMs`, 절의 `audioMs`, `lexicon`, `sources`, 장의 `original`·`quiz`는 나중에 더한 키라 `schemaVersion`은 1 그대로이며, 이 키를 모르는 옛 독자는 무시하면 된다. 있던 키의 뜻이나 형식을 바꿀 때만 올린다.

### 최상위

| 필드 | 형식 | 뜻 |
|---|---|---|
| `schemaVersion` | `1` | 묶음 형식 버전. 앱은 모르는 값이면 읽지 않고 오류를 낸다(웹: `묶음 형식이 다릅니다 (schemaVersion n)`) |
| `bookId` | string | 책 id. `packages/reader-core/src/books.ts`의 `id`(예: `genesis`, `1-john`)이고 묶음 파일 이름과 같다. 옛 묶음에는 없어서 앱은 `book`으로 찾아 채운다 |
| `book` | string | 책 이름(개역한글, 예: `창세기`). `bookId`의 책과 같다 |
| `translation` | string | 번역본 이름. 지금은 `개역한글` |
| `places` | Place[] | 지도에 쓰는 장소. 설정집에서 사람이 승인한(`approved`) 장소 가운데 이 책까지 나온 것만 들어간다(아래 "책 묶음에 드는 설정집 항목과 인용") |
| `characters` | Character[] | 인물 카드와 연표에 쓰는 인물. 승인한 인물 가운데 이 책까지 나온 것만, 설정집 파일 순서 |
| `eras` | Era[] | 연표에 쓰는 시대. 승인한 시대 가운데 이 책까지 나온 것만, 설정집 파일 순서 |
| `things` | Thing[] | 검색과 설정집 카드에 쓰는 물건. 승인한 물건 가운데 이 책까지 나온 것만, 설정집 파일 순서 |
| `imageVersions` | ImageVersion[] | 그림 버전 목록. 추가한 순서 |
| `defaultImageVersion` | string \| null | 처음 보여 줄 그림 버전 id. 목록의 마지막 버전이고, 버전이 없으면 null |
| `lexicon` | Record<string, LexiconEntry> | 스트롱 번호(`H7225`) → 사전 항목. 장들의 원어 낱말에 나오는 번호만 |
| `sources` | Source[] | 자료 출처와 이용 조건(앱의 자료 출처 화면) |
| `chapters` | Chapter[] | 장 목록. 장 번호 순서 |

### Place

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | 장소 id. 장면의 `placeId`가 가리킨다 |
| `name` | string | 이름 |
| `description` | string | 지도 카드에 보여 줄 설명 |
| `estimated` | boolean | 위치가 확실하지 않으면 true(추정지) |
| `lat`, `lng` | number \| null | 좌표. 위치를 모르면 둘 다 null이고 지도에 그리지 않는다 |

### Character

설정집 인물의 `facts`만 옮긴다(`design`과 기준 이미지는 넣지 않는다). 앱의 인물 카드와 연표가 이 데이터를 쓴다.

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | 인물 id. 장면의 `characters`와 관계의 `to`가 가리킨다 |
| `name` | string | 이름 |
| `aliases` | string[] | 다른 이름 |
| `gender` | `남` \| `여` \| `불명` | 성별 |
| `firstAppearance` | string | 처음 나오는 절. `장:절` 또는 `장:절-절` (예: `4:1`). 앞 책의 절이면 책 이름이 붙는다(예: `창세기 2:7`) |
| `years` | `{ born: number \| null, died: number \| null }` | 창조 원년 기준 태어난 해와 죽은 해. 모르면 null(에녹처럼 죽지 않고 데려간 경우도 `died`가 null) |
| `relations` | `{ type: string, to: string }[]` | 관계. `type`은 `아내`, `아들` 같은 말, `to`는 인물 id |
| `attire` | `{ from: string, description: string }[]` | 옷차림. `from`은 근거 절 |
| `notes` | string | 본문이 말하는 것. 줄바꿈(`\n`)으로 문단을 나눈다 |
| `sources` | string[] | 본문 근거 절 |

### Era

설정집 시대의 `facts`만 옮긴다. 앱의 연표가 이 데이터를 쓴다.

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | 시대 id |
| `name` | string | 이름 |
| `range` | `{ from: string, to: string }` | 시대가 덮는 본문 범위(절 인용). 끝이 뒤 책이면 이 책의 마지막 절이다 |
| `years` | `{ from: number \| null, to: number \| null }` | 창조 원년 기준 햇수. 모르면 null |
| `description` | string | 설명 |
| `present`, `absent` | string[] | 그 시대에 있는 것과 아직 없는 것 |

### Thing

설정집 물건의 `facts`만 옮긴다. 앱의 검색과 설정집 카드가 쓴다.

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | 물건 id |
| `name` | string | 이름 |
| `aliases` | string[] | 다른 이름 |
| `description` | string | 설명. 줄바꿈(`\n`)으로 문단을 나눈다 |
| `details` | string[] | 본문이 말하는 세부 사실 |
| `sources` | string[] | 본문 근거 절(예: `3:21`) |

### 책 묶음에 드는 설정집 항목과 인용

설정집은 모든 책이 함께 쓴다. 책 묶음에는 그 책을 다 읽은 독자가 아는 항목만 들어간다. 사람이 승인한 항목 가운데 처음 나오는 곳이 이 책이거나 앞 책(성경 순서)인 것이다. 처음 나오는 곳은 인물·장소는 `firstAppearance`, 시대는 `range.from`, 물건은 `sources` 가운데 가장 앞선 절이다. 인물의 `relations`와 장면의 `characters`는 묶음에 든 인물만 가리킨다.

묶음의 절 인용(`firstAppearance`, `attire[].from`, `sources`, `range`)은 앱이 읽는 데이터라 화면에 보일 모양이 아니라 아래 모양으로 쓴다.

- 이 책의 절: 책 없이 `장:절`(예: `2:7`).
- 앞 책의 절: 책 이름을 붙인다(예: `창세기 2:7`). reader-core의 `chapterOfReference`는 책 이름을 읽지 않아 이런 인용을 0장으로 읽는다. 0장은 이 책을 읽기 전에 이미 만난 것이라는 뜻이다(본문의 이름 잇기 `splitVerse`는 이런 인물을 1장부터 잇는다).
- 뒤 책의 절: `sources`와 `attire`에서 뺀다. 시대의 끝(`range.to`)이 뒤 책이면 이 책 본문의 마지막 절(예: `50:26`)로 둔다.
- 읽을 수 없는 글: 그대로 둔다.

창세기만 있으면 승인된 항목이 모두 들어가고 모든 인용이 책 없는 `장:절`이다.

**넘어가는 동안의 한계.** 두 책에 걸친 시대는 뒤 책 묶음에서 `창세기 12:1 ~ 1:7`처럼 보인다(앱의 설정집 카드가 두 끝을 그대로 잇는다). 3단계에서 묶음 대신 꾸러미와 공용 설정집(책이 붙은 인용)을 쓰고 책을 아는 표시로 바꾸면 없어진다.

### ImageVersion

`{ id: string, label: string, note: string }`. `id`는 영문 소문자·숫자·하이픈이고 그림 폴더 이름과 같다. `label`은 버전 바꾸기 버튼에 보여 줄 이름, `note`는 설명이다.

### Chapter

| 필드 | 형식 | 뜻 |
|---|---|---|
| `chapter` | number | 장 번호 |
| `verses` | Verse[] | 절 목록. 1절부터 순서대로 |
| `scenes` | Scene[] | 장면 목록. 절 순서대로 |
| `original` | OriginalVerse[] \| null | 절마다 히브리어 낱말(OSHB). 원어 자료가 없는 장은 null |
| `quiz` | QuizQuestion[] | 사람이 승인한 이해 확인 문제. 없으면 빈 배열 |

`OriginalVerse`: `{ verse, words: [{ text, strong, morph, pos }] }`. `text`는 모음 부호가 있는 히브리어 낱말(칸틸레이션 부호는 뺐다), `strong`은 스트롱 번호(접두사뿐인 낱말은 null), `morph`는 OSHB 형태 부호, `pos`는 한국어 품사 이름(예: `접속사 + 동사(칼 연속 미완료)`). 한국어 절의 낱말과 짝짓지 않는다.

`LexiconEntry`: `{ lemma, xlit, english, korean, note, count }`. `english`는 스트롱 사전의 정의, `korean`과 `note`는 사람이 승인한 한국어 뜻과 메모이고 아직 없으면 null, `count`는 이 묶음의 장에 나오는 횟수.

`QuizQuestion`: `{ id, question, options, answer, explanation, verse }`. 보기는 넷, `answer`는 정답 보기 번호(0부터), `verse`는 그 장의 근거 절.

`Source`: `{ id, title, detail, license, url }`. `url`은 없을 수 있다.

### Verse

| 필드 | 형식 | 뜻 |
|---|---|---|
| `verse` | number | 절 번호 |
| `text` | string | 본문. 원문 그대로이며 고치지 않는다 |
| `audio` | string \| null | 낭독 파일 경로. 아직 없으면 null |
| `audioMs` | number \| null | 절 낭독 길이(ms). 음성이 없거나 길이를 모르면 null. 홈 화면의 "낭독으로 들으면 N분" 안내에 쓴다 |

### Scene

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | `<bookId>-<장>-<순번 2자리>`(예: `genesis-01-03`). 장은 그 책의 장 수 자리수로 채운다. 장면 파일이 없는 장의 기본 장면은 순번이 `00`이고 제목은 `<책 이름> <장>장`(예: `창세기 6장`)이다 |
| `verseStart`, `verseEnd` | number | 장면이 덮는 절 범위(양 끝 포함) |
| `title` | string | 장면 제목 |
| `commentary` | string \| null | 짧은 해설. 없을 수 있다 |
| `explanation` | string[] | 구절을 읽는 데 도움이 되는 해설 문단들. 비어 있으면 아직 준비되지 않은 것 |
| `history` | HistoryNote[] | 역사 배경 메모 |
| `glossary` | Gloss[] | 본문 낱말 풀이 |
| `placeId` | string \| null | 장면의 장소. `places`의 id |
| `characters` | string[] | 장면에 나오는 인물. 최상위 `characters`의 id. 기본 장면은 빈 배열 |
| `images` | Record<string, string> | 그림 버전 id → 그림 경로. 그 버전에 그림이 없으면 키가 없다 |
| `reviewStatus` | `none` \| `draft` \| `reviewed` \| `flagged` \| `approved` | 검수 상태. `none`은 장면 파일이 없는 장의 기본 장면 |
| `audio` | string \| null | 장면 낭독 경로(`content/audio/scenes/<sceneId>.mp3`). 장면에 든 절 가운데 낭독이 있는 절을 차례로 이었다. 하나도 없으면 null |
| `audioMs` | number \| null | 장면 낭독 길이(ms). 이은 절의 `audioMs` 합이고, 그중 길이를 모르는 절이 있으면 null |

`HistoryNote`: `{ text, basis, certainty: '확실' | '추정' | '견해 갈림', sources: string[] }`. `text`는 내용, `basis`는 근거 설명, `sources`는 출처 표기다.

`Gloss`: `{ verse: number, word: string, meaning: string }`. `verse` 절 본문에 나오는 `word`의 뜻이 `meaning`이다.

## 앱이 믿어도 되는 것

빌드가 검사해서 어기면 묶음을 만들지 않는다.

- 모든 장에 장면이 하나 이상 있다. 장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나가 들어간다.
- 한 장의 장면들은 1절부터 마지막 절까지 순서대로, 빈틈도 겹침도 없이 덮는다. 그래서 어떤 절이든 그 절을 담은 장면이 정확히 하나 있다.
- 풀이한 낱말(`glossary[].word`)은 그 절(`glossary[].verse`)의 본문에 글자 그대로 있고, 그 절은 장면 범위 안이다.
- 장면의 `placeId`가 null이 아니면 `places`에 그 id가 있다.
- 장면의 `characters`와 인물의 `relations[].to`는 모두 최상위 `characters`에 있는 id다. 승인되지 않았거나 뒤 책에서 처음 나오는 인물을 가리키는 것은 빌드가 오류 없이 뺀다.
- `images`의 키는 모두 `imageVersions`에 있는 버전 id다.
- 그림·음성 경로가 가리키는 파일은 묶음과 함께 복사되어 있다.

믿으면 안 되는 것:

- `audio`는 null일 수 있다. 일부 절만 낭독 파일이 있을 수 있다. 장면 낭독에는 낭독이 있는 절만 들어 있다.
- 장면에 지금 고른 버전의 그림이 없을 수 있다. 그때는 자리 표시(웹: "그림 준비 중")를 보여 준다.
- `lat`/`lng`가 null인 장소가 있을 수 있다.
- 인물의 `years.born`/`died`, 시대의 `years.from`/`to`는 null일 수 있다.
- `commentary`, `explanation`, `history`, `glossary`는 비어 있을 수 있다.

## 읽기 규칙

웹 앱(`app/src/reader/`)은 아래 규칙의 한 구현이다. 계산 부분은 브라우저 API 없는 순수 함수이고, 같은 테스트 케이스로 다른 언어에 옮길 수 있다.

- **읽는 위치**는 `{ chapter, verse }`다. 저장된 위치가 묶음에 없으면 그 장의 첫 절, 장도 없으면 첫 장의 첫 절로 시작한다(`initialPosition`).
- **현재 절**: 본문을 스크롤할 때, 화면 위쪽 기준선(스크롤 영역 위에서 24px)을 위쪽 끝이 지난 절 가운데 마지막 절이다. 끝까지 스크롤했으면 마지막 절이다(`findActiveIndex`).
- **현재 장면**: 현재 절을 담은 장면이다(`findSceneIndex`). 그림, 제목, 해설, 지도는 이 장면을 따른다.
- **그림 버전**: 사용자가 고른 버전이 묶음에 있으면 그것, 아니면 `defaultImageVersion`이다. 버튼을 누르면 `imageVersions` 순서로 다음 버전, 마지막 다음은 처음이다(`pickImageVersion`, `nextImageVersion`).
- **낭독**: 웹 앱은 현재 절의 `audio`를 재생한다. 한 절이 끝나면 다음 절, 장의 끝이면 다음 장의 첫 절로 위치를 옮기고 이어 읽는다. 다음 절이 없거나 그 절의 `audio`가 null이면 멈춘다(`nextPosition`).
- **장면 낭독**: 네이티브 앱은 장면의 `audio` 하나를 재생한다(화면을 꺼도 끊기지 않고 잠금 화면에 장면 단위로 보이게). 지금 절은 재생 위치로 정한다. 그 장면에서 낭독이 있는 절의 `audioMs`를 차례로 더해 절마다 구간을 매긴다(`sceneTrack`, `verseAtTime`). 장면이 끝나면 다음으로 낭독이 있는 장면을 재생한다(`adjacentTrack`).
- **자막**: 켜져 있으면 그림 위에 현재 절의 번호와 본문을 보여 준다. 처음에는 켜져 있다.
- **낱말 풀이**: 절 본문에서 그 절의 풀이 낱말이 처음 나오는 곳만 표시하고, 겹치면 먼저 나오는 낱말을 쓴다(`splitByGlosses`).
- **지도 경로**: 처음 장면부터 현재 장면까지 좌표가 있는 장소를 차례로 모은 것이 지나온 길이고(같은 장소가 이어지면 한 번), 그 마지막이 현재 장소다. 현재 장면 뒤에서 처음 나오는 다른 장소가 다음 장소다(`buildRoute`).
