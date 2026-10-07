# 콘텐츠 묶음 형식 (schemaVersion 1)

읽기 앱(웹, 나중의 iOS/Android)이 읽는 것은 이 묶음뿐이다. 묶음은 `npm run pipeline -- build`가 `content/`에서 만들며, 앱은 설정집·장면 파일·파이프라인을 직접 읽지 않는다. 형식의 기준은 `pipeline/src/schema.ts`의 `BundleSchema`이고, 웹 앱의 타입은 `app/src/content/types.ts`에 있다.

## 파일 배치

```
app/public/                     웹 앱의 사이트 루트. 아래 "경로"의 기준 폴더
  content/                      묶음 폴더. 빌드할 때마다 지우고 다시 만든다
    genesis.json                묶음 본체
    images/<versionId>/<sceneId>.<ext>   장면 그림 (png, jpg 등)
    audio/genesis-<장 2자리>-<절 3자리>.mp3  절 낭독 (예: genesis-01-001.mp3)
```

**경로 주의.** 묶음 안의 그림·음성 경로는 `content/`로 시작한다(예: `content/images/v1/genesis-01-01.png`). 즉 묶음 폴더가 아니라 그 부모 폴더 기준이다. 웹 앱은 `BASE_URL + 경로`로 불러온다. 네이티브 앱은 묶음 폴더를 `content/`라는 이름으로 두고 그 부모를 기준으로 풀거나, 앞의 `content/`를 떼고 묶음 폴더 기준으로 풀면 된다.

## 필드

### 최상위

| 필드 | 형식 | 뜻 |
|---|---|---|
| `schemaVersion` | `1` | 묶음 형식 버전. 앱은 모르는 값이면 읽지 않고 오류를 낸다(웹: `묶음 형식이 다릅니다 (schemaVersion n)`) |
| `book` | string | 책 이름. 지금은 `창세기` |
| `translation` | string | 번역본 이름. 지금은 `개역한글` |
| `places` | Place[] | 지도에 쓰는 장소 |
| `imageVersions` | ImageVersion[] | 그림 버전 목록. 추가한 순서 |
| `defaultImageVersion` | string \| null | 처음 보여 줄 그림 버전 id. 목록의 마지막 버전이고, 버전이 없으면 null |
| `chapters` | Chapter[] | 장 목록. 장 번호 순서 |

### Place

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | 장소 id. 장면의 `placeId`가 가리킨다 |
| `name` | string | 이름 |
| `description` | string | 지도 카드에 보여 줄 설명 |
| `estimated` | boolean | 위치가 확실하지 않으면 true(추정지) |
| `lat`, `lng` | number \| null | 좌표. 위치를 모르면 둘 다 null이고 지도에 그리지 않는다 |

### ImageVersion

`{ id: string, label: string, note: string }`. `id`는 영문 소문자·숫자·하이픈이고 그림 폴더 이름과 같다. `label`은 버전 바꾸기 버튼에 보여 줄 이름, `note`는 설명이다.

### Chapter

| 필드 | 형식 | 뜻 |
|---|---|---|
| `chapter` | number | 장 번호 |
| `verses` | Verse[] | 절 목록. 1절부터 순서대로 |
| `scenes` | Scene[] | 장면 목록. 절 순서대로 |

### Verse

| 필드 | 형식 | 뜻 |
|---|---|---|
| `verse` | number | 절 번호 |
| `text` | string | 본문. 원문 그대로이며 고치지 않는다 |
| `audio` | string \| null | 낭독 파일 경로. 아직 없으면 null |

### Scene

| 필드 | 형식 | 뜻 |
|---|---|---|
| `id` | string | `genesis-<장 2자리>-<순번 2자리>`. 장면 파일이 없는 장의 기본 장면은 순번이 `00` |
| `verseStart`, `verseEnd` | number | 장면이 덮는 절 범위(양 끝 포함) |
| `title` | string | 장면 제목 |
| `commentary` | string \| null | 짧은 해설. 없을 수 있다 |
| `explanation` | string[] | 구절을 읽는 데 도움이 되는 해설 문단들. 비어 있으면 아직 준비되지 않은 것 |
| `history` | HistoryNote[] | 역사 배경 메모 |
| `glossary` | Gloss[] | 본문 낱말 풀이 |
| `placeId` | string \| null | 장면의 장소. `places`의 id |
| `images` | Record<string, string> | 그림 버전 id → 그림 경로. 그 버전에 그림이 없으면 키가 없다 |
| `reviewStatus` | `none` \| `draft` \| `reviewed` \| `flagged` \| `approved` | 검수 상태. `none`은 장면 파일이 없는 장의 기본 장면 |

