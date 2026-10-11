# chansu-bible

장면으로 읽는 성경 목업입니다. 화면 위 절반에 장면 그림, 아래 절반에 성경 본문(개역한글)이 있고, 본문을 내려 읽으면 그림이 장면에 맞춰 바뀝니다.

설계 문서: [docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md](docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md), 네이티브 앱은 [docs/superpowers/specs/2026-10-09-native-app-design.md](docs/superpowers/specs/2026-10-09-native-app-design.md)

## 자동 시험

PR을 열거나 `main`에 푸시하면 GitHub Actions가 시험, 묶음 만들기, 형 검사, 웹 목업 빌드를 돌린다(`.github/workflows/ci.yml`). 배포는 하지 않는다. 이제 앱으로 쓰므로 웹 목업 사이트(GitHub Pages)는 두지 않는다.

## 구조

| 폴더 | 내용 |
|---|---|
| `app/` | 읽기 화면 웹 목업 (React + Vite + TypeScript). 로컬에서 `npm run dev`로 본다 |
| `mobile/` | 네이티브 앱 (Expo SDK 57, React Native). 안드로이드·iOS, 확인용 Expo 웹 |
| `packages/reader-core/` | 웹 목업과 앱이 함께 쓰는 읽기 계산 모듈과 묶음 타입 |
| `server/` | 앱 기록 동기화 서버 (Hono, Postgres). 키클락 토큰을 검증한다 |
| `infra/` | 개발용 Postgres·키클락 (docker compose) |
| `deploy/` | 맥미니 운영 배포: Compose(Postgres, 운영 키클락, 서버, Caddy 입구), 올리기·백업 스크립트, 준비 문서 |
| `pipeline/` | 콘텐츠 생성 스크립트 (Node + TypeScript) |
| `admin/` | 로컬 관리 도구: 상태 보기, 작업 실행, 설정집 편집·승인 |
| `content/` | 본문, 설정집, 장면, 그림, 음성 |
| `docs/content-bundle.md` | 앱이 읽는 묶음 형식(네이티브 앱용 계약) |
| `docs/git-convention.md` | 커밋 메시지, 브랜치, main에 합치기, 푸시 전 확인 |

## 실행

```bash
npm install
npm run dev
```

## 네이티브 앱

```bash
npm run pipeline -- build    # 묶음을 만든다 (app/public/content)
npm run content -w mobile    # 묶음·기본 그림 버전·낭독을 앱으로 복사한다
npm run web -w mobile        # Expo 웹으로 확인 (http://localhost:8081)
```

폰에서 보려면 폰에 Expo Go 앱을 깔고, 같은 와이파이에서 `npm run start -w mobile -- --go`가 띄우는 QR 코드를 찍는다. `--go`를 빼면 아래의 개발 빌드에 붙는다. 에뮬레이터는 Android SDK가 있어야 하고 `npm run android -w mobile`로 연다. 지도, 그림 전환, 낭독, 글꼴은 모두 앱 안에 들어 있어 인터넷 없이 돈다. 여정 지도의 바탕(해안선·강)은 Natural Earth에서 만든 `mobile/src/map/basemap.generated.ts`이고, 다시 만들 때는 `npm run basemap -w mobile`을 쓴다. 앱 형 검사는 `npm run typecheck -w mobile`.

앱 화면: 홈(오늘의 읽기, 계획과 진도, 바로 가기), 읽기(장면 그림과 본문, 낱말 풀이, 인물·장소 카드, 목차·연표, 여정 지도, 낭독, 절을 길게 눌러 밑줄·메모와 장면 카드 공유·원어 보기), 이해 확인 퀴즈, 질문하기, 서재, 자료 출처, 낭독 플레이어(속도, 잠자기 타이머, 자막, 다음에 들을 것), 내 메모, 검색, 인물 사전, 가계도, 계정과 동기화, 홈 화면 위젯 "오늘의 장면". 기록은 기기에 저장되고, 로그인하면 계정과 맞춰진다.

