# 그림 참고 이미지와 프롬프트 관리 설계

2026-10-07. 관리 도구에 "그림" 화면을 더해, 그림 파이프라인이 쓰는 것을 사람이 직접 관리한다. 사용자가 고른 범위(기본안): 화풍 참고 이미지, 화풍 프롬프트, 장면별 최종 프롬프트 보기·그림 지시 수정·다시 그리기·버전별 그림 미리 보기, 새 그림 버전 만들기. 인물별 참고 이미지는 3단계(`refs` 단계)에서 다룬다.

## 1. 지금 그림이 만들어지는 길

`images` 단계는 `content/story-bible/style.json`(화풍)과 장면 파일의 `visual.description`·`visual.shot`으로 프롬프트를 조립한다(`pipeline/src/images/prompt.ts`). 순서는 참고 지시문(참고 이미지가 있을 때) → 화풍 앞말 → 구도 → 장면 묘사 → 표현 기준. 참고 이미지는 `content/story-bible/refs/`의 파일이고, 있으면 `images.edit`로 함께 보낸다. 결과는 `content/images/<버전>/`에 쌓이고 버전 목록은 `content/images/versions.json`이다. 지금은 이 넷을 모두 파일을 직접 고쳐서 관리한다.

## 2. 데이터

### style.json

참고 이미지를 파일 이름 문자열에서 객체로 바꾼다. 출처를 함께 적기 위해서다(퍼블릭 도메인이나 사용 허가가 있는 그림만 쓴다는 규칙을 데이터에 남긴다).

```json
"references": [
  { "file": "sargent-olive-trees-canopy.jpg", "label": "나뭇잎과 줄기의 붓질",
    "source": "John Singer Sargent, Olive Trees, Corfu (1909). Art Institute of Chicago, 퍼블릭 도메인. https://www.artic.edu/artworks/14792" }
]
```

`refs/SOURCES.md`는 내용을 `source`로 옮기고 지운다. 파일 이름 규칙은 `^[a-z0-9][a-z0-9._-]{0,79}\.(jpg|jpeg|png|webp)$`. 올릴 때 이름은 이 규칙에 맞게 고치고(소문자, 허용하지 않는 글자는 `-`), 확장자는 파일 내용으로 정한다(`detectImageExtension`). 같은 이름이 있으면 `-2`, `-3`을 붙인다. 크기는 15MB까지.

### versions.json

형식은 그대로다. `id`에 규칙 `^[a-z0-9][a-z0-9-]*$`를 둔다(기존 `v1-flare` 등은 맞는다). 새 버전을 더하면 `content/images/<id>/` 폴더를 만든다. `images` 단계는 목록의 마지막 버전에 그린다는 규칙은 바뀌지 않는다.

### 장면 파일

`visual.description`, `visual.shot`, `visual.characters`를 관리 도구에서 고쳐 저장한다. 저장은 장면 전체(`SceneSchema`)를 검증한 뒤 그 장면만 바꿔 파일을 다시 쓴다. 나머지 필드(해설, 낱말 풀이 등)의 편집은 2단계 장면 화면에서 한다.

## 3. 파이프라인 모듈

| 모듈 | 하는 일 |
|---|---|
| `images/style.ts` | `readStyle()`, `writeStyle()`(스키마 검증, 참고 파일이 실제로 있는지 확인), `referencePaths()`, 파일 이름 규칙, 확장자별 MIME |
| `images/versions.ts` | 기존 읽기에 `writeImageVersions()`, `addImageVersion()` 추가 |
| `scenes/files.ts` | `readSceneFile()`, `writeSceneFile()`(스키마, 장 번호, id 중복 검증). `generateImages`도 이것으로 저장한다 |
| `images/openaiDraw.ts` | 참고 이미지 MIME을 확장자에 맞게 보낸다(지금은 모두 jpeg로 보냄) |

관리 서버는 `pipeline` 공개 함수만 쓴다(기존 원칙).

