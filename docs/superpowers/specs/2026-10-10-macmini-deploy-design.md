# 맥미니 배포 설계

사용자의 맥미니(SSH 이름 `mainserver`)에 로그인 서버, 동기화·질문하기 서버를 띄운다. 폰에 깐 앱이 집 밖에서도 로그인하고 기록을 맞추고 질문할 수 있게 한다. 관리 도구와 파이프라인도 맥미니에서 돌리고, 사용자는 SSH로 들어가 쓴다.

## 1. 목표와 완료 기준

1. 맥미니에서 명령 하나(`docker compose … up -d`)로 Postgres, 키클락, 동기화·질문하기 서버, 입구(Caddy)가 뜬다. 맥미니를 다시 켜도 다시 뜬다.
2. 밖에서는 Tailscale Funnel의 고정 주소 `https://mainserver.<tailnet>.ts.net` 하나로만 닿는다. 그 밖의 포트는 모두 맥미니 자신(`127.0.0.1`)에만 열린다.
3. 그 주소로 빌드한 안드로이드 APK에서 가입, 로그인, 동기화, 질문하기가 된다.
4. 키클락 관리 화면은 밖에서 열리지 않는다. SSH 포트 전달로만 연다.
5. 비밀 값(DB·키클락 관리자 비밀번호, OpenAI 키)은 맥미니의 `deploy/.env`에만 있고 리포에는 없다. 리포는 공개다.
6. 나중에 도메인을 사면 입구 앞의 Funnel만 Cloudflare 터널로 바꾼다. 바뀌는 것은 `deploy/.env`의 공개 주소와 앱 빌드의 주소다.

## 2. 범위

넣는 것:
- `deploy/` 폴더: Compose 파일, Caddyfile, 운영용 키클락 realm, 서버 Dockerfile, `.env.example`, 올리기·백업 스크립트, 맥미니 준비 문서
- 서버의 상태 확인(`GET /health`)이 DB까지 보게 함
- 질문하기의 서버 전체 하루 한도
- 앱 빌드에 맥미니 주소를 넣는 방법(EAS 환경 변수)

빼는 것:
- 메일 서버(SMTP). 그래서 비밀번호 찾기와 이메일 확인이 없다.
- 도메인과 Cloudflare 터널. 나중에 10절대로 한다.
- 웹 앱(Expo 웹) 공개
- 여러 대로 나누기, 모니터링 도구

## 3. 구성

| 무엇 | 어디서 | 열리는 곳 |
|---|---|---|
| Postgres 17 | Compose `db` | Compose 안에서만 |
| 키클락 26.8 (운영 모드, DB는 같은 Postgres의 `keycloak` 데이터베이스) | Compose `keycloak` | Compose 안 + 관리 화면용 `127.0.0.1:8180` |
| 동기화·질문하기 서버(지금 코드 그대로, `tsx`로 실행) | Compose `server`(리포에서 이미지 빌드) | Compose 안에서만 |
| 입구(Caddy) | Compose `caddy` | `127.0.0.1:8443` |
| 공개 주소(HTTPS) | 맥미니의 Tailscale Funnel | `https://mainserver.<tailnet>.ts.net` → `127.0.0.1:8443` |
| 관리 도구·파이프라인 | 맥미니의 리포 폴더에서 Node 22로 | `127.0.0.1:5174`, `127.0.0.1:8787`(지금처럼) |

- 포트 번호(8443, 8180)는 `deploy/.env`에서 바꿀 수 있다. 맥미니에 다른 서버가 이미 그 포트를 쓰고 있을 수 있기 때문이다.
- Compose 프로젝트 이름은 `chansu-bible-prod`다. 개발용 `infra/`(`chansu-bible`)와 볼륨이 섞이지 않는다.

## 4. 주소와 입구

Caddy는 HTTP로만 받는다. TLS는 Funnel이 맡는다(도메인으로 바꾼 뒤에는 Cloudflare가 맡는다).

| 경로 | 보내는 곳 |
|---|---|
| `/auth/admin*`, `/auth/realms/master*` | 404(밖에서 막음. 관리 화면과 관리자 realm) |
| `/auth/*` | 키클락(`KC_HTTP_RELATIVE_PATH=/auth`) |
| 그 밖(`/sync`, `/ask`, `/ask/usage`, `/health`, 2단계부터 `/content/*`) | 서버 |