원어 보기의 한국어 뜻과 퀴즈 문제는 파이프라인이 초안을 쓰고, 관리 도구의 "원어 뜻"·"퀴즈" 화면에서 사람이 승인한 것만 묶음에 들어간다. 승인 전에는 원어 보기에 "뜻 검수 중"과 사전의 영어 정의가 보이고, 퀴즈는 승인된 문제가 셋 이상인 장에만 열린다.

낭독은 장면마다 절 낭독을 이은 파일(`npm run pipeline -- build`가 만든다)로 재생한다. 화면을 끈 뒤에도 이어지는 낭독, 잠금 화면 조작, 홈 화면 위젯은 Expo Go에 없는 기능이라 개발 빌드에서만 보인다(그 밖의 화면은 Expo Go와 Expo 웹에서 모두 된다). 개발 빌드는 Android SDK가 있으면 `npx expo run:android`로, 없으면 Expo 클라우드 빌드(EAS)로 만든다. iOS는 맥 또는 EAS가 필요하고, app.json에 `ios.appleTeamId`를 넣어야 한다.

EAS로 안드로이드 APK를 만든다(Expo 계정이 필요하다).

```bash
npx eas-cli login                                        # 처음 한 번
cd mobile
npx eas-cli init                                         # 처음 한 번. app.json에 들어간 projectId를 커밋한다
npx eas-cli build --platform android --profile preview   # 폰에 바로 까는 APK
```

빌드 프로필은 `mobile/eas.json`에 있다. `preview`는 폰에 바로 까는 APK라 낭독과 위젯을 확인할 때 쓰고, `development`는 개발 빌드라 같은 와이파이의 `npm run start -w mobile`에 붙어 고친 코드를 바로 보여 준다. `production`은 스토어용이다. EAS는 커밋된 파일만 올리므로, 빌드 서버에서 설치가 끝나면 `eas-build-post-install`이 묶음을 만들어 앱으로 복사한다. 빌드가 끝나면 EAS가 주는 주소나 QR 코드로 APK를 받아 깐다. 폰에 깐 앱은 이 PC의 키클락과 동기화 서버에 닿지 않아 로그인, 동기화, 질문하기는 되지 않는다(낭독과 위젯 확인에는 필요 없다). 네이티브 폴더(`mobile/android`, `mobile/ios`)는 `npx expo prebuild`가 만들며 커밋하지 않는다.

로그인과 기록 동기화는 도커로 띄운 키클락과 동기화 서버를 쓴다. 로그인하지 않아도 앱은 모두 돈다.

```bash
npm run infra:up             # Postgres와 키클락 (infra/README.md)
npm run server               # 동기화 서버 (http://127.0.0.1:8790)
```

홈 머리의 계정 단추로 로그인한다(시험 계정은 `infra/README.md`). 로그인하면 읽은 장면, 읽던 곳, 계획, 밑줄·메모, 끝까지 푼 퀴즈가 계정에 올라가고 다른 기기와 맞춰진다. 로그아웃하면 그 기기의 기록을 지우고, 다시 로그인하면 받아 온다.

질문하기는 로그인한 사람만 쓴다. 동기화 서버가 묶음 폴더(`BUNDLE_DIR`, 비우면 `app/public/content`)의 책 묶음(`<책 id>.json`)을 모두 읽어 본문 절, 검수된 장면 해설, 설정집 대목을 찾는다. 읽고 있는 책과 장의 대목에는 점수를 더 주고, 찾은 대목만 OpenAI 모델에 준다. 문장마다 근거가 맞지 않으면 "자료에 없어요"로 답한다. 리포 루트 `.env`에 `OPENAI_API_KEY`가 있어야 켜지고, 모델은 `ASK_MODEL`(비우면 작성 모델), 한도는 계정마다 하루 `ASK_DAILY_LIMIT`번(비우면 20)이다. 서버 전체로도 하루 `ASK_GLOBAL_DAILY_LIMIT`번(비우면 200)까지만 답하고, 넘으면 그날은 모두에게 "오늘은 질문을 더 받을 수 없어요"로 답한다. 서버는 시작할 때 묶음을 읽으므로 묶음을 다시 만들면 서버를 다시 띄운다. 묶음 하나라도 읽지 못하면 경고를 남기고 질문하기만 끈다(동기화는 그대로 된다). 질문과 답은 저장하지 않는다(서버는 하루 횟수만 센다).

