# 맥미니 배포 준비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자의 맥미니(`mainserver`)에서 Docker Compose 하나로 Postgres, 운영 키클락, 동기화·질문하기 서버, Caddy 입구를 띄우고, Tailscale Funnel 주소로 폰 앱이 붙을 수 있게 배포 파일과 문서를 만든다.

**Architecture:** 리포에 `deploy/` 폴더를 둔다. 서버는 리포에서 이미지로 빌드하고(`tsx` 실행 그대로), 키클락은 운영 모드로 같은 Postgres를 쓰며 `/auth` 아래에서 돈다. Caddy가 유일한 입구로 `/auth/admin`을 막고 `/auth/*`는 키클락, 나머지는 서버로 보낸다. 밖에서는 Tailscale Funnel이 Caddy로 보낸다. 서버에는 상태 확인이 DB까지 보게 하고, 질문하기에 서버 전체 하루 한도를 더한다.

**Tech Stack:** Docker Compose, Caddy 2, Keycloak 26.8(운영 모드), Postgres 17, Node 22, Hono, vitest(PGlite), bash, launchd

**설계:** `docs/superpowers/specs/2026-10-10-macmini-deploy-design.md`

**브랜치:** `feature/books-and-release`(설계 13절)

**공통 규칙(모든 Task):**
- 코드 주석은 짧은 한국어 "-다" 문장, UI·오류 글은 한국어, 2칸 들여쓰기, 세미콜론 없음, 작은따옴표.
- 리포는 공개다. 비밀 값(비밀번호, 키)을 파일·커밋·대화에 쓰지 않는다. 시험에 쓰는 값은 시스템 임시 폴더에만 둔다.
- 커밋 메시지는 파일에 써서 `git commit -F`로 한다(끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- 셸 명령의 날것 출력이 필요하면 `rtk proxy <명령>`, 찾기는 Grep/Glob 도구(셸 `grep -r`는 멈출 수 있다).

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `server/src/app.ts` | `/health`가 DB까지 본다. `/ask`가 서버 전체 하루 한도를 쓴다 |
| `server/src/ask/usage.ts` | `takeGlobalAsk`, `giveBackGlobal`, `DEFAULT_GLOBAL_DAILY_LIMIT` |
| `server/src/db.ts` | `ask_daily` 표 |
| `server/src/config.ts`, `server/src/index.ts` | `ASK_GLOBAL_DAILY_LIMIT` |
| `server/test/{app,ask,config}.test.ts` | 위 시험 |
| `server/test/deploy.test.ts` (새) | 배포 파일이 지켜야 할 것(시험 계정 없음, 포트는 127.0.0.1, 비밀 값 없음, 관리 화면 막기) |
| `.env.example` | `ASK_GLOBAL_DAILY_LIMIT` |
| `deploy/keycloak/chansu-bible-realm.json` (새) | 운영용 realm |
| `deploy/server.Dockerfile` (새), `.dockerignore` (새) | 서버 이미지 |
| `deploy/compose.yaml`, `deploy/Caddyfile`, `deploy/postgres/10-keycloak.sql`, `deploy/.env.example` (새) | 맥미니 구성 |
| `deploy/update.sh`, `deploy/backup.sh`, `deploy/launchd/com.chansubible.backup.plist` (새) | 올리기, 백업 |
| `deploy/README.md` (새), `README.md`, `mobile/eas.json` | 맥미니 준비 문서, 앱 빌드 환경 |
| `docs/superpowers/plans/2026-10-10-books-and-release-stage2.md` | Task 8·9가 배포 파일도 고친다는 메모 |

---

### Task 1: 서버 — 상태 확인이 DB까지 보고, 질문하기에 서버 전체 하루 한도

**Files:**
- Modify: `server/src/app.ts`, `server/src/ask/usage.ts`, `server/src/db.ts`, `server/src/config.ts`, `server/src/index.ts`, `.env.example`
- Test: `server/test/app.test.ts`, `server/test/ask.test.ts`, `server/test/config.test.ts`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`server/test/app.test.ts`의 `/health` 시험 옆에 더한다. 파일 위의 import에 `createApp`(`../src/app.ts`), `createVerifier`(`../src/auth.ts`), `type Sql`(`../src/db.ts`), `ISSUER`·`testKeys`(`./helpers.ts`)가 없으면 더한다.

```ts
  it('/health는 DB에 닿지 못하면 503이다', async () => {
    const down: Sql = {
      query: async () => {
        throw new Error('연결 끊김')
      },
      transaction: async () => {
        throw new Error('연결 끊김')
      },
    }
    const { jwks } = await testKeys()
    const app = createApp({ sql: down, verify: createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app'], jwks }), corsOrigins: [] })
    const response = await app.request('/health')
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false })
  })
```

`server/test/ask.test.ts`의 `askApp`을 바꾼다. 서버 전체 한도와 같은 앱의 다른 사용자 토큰이 필요하다.

```ts
async function askApp(model: AskModel, dailyLimit = 20, askIndex: PassageIndex = index, globalDailyLimit?: number) {
  const sql = await memorySql()
  const { privateKey, jwks } = await testKeys()
  const verify = createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app'], jwks })
  const app = createApp({ sql, verify, corsOrigins: [], ask: { index: askIndex, model, dailyLimit, globalDailyLimit } })
  return { app, bearer: await token(privateKey, { sub: newUser() }), newBearer: () => token(privateKey, { sub: newUser() }) }
}
```

`describe('POST /ask', …)` 안에 더한다.

```ts
  it('서버 전체 하루 한도를 넘으면 429이고, 그 사람의 횟수는 되돌린다', async () => {
    const { app, bearer, newBearer } = await askApp(good, 5, index, 1)
    expect((await post(app, bearer, { question: '가인의 표가 뭐예요?' })).status).toBe(200)
    const other = await newBearer()
    const blocked = await post(app, other, { question: '가인의 표가 뭐예요?' })
    expect(blocked.status).toBe(429)
    // 그 사람의 남은 횟수는 그대로라 remaining을 보내지 않는다.
    expect(await blocked.json()).toEqual({ error: '오늘은 질문을 더 받을 수 없어요. 내일 다시 물어 주세요.' })
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${other}` } })
    expect(await usage.json()).toMatchObject({ remaining: 5 })
  })

  it('답을 만들지 못하면 서버 전체 횟수도 되돌린다', async () => {
    let fail = true
    const flaky: AskModel = async (...args: Parameters<AskModel>) => {
      if (fail) {
        fail = false
        throw new Error('모델 오류')
      }
      return good(...args)
    }
    const { app, bearer, newBearer } = await askApp(flaky, 5, index, 1)
    expect((await post(app, bearer, { question: '가인의 표가 뭐예요?' })).status).toBe(502)
    expect((await post(app, await newBearer(), { question: '가인의 표가 뭐예요?' })).status).toBe(200)
  })