- 키클락은 요청이 HTTPS로 왔는지를 `X-Forwarded-Proto`로 판단한다. 판단이 틀리면 밖에서 온 요청에 "HTTPS required"를 낸다. Funnel이 그 머리글을 보내는지에 기대지 않는다. Caddy가 공개 주소의 스킴(`PUBLIC_SCHEME`, 기본 `https`)으로 `X-Forwarded-Proto`를 정해서 보낸다. 호스트는 `KC_HOSTNAME`이 전체 주소로 정하므로 머리글에 기대지 않는다.
- 키클락 설정:
  - `KC_HOSTNAME=${PUBLIC_URL}/auth`
  - `KC_HOSTNAME_ADMIN=http://127.0.0.1:${KC_ADMIN_PORT}/auth`: 관리 화면은 SSH 포트 전달 주소로 연다.
  - `KC_PROXY_HEADERS=xforwarded`
  - `KC_HTTP_ENABLED=true`
- 토큰의 발급자는 `${PUBLIC_URL}/auth/realms/chansu-bible`이다.
  - 서버는 이 발급자만 받는다(`AUTH_ISSUERS`).
  - 서명 키는 Compose 안의 주소에서 받는다: `AUTH_JWKS_URL=http://keycloak:8080/auth/realms/chansu-bible/protocol/openid-connect/certs`.
  - 받는 클라이언트는 `chansu-bible-app` 하나다(`AUTH_CLIENTS`).

## 5. 로그인(운영용 realm)

`deploy/keycloak/chansu-bible-realm.json`을 새로 둔다. 개발용 `infra/keycloak`의 파일을 바탕으로 하되 다음이 다르다.

- 시험 계정(`tester`)과 개발용 클라이언트(`chansu-bible-test`)가 없다.
- 앱 클라이언트 `chansu-bible-app`:
  - 공개 클라이언트, PKCE S256, 직접 비밀번호 받기 끔
  - 돌아올 주소는 `chansubible://*`만 둔다. `exp://*`과 `localhost`는 넣지 않는다.
- 가입: 누구나(`registrationAllowed: true`), 이메일로 로그인 가능
- 이메일 확인과 비밀번호 찾기: 끔. 메일 서버가 없기 때문이다.
- 로그인 실패를 반복하면 막는다(`bruteForceProtected: true`, 기본 대기 시간).
- 비밀번호 규칙: `length(8) and notUsername and notEmail`
- 오래 가는 갱신 토큰(`offline_access`): 지금처럼 30일 동안 쓰지 않으면 끝난다.
- 한국어 화면(기본 `ko`), `sslRequired: external`

realm 파일은 키클락이 처음 뜰 때 한 번만 읽는다(`--import-realm`, realm이 이미 있으면 건너뛴다). 그 뒤의 바꿈은 관리 화면에서 한다.

## 6. 서버

- **이미지:** `deploy/server.Dockerfile`, 리포 루트를 빌드 맥락으로 쓴다.
  - Node 22 이미지에 루트 `package.json`·`package-lock.json`과 `packages/reader-core`, `server`만 넣는다.
  - 서버 작업 공간만 설치한다(`tsx` 포함). 실행은 지금처럼 `tsx src/index.ts`다.
  - `.dockerignore`로 `.env`, `node_modules`, `content/`, `mobile/`, `app/` 등을 뺀다. 특히 리포 루트 `.env`가 이미지에 들어가면 안 된다. 서버는 루트 `.env`가 있으면 읽기 때문이다.
- **환경 변수**(Compose가 `deploy/.env`에서 넘긴다):
  - `HOST=0.0.0.0`, `DATABASE_URL`
  - 4절의 `AUTH_*` 셋
  - `CORS_ORIGINS`는 정하지 않는다. 네이티브 앱은 CORS를 쓰지 않는다. 비우면 서버가 개발 기본값을 쓰는데, 그래도 상관없다.
  - `OPENAI_API_KEY`, `ASK_MODEL`, `ASK_DAILY_LIMIT`, `ASK_GLOBAL_DAILY_LIMIT`
- **질문하기의 묶음:**
  - 1단계 코드에서는 `BUNDLE_DIR=/content`이고, 맥미니 리포의 `app/public/content`를 읽기 전용으로 붙인다.
  - 2단계 Task 9가 `BUNDLE_DIR`를 지우고 `CONTENT_DIR`(`publish/`)로 바꿀 때 Compose 파일도 함께 고친다. 이것을 2단계 계획에 적는다.