### 맥미니에 서버 띄우기

폰에 깐 앱이 집 밖에서도 로그인·동기화·질문하기를 쓰게, 사용자의 맥미니에 Postgres·키클락·서버·입구(Caddy)를 Docker Compose로 띄우고 Tailscale Funnel로 연다. 준비와 올리기, 백업은 [deploy/README.md](deploy/README.md)에 있다. 설계는 [docs/superpowers/specs/2026-10-10-macmini-deploy-design.md](docs/superpowers/specs/2026-10-10-macmini-deploy-design.md). 맥미니 주소는 EAS의 `preview` 환경 변수로 넣고 APK를 만들며, 리포에는 커밋하지 않는다.

## 관리 도구

```bash
npm run admin
```

`http://localhost:5174`에서 열린다. 대시보드(장별 진행), 설정집(인물·장소·시대·물건 편집과 승인, 변경 제안), 장면, 원어 뜻(사전 항목마다 한국어 뜻 검수와 승인), 퀴즈(장마다 문제 고치기·승인·버림), 작업(파이프라인 단계 실행과 실시간 로그, 호출 비용), 검수 대기열, 저장소 상태를 볼 수 있다. 서버는 `127.0.0.1:8787`에만 열리고 로그인은 없다. 커밋과 푸시는 터미널에서 한다.

## 설정집

`content/story-bible/`의 `characters.json`, `places.json`, `eras.json`, `things.json`이 인물·장소·시대·물건의 확정 정보다. 항목마다 `facts`(본문 근거, 절 인용)와 `design`(제작상 결정)을 나누고, `status`가 `approved`인 항목만 그림과 시나리오가 참조한다. `npm run pipeline -- canon --book genesis --chapter N`이 본문에서 초안을 뽑고, 승인된 항목에 대한 변경은 `proposals.json`에 제안으로만 쌓인다. 초안은 그릴 대상만 담는다. 이름 있는 인물과 고유 지명, 본문이 지목한 사물이 대상이고, 하나님과 "땅·하늘·빛" 같은 일반 명사는 넣지 않는다. 시대 구분은 사람이 미리 해 둔다.

