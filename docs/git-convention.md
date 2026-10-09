# 깃 컨벤션

이 리포와 dfdfg42의 다른 리포(AOD 프론트·백엔드, woowacourse-precourse, AssignmentPractice, spring-study)에서 써 온 방식을 모았다. 바탕은 우아한테크코스가 쓰는 AngularJS 커밋 메시지 컨벤션이다.

## 커밋 메시지

```
type(scope): 한국어 요약

본문(필요할 때만): 왜 바꿨는지, 무엇을 확인했는지, 남은 일
```

- 요약은 한국어로 무엇이 바뀌었는지 쓴다. 끝에 마침표를 찍지 않는다.
- 세부가 여럿이면 요약 뒤 괄호에 쓰거나 ` - ` 뒤에 `·`로 잇는다.
  - `feat(server): 질문하기(검수된 자료에서 대목 찾기, 문장마다 근거 확인, 하루 20번)`
  - `fix(mobile): 퀴즈 리뷰 반영 - 틀린 문제 진행 칸 색·정답 문구`
- 본문은 한 줄 비우고 쓴다. 바뀐 것을 줄마다 `- `로 적어도 된다.
- AI 도구와 함께 만든 커밋은 끝에 `Co-Authored-By:` 줄을 둔다.

### type

| type | 쓰는 때 |
|---|---|
| `feat` | 기능을 더하거나 바꿀 때 |
| `fix` | 버그를 고치거나 리뷰 지적을 반영할 때 |
| `refactor` | 동작은 그대로 두고 구조만 바꿀 때 |
| `perf` | 성능만 바꿀 때 |
| `test` | 테스트만 더하거나 고칠 때 |
| `docs` | 설계, 계획, README 같은 문서 |
| `chore` | 빌드, 설정, 의존성, 도구 |
| `content` | 파이프라인이 만든 본문·장면·그림·음성과 초안 |
| `data` | 사람이 승인하거나 고친 데이터(예: `data(canon)`) |
| `wip` | 끝나지 않은 실험. 작업 브랜치에만 두고 main에 넣지 않는다 |
| `merge` | 작업 브랜치를 main에 합치는 머지 커밋 |

### scope

바꾼 워크스페이스나 기능 이름을 쓴다. 여러 곳에 걸치면 생략한다.

- 워크스페이스: `app`(웹 목업), `mobile`, `core`(packages/reader-core), `server`, `pipeline`, `admin`, `infra`
- 기능: `canon`, `scenario`, `images`, `bundle` 등

## 브랜치

| 브랜치 | 쓰는 때 |
|---|---|
| `main` | 배포 브랜치. 푸시하면 GitHub Pages(웹 목업)가 배포된다 |
| `feature/<이름>` | 기능 |
| `fix/<이름>` | 버그 |
| `refactor/<이름>`, `perf/<이름>` | 구조, 성능 |
| `docs/<이름>`, `chore/<이름>` | 문서, 설정 |

- 이름은 영어 소문자와 `-`로 짓는다(예: `feature/mobile-app`).
- 문서 한두 곳, 설정 몇 줄, 머지 뒤 후속 조정 같은 작은 고침은 main에 바로 커밋해도 된다.
- 예전에 만든 `feat/…` 브랜치는 이어서 작업할 때 `feature/…`로 이름을 바꾼다.

## main에 합치기

지금은 혼자 작업하므로 로컬에서 합치고 푸시한다. 함께 작업하게 되면 GitHub 풀 리퀘스트로 합친다(AOD 백엔드처럼).

1. main을 원격과 맞춘다.
   ```bash
   git checkout main
   git pull --ff-only
   ```
2. 빨리 감기 대신 머지 커밋으로 합친다. main의 첫 부모 기록에서 기능이 한 줄로 보이게 하려는 것이다.
   ```bash
   git merge --no-ff feature/<이름> -F <메시지 파일>
   ```
   메시지는 `merge: <기능 요약> (feature/<이름>)`이고, 본문에 담긴 일을 줄마다 적는다.
3. 합친 결과로 전체 확인을 다시 돌린다.
   ```bash
   npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run build -w app
   ```
4. 합친 브랜치는 지운다(`git branch -d feature/<이름>`). 기록은 머지 커밋에 남는다.

## 푸시하기 전에

- 공개 리포다. OpenAI 키가 든 `.env`는 올리지 않는다(.gitignore에 있다).
- 올릴 변경에 키가 섞이지 않았는지 본다. 아무것도 나오지 않아야 한다.
  ```bash
  git diff origin/main..main | grep -E "sk-[A-Za-z0-9_-]{20,}"
  ```
- main에 푸시하면 GitHub Actions가 `npm ci`, `npm test`, 묶음 만들기, 웹 목업 빌드를 거쳐 Pages에 배포한다. 로컬에서 같은 확인이 통과한 뒤 푸시한다.
- 올린 기록을 다시 쓰는 강제 푸시는 하지 않는다.