- **`GET /health`:** 이미 있다. 이번에는 DB까지 보게 고친다.
  - 인증 없이 `{ ok: true }`를 돌려준다. Compose 상태 확인과 Funnel 확인에 쓴다.
  - DB가 끊겼으면 503이다. 질문하기가 켜졌는지 같은 내부 정보는 보이지 않는다.
- **서버 전체 하루 한도:**
  - `ask_daily(day, count)` 표에 한국 날짜별로 센다. 한도는 `ASK_GLOBAL_DAILY_LIMIT`, 기본 200이다.
  - 사람마다의 한도(`takeAsk`)와 같은 방식으로 한 번 쓰고, 넘으면 되돌린다.
  - 넘으면 429 `{ error: '오늘은 질문을 더 받을 수 없어요. 내일 다시 물어 주세요.' }`를 보낸다. 이 응답에는 `remaining`을 넣지 않는다. 그 사람의 남은 횟수는 그대로이기 때문이다.
  - 답을 만들지 못하면 사람 한도와 함께 되돌린다.

## 7. 관리 도구와 콘텐츠

- 맥미니의 리포 폴더가 콘텐츠 작업의 중심이다.
  - 사용자는 `ssh mainserver`로 들어가 `npm run admin`을 띄운다.
  - PC에서는 포트 전달로 연다: `ssh -L 5174:127.0.0.1:5174 -L 8787:127.0.0.1:8787 -L 8180:127.0.0.1:8180 mainserver`. 8180은 키클락 관리 화면이다.
  - 관리 도구는 지금처럼 `127.0.0.1`에만 열린다.
- 비용이 드는 파이프라인 단계(그림, 낭독, 장면 쓰기 등)를 맥미니 관리 도구에서 돌리려면 맥미니 리포 루트의 `.env`에 OpenAI 키를 둔다. `deploy/.env`와 따로다. 둘 다 git이 빼는 이름이다.
- 코드는 PC에서 만들고 GitHub로 맞춘다.
  - 맥미니에서 승인한 설정집과 장면은 맥미니에서 커밋·푸시한다.
  - PC에서 고친 코드는 PC에서 푸시하고 맥미니에서 받는다.
  - 같은 콘텐츠 파일을 두 곳에서 동시에 고치지 않는다(문서에 적는다).
- `deploy/update.sh`(맥미니에서 돌린다):
  1. 받기(`git pull --ff-only`)
  2. 설치(`npm ci`)
  3. 묶음 만들기(`npm run pipeline -- build`, 2단계부터는 `publish`)
  4. Compose를 다시 빌드해 띄우기
  5. `/health` 확인

  1단계 서버는 묶음을 시작할 때 읽으므로, 묶음을 다시 만든 뒤에는 서버 컨테이너를 다시 띄운다. 스크립트가 한다.

## 8. 운영

- **백업:** `deploy/backup.sh`가 `pg_dumpall`을 압축해 `~/chansu-backups/`에 두고 14일보다 오래된 것을 지운다. 키클락 계정도 같은 Postgres에 있어 함께 백업된다. 매일 새벽에 돌리는 launchd 예시 파일을 둔다.
- **맥미니 준비:** `deploy/README.md`에 적는다.
  - 설치: Docker(OrbStack 또는 Docker Desktop, 로그인할 때 자동 시작), Node 22, Tailscale(독립 실행 앱과 CLI)
  - Tailscale 관리 화면에서 HTTPS 인증서와 Funnel을 켠다.
  - 잠자기를 끄고 정전 뒤 자동으로 켜지게 한다(`pmset`).
  - 처음 띄우기, 로그 보기, 멈추기, 백업에서 되살리기
- **Funnel:** `tailscale funnel --bg http://127.0.0.1:8443`. 공개 포트는 443이다. 맥미니의 다른 서비스가 이미 443 Funnel을 쓰고 있으면 8443이나 10000을 쓴다. 그때는 공개 주소에 포트가 붙는다.
- **비밀 값:**
  - 맥미니에서 새로 만든다(`openssl rand -hex 24` 등).
  - OpenAI 키는 PC와 다른 키를 만들어 맥미니에만 둔다. 하나가 새도 다른 쪽에 영향이 없게 한다.
- **로그:** `docker compose logs -f server`. 서버는 질문과 답을 남기지 않는다(지금처럼).

## 9. 앱 빌드