설정집은 성경 전체에 하나다. 절 인용은 `genesis 2:7`처럼 책 id를 붙여 저장한다(관리 도구에서는 `창세기 2:7`로 보이고, 그렇게 써도 받는다). 설정집을 읽고 쓸 때마다 인용한 책의 본문으로 절 수를 확인하므로, 설정집이 어떤 책을 인용하면 그 책의 본문 파일(`content/source/<책 id>.json`)도 함께 커밋한다. 없으면 `build`와 자동 시험이 실패한다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 묶음을 만들고 읽기 화면을 띄운다 |
| `npm test` | 전체 테스트 |
| `npm run infra:up`, `npm run infra:down` | 개발용 Postgres·키클락을 띄우고 멈춘다 |
| `npm run server` | 동기화 서버를 띄운다 (http://127.0.0.1:8790) |
| `npm run pipeline -- source --book genesis --chapters 1-10` | 위키문헌에서 개역한글 본문을 받아 `content/source/<책 id>.json`에 저장한다. `--chapters`(`3`, `1-10`)가 없으면 책 전체를 받는다. 있던 본문 파일은 이번에 받은 장으로 바뀐다(더하지 않는다). 설정집이 인용한 장이 빠지면 설정집 검증이 실패해 `build`와 자동 시험이 멈춘다 |
| `npm run pipeline -- images --book genesis --chapter 1 --allow-draft` | 1장 장면 중 그림이 없는 것을 OpenAI로 그려 `content/images/`에 저장한다 |
| `npm run pipeline -- canon --book genesis --chapter 1` | 1장 본문에서 설정집 초안(인물·장소·시대·물건)을 뽑는다. `--dry-run`은 프롬프트만 보여 준다 |
| `npm run pipeline -- migrate-canon-refs --book genesis` | 책이 없는 옛 설정집 인용(`2:7`)에 책을 붙인다. 한 번만 쓰는 이전이고, `--dry-run`은 몇 개인지만 보여 준다 |
| `npm run pipeline -- scenario --book genesis --chapter 3` | 3장 본문과 승인된 설정집으로 장면(제목·해설·낱말 풀이·역사 배경·그림 지시)을 쓴다. 파일이 있으면 `--force`로 다시 쓴다 |
| `npm run pipeline -- review-text --book genesis --chapter 3` | 3장 장면의 글을 검수 모델이 검수한다. 지적이 있으면 작성 모델이 고쳐 쓰고(최대 2회), 통과하면 `reviewed`, 안 되면 `flagged`가 된다 |
| `npm run pipeline -- tts --book genesis --chapter 1` | 1장의 절마다 낭독 음성을 OpenAI로 만들어 `content/audio/`에 저장한다 |
| `npm run pipeline -- original` | 본문이 있는 구약 책마다(`--book`으로 한 책만) OSHB(히브리어 낱말과 형태)와 스트롱 사전을 고정된 커밋에서 받아 `content/original/<책 id>.json`과 `lexicon.json`을 만든다. 히브리어 절 번호는 개역한글 절 번호에 맞추고, 맞출 수 없는 장은 원어 없이 둔다. 신약 책은 건너뛴다. 이미 쓴 한국어 뜻은 지킨다 |
| `npm run pipeline -- original-gloss` | 모든 책이 함께 쓰는 사전 항목마다 한국어 뜻 초안을 40개씩 쓴다(`--book`은 받지 않는다). `--limit`, `--force`(초안도 다시 씀), `--dry-run` |
| `npm run pipeline -- quiz --book genesis --chapter 4` | 4장 이해 확인 문제 다섯을 쓰고 검수 모델이 근거 절을 확인한다. 통과하면 `reviewed`, 지적이 남으면 `flagged`. `--force`는 승인된 문제를 두고 나머지를 다시 쓴다 |
| `npm run pipeline -- build` | 본문이 있는 모든 책마다 본문·장면·장소·그림·음성을 합쳐 `app/public/content/<책 id>.json` 묶음을 만든다(`--book`은 받지 않는다) |

그림은 버전별로 `content/images/<버전 id>/`에 보관하고, 버전 목록은 `content/images/versions.json`에 있다. `images` 명령은 목록의 마지막 버전에 그리며, 앱에서는 그림 위 버튼으로 버전을 바꿔 볼 수 있다.

그림체는 `content/story-bible/style.json`에서 정한다. 화풍 참고 이미지는 `content/story-bible/refs/`에 있고, 이름표와 출처는 `style.json`의 `references[].label`·`references[].source`에 적는다.

화풍 프롬프트, 참고 이미지(올리기·주소로 가져오기·삭제), 그림 버전은 관리 도구의 "그림" 화면에서 관리한다.

그림을 만들려면 `.env.example`을 `.env`로 복사하고 `OPENAI_API_KEY`를 넣는다. `images`에 `--dry-run`을 붙이면 API를 부르지 않고 프롬프트만 출력하고, `--limit 2`처럼 개수를 제한할 수 있다. 특정 장면만 다시 그리려면 `--scene genesis-01-05`처럼 장면 id를 준다(여러 번 쓸 수 있다).