`HistoryNote`: `{ text, basis, certainty: '확실' | '추정' | '견해 갈림', sources: string[] }`. `text`는 내용, `basis`는 근거 설명, `sources`는 출처 표기다.

`Gloss`: `{ verse: number, word: string, meaning: string }`. `verse` 절 본문에 나오는 `word`의 뜻이 `meaning`이다.

## 앱이 믿어도 되는 것

빌드가 검사해서 어기면 묶음을 만들지 않는다.

- 모든 장에 장면이 하나 이상 있다. 장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나가 들어간다.
- 한 장의 장면들은 1절부터 마지막 절까지 순서대로, 빈틈도 겹침도 없이 덮는다. 그래서 어떤 절이든 그 절을 담은 장면이 정확히 하나 있다.
- 풀이한 낱말(`glossary[].word`)은 그 절(`glossary[].verse`)의 본문에 글자 그대로 있고, 그 절은 장면 범위 안이다.
- 장면의 `placeId`가 null이 아니면 `places`에 그 id가 있다.
- `images`의 키는 모두 `imageVersions`에 있는 버전 id다.
- 그림·음성 경로가 가리키는 파일은 묶음과 함께 복사되어 있다.

믿으면 안 되는 것:

- `audio`는 null일 수 있다. 일부 절만 낭독 파일이 있을 수 있다.
- 장면에 지금 고른 버전의 그림이 없을 수 있다. 그때는 자리 표시(웹: "그림 준비 중")를 보여 준다.
- `lat`/`lng`가 null인 장소가 있을 수 있다.
- `commentary`, `explanation`, `history`, `glossary`는 비어 있을 수 있다.

## 읽기 규칙

웹 앱(`app/src/reader/`)은 아래 규칙의 한 구현이다. 계산 부분은 브라우저 API 없는 순수 함수이고, 같은 테스트 케이스로 다른 언어에 옮길 수 있다.

- **읽는 위치**는 `{ chapter, verse }`다. 저장된 위치가 묶음에 없으면 그 장의 첫 절, 장도 없으면 첫 장의 첫 절로 시작한다(`initialPosition`).
- **현재 절**: 본문을 스크롤할 때, 화면 위쪽 기준선(스크롤 영역 위에서 24px)을 위쪽 끝이 지난 절 가운데 마지막 절이다. 끝까지 스크롤했으면 마지막 절이다(`findActiveIndex`).
- **현재 장면**: 현재 절을 담은 장면이다(`findSceneIndex`). 그림, 제목, 해설, 지도는 이 장면을 따른다.
- **그림 버전**: 사용자가 고른 버전이 묶음에 있으면 그것, 아니면 `defaultImageVersion`이다. 버튼을 누르면 `imageVersions` 순서로 다음 버전, 마지막 다음은 처음이다(`pickImageVersion`, `nextImageVersion`).
- **낭독**: 현재 절의 `audio`를 재생한다. 한 절이 끝나면 다음 절, 장의 끝이면 다음 장의 첫 절로 위치를 옮기고 이어 읽는다. 다음 절이 없거나 그 절의 `audio`가 null이면 멈춘다(`nextPosition`).
- **자막**: 켜져 있으면 그림 위에 현재 절의 번호와 본문을 보여 준다. 처음에는 켜져 있다.
- **낱말 풀이**: 절 본문에서 그 절의 풀이 낱말이 처음 나오는 곳만 표시하고, 겹치면 먼저 나오는 낱말을 쓴다(`splitByGlosses`).
- **지도 경로**: 처음 장면부터 현재 장면까지 좌표가 있는 장소를 차례로 모은 것이 지나온 길이고(같은 장소가 이어지면 한 번), 그 마지막이 현재 장소다. 현재 장면 뒤에서 처음 나오는 다른 장소가 다음 장소다(`buildRoute`).