```

`AskModel`이 함수 형이 아니면 `good`과 같은 모양으로 맞춘다(파일 위의 `answering`이 만드는 모양을 따른다).

`server/test/config.test.ts`에 더한다.

```ts
  it('서버 전체 하루 한도는 ASK_GLOBAL_DAILY_LIMIT이고, 비었거나 틀리면 200이다', () => {
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '50' }).askGlobalDailyLimit).toBe(50)
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '' }).askGlobalDailyLimit).toBe(200)
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '0' }).askGlobalDailyLimit).toBe(200)
    expect(readConfig({}).askGlobalDailyLimit).toBe(200)
  })
```

- [ ] **Step 2: 시험이 실패하는지 본다**

Run: `rtk proxy npm test -w server`
Expected: 새 시험 넷이 실패한다. `/health`는 200이고, 서버 전체 한도가 없어 둘째 사용자가 200이며, `askGlobalDailyLimit`이 `undefined`다.

- [ ] **Step 3: 구현**

`server/src/db.ts`의 `migrate` 끝에 더한다.

```ts
  // 질문하기 횟수: 서버 전체, 한국 날짜마다
  await sql.query(`CREATE TABLE IF NOT EXISTS ask_daily (
    day TEXT PRIMARY KEY,
    count INTEGER NOT NULL
  )`)
```

`server/src/ask/usage.ts`에 더한다.

```ts
// 서버 전체의 하루 질문 수. 누구나 가입할 수 있으므로 계정을 많이 만들어도 하루 비용이 이 안에 머물게 한다.
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200

// 서버 전체에서 한 번 쓴다. 한도를 넘으면 되돌리고 false다.
export async function takeGlobalAsk(query: Query, day: string, limit: number): Promise<boolean> {
  const rows = await query<{ count: number | string }>(
    `INSERT INTO ask_daily (day, count) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET count = ask_daily.count + 1
     RETURNING count`,
    [day],
  )
  if (Number(rows[0]?.count ?? 0) <= limit) return true
  await giveBackGlobal(query, day)
  return false
}