## 4. 관리 서버 API

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/style` | 화풍 |
| PUT | `/api/style` | 화풍 저장. 스키마나 없는 참고 파일이면 400 |
| GET | `/api/style/refs/:file` | 참고 이미지 바이트 |
| POST | `/api/style/refs` | multipart `file`(+`label`, `source`)로 올리기. 형식·크기 검사 후 목록에 추가. 201 `{ style, added }` |
| POST | `/api/style/refs/import` | `{ url, label?, source? }`. 서버가 http(s)로 받아 같은 검사 후 추가. `source`가 비면 url을 적는다 |
| DELETE | `/api/style/refs/:file` | 목록에서 빼고 파일을 지운다 |
| GET | `/api/images/versions` | 버전 목록 |
| POST | `/api/images/versions` | `{ id, label, note }` 추가. 규칙 어김 400, 중복 409 |
| GET | `/api/images/:version/:file` | 장면 그림 바이트 |
| GET | `/api/scenes/:chapter` | 기존 응답에 `imageVersions`와 `images`(장면 id → 버전 id → 파일 이름)를 더한다 |
| GET | `/api/scenes/:chapter/:id/prompt` | 실제로 보낼 최종 프롬프트와 참고 파일 목록 |
| PUT | `/api/scenes/:chapter/:id` | 장면 저장(전체 검증) |

파일을 내보내는 경로는 이름 규칙에 맞지 않으면 400, 없으면 404로 답하고, 폴더 밖 경로는 규칙상 만들 수 없다. 서버는 그대로 `127.0.0.1`에만 묶인다.

## 5. 관리 화면

### 그림 (`#/images`)

세 묶음을 한 화면에 둔다.

1. **화풍 프롬프트**: 설명, 앞말(`promptPrefix`), 표현 기준(`promptRules`), 참고 지시문(`referenceInstruction`)을 여러 줄 칸으로 고치고 저장한다. 조립 순서를 한 줄로 안내한다.
2. **화풍 참고 이미지**: 그림 조각들을 썸네일로 보여 주고, 이름표(`label`)와 출처(`source`)를 고친다(저장은 화풍 저장과 같은 버튼). 파일 올리기, 주소로 가져오기, 삭제(확인 후). "퍼블릭 도메인이나 사용 허가가 있는 그림만. 출처를 적어 두세요"를 안내한다.
3. **그림 버전**: 버전마다 id, 이름, 메모, 그림 수를 표로 보여 주고 새 버전을 만든다. "images 단계는 마지막 버전에 그립니다"를 안내한다.

### 장면 (`#/scenes/N`)

장면 카드의 "그림 지시"를 편집할 수 있게 바꾼다.

- 묘사·구도·인물 id를 고쳐 저장(PUT).
- "최종 프롬프트 보기": 서버가 조립한 프롬프트를 그대로 보여 준다. 사람이 모델에 가는 글을 그대로 확인하는 것이 목적이다.
- "이 장면만 다시 그리기": `images` 작업을 `{ chapter, scenes: [id], allowDraft: true }`로 시작하고 작업 화면 링크를 보여 준다. 작업이 이미 돌고 있으면 그 사실을 알린다.
- 버전별 그림 썸네일 한 줄. 없는 버전은 "없음".

## 6. 검증과 오류

- 화풍 저장: `StyleSchema` + 참고 파일 존재. 실패하면 400과 이유.
- 올리기: 내용으로 형식을 판별(jpg·png·webp만), 15MB 넘으면 400, 이름은 규칙대로 고친다.
- 주소로 가져오기: http(s)만, 응답이 그림이 아니거나 너무 크면 400. 서버가 바깥으로 요청하는 유일한 경로라 로그에 주소를 남긴다.
- 삭제: 화면에서 확인을 받는다. 파일이 이미 없어도 목록에서는 뺀다.
- 장면 저장: 주소의 장·id와 본문이 다르면 400. 장면 파일이 없거나 id가 없으면 404.

## 7. 테스트

- pipeline: 화풍 읽기·쓰기·검증, 참고 경로, MIME, 버전 쓰기(중복 id 거부), 장면 파일 쓰기(장 번호·id 중복), 프롬프트 조립(참고 객체).
- admin 서버: 임시 폴더로 화풍·참고 이미지(올리기·가져오기·삭제·내보내기)·버전·장면 프롬프트·장면 저장 경로. 가져오기는 `fetch`를 바꿔 끼워 시험한다.
- admin 화면: 라우트, id 목록 나누기 같은 순수 함수.

## 8. 네이티브 앱을 염두에 둔 점

화풍과 참고 이미지는 제작 도구 쪽 데이터라 묶음(`docs/content-bundle.md`)에는 들어가지 않는다. 새 버전은 다음 `build`에서 묶음의 `imageVersions`에 그대로 나타난다. 장면의 `visual`은 묶음에 들어가지 않으므로 앱 쪽 계약은 바뀌지 않는다.