- 앱은 이미 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH_ISSUER`를 받는다(`mobile/src/auth/config.ts`). 3단계에서 `EXPO_PUBLIC_CONTENT_URL`이 더해지고, 기본은 `${apiUrl}/content`다.
- 이 값은 EAS 프로젝트의 환경 변수(`preview` 환경)에 넣는다.
  - `eas.json`의 `preview` 프로필에 `"environment": "preview"`를 더한다.
  - 값은 사용자가 `eas env:create`로 넣는다. 리포에는 맥미니 주소를 커밋하지 않는다.
- `npx eas-cli build --platform android --profile preview`로 만든 APK가 맥미니에 붙는다.
- `development` 프로필(개발 빌드)은 지금처럼 PC의 개발 서버에 붙는다.

## 10. 도메인으로 옮기기(나중에)

1. 도메인을 사서 Cloudflare에 연결하고, 맥미니에 `cloudflared` 터널을 만든다. 터널은 `127.0.0.1:8443`(Caddy)로 보낸다.
2. `deploy/.env`의 `PUBLIC_URL`을 새 주소로 바꾸고 Compose를 다시 띄운다. 키클락 발급자가 바뀐다.
3. EAS 환경 변수를 새 주소로 바꿔 앱을 다시 빌드한다.
4. 옛 주소로 받은 토큰은 서버가 받지 않는다. 쓰던 사람은 한 번 다시 로그인한다. 계정과 기록은 그대로다.
5. Funnel을 끈다.

## 11. 확인

- **PC에서 확인:** 이 PC의 Docker로 같은 Compose를 시험용 `.env`로 띄운다(`PUBLIC_URL=http://localhost:8443`, `PUBLIC_SCHEME=http`). 시험 값은 시스템 임시 폴더에 두고 커밋하지 않는다. 확인할 것:
  - `/health`가 200이다.
  - 발견 문서의 발급자가 공개 주소다.
  - `/auth/admin`이 404다.
  - `127.0.0.1:8180`의 관리 화면이 열린다.
  - 관리 API로 시험 계정을 만들고, 그 시험 realm에서만 직접 비밀번호 받기를 켠다. 그 토큰으로 `/sync`가 200이다.
  - 서버 전체 한도가 넘으면 429다.

  확인이 끝나면 볼륨까지 지운다(`down -v`).
- **자동 시험:** 서버의 `/health`와 서버 전체 한도는 서버 시험(vitest, PGlite)으로 고정한다.
- **맥미니에서 확인:** 사용자가 `deploy/README.md`의 순서대로 한다. 마지막 확인은 둘이다.
  - 폰의 모바일 데이터로 APK에서 가입·로그인·동기화·질문하기가 되는지
  - 밖에서 `/auth/admin`이 막히는지

## 12. 위험과 대응

| 위험 | 대응 |
|---|---|
| Funnel이 `X-Forwarded-Proto`를 보내지 않아 키클락이 "HTTPS required"를 냄 | Caddy가 공개 스킴으로 직접 정해서 보낸다(4절) |
| 누구나 가입해 질문하기 비용이 늘어남 | 사람마다 하루 20번 + 서버 전체 하루 한도(기본 200) |
| 맥미니가 잠들거나 정전 뒤 꺼져 있음 | `pmset`으로 잠자기를 끄고 자동으로 켜지게 한다. Docker는 로그인할 때 자동 시작하고, 컨테이너는 `restart: unless-stopped`다 |
| 비밀 값이 공개 리포에 들어감 | `deploy/.env`와 루트 `.env`는 git이 뺀다. 서버 이미지에는 `.dockerignore`로 넣지 않는다. 푸시 전에는 지금처럼 키 모양 문자열을 검사한다 |
| Funnel 대역폭 제한 | 시험 단계에만 쓰고, 사용자가 늘면 도메인과 Cloudflare 터널로 옮긴다(10절) |
| 비밀번호를 잊은 사용자 | 메일 서버가 없어 관리 화면에서 사용자가 비밀번호를 바꿔 준다. 메일 서버는 나중에 붙인다 |
| 키클락 관리 화면 노출 | 입구에서 `/auth/admin`을 막고, 관리 화면은 `127.0.0.1`과 SSH 포트 전달로만 연다 |

## 13. 작업 위치

이 작업은 `feature/books-and-release` 브랜치에 커밋한다. 서버와 `deploy/` 설정이 그 브랜치의 1단계 코드(`BUNDLE_DIR`)와 맞물리기 때문이다. 맥미니는 그 브랜치를 받아 띄우거나, 세 단계를 main에 합친 뒤 main을 받는다. 2단계의 서버 작업(Task 8, 9)은 `deploy/compose.yaml`의 환경 변수와 붙이는 폴더도 함께 고친다.
