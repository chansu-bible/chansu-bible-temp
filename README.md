# chansu-bible

장면으로 읽는 성경 목업입니다. 화면 위 절반에 장면 그림, 아래 절반에 성경 본문(개역한글)이 있고, 본문을 내려 읽으면 그림이 장면에 맞춰 바뀝니다.

설계 문서: [docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md](docs/superpowers/specs/2026-10-04-scene-bible-reader-design.md), 네이티브 앱은 [docs/superpowers/specs/2026-10-09-native-app-design.md](docs/superpowers/specs/2026-10-09-native-app-design.md)

## 사이트

`main`에 푸시하면 GitHub Pages에 자동으로 배포된다: https://chansu-bible.github.io/chansu-bible-temp/

## 구조

| 폴더 | 내용 |
|---|---|
| `app/` | 읽기 화면 웹 목업 (React + Vite + TypeScript). 깃허브 페이지로 배포 |
| `mobile/` | 네이티브 앱 (Expo SDK 57, React Native). 안드로이드·iOS, 확인용 Expo 웹 |
| `packages/reader-core/` | 웹 목업과 앱이 함께 쓰는 읽기 계산 모듈과 묶음 타입 |
| `pipeline/` | 콘텐츠 생성 스크립트 (Node + TypeScript) |
| `admin/` | 로컬 관리 도구: 상태 보기, 작업 실행, 설정집 편집·승인 |
| `content/` | 본문, 설정집, 장면, 그림, 음성 |
| `docs/content-bundle.md` | 앱이 읽는 묶음 형식(네이티브 앱용 계약) |

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

폰에서 보려면 폰에 Expo Go 앱을 깔고, 같은 와이파이에서 `npm run start -w mobile`이 띄우는 QR 코드를 찍는다(1단계는 Expo Go에 들어 있는 모듈만 써서 따로 빌드할 필요가 없다). 에뮬레이터는 Android SDK가 있어야 하고 `npm run android -w mobile`로 연다. 지도, 그림 전환, 낭독, 글꼴은 모두 앱 안에 들어 있어 인터넷 없이 돈다. 여정 지도의 바탕(해안선·강)은 Natural Earth에서 만든 `mobile/src/map/basemap.generated.ts`이고, 다시 만들 때는 `npm run basemap -w mobile`을 쓴다. 앱 형 검사는 `npm run typecheck -w mobile`.

앱 화면: 홈(오늘의 읽기, 계획과 진도), 읽기(장면 그림과 본문, 낱말 풀이, 인물·장소 카드, 목차·연표, 여정 지도, 낭독, 절을 길게 눌러 밑줄·메모와 장면 카드 공유), 내 메모, 검색, 인물 사전, 가계도. 기록은 기기에 저장된다.

## 관리 도구

```bash
npm run admin
```

`http://localhost:5174`에서 열린다. 대시보드(장별 진행), 설정집(인물·장소·시대·물건 편집과 승인, 변경 제안), 장면, 작업(파이프라인 단계 실행과 실시간 로그, 호출 비용), 검수 대기열, 저장소 상태를 볼 수 있다. 서버는 `127.0.0.1:8787`에만 열리고 로그인은 없다. 커밋과 푸시는 터미널에서 한다.

## 설정집

`content/story-bible/`의 `characters.json`, `places.json`, `eras.json`, `things.json`이 인물·장소·시대·물건의 확정 정보다. 항목마다 `facts`(본문 근거, 절 인용)와 `design`(제작상 결정)을 나누고, `status`가 `approved`인 항목만 그림과 시나리오가 참조한다. `npm run pipeline -- canon --chapter N`이 본문에서 초안을 뽑고, 승인된 항목에 대한 변경은 `proposals.json`에 제안으로만 쌓인다. 초안은 그릴 대상만 담는다. 이름 있는 인물과 고유 지명, 본문이 지목한 사물이 대상이고, 하나님과 "땅·하늘·빛" 같은 일반 명사는 넣지 않는다. 시대 구분은 사람이 미리 해 둔다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 묶음을 만들고 읽기 화면을 띄운다 |
| `npm test` | 전체 테스트 |
| `npm run pipeline -- source` | 개역한글 창세기 1~10장을 받아 `content/source/genesis.json`에 저장한다 |
| `npm run pipeline -- images --chapter 1 --allow-draft` | 1장 장면 중 그림이 없는 것을 OpenAI로 그려 `content/images/`에 저장한다 |
| `npm run pipeline -- canon --chapter 1` | 1장 본문에서 설정집 초안(인물·장소·시대·물건)을 뽑는다. `--dry-run`은 프롬프트만 보여 준다 |
| `npm run pipeline -- scenario --chapter 3` | 3장 본문과 승인된 설정집으로 장면(제목·해설·낱말 풀이·역사 배경·그림 지시)을 쓴다. 파일이 있으면 `--force`로 다시 쓴다 |
| `npm run pipeline -- review-text --chapter 3` | 3장 장면의 글을 검수 모델이 검수한다. 지적이 있으면 작성 모델이 고쳐 쓰고(최대 2회), 통과하면 `reviewed`, 안 되면 `flagged`가 된다 |
| `npm run pipeline -- tts --chapter 1` | 1장의 절마다 낭독 음성을 OpenAI로 만들어 `content/audio/`에 저장한다 |
| `npm run pipeline -- build` | 본문·장면·장소·그림·음성을 합쳐 `app/public/content/`에 묶음을 만든다 |

그림은 버전별로 `content/images/<버전 id>/`에 보관하고, 버전 목록은 `content/images/versions.json`에 있다. `images` 명령은 목록의 마지막 버전에 그리며, 앱에서는 그림 위 버튼으로 버전을 바꿔 볼 수 있다.

그림체는 `content/story-bible/style.json`에서 정한다. 화풍 참고 이미지는 `content/story-bible/refs/`에 있고, 이름표와 출처는 `style.json`의 `references[].label`·`references[].source`에 적는다.

화풍 프롬프트, 참고 이미지(올리기·주소로 가져오기·삭제), 그림 버전은 관리 도구의 "그림" 화면에서 관리한다.

그림을 만들려면 `.env.example`을 `.env`로 복사하고 `OPENAI_API_KEY`를 넣는다. `images`에 `--dry-run`을 붙이면 API를 부르지 않고 프롬프트만 출력하고, `--limit 2`처럼 개수를 제한할 수 있다. 특정 장면만 다시 그리려면 `--scene genesis-01-05`처럼 장면 id를 준다(여러 번 쓸 수 있다).