// 답을 만들지 못했을 때 서버 전체의 한 번을 되돌린다.
export async function giveBackGlobal(query: Query, day: string): Promise<void> {
  await query('UPDATE ask_daily SET count = GREATEST(count - 1, 0) WHERE day = $1', [day])
}
```

`server/src/app.ts`:
- `AskDeps`에 `globalDailyLimit?: number`를 더한다(주석: 서버 전체 하루 한도. 없으면 200).
- import에 `DEFAULT_GLOBAL_DAILY_LIMIT`, `giveBackGlobal`, `takeGlobalAsk`를 더한다.
- `/health`를 바꾼다.

```ts
  // 상태 확인(Compose, 입구). DB까지 닿는지 본다. 끊겼으면 503이다.
  app.get('/health', async (c) => {
    try {
      await deps.sql.query('SELECT 1')
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })
```

- `/ask`에서 사람 한도를 쓴 바로 뒤(`if (!taken.allowed) …` 다음)에 더한다.

```ts
      // 서버 전체 한도. 넘으면 이 사람의 한 번도 되돌린다(그 사람의 남은 횟수는 그대로라 remaining을 보내지 않는다).
      if (!(await takeGlobalAsk(deps.sql.query, day, ask.globalDailyLimit ?? DEFAULT_GLOBAL_DAILY_LIMIT))) {
        await giveBack(deps.sql.query, user.sub, day)
        return c.json({ error: '오늘은 질문을 더 받을 수 없어요. 내일 다시 물어 주세요.' }, 429)
      }
```

- 답을 만들지 못한 `catch`에서 `await giveBack(…)` 다음 줄에 `await giveBackGlobal(deps.sql.query, day)`를 더한다.

`server/src/config.ts`:
- `Config`에 `askGlobalDailyLimit: number`(주석: 서버 전체 하루 질문 수)를 더한다.
- `readConfig`에 `askGlobalDailyLimit: positiveInt(env.ASK_GLOBAL_DAILY_LIMIT, 200)`를 더한다.

`server/src/index.ts`의 `loadAsk`:
- 돌려주는 값에 `globalDailyLimit: config.askGlobalDailyLimit`를 더한다.
- 시작 로그의 `하루 ${config.askDailyLimit}번` 뒤에 `, 서버 전체 하루 ${config.askGlobalDailyLimit}번`을 더한다.

리포 루트 `.env.example`의 `ASK_DAILY_LIMIT=` 다음 줄에 더한다.

```
# 서버 전체의 하루 질문 수 (비워 두면 200). 누구나 가입하는 서버에서 비용의 상한이다.
ASK_GLOBAL_DAILY_LIMIT=
```

- [ ] **Step 4: 통과하는지 본다**

Run: `rtk proxy npm test -w server && rtk proxy npm run typecheck -w server`
Expected: 모두 통과. 이전 51개 + 새 4개, 링크 시험 2개는 이 PC에서 건너뛴다.

- [ ] **Step 5: 커밋**

```bash
git add server .env.example
git commit -F <메시지 파일>   # feat(server): 질문하기에 서버 전체 하루 한도를 두고, /health가 DB까지 본다
```

---

### Task 2: 운영용 키클락 realm과 배포 파일 시험

**Files:**
- Create: `deploy/keycloak/chansu-bible-realm.json`, `server/test/deploy.test.ts`

- [ ] **Step 1: 실패하는 시험을 쓴다** — `server/test/deploy.test.ts`

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 맥미니 배포 파일(deploy/)이 지켜야 할 것. 리포가 공개라 비밀 값과 시험 계정이 들어가지 않게 막는다.
const repoDir = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(repoDir, file), 'utf8')

describe('운영용 키클락 realm', () => {
  const realm = JSON.parse(read('deploy/keycloak/chansu-bible-realm.json'))

  it('시험 계정과 개발용 클라이언트가 없다', () => {
    expect(realm.users ?? []).toEqual([])
    expect(realm.clients.map((client: { clientId: string }) => client.clientId)).toEqual(['chansu-bible-app'])
  })

  it('앱 클라이언트는 PKCE 공개 클라이언트이고 앱으로만 돌아온다', () => {
    const [app] = realm.clients
    expect(app).toMatchObject({ publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false })
    expect(app.redirectUris).toEqual(['chansubible://*'])
    expect(app.webOrigins ?? []).toEqual([])
    expect(app.attributes['pkce.code.challenge.method']).toBe('S256')
    expect(app.optionalClientScopes).toContain('offline_access')
  })

  it('누구나 가입하고, 메일이 필요한 기능은 끄고, 로그인 실패를 막는다', () => {
    expect(realm).toMatchObject({
      realm: 'chansu-bible',
      registrationAllowed: true,
      resetPasswordAllowed: false,
      verifyEmail: false,
      bruteForceProtected: true,
      sslRequired: 'external',
      defaultLocale: 'ko',
    })
    expect(realm.passwordPolicy).toContain('length(8)')
  })
})
```

Run: `rtk proxy npm test -w server`
Expected: `deploy.test.ts`가 파일이 없어 실패한다(ENOENT).

- [ ] **Step 2: realm 파일** — `deploy/keycloak/chansu-bible-realm.json`

개발용 `infra/keycloak/chansu-bible-realm.json`을 바탕으로 한다. 시험 계정(`users`)과 `chansu-bible-test` 클라이언트는 없다.

```json
{
  "realm": "chansu-bible",
  "enabled": true,
  "displayName": "장면으로 읽는 성경",
  "registrationAllowed": true,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": false,
  "verifyEmail": false,
  "rememberMe": false,
  "bruteForceProtected": true,
  "permanentLockout": false,
  "failureFactor": 5,
  "passwordPolicy": "length(8) and notUsername and notEmail",
  "internationalizationEnabled": true,
  "supportedLocales": ["ko", "en"],
  "defaultLocale": "ko",
  "sslRequired": "external",
  "accessTokenLifespan": 900,
  "offlineSessionIdleTimeout": 2592000,
  "clients": [
    {
      "clientId": "chansu-bible-app",
      "name": "장면 성경 앱",
      "enabled": true,
      "publicClient": true,
      "protocol": "openid-connect",
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "frontchannelLogout": false,
      "redirectUris": ["chansubible://*"],
      "webOrigins": [],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "chansubible://*"
      },
      "defaultClientScopes": ["web-origins", "acr", "basic", "profile", "roles", "email"],
      "optionalClientScopes": ["offline_access"]
    }
  ]
}
```

- [ ] **Step 3: 통과하는지 본다**

Run: `rtk proxy npm test -w server`
Expected: 통과

- [ ] **Step 4: 커밋**

```bash
git add deploy/keycloak server/test/deploy.test.ts
git commit -F <메시지 파일>   # feat(deploy): 운영용 키클락 realm(시험 계정 없음, 앱으로만 돌아옴, 로그인 실패 막기)
```

---

### Task 3: 서버 이미지

**Files:**
- Create: `deploy/server.Dockerfile`, `.dockerignore`(리포 루트)
- Modify: `server/test/deploy.test.ts`

- [ ] **Step 1: 시험을 더한다** — `server/test/deploy.test.ts` 끝에

```ts
describe('서버 이미지', () => {
  it('빌드 맥락에서 .env와 node_modules를 뺀다', () => {
    const ignore = read('.dockerignore').split('\n').map((line) => line.trim())
    expect(ignore).toContain('**/.env')
    expect(ignore).toContain('**/node_modules')
  })
})
```

Run: `rtk proxy npm test -w server`
Expected: `.dockerignore`가 없어 실패한다.

- [ ] **Step 2: `.dockerignore`**(리포 루트, 빌드 맥락은 리포 루트다)

```
# 서버 이미지(deploy/server.Dockerfile)의 빌드 맥락. 비밀 값과 큰 폴더는 넣지 않는다.
**/node_modules
**/.env
**/.env.*
!**/.env.example
.git
.claude
content
publish
**/*.tmp
**/.vitest
**/dist
# 작업 공간 목록이 맞아야 npm ci가 되므로 다른 작업 공간은 package.json만 넣는다.
app/*
!app/package.json
admin/*
!admin/package.json
mobile/*
!mobile/package.json
pipeline/*
!pipeline/package.json
```

- [ ] **Step 3: `deploy/server.Dockerfile`**

```dockerfile
# 동기화·질문하기 서버 이미지. 빌드 맥락은 리포 루트다(deploy/compose.yaml).
FROM node:22-bookworm-slim
WORKDIR /app
# 작업 공간 목록이 맞아야 npm ci가 되므로 모든 작업 공간의 package.json을 넣고, 설치는 서버만 한다.
COPY package.json package-lock.json ./
COPY packages/reader-core/package.json packages/reader-core/
COPY server/package.json server/
COPY pipeline/package.json pipeline/
COPY app/package.json app/
COPY admin/package.json admin/
COPY mobile/package.json mobile/
RUN npm ci --workspace server --no-audit --no-fund
COPY packages/reader-core packages/reader-core
COPY server server
WORKDIR /app/server
EXPOSE 8790
# 서버는 지금처럼 tsx로 TypeScript를 바로 돌린다.
CMD ["../node_modules/.bin/tsx", "src/index.ts"]
```

- [ ] **Step 4: 빌드하고 확인한다**(이 PC의 Docker)

```bash
docker build -f deploy/server.Dockerfile -t chansu-server:check .
docker run --rm chansu-server:check sh -c 'ls -a /app; test ! -e /app/.env && echo no-env'
docker run --rm -e DATABASE_URL=postgres://u:p@127.0.0.1:1/x chansu-server:check
docker image rm chansu-server:check
```

Expected:
- 빌드가 성공한다.
- `/app`에 `.env`가 없다(`no-env`).
- 마지막 실행은 Postgres에 연결하지 못했다는 한국어 오류로 끝난다(종료 코드 1). 이것이 서버가 이미지 안에서 뜬다는 확인이다.
- `node_modules`에 `expo`나 `react-native`가 없어야 한다: `docker run --rm chansu-server:check ls /app/node_modules | grep -c expo`가 0.
  - 들어 있으면 `npm ci --workspace server`가 다른 작업 공간까지 설치한 것이다. 그때는 `--include-workspace-root=false`를 더하거나 원인을 보고하고, 무엇을 바꿨는지 적는다.

- [ ] **Step 5: 통과와 커밋**

Run: `rtk proxy npm test -w server`
Expected: 통과

```bash
git add .dockerignore deploy/server.Dockerfile server/test/deploy.test.ts
git commit -F <메시지 파일>   # build(deploy): 서버 이미지(.env를 넣지 않고 서버 작업 공간만 설치)
```

---

### Task 4: Compose, 입구, Postgres 초기화, 설정 견본

**Files:**
- Create: `deploy/compose.yaml`, `deploy/Caddyfile`, `deploy/postgres/10-keycloak.sql`, `deploy/.env.example`
- Modify: `server/test/deploy.test.ts`

- [ ] **Step 1: 시험을 더한다** — `server/test/deploy.test.ts` 끝에

```ts
describe('Compose와 입구', () => {
  const compose = read('deploy/compose.yaml')

  it('포트는 맥미니 자신(127.0.0.1)에만 연다', () => {
    const lines = compose.split('\n')
    const published = lines.flatMap((line, at) => (lines[at - 1]?.trim() === 'ports:' ? [line.trim()] : []))
    expect(published).toHaveLength(2)
    for (const line of published) expect(line.startsWith("- '127.0.0.1:")).toBe(true)
  })

  it('비밀번호는 deploy/.env에서만 받는다', () => {
    expect(compose).not.toMatch(/PASSWORD:\s*(?!\$\{)/)
  })

  it('입구는 키클락 관리 화면을 먼저 막고, 공개 스킴을 알린다', () => {
    const caddy = read('deploy/Caddyfile')
    const block = caddy.indexOf('handle @kcadmin')
    const keycloak = caddy.indexOf('handle @keycloak')
    expect(block).toBeGreaterThan(-1)
    expect(block).toBeLessThan(keycloak)
    expect(caddy).toContain('header_up X-Forwarded-Proto {$PUBLIC_SCHEME}')
  })

  it('설정 견본에는 비밀 값이 비어 있다', () => {
    const example = read('deploy/.env.example')
    for (const key of ['DB_PASSWORD', 'KC_ADMIN_PASSWORD', 'OPENAI_API_KEY']) expect(example).toMatch(new RegExp(`^${key}=$`, 'm'))
  })
})
```

Run: `rtk proxy npm test -w server`
Expected: 새 시험이 파일이 없어 실패한다.

- [ ] **Step 2: `deploy/postgres/10-keycloak.sql`**

```sql
-- 처음 DB를 만들 때 한 번 돈다. 키클락이 쓸 데이터베이스다(동기화 서버는 chansu 데이터베이스를 쓴다).
CREATE DATABASE keycloak;
```

- [ ] **Step 3: `deploy/Caddyfile`**

```
# 맥미니의 유일한 입구. TLS는 앞의 Tailscale Funnel(나중에는 Cloudflare 터널)이 맡고 여기는 HTTP로 받는다.
{
	admin off
	auto_https off
}

:80 {
	# 키클락 관리 화면은 밖에서 열지 않는다. 맥미니 안에서 127.0.0.1:${KC_ADMIN_PORT}로만 연다.
	@kcadmin path /auth/admin /auth/admin/*
	handle @kcadmin {
		respond 404
	}

	# 키클락은 /auth 아래에서 돈다. 밖에서 HTTPS로 왔다는 것을 키클락에 직접 알린다.
	@keycloak path /auth /auth/*
	handle @keycloak {
		reverse_proxy keycloak:8080 {
			header_up X-Forwarded-Proto {$PUBLIC_SCHEME}
		}
	}

	# 그 밖은 동기화·질문하기 서버(2단계부터 /content도)
	handle {
		reverse_proxy server:8790
	}
}
```

- [ ] **Step 4: `deploy/compose.yaml`**

```yaml
# 맥미니 운영용. 띄우기: docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
# 모든 포트는 맥미니 자신(127.0.0.1)에만 연다. 밖에서는 Tailscale Funnel이 입구(caddy)로 보낸다.
name: chansu-bible-prod

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: chansu
      POSTGRES_PASSWORD: ${DB_PASSWORD:?deploy/.env에 DB_PASSWORD를 적으세요}
      POSTGRES_DB: chansu
    volumes:
      - db-data:/var/lib/postgresql/data
      # 처음 만들 때 한 번: 키클락이 쓸 데이터베이스
      - ./postgres:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U chansu -d chansu']
      interval: 5s
      timeout: 3s
      retries: 30

  keycloak:
    image: quay.io/keycloak/keycloak:26.8
    restart: unless-stopped
    # 운영 모드. realm이 아직 없을 때만 deploy/keycloak의 realm 파일을 읽는다.
    command: ['start', '--import-realm']
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db:5432/keycloak
      KC_DB_USERNAME: chansu
      KC_DB_PASSWORD: ${DB_PASSWORD}
      KC_HOSTNAME: ${PUBLIC_URL:?deploy/.env에 PUBLIC_URL을 적으세요}/auth
      KC_HOSTNAME_ADMIN: http://127.0.0.1:${KC_ADMIN_PORT:-8180}/auth
      KC_HTTP_ENABLED: 'true'
      KC_HTTP_RELATIVE_PATH: /auth
      KC_PROXY_HEADERS: xforwarded
      KC_HEALTH_ENABLED: 'true'
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD:?deploy/.env에 KC_ADMIN_PASSWORD를 적으세요}
    volumes:
      - ./keycloak:/opt/keycloak/data/import:ro
    # 관리 화면: SSH 포트 전달로만 연다(ssh -L 8180:127.0.0.1:8180 mainserver)
    ports:
      - '127.0.0.1:${KC_ADMIN_PORT:-8180}:8080'
    depends_on:
      db:
        condition: service_healthy

  server:
    build:
      context: ..
      dockerfile: deploy/server.Dockerfile
    restart: unless-stopped
    init: true
    environment:
      HOST: 0.0.0.0
      PORT: '8790'
      DATABASE_URL: postgres://chansu:${DB_PASSWORD}@db:5432/chansu
      AUTH_ISSUERS: ${PUBLIC_URL}/auth/realms/chansu-bible
      AUTH_JWKS_URL: http://keycloak:8080/auth/realms/chansu-bible/protocol/openid-connect/certs
      AUTH_CLIENTS: chansu-bible-app
      BUNDLE_DIR: /content
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ASK_MODEL: ${ASK_MODEL:-}
      ASK_DAILY_LIMIT: ${ASK_DAILY_LIMIT:-20}
      ASK_GLOBAL_DAILY_LIMIT: ${ASK_GLOBAL_DAILY_LIMIT:-200}
    volumes:
      # 1단계: 맥미니 리포에서 만든 책 묶음(npm run pipeline -- build). 2단계 Task 9에서 publish/로 바뀐다.
      - ../app/public/content:/content:ro
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:8790/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 12

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment:
      PUBLIC_SCHEME: ${PUBLIC_SCHEME:-https}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    # 입구: Tailscale Funnel이 이 포트로 보낸다(tailscale funnel --bg http://127.0.0.1:8443)
    ports:
      - '127.0.0.1:${PROXY_PORT:-8443}:80'
    depends_on:
      - server
      - keycloak

volumes:
  db-data:
```

- [ ] **Step 5: `deploy/.env.example`**

```
# 맥미니 운영 설정. 이 파일을 deploy/.env로 복사해 값을 채운다. deploy/.env는 커밋하지 않는다(.gitignore의 .env).
# 공개 주소: Tailscale Funnel 주소(https://<맥미니 이름>.<tailnet>.ts.net, 끝에 /를 붙이지 않는다). 도메인으로 옮기면 그 주소로 바꾼다.
PUBLIC_URL=
# 공개 주소의 스킴. PC에서 http로 시험할 때만 http로 바꾼다.
PUBLIC_SCHEME=https
# 비밀 값은 맥미니에서 새로 만든다: openssl rand -base64 24
DB_PASSWORD=
KC_ADMIN_PASSWORD=
# 질문하기. 비우면 질문하기를 끈다. PC와 다른 키를 만들어 맥미니에만 둔다.
OPENAI_API_KEY=
ASK_MODEL=
ASK_DAILY_LIMIT=20
ASK_GLOBAL_DAILY_LIMIT=200
# 맥미니 자신에게만 여는 포트. 맥미니의 다른 서버와 겹치면 바꾼다.
PROXY_PORT=8443
KC_ADMIN_PORT=8180
```

- [ ] **Step 6: Compose 파일을 검사한다**(띄우지 않는다)

시스템 임시 폴더에 시험용 env 파일을 만든다. 비밀번호 자리에는 아무 글자나 넣는다. 그 파일로 해석이 되는지만 본다.

```bash
docker compose -f deploy/compose.yaml --env-file <임시 env 파일> config --quiet && echo compose-ok
```

Expected: `compose-ok`. 그 뒤 임시 파일을 지운다.

- [ ] **Step 7: 통과와 커밋**

Run: `rtk proxy npm test -w server`
Expected: 통과

```bash
git add deploy/compose.yaml deploy/Caddyfile deploy/postgres deploy/.env.example server/test/deploy.test.ts
git commit -F <메시지 파일>   # feat(deploy): 맥미니용 Compose(Postgres, 운영 키클락, 서버, Caddy 입구)와 설정 견본
```

---

### Task 5: 올리기·백업 스크립트

**Files:**
- Create: `deploy/update.sh`, `deploy/backup.sh`, `deploy/launchd/com.chansubible.backup.plist`

- [ ] **Step 1: `deploy/update.sh`**

```bash
#!/usr/bin/env bash
# 맥미니에서 돌린다: 리포를 받고, 묶음을 만들고, 서버를 다시 띄우고, 상태를 확인한다.
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose -f deploy/compose.yaml --env-file deploy/.env)

git pull --ff-only
npm ci
# 1단계 서버는 책 묶음을 읽는다. 2단계 Task 9부터는 npm run pipeline -- publish로 바뀐다.
npm run pipeline -- build
"${compose[@]}" up -d --build
# 서버는 시작할 때 묶음을 읽으므로 새 묶음을 읽게 다시 띄운다.
"${compose[@]}" restart server

port=$(grep -E '^PROXY_PORT=' deploy/.env | cut -d= -f2)
port=${port:-8443}
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null; then
    echo "서버가 떴습니다: http://127.0.0.1:${port}/health"
    exit 0
  fi
  sleep 2
done
echo "서버 상태 확인에 실패했습니다. 로그: ${compose[*]} logs server" >&2
exit 1
```

- [ ] **Step 2: `deploy/backup.sh`**

```bash
#!/usr/bin/env bash
# DB 전체(동기화 기록과 키클락 계정)를 압축해 백업하고 14일보다 오래된 것은 지운다.
set -euo pipefail
cd "$(dirname "$0")/.."
dir="${BACKUP_DIR:-$HOME/chansu-backups}"
mkdir -p "$dir"
file="$dir/chansu-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db pg_dumpall -U chansu | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find "$dir" -name 'chansu-*.sql.gz' -mtime +14 -delete
echo "백업: $file"
```

- [ ] **Step 3: `deploy/launchd/com.chansubible.backup.plist`**

`__REPO__`와 `__HOME__`은 설치할 때 바꾼다(`deploy/README.md`). `bash -lc`로 돌려 Docker가 PATH에 들게 한다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.chansubible.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>__REPO__/deploy/backup.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>__HOME__/Library/Logs/chansu-backup.log</string>
  <key>StandardErrorPath</key>
  <string>__HOME__/Library/Logs/chansu-backup.log</string>
</dict>
</plist>
```

- [ ] **Step 4: 문법 확인과 실행 권한**

```bash
bash -n deploy/update.sh && bash -n deploy/backup.sh && echo sh-ok
git add deploy/update.sh deploy/backup.sh deploy/launchd
git update-index --chmod=+x deploy/update.sh deploy/backup.sh
git ls-files -s deploy/update.sh deploy/backup.sh
```

Expected: `sh-ok`. 두 줄 모두 `100755`.

- [ ] **Step 5: 커밋**

```bash
git commit -F <메시지 파일>   # feat(deploy): 맥미니 올리기(update.sh)와 매일 DB 백업(backup.sh, launchd)
```

---

### Task 6: 문서와 앱 빌드 환경

**Files:**
- Create: `deploy/README.md`
- Modify: `README.md`, `mobile/eas.json`, `docs/superpowers/plans/2026-10-10-books-and-release-stage2.md`

- [ ] **Step 1: `mobile/eas.json`**: `preview` 프로필에 EAS 환경을 정한다. 맥미니 주소는 EAS 환경 변수로 넣고 리포에 커밋하지 않는다.

```json
    "preview": {
      "distribution": "internal",
      "environment": "preview",
      "android": {
        "buildType": "apk"
      }
    },
```

- [ ] **Step 2: `deploy/README.md`**

한국어로, 맥미니에서 처음 한 번 하는 일과 그 뒤에 하는 일을 순서대로 쓴다. 각 절에 아래 명령을 그대로 넣는다. 문장은 짧은 "-다" 체다.

1. **준비물:** Apple Silicon 맥미니, 관리자 계정, SSH 이름 `mainserver`(사용자의 `~/.ssh/config`).
2. **설치:**
   - `brew install node@22 git`(Homebrew가 없으면 brew.sh)
   - Docker: OrbStack(`brew install --cask orbstack`) 또는 Docker Desktop. 설정에서 로그인할 때 자동 시작을 켠다.
   - Tailscale: tailscale.com의 독립 실행 앱(CLI와 Funnel이 되는 판)을 깔고 `tailscale up`.
   - Tailscale 관리 화면의 DNS에서 MagicDNS와 HTTPS 인증서를 켠다. Funnel은 처음 `tailscale funnel`을 돌릴 때 나오는 안내 주소로 켠다.
3. **잠자기 끄기와 자동 켜짐:** `sudo pmset -a sleep 0 disksleep 0 autorestart 1`.
   - 정전 뒤 서비스가 다시 뜨려면 사용자가 로그인되어 있어야 한다(Docker가 로그인 항목이다).
   - 자동 로그인을 켜는 것은 선택이다. FileVault를 쓰면 자동 로그인이 안 된다는 것도 적는다.
4. **리포 받기:**
   - `git clone https://github.com/chansu-bible/chansu-bible-temp.git ~/chansu-bible`
   - `cd ~/chansu-bible && git switch feature/books-and-release`(main에 합친 뒤에는 main)
   - `npm ci && npm run pipeline -- build`
5. **설정:**
   - `cp deploy/.env.example deploy/.env`
   - `PUBLIC_URL`은 `tailscale status --json`의 `Self.DNSName`에서 끝의 `.`를 떼고 앞에 `https://`를 붙인 것이다.
   - 비밀번호는 `openssl rand -base64 24`로 하나씩 만든다.
   - OpenAI 키는 PC와 다른 새 키다.
   - 관리 도구와 파이프라인이 쓸 리포 루트 `.env`(OpenAI 키)는 따로다.
6. **띄우기:**
   - `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build`
   - `docker compose -f deploy/compose.yaml --env-file deploy/.env ps`
   - `curl http://127.0.0.1:8443/health`
   - 키클락의 첫 시작은 1~2분 걸린다.
7. **공개:** `tailscale funnel --bg http://127.0.0.1:8443` 뒤 `tailscale funnel status`.
   - 폰(와이파이를 끄고)에서 `https://…/health`가 `{"ok":true}`인지 본다.
   - 443을 다른 서비스가 쓰고 있으면 `--https=8443`으로 열고, 공개 주소에 `:8443`을 붙인다.
8. **키클락 관리 화면:** PC에서 `ssh -L 8180:127.0.0.1:8180 mainserver`로 연결하고 `http://127.0.0.1:8180/auth/admin`을 연다(`admin` / `KC_ADMIN_PASSWORD`).
   - 처음 만든 관리자는 임시 관리자다. 영구 관리자를 만들고 임시 관리자를 지운다.
   - 밖에서 `https://…/auth/admin`이 404인지 본다.
9. **앱 빌드:** `mobile` 폴더에서 다음 둘을 넣고 `npx eas-cli build --platform android --profile preview`.
   - `npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://… --visibility plaintext`
   - `EXPO_PUBLIC_AUTH_ISSUER`(`https://…/auth/realms/chansu-bible`)
10. **관리 도구:** PC에서 `ssh -L 5174:127.0.0.1:5174 -L 8787:127.0.0.1:8787 mainserver`로 연결하고, 맥미니에서 `cd ~/chansu-bible && npm run admin`(SSH가 끊겨도 돌게 `tmux`를 권한다). PC 브라우저에서 `http://localhost:5174`를 연다.
    - 콘텐츠는 맥미니에서 고치고 커밋·푸시한다. 코드는 PC에서 고친다. 같은 콘텐츠 파일을 두 곳에서 함께 고치지 않는다.
11. **올리기:** `deploy/update.sh`(받기, 설치, 묶음, 다시 띄우기, 상태 확인).
12. **백업과 되살리기:**
    - 백업: `deploy/backup.sh`
    - 매일 백업 설치:

      ```bash
      sed "s#__REPO__#$PWD#g; s#__HOME__#$HOME#g" deploy/launchd/com.chansubible.backup.plist > ~/Library/LaunchAgents/com.chansubible.backup.plist && launchctl load ~/Library/LaunchAgents/com.chansubible.backup.plist
      ```

    - 되살리기: 새 볼륨으로 `db`만 띄운 뒤

      ```bash
      gunzip -c <파일> | docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db psql -U chansu -d postgres
      ```

13. **로그와 멈추기:**
    - 로그: `docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f server`
    - 멈추기: `… down`. 볼륨은 남는다. `down -v`는 DB를 지우므로 쓰지 않는다.
14. **문제 해결:**
    - 밖에서 로그인할 때 "HTTPS required": `PUBLIC_SCHEME=https`인지와 Caddy 로그를 본다.
    - 포트가 겹칠 때: `PROXY_PORT`, `KC_ADMIN_PORT`를 바꾼다.
    - 키클락 설정을 realm 파일로 다시 넣고 싶을 때: realm 파일은 처음 한 번만 읽힌다. 관리 화면에서 고친다.
15. **도메인으로 옮기기:** 설계 문서 10절의 다섯 단계를 그대로 옮긴다.

- [ ] **Step 3: `README.md`**: "네이티브 앱" 절 끝(로그인·동기화 설명 뒤)에 짧은 절을 더한다.

```markdown
### 맥미니에 서버 띄우기

폰에 깐 앱이 집 밖에서도 로그인·동기화·질문하기를 쓰게, 사용자의 맥미니에 Postgres·키클락·서버·입구(Caddy)를 Docker Compose로 띄우고 Tailscale Funnel로 연다. 준비와 올리기, 백업은 [deploy/README.md](deploy/README.md)에 있다. 설계는 [docs/superpowers/specs/2026-10-10-macmini-deploy-design.md](docs/superpowers/specs/2026-10-10-macmini-deploy-design.md).
```

- [ ] **Step 4: 2단계 계획에 메모**: `docs/superpowers/plans/2026-10-10-books-and-release-stage2.md`

  - Task 8의 Step 1 아래에 더한다: "`deploy/compose.yaml`의 `server`에 `CONTENT_DIR=/publish`와 `../publish:/publish:ro`를 더한다(`CONTENT_PREVIEW`는 맥미니에서 켜지 않는다). Caddy는 `/content`를 이미 서버로 보낸다."
  - Task 9의 Step 3 아래에 더한다: "`deploy/compose.yaml`에서 `BUNDLE_DIR`와 `../app/public/content` 붙이기를 지우고, `deploy/update.sh`는 `npm run pipeline -- build` 대신 `npm run pipeline -- publish`를 돈다."
  - 두 Task의 커밋 줄에 `deploy`를 더한다.

- [ ] **Step 5: 확인과 커밋**

Run: `rtk proxy npm test -w server`(배포 파일 시험이 그대로 통과)

```bash
git add deploy/README.md README.md mobile/eas.json docs/superpowers/plans/2026-10-10-books-and-release-stage2.md
git commit -F <메시지 파일>   # docs(deploy): 맥미니 준비·올리기·백업 문서와 앱 빌드 환경(EAS preview)
```

---

### Task 7: PC에서 같은 구성으로 확인(진행자가 한다)

이 PC의 Docker로 시험용 env로 띄우고 확인한 뒤, 볼륨까지 지운다. 시험 값(비밀번호, 시험 계정)은 시스템 임시 폴더의 파일에만 두고 화면에 찍지 않는다. 이 시험 스택은 `localhost`에서만 돌고 끝나면 지운다.

- [ ] **Step 1: 시험 env**: 임시 폴더에 `deploy-check.env`를 만든다. 비밀번호 둘은 node `crypto.randomBytes`로 만든다.
  - `PUBLIC_URL=http://localhost:18443`, `PUBLIC_SCHEME=http`
  - `PROXY_PORT=18443`, `KC_ADMIN_PORT=18180`
  - `OPENAI_API_KEY`는 비운다(질문하기는 끈다. 서버 전체 한도는 Task 1의 시험이 고정한다).
- [ ] **Step 2: 띄우기**: `docker compose -p chansu-bible-deploycheck -f deploy/compose.yaml --env-file <deploy-check.env> up -d --build`. 키클락이 뜰 때까지 기다린다.
- [ ] **Step 3: 확인 스크립트**(임시 폴더의 node 스크립트, 값을 찍지 않는다):
  1. `GET http://127.0.0.1:18443/health`가 200 `{ ok: true }`다.
  2. `GET http://127.0.0.1:18443/auth/realms/chansu-bible/.well-known/openid-configuration`의 `issuer`가 `http://localhost:18443/auth/realms/chansu-bible`이다.
  3. `GET http://127.0.0.1:18443/auth/admin/`가 404다.
  4. `GET http://127.0.0.1:18180/auth/admin/`가 200 또는 302다.
  5. 관리 API로 시험 계정을 만든다.
     - master realm의 `admin-cli`로 시험 관리자 비밀번호를 써서 토큰을 받는다.
     - 이 시험 스택의 `chansu-bible-app`에 직접 비밀번호 받기를 켠다.
     - 시험 사용자를 만든다(값은 임시 파일에서).
     - 그 사용자로 토큰을 받는다. 토큰의 `iss`가 2와 같다.
  6. `POST http://127.0.0.1:18443/sync`(그 토큰, `{ since: 0, changes: [] }`)가 200이다.
  7. 토큰 없이 `/sync`는 401이다.
- [ ] **Step 4: 지우기**: `docker compose -p chansu-bible-deploycheck -f deploy/compose.yaml --env-file <deploy-check.env> down -v`, 서버 이미지 지우기, 임시 env와 스크립트 지우기.
- [ ] **Step 5: 기록**: 결과를 설계 문서 11절 아래에 "PC 확인 (날짜): 통과한 것, 고친 것"으로 적고 커밋한다(`docs(deploy): PC에서 맥미니 구성을 확인함`). 확인 중 고친 파일이 있으면 그 Task의 방식대로 시험과 함께 고친다.
