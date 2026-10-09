# 네이티브 앱 3단계: 키클락 로그인과 기록 동기화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 키클락으로 로그인하면 기기 기록(읽은 장면, 읽던 곳, 계획, 밑줄·메모)이 서버와 맞춰져 다른 기기에서도 같아진다. 로그인하지 않아도 앱은 지금처럼 모두 동작한다.

**Architecture:** 로컬 도커로 Postgres와 키클락(realm `chansu-bible`, 공개 클라이언트 `chansu-bible-app`, PKCE)을 띄운다. 새 `server/` 워크스페이스(Hono)는 키클락 JWKS로 토큰을 검증하고, `POST /sync` 한 번으로 바뀐 줄을 받고(나중에 고친 쪽이 이김) 다른 기기가 바꾼 줄을 서버 순번 기준으로 돌려준다. 앱은 expo-auth-session으로 로그인하고, 기록 저장소의 아직 안 올린 줄을 올린 뒤 받은 줄을 합친다. 합치는 규칙은 `reader-core`의 순수 함수로 두고 시험한다.

**Tech Stack:** Docker(Postgres 17, Keycloak 26.8), Hono 4, @hono/node-server, jose 6, pg 8, PGlite(서버 시험), zod 4, expo-auth-session, expo-secure-store, vitest.

**설계:** `docs/superpowers/specs/2026-10-09-native-app-design.md` 7·8절

**설계에서 바꾸거나 새로 정하는 것:**
- 개발 중 서버는 도커가 아니라 호스트에서 `tsx`로 돌린다(도커 안에서 모노레포를 설치하면 Expo 의존성까지 받아 무겁다). 도커에는 Postgres와 키클락만 둔다.
- 로그아웃하면 그 기기의 기록을 지운다(다른 계정으로 들어갔을 때 섞이지 않게). 기록은 계정에 남아 다시 로그인하면 받아 온다. 아직 올리지 못한 기록이 있으면 먼저 올려 보고, 못 올렸으면 한 번 더 묻는다.
- 로그인 창은 늘 로그인 양식을 보인다(`prompt=login`). 브라우저에 남은 키클락 세션 때문에 로그아웃 뒤 다른 계정으로 못 들어가는 일을 막는다.
- 로그인이 풀린 뒤 다른 계정으로 들어오면, 기기에 남은 앞 계정의 기록은 올리지 않고 비운다(그 기록은 앞 계정에 있다). 로그인 전에 쌓은 기록(주인 없음)은 들어온 계정으로 올린다.
- 기기에서 고친 시각은 그 줄이 이미 가진 시각보다 늘 뒤로 둔다. 기기 시계가 늦어도 새로 고친 것이 이긴다.
- 서버는 같은 사용자의 동기화를 차례로 처리한다(사용자별 잠금). 순번을 받아 간 뒤 그보다 앞 순번이 늦게 쓰여 빠지는 일이 없다.
- 앱은 한 번에 500줄씩 나눠 올린다(서버 한도). 받은 줄은 한 번에 쓴다(SQLite 트랜잭션 하나, 구독자 알림 한 번).

**코드 블록 표기:** 정보 문자열에 `path=`가 붙은 코드 블록은 그 파일의 전체 내용이다. 백틱 네 개로 연 블록은 안에 코드 블록을 품는다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `infra/docker-compose.yml`, `infra/keycloak/chansu-bible-realm.json`, `infra/dev-token.mjs`, `infra/README.md` | 개발용 Postgres·키클락, 시험 토큰 받기 |
| `packages/reader-core/src/records.ts` | 고친 시각 단조 증가, `getRow`·`dirtyRows`·`writeRows`·`clear` |
| `packages/reader-core/src/sync.ts` | 받은 줄 합치기, 주고받은 뒤 쓸 줄 정하기 |
| `server/src/config.ts` | 환경 변수 |
| `server/src/db.ts` | SQL 실행 인터페이스(pg, PGlite), 트랜잭션, 표 만들기 |
| `server/src/auth.ts` | 토큰 검증 |
| `server/src/records.ts` | 요청 형식, 줄 반영(나중 쓰기 이김)과 받아 가기 |
| `server/src/app.ts` | 경로(`/health`, `/me`, `/sync`), CORS, 크기 제한 |
| `server/src/index.ts` | 실행 |
| `server/test/*` | 서버 시험(PGlite, 시험용 키) |
| `mobile/src/auth/*` | 로그인 설정, 토큰 보관, 토큰 읽기, 로그인 상태 |
| `mobile/src/sync/*` | 한 번 맞추기, 언제 맞출지 |
| `mobile/src/account/AccountScreen.tsx`, `mobile/src/app/{account,auth}.tsx` | 계정 화면, 로그인 창이 돌아오는 경로 |

---

### Task 1: 개발용 Postgres와 키클락

**Files:**
- Create: `infra/docker-compose.yml`, `infra/keycloak/chansu-bible-realm.json`, `infra/dev-token.mjs`, `infra/README.md`
- Modify: 루트 `package.json`(스크립트)

- [ ] **Step 1: compose**

```yaml path=infra/docker-compose.yml
# 개발용 Postgres(동기화 서버)와 키클락(로그인). 둘 다 이 컴퓨터(127.0.0.1)에만 연다. 운영용이 아니다.
# 띄우기: npm run infra:up  /  멈추기: npm run infra:down
name: chansu-bible

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: chansu
      POSTGRES_PASSWORD: chansu-dev
      POSTGRES_DB: chansu
    ports:
      - '127.0.0.1:5433:5432'
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U chansu -d chansu']
      interval: 5s
      timeout: 3s
      retries: 20

  keycloak:
    image: quay.io/keycloak/keycloak:26.8
    # 개발 모드: http로 열고, 요청한 주소로 발급자(iss)를 정한다. realm이 아직 없을 때만 import 폴더의 realm 파일을 읽는다.
    command: ['start-dev', '--import-realm']
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin-dev
    ports:
      - '127.0.0.1:8080:8080'
    volumes:
      # 키클락의 개발용 DB(H2). 가입한 계정이 여기 남는다.
      - keycloak-data:/opt/keycloak/data
      - ./keycloak:/opt/keycloak/data/import:ro

volumes:
  db-data:
  keycloak-data:
```

- [ ] **Step 2: realm 설정**

시험 계정 `tester`의 id를 고정해 두어, 볼륨을 지우고 다시 읽어 들여도 토큰의 `sub`(서버 기록의 주인)가 같다. 가져온 사용자에게는 기본 역할이 저절로 붙지 않으므로 `default-roles-chansu-bible`을 적는다(그래야 `offline_access`를 받는다).

```json path=infra/keycloak/chansu-bible-realm.json
{
  "realm": "chansu-bible",
  "enabled": true,
  "displayName": "장면으로 읽는 성경",
  "registrationAllowed": true,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": false,
  "rememberMe": false,
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
      "redirectUris": ["chansubible://*", "exp://*", "http://localhost:8081/*"],
      "webOrigins": ["http://localhost:8081"],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "chansubible://*##exp://*##http://localhost:8081/*"
      },
      "defaultClientScopes": ["web-origins", "acr", "basic", "profile", "roles", "email"],
      "optionalClientScopes": ["offline_access"]
    },
    {
      "clientId": "chansu-bible-test",
      "name": "개발용 시험 클라이언트",
      "description": "비밀번호로 바로 토큰을 받는다. 서버를 손으로 시험할 때만 쓴다(infra/dev-token.mjs).",
      "enabled": true,
      "publicClient": true,
      "protocol": "openid-connect",
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": true,
      "defaultClientScopes": ["web-origins", "acr", "basic", "profile", "roles", "email"]
    }
  ],
  "users": [
    {
      "id": "6c1f2b8e-4d3a-4f6e-9b7a-2e5d8c0a1f34",
      "username": "tester",
      "enabled": true,
      "email": "tester@example.test",
      "emailVerified": true,
      "firstName": "시험",
      "lastName": "사용자",
      "realmRoles": ["default-roles-chansu-bible"],
      "credentials": [{ "type": "password", "value": "__TEST_PASSWORD__", "temporary": false }]
    }
  ]
}
```

시험 계정 비밀번호는 무작위로 만들어 realm 파일에만 적는다(이 컴퓨터의 개발용 키클락에서만 쓰는 값이다).

```bash
node -e "const fs=require('fs');const f='infra/keycloak/chansu-bible-realm.json';const pw='tester-local-'+require('crypto').randomBytes(9).toString('base64url');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('__TEST_PASSWORD__',pw))"
```

- [ ] **Step 3: 시험 토큰 받기**

```js path=infra/dev-token.mjs
// 개발용: realm 파일의 시험 계정으로 키클락에서 액세스 토큰을 받아 출력한다. 서버를 손으로 시험할 때 쓴다.
//   TOKEN=$(node infra/dev-token.mjs)
import { readFileSync } from 'node:fs'

const realm = JSON.parse(readFileSync(new URL('./keycloak/chansu-bible-realm.json', import.meta.url), 'utf8'))
const username = process.argv[2] ?? 'tester'
const user = realm.users.find((item) => item.username === username)
if (!user) throw new Error(`realm 파일에 ${username} 사용자가 없습니다`)

const issuer = process.env.AUTH_ISSUER ?? 'http://localhost:8080/realms/chansu-bible'
const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'chansu-bible-test',
    username: user.username,
    password: user.credentials[0].value,
    scope: 'openid',
  }),
})
const body = await response.json()
if (!response.ok) {
  console.error('토큰을 받지 못했습니다:', body)
  process.exit(1)
}
console.log(body.access_token)
```

- [ ] **Step 4: 설명서와 스크립트**

````md path=infra/README.md
# 개발용 인프라

`docker-compose.yml`은 동기화 서버가 쓰는 Postgres와 로그인용 키클락을 이 컴퓨터(127.0.0.1)에만 띄운다. 운영용이 아니다.

```bash
npm run infra:up      # 띄우기 (키클락은 처음에 30초쯤 걸린다)
npm run server        # 동기화 서버 (http://127.0.0.1:8790)
npm run infra:down    # 멈추기 (서버 기록과 가입한 계정은 도커 볼륨에 남는다)
```

| 무엇 | 주소 | 계정 |
|---|---|---|
| 키클락 관리 화면 | http://localhost:8080/admin | admin / admin-dev |
| realm `chansu-bible` | http://localhost:8080/realms/chansu-bible | 시험 계정 `tester`(비밀번호는 `keycloak/chansu-bible-realm.json`에 있다) |
| Postgres | 127.0.0.1:5433, DB `chansu` | chansu / chansu-dev |

- 여기 적은 비밀번호는 이 컴퓨터에서만 여는 개발용이다. 다른 곳에 열 때는 모두 바꾼다.
- realm 설정은 `keycloak/chansu-bible-realm.json`이다. 키클락은 realm이 아직 없을 때만 이 파일을 읽으므로, 고친 뒤에는 `docker compose -f infra/docker-compose.yml down -v`로 볼륨까지 지우고 다시 띄운다(가입한 계정과 서버 기록도 지워진다).
- 앱 클라이언트 `chansu-bible-app`은 공개 클라이언트(PKCE)다. 돌아올 주소는 앱(`chansubible://`), Expo Go(`exp://`), Expo 웹(`http://localhost:8081`)이다.
- `chansu-bible-test`는 비밀번호로 바로 토큰을 받는 개발용 클라이언트다. 운영 realm에는 만들지 않는다.
- 안드로이드 에뮬레이터는 이 컴퓨터를 `10.0.2.2`로 부른다(앱과 서버가 이미 그 주소를 안다). 실제 폰에서 쓰려면 포트를 내부망에 열고 앱의 `EXPO_PUBLIC_AUTH_ISSUER`, `EXPO_PUBLIC_API_URL`과 서버의 `AUTH_ISSUERS`에 그 주소를 준다.

서버를 손으로 불러 보기:

```bash
TOKEN=$(node infra/dev-token.mjs)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8790/me
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"since":0,"changes":[]}' http://127.0.0.1:8790/sync
```
````

루트 `package.json`의 `scripts`에 더한다.

```json
"infra:up": "docker compose -f infra/docker-compose.yml up -d",
"infra:down": "docker compose -f infra/docker-compose.yml down",
"server": "npm run dev -w server"
```

- [ ] **Step 5: 띄워서 확인**

Run: `npm run infra:up`, 그다음 발견 문서가 열릴 때까지 기다린다.

```bash
until curl -sf http://localhost:8080/realms/chansu-bible/.well-known/openid-configuration >/dev/null; do sleep 3; done
node infra/dev-token.mjs | cut -c1-20
curl -s -o /dev/null -D - -H "Origin: http://localhost:8081" http://localhost:8080/realms/chansu-bible/.well-known/openid-configuration | grep -i access-control-allow-origin
```

Expected: 토큰 앞부분(`eyJ…`)이 나오고, 발견 문서가 Expo 웹 출처에 CORS를 허락한다.

- [ ] **Step 6: 커밋**

```bash
git add infra package.json
git commit -m "feat(infra): 개발용 Postgres와 키클락(realm chansu-bible, PKCE 앱 클라이언트, 시험 계정)"
```

---

### Task 2: reader-core — 동기화 합치기

**Files:**
- Modify: `packages/reader-core/src/records.ts`(전체), `packages/reader-core/src/records.test.ts`(끝에 더함), `packages/reader-core/src/index.ts`
- Create: `packages/reader-core/src/sync.ts`, `packages/reader-core/src/sync.test.ts`

- [ ] **Step 1: 시험**

```ts path=packages/reader-core/src/sync.test.ts
import { describe, expect, it } from 'vitest'
import type { Collection, RecordRow } from './records.ts'
import { applySyncResponse, mergeRemote, type RemoteRow } from './sync.ts'

const row = (overrides: Partial<RecordRow> = {}): RecordRow => ({
  collection: 'marks',
  id: 'genesis:4:9',
  data: { note: '기기' },
  updatedAt: 100,
  deletedAt: null,
  dirty: false,
  ...overrides,
})
const remote = (overrides: Partial<RemoteRow> = {}): RemoteRow => ({
  collection: 'marks',
  id: 'genesis:4:9',
  data: { note: '서버' },
  updatedAt: 200,
  deletedAt: null,
  ...overrides,
})
const table = (...rows: RecordRow[]) => {
  const map = new Map(rows.map((item) => [`${item.collection}/${item.id}`, item]))
  return (collection: Collection, id: string) => map.get(`${collection}/${id}`)
}

describe('mergeRemote', () => {
  it('기기에 없는 줄은 받아서 올린 것으로 둔다', () => {
    expect(mergeRemote(undefined, remote())).toEqual({ ...remote(), dirty: false })
  })

  it('서버 줄이 더 새로우면 바꾼다(지운 것도 그대로 받는다)', () => {
    expect(mergeRemote(row({ dirty: true }), remote({ deletedAt: 200 }))).toEqual({ ...remote({ deletedAt: 200 }), dirty: false })
  })

  it('기기 줄이 더 새로우면(아직 안 올린 변경) 그대로 둔다', () => {
    expect(mergeRemote(row({ updatedAt: 300, dirty: true }), remote())).toBeNull()
  })

  it('시각이 같으면 내가 올린 것이 돌아온 것이라 올린 것으로만 표시한다', () => {
    expect(mergeRemote(row({ updatedAt: 200, dirty: true }), remote())).toEqual(row({ updatedAt: 200 }))
    expect(mergeRemote(row({ updatedAt: 200 }), remote())).toBeNull()
  })
})

describe('applySyncResponse', () => {
  it('올린 뒤 그대로인 줄을 올린 것으로 표시하고, 돌아온 같은 줄은 다시 쓰지 않는다', () => {
    const sent = row({ dirty: true })
    const echo = remote({ data: sent.data, updatedAt: 100 })
    expect(applySyncResponse([sent], [echo], table(sent))).toEqual([row()])
  })

  it('올리는 사이 다시 고친 줄은 그대로 두어 다음에 올린다', () => {
    const sent = row({ dirty: true })
    const edited = row({ updatedAt: 150, data: { note: '고침' }, dirty: true })
    expect(applySyncResponse([sent], [], table(edited))).toEqual([])
  })

  it('다른 기기가 더 나중에 고친 줄을 받으면 내 것을 바꾼다', () => {
    const sent = row({ dirty: true })
    expect(applySyncResponse([sent], [remote()], table(sent))).toEqual([{ ...remote(), dirty: false }])
  })

  it('처음 보는 줄은 그대로 받는다', () => {
    const first = remote({ id: 'genesis:1:1' })
    expect(applySyncResponse([], [first], table())).toEqual([{ ...first, dirty: false }])
  })
})
```

`records.test.ts` 끝에 더한다.

```ts
describe('동기화가 쓰는 기능', () => {
  it('기기 시계가 늦어도 새로 고친 줄의 시각은 앞의 것보다 뒤다', () => {
    const store = new RecordStore(memory())
    store.put('marks', 'a', { note: '가' }, 1000)
    store.put('marks', 'a', { note: '나' }, 500)
    expect(store.getRow('marks', 'a')).toMatchObject({ data: { note: '나' }, updatedAt: 1001 })
    store.remove('marks', 'a', 900)
    expect(store.getRow('marks', 'a')).toMatchObject({ updatedAt: 1002, deletedAt: 1002 })
  })

  it('dirtyRows는 지운 줄을 포함해 아직 안 올린 줄만 준다', () => {
    const store = new RecordStore(
      memory([
        { collection: 'marks', id: 'a', data: {}, updatedAt: 1, deletedAt: null, dirty: false },
        { collection: 'marks', id: 'b', data: {}, updatedAt: 1, deletedAt: 2, dirty: true },
      ]),
    )
    expect(store.dirtyRows().map((item) => item.id)).toEqual(['b'])
  })

  it('writeRows는 여러 줄을 한 번에 저장하고 구독자에게 한 번 알린다', () => {
    const batches: RecordRow[][] = []
    const store = new RecordStore({ ...memory(), saveMany: (rows) => void batches.push(rows) })
    let calls = 0
    store.subscribe(() => calls++)
    const rows: RecordRow[] = [
      { collection: 'marks', id: 'a', data: {}, updatedAt: 1, deletedAt: null, dirty: false },
      { collection: 'marks', id: 'b', data: {}, updatedAt: 1, deletedAt: null, dirty: false },
    ]
    store.writeRows(rows)
    expect(batches).toEqual([rows])
    expect(calls).toBe(1)
    expect(store.list('marks').map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('clear는 모든 줄을 지우고 알린다', () => {
    let cleared = 0
    const store = new RecordStore({
      ...memory([{ collection: 'marks', id: 'a', data: {}, updatedAt: 1, deletedAt: null, dirty: false }]),
      clear: () => void cleared++,
    })
    let calls = 0
    store.subscribe(() => calls++)
    store.clear()
    expect(store.rowsSnapshot()).toEqual([])
    expect([cleared, calls]).toEqual([1, 1])
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `npm test -w reader-core` → FAIL(`sync.ts` 없음, `getRow`·`dirtyRows`·`writeRows`·`clear` 없음)

- [ ] **Step 3: 구현**

```ts path=packages/reader-core/src/records.ts
// 기기 기록(읽은 장면, 읽기 위치, 계획, 밑줄·메모)을 담는 저장소.
// 줄마다 수정 시각, 지운 시각, 아직 서버에 올리지 않았는지를 적어 동기화(sync.ts)가 그대로 쓴다.
// 기록은 작아서(수백 줄) 모두 메모리에 두고, 바뀐 줄만 persistence로 내려 쓴다.
export type Collection = 'position' | 'readScenes' | 'plan' | 'marks' | 'quizDone'

export type RecordRow = {
  collection: Collection
  id: string
  data: unknown
  updatedAt: number
  // 지운 시각. 지운 줄도 다른 기기에 알려야 하므로 바로 없애지 않는다.
  deletedAt: number | null
  dirty: boolean
}

export type Persistence = {
  load(): RecordRow[]
  save(row: RecordRow): void
  // 여러 줄을 한 번에 쓴다(SQLite는 트랜잭션 하나로). 없으면 줄마다 save를 부른다.
  saveMany?(rows: RecordRow[]): void
  // 모든 줄을 지운다(로그아웃).
  clear?(): void
}

const keyOf = (collection: Collection, id: string) => `${collection}/${id}`

export class RecordStore {
  private rows = new Map<string, RecordRow>()
  private listeners = new Set<() => void>()
  private version = 0
  private persistence: Persistence

  constructor(persistence: Persistence) {
    this.persistence = persistence
    for (const row of persistence.load()) this.rows.set(keyOf(row.collection, row.id), row)
  }

  get<T>(collection: Collection, id: string): T | null {
    const row = this.rows.get(keyOf(collection, id))
    return row && row.deletedAt === null ? (row.data as T) : null
  }

  list<T>(collection: Collection): { id: string; data: T; updatedAt: number }[] {
    const items: { id: string; data: T; updatedAt: number }[] = []
    for (const row of this.rows.values()) {
      if (row.collection === collection && row.deletedAt === null) items.push({ id: row.id, data: row.data as T, updatedAt: row.updatedAt })
    }
    return items
  }

  put(collection: Collection, id: string, data: unknown, now = Date.now()): void {
    this.write([{ collection, id, data, updatedAt: this.stamp(collection, id, now), deletedAt: null, dirty: true }])
  }

  remove(collection: Collection, id: string, now = Date.now()): void {
    const existing = this.rows.get(keyOf(collection, id))
    if (!existing || existing.deletedAt !== null) return
    const at = this.stamp(collection, id, now)
    this.write([{ ...existing, updatedAt: at, deletedAt: at, dirty: true }])
  }

  // 아래는 동기화가 쓴다.
  getRow(collection: Collection, id: string): RecordRow | undefined {
    return this.rows.get(keyOf(collection, id))
  }

  // 모든 줄(지운 줄 포함)
  rowsSnapshot(): RecordRow[] {
    return [...this.rows.values()]
  }

  // 아직 서버에 올리지 않은 줄(지운 줄 포함)
  dirtyRows(): RecordRow[] {
    return [...this.rows.values()].filter((row) => row.dirty)
  }

  // 서버와 맞춘 줄을 그대로 쓴다. 여러 줄이어도 구독자에게는 한 번 알린다.
  writeRows(rows: RecordRow[]): void {
    if (rows.length > 0) this.write(rows)
  }

  // 로그아웃할 때 기기 기록을 모두 지운다.
  clear(): void {
    this.rows.clear()
    this.persistence.clear?.()
    this.changed()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  // 고친 시각은 그 줄이 이미 가진 시각보다 늘 뒤로 둔다.
  // 기기 시계가 늦어도 새로 고친 것이 앞의 것(다른 기기에서 받은 것 포함)을 이겨 서버에 올라간다.
  private stamp(collection: Collection, id: string, now: number): number {
    const existing = this.rows.get(keyOf(collection, id))
    return existing ? Math.max(now, existing.updatedAt + 1) : now
  }

  private write(rows: RecordRow[]): void {
    for (const row of rows) this.rows.set(keyOf(row.collection, row.id), row)
    if (rows.length > 1 && this.persistence.saveMany) this.persistence.saveMany(rows)
    else for (const row of rows) this.persistence.save(row)
    this.changed()
  }

  private changed(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}
```

```ts path=packages/reader-core/src/sync.ts
import type { Collection, RecordRow } from './records.ts'

// 서버가 돌려주는 줄(올렸는지 표시가 없다)
export type RemoteRow = {
  collection: Collection
  id: string
  data: unknown
  updatedAt: number
  deletedAt: number | null
}

const keyOf = (collection: Collection, id: string) => `${collection}/${id}`

// 서버에서 받은 줄을 기기 줄과 합친다. 바꿀 줄을 돌려주고, 그대로 두면 null이다.
// 나중에 고친 쪽(updatedAt이 큰 쪽)이 이긴다. 기기 줄이 더 새로우면(아직 안 올린 변경) 기기 것을 두고 다음에 올린다.
// 시각이 같으면 같은 쓰기라서(내가 올린 것이 돌아왔다) 올린 것으로만 표시한다.
export function mergeRemote(local: RecordRow | undefined, remote: RemoteRow): RecordRow | null {
  if (!local || remote.updatedAt > local.updatedAt) {
    return { collection: remote.collection, id: remote.id, data: remote.data, updatedAt: remote.updatedAt, deletedAt: remote.deletedAt, dirty: false }
  }
  if (remote.updatedAt === local.updatedAt && local.dirty) return { ...local, dirty: false }
  return null
}

// 한 번 주고받은 뒤 기기에 쓸 줄을 정한다.
// sent: 올린 줄(올릴 때의 모습), received: 서버가 돌려준 줄, current: 지금 기기의 줄.
// 올린 뒤 다시 고치지 않은 줄은 올린 것으로 표시하고, 받은 줄은 mergeRemote로 합친다.
export function applySyncResponse(
  sent: readonly RecordRow[],
  received: readonly RemoteRow[],
  current: (collection: Collection, id: string) => RecordRow | undefined,
): RecordRow[] {
  const writes = new Map<string, RecordRow>()
  const lookup = (collection: Collection, id: string) => writes.get(keyOf(collection, id)) ?? current(collection, id)
  for (const row of sent) {
    const now = lookup(row.collection, row.id)
    if (now && now.dirty && now.updatedAt === row.updatedAt) writes.set(keyOf(row.collection, row.id), { ...now, dirty: false })
  }
  for (const remote of received) {
    const merged = mergeRemote(lookup(remote.collection, remote.id), remote)
    if (merged) writes.set(keyOf(remote.collection, remote.id), merged)
  }
  return [...writes.values()]
}
```

`index.ts`에 `export * from './sync.ts'`를 더한다.

- [ ] **Step 4: 통과와 커밋**

Run: `npm test -w reader-core && npx tsc --noEmit -p packages/reader-core` → PASS

```bash
git add packages/reader-core
git commit -m "feat(core): 동기화 합치기와 기록 저장소의 고친 시각 단조 증가·한꺼번에 쓰기·비우기"
```

---

### Task 3: 동기화 서버

**Files:**
- Create: `server/{package.json,tsconfig.json,vitest.config.ts}`, `server/src/{config,db,auth,records,app,index}.ts`, `server/test/{helpers,app.test,records.test}.ts`
- Modify: 루트 `package.json`(workspaces, test)

- [ ] **Step 1: 패키지**

```json path=server/package.json
{
  "name": "server",
  "private": true,
  "type": "module",
  "description": "앱 기록 동기화 서버. 키클락 토큰을 검증하고 Postgres에 사용자별 기록을 둔다.",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hono/node-server": "^2.1.4",
    "hono": "^4.13.13",
    "jose": "^6.2.12",
    "pg": "^8.23.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.8",
    "@types/node": "^24.13.3",
    "@types/pg": "^8.23.1",
    "tsx": "^4.23.15",
    "typescript": "~6.0.2",
    "vitest": "^5.0.3"
  }
}
```

```json path=server/tsconfig.json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

```ts path=server/vitest.config.ts
import { defineConfig } from 'vitest/config'

// 시험마다 PGlite(메모리 Postgres)를 새로 띄우므로 넉넉히 기다린다.
export default defineConfig({ test: { testTimeout: 30_000 } })
```

루트 `package.json`의 `workspaces`에 `"server"`를 더하고, `test` 끝에 `&& npm test -w server`를 덧붙인다. `npm install`.

- [ ] **Step 2: 시험 도우미와 시험**

```ts path=server/test/helpers.ts
import { PGlite } from '@electric-sql/pglite'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createApp } from '../src/app.ts'
import { createVerifier } from '../src/auth.ts'
import { migrate, type Query, type Sql } from '../src/db.ts'

export const ISSUER = 'http://localhost:8080/realms/chansu-bible'

type Queryable = { query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }
const wrap =
  (target: Queryable): Query =>
  async <T>(text: string, params: unknown[] = []) =>
    (await target.query<T>(text, params)).rows

// 메모리 안의 Postgres(PGlite)로 서버를 시험한다. 도커가 없어도 된다.
export async function memorySql(): Promise<Sql> {
  const db = new PGlite()
  const sql: Sql = {
    query: wrap(db),
    transaction: <T>(fn: (query: Query) => Promise<T>) => db.transaction((tx) => fn(wrap(tx))),
  }
  await migrate(sql)
  return sql
}

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

export async function testKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' }
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) }
}

// 키클락 액세스 토큰과 같은 모양의 토큰을 시험용 키로 서명한다.
export async function token(
  privateKey: PrivateKey,
  claims: { sub: string; azp?: string; name?: string; preferred_username?: string },
  options: { issuer?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT({ azp: 'chansu-bible-app', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(options.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey)
}

async function createTestApp() {
  const sql = await memorySql()
  const { privateKey, jwks } = await testKeys()
  const verify = createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app', 'chansu-bible-test'], jwks })
  return { app: createApp({ sql, verify, corsOrigins: ['http://localhost:8081'] }), sql, privateKey }
}

// PGlite는 띄우는 데 몇 초 걸려서 시험 파일마다 하나를 같이 쓴다. 시험마다 newUser()로 다른 사용자를 써서 섞이지 않게 한다.
let shared: ReturnType<typeof createTestApp> | null = null
export function testApp(): ReturnType<typeof createTestApp> {
  shared ??= createTestApp()
  return shared
}

let users = 0
export const newUser = (): string => `user-${++users}`
```

```ts path=server/test/app.test.ts
import { describe, expect, it } from 'vitest'
import { newUser, testApp, token } from './helpers.ts'

type App = Awaited<ReturnType<typeof testApp>>['app']
type SyncResponse = {
  now: number
  more: boolean
  changes: { collection: string; id: string; data: unknown; updatedAt: number; deletedAt: number | null }[]
}

const mark = (id: string, updatedAt: number, note: string, deletedAt: number | null = null) => ({
  collection: 'marks',
  id,
  data: { note },
  updatedAt,
  deletedAt,
})

function post(app: App, bearer: string, body: unknown) {
  return app.request('/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sync(app: App, bearer: string, body: unknown): Promise<SyncResponse> {
  const response = await post(app, bearer, body)
  expect(response.status).toBe(200)
  return (await response.json()) as SyncResponse
}

describe('인증', () => {
  it('토큰이 없거나, 다른 발급자이거나, 다른 앱의 토큰이거나, 만료됐으면 401이다', async () => {
    const { app, privateKey } = await testApp()
    const sub = newUser()
    expect((await app.request('/me')).status).toBe(401)
    const wrongIssuer = await token(privateKey, { sub }, { issuer: 'http://evil.test/realms/x' })
    expect((await app.request('/me', { headers: { Authorization: `Bearer ${wrongIssuer}` } })).status).toBe(401)
    const wrongClient = await token(privateKey, { sub, azp: 'other-app' })
    expect((await app.request('/me', { headers: { Authorization: `Bearer ${wrongClient}` } })).status).toBe(401)
    const expired = await token(privateKey, { sub }, { expiresIn: '-1m' })
    expect((await app.request('/me', { headers: { Authorization: `Bearer ${expired}` } })).status).toBe(401)
  })

  it('/me는 토큰의 사용자를 알려 준다', async () => {
    const { app, privateKey } = await testApp()
    const sub = newUser()
    const bearer = await token(privateKey, { sub, name: '시험 사용자', preferred_username: 'tester' })
    const response = await app.request('/me', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sub, name: '시험 사용자', username: 'tester' })
  })

  it('/health는 인증 없이 열린다', async () => {
    const { app } = await testApp()
    expect(await (await app.request('/health')).json()).toEqual({ ok: true })
  })
})

describe('POST /sync', () => {
  it('올린 줄을 저장해 돌려주고, 받아 간 뒤로는 새 것만 준다', async () => {
    const { app, privateKey } = await testApp()
    const bearer = await token(privateKey, { sub: newUser() })
    const first = await sync(app, bearer, { since: 0, changes: [mark('a', 100, '가')] })
    expect(first.changes).toEqual([mark('a', 100, '가')])
    expect(first.now).toBeGreaterThan(0)
    // 다른 기기가 처음부터 받으면 같은 줄을, 받아 간 순번부터 받으면 아무것도 받지 않는다.
    expect((await sync(app, bearer, { since: 0, changes: [] })).changes).toEqual([mark('a', 100, '가')])
    expect((await sync(app, bearer, { since: first.now, changes: [] })).changes).toEqual([])
  })

  it('나중에 고친 쪽이 이긴다: 옛 쓰기는 버리고, 지움도 전한다', async () => {
    const { app, privateKey } = await testApp()
    const bearer = await token(privateKey, { sub: newUser() })
    await sync(app, bearer, { since: 0, changes: [mark('a', 200, '새것')] })
    await sync(app, bearer, { since: 0, changes: [mark('a', 100, '옛것')] })
    expect((await sync(app, bearer, { since: 0, changes: [] })).changes).toEqual([mark('a', 200, '새것')])
    await sync(app, bearer, { since: 0, changes: [mark('a', 300, '새것', 300)] })
    expect((await sync(app, bearer, { since: 0, changes: [] })).changes).toEqual([mark('a', 300, '새것', 300)])
  })

  it('사용자마다 기록이 따로다', async () => {
    const { app, privateKey } = await testApp()
    await sync(app, await token(privateKey, { sub: newUser() }), { since: 0, changes: [mark('a', 100, '가')] })
    expect((await sync(app, await token(privateKey, { sub: newUser() }), { since: 0, changes: [] })).changes).toEqual([])
  })

  it('모르는 컬렉션, 큰 줄, 너무 많은 줄, 깨진 JSON은 400이다', async () => {
    const { app, privateKey } = await testApp()
    const bearer = await token(privateKey, { sub: newUser() })
    expect((await post(app, bearer, { since: 0, changes: [{ ...mark('a', 1, '가'), collection: 'secrets' }] })).status).toBe(400)
    expect((await post(app, bearer, { since: 0, changes: [mark('a', 1, 'x'.repeat(20_000))] })).status).toBe(400)
    const many = Array.from({ length: 501 }, (_, index) => mark(`m${index}`, 1, '가'))
    expect((await post(app, bearer, { since: 0, changes: many })).status).toBe(400)
    const broken = await app.request('/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: '{',
    })
    expect(broken.status).toBe(400)
  })

  it('웹 미리 보기 출처에만 CORS를 허락한다', async () => {
    const { app } = await testApp()
    const preflight = (origin: string) =>
      app.request('/sync', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
    expect((await preflight('http://localhost:8081')).headers.get('access-control-allow-origin')).toBe('http://localhost:8081')
    expect((await preflight('http://evil.test')).headers.get('access-control-allow-origin')).toBeNull()
  })
})
```

```ts path=server/test/records.test.ts
import { describe, expect, it } from 'vitest'
import { applyChanges, pullChanges, type Change } from '../src/records.ts'
import { newUser, testApp } from './helpers.ts'

const mark = (id: string, updatedAt: number): Change => ({ collection: 'marks', id, data: { id }, updatedAt, deletedAt: null })

describe('pullChanges', () => {
  it('순번 순서로 나눠 주고, 더 있으면 more로 알린다', async () => {
    const { sql } = await testApp()
    const user = newUser()
    await applyChanges(sql.query, user, [mark('a', 1), mark('b', 1), mark('c', 1)])
    const first = await pullChanges(sql.query, user, 0, 2)
    expect(first.changes.map((change) => change.id)).toEqual(['a', 'b'])
    expect(first.more).toBe(true)
    const second = await pullChanges(sql.query, user, first.now, 2)
    expect(second.changes.map((change) => change.id)).toEqual(['c'])
    expect(second.more).toBe(false)
    expect(second.now).toBeGreaterThan(first.now)
  })

  it('고친 줄은 새 순번을 받아, 받아 간 뒤에 다시 내려간다', async () => {
    const { sql } = await testApp()
    const user = newUser()
    await applyChanges(sql.query, user, [mark('a', 1), mark('b', 1)])
    const { now } = await pullChanges(sql.query, user, 0)
    await applyChanges(sql.query, user, [mark('a', 2)])
    expect((await pullChanges(sql.query, user, now)).changes).toEqual([mark('a', 2)])
  })
})
```

Run: `npm test -w server` → FAIL(모듈 없음)

- [ ] **Step 3: 서버 구현**

```ts path=server/src/config.ts
// 서버 설정. 기본값은 infra/docker-compose.yml의 개발용 값이다. 운영에서는 환경 변수로 바꾼다.
const list = (value: string | undefined, fallback: string[]) =>
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback

export type Config = {
  host: string
  port: number
  databaseUrl: string
  // 받아들일 토큰 발급자. 키클락 개발 모드는 요청한 주소로 발급자를 정해서, 에뮬레이터(10.0.2.2)용도 넣는다.
  issuers: string[]
  // 서명 키를 받을 주소(서버가 키클락에 직접 붙는 주소)
  jwksUrl: string
  // 받아들일 클라이언트(토큰의 azp)
  clients: string[]
  corsOrigins: string[]
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 8790),
    databaseUrl: env.DATABASE_URL ?? 'postgres://chansu:chansu-dev@127.0.0.1:5433/chansu',
    issuers: list(env.AUTH_ISSUERS, [
      'http://localhost:8080/realms/chansu-bible',
      'http://127.0.0.1:8080/realms/chansu-bible',
      'http://10.0.2.2:8080/realms/chansu-bible',
    ]),
    jwksUrl: env.AUTH_JWKS_URL ?? 'http://127.0.0.1:8080/realms/chansu-bible/protocol/openid-connect/certs',
    clients: list(env.AUTH_CLIENTS, ['chansu-bible-app', 'chansu-bible-test']),
    corsOrigins: list(env.CORS_ORIGINS, ['http://localhost:8081']),
  }
}
```

```ts path=server/src/db.ts
import pg from 'pg'

// SQL 한 문장을 실행한다. 자리표시는 $1, $2...
export type Query = <T>(text: string, params?: unknown[]) => Promise<T[]>

// 서버가 쓰는 최소 인터페이스. 운영은 pg, 시험은 PGlite가 구현한다.
export type Sql = {
  query: Query
  // 연결 하나에서 트랜잭션으로 묶어 실행한다. fn이 던지면 되돌린다.
  transaction<T>(fn: (query: Query) => Promise<T>): Promise<T>
}

export function pgSql(databaseUrl: string): Sql & { end(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 })
  // 쉬는 연결이 끊겨도 서버가 죽지 않게 한다(다음 요청이 새로 연결한다).
  pool.on('error', (error) => console.error('Postgres 연결 오류:', error.message))
  return {
    query: async <T>(text: string, params: unknown[] = []) => (await pool.query(text, params)).rows as T[],
    transaction: async <T>(fn: (query: Query) => Promise<T>): Promise<T> => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(async <R>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as R[])
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
    end: () => pool.end(),
  }
}

// 표 만들기. 서버가 시작할 때마다 돌려도 된다.
// records: 사용자(sub)별 기록 줄. seq는 서버가 매기는 순번이라, 기기 시계와 상관없이 어디까지 받아 갔는지 정한다.
export async function migrate(sql: Pick<Sql, 'query'>): Promise<void> {
  await sql.query('CREATE SEQUENCE IF NOT EXISTS record_seq')
  await sql.query(`CREATE TABLE IF NOT EXISTS records (
    user_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT,
    seq BIGINT NOT NULL,
    PRIMARY KEY (user_id, collection, id)
  )`)
  await sql.query('CREATE INDEX IF NOT EXISTS records_user_seq ON records (user_id, seq)')
}
```

```ts path=server/src/auth.ts
import { jwtVerify, type JWTVerifyGetKey } from 'jose'

export type User = { sub: string; name: string | null; username: string | null }
export type Verify = (token: string) => Promise<User>

export class AuthError extends Error {}

// 키클락이 서명한 액세스 토큰을 검증한다: 서명(JWKS), 발급자, 만료, 그리고 우리 앱(azp)이 받은 토큰인지.
export function createVerifier(options: { issuers: string[]; clients: string[]; jwks: JWTVerifyGetKey }): Verify {
  return async (token) => {
    let payload
    try {
      ;({ payload } = await jwtVerify(token, options.jwks, { issuer: options.issuers, algorithms: ['RS256'] }))
    } catch {
      throw new AuthError('토큰을 확인하지 못했습니다')
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new AuthError('사용자가 없는 토큰입니다')
    if (typeof payload.azp !== 'string' || !options.clients.includes(payload.azp)) throw new AuthError('다른 앱의 토큰입니다')
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      username: typeof payload.preferred_username === 'string' ? payload.preferred_username : null,
    }
  }
}
```

```ts path=server/src/records.ts
import { z } from 'zod'
import type { Query } from './db.ts'

export const COLLECTIONS = ['position', 'readScenes', 'plan', 'marks', 'quizDone'] as const
// 한 줄의 데이터는 JSON으로 1만 자까지
export const MAX_DATA = 10_000
// 한 번에 올리는 줄은 500개까지(앱이 나눠 올린다)
export const MAX_CHANGES = 500
// 한 번에 내려 주는 줄. 더 있으면 more로 알린다.
export const PULL_LIMIT = 1000

export const ChangeSchema = z.object({
  collection: z.enum(COLLECTIONS),
  id: z.string().min(1).max(200),
  data: z.unknown().refine((value) => JSON.stringify(value ?? null).length <= MAX_DATA, { error: '데이터가 너무 큽니다' }),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
})

export const SyncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  changes: z.array(ChangeSchema).max(MAX_CHANGES),
})

export type Change = z.infer<typeof ChangeSchema>

// 받은 줄을 반영한다. 같은 줄이 이미 있으면 updatedAt이 더 클 때만 바꾼다(나중 쓰기 이김). 바뀐 줄은 새 순번을 받는다.
export async function applyChanges(query: Query, userId: string, changes: Change[]): Promise<void> {
  for (const change of changes) {
    await query(
      `INSERT INTO records (user_id, collection, id, data, updated_at, deleted_at, seq)
       VALUES ($1, $2, $3, $4, $5, $6, nextval('record_seq'))
       ON CONFLICT (user_id, collection, id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, seq = EXCLUDED.seq
         WHERE records.updated_at < EXCLUDED.updated_at`,
      [userId, change.collection, change.id, JSON.stringify(change.data ?? null), change.updatedAt, change.deletedAt],
    )
  }
}

type Row = {
  collection: Change['collection']
  id: string
  data: unknown
  updated_at: string | number | bigint
  deleted_at: string | number | bigint | null
  seq: string | number | bigint
}

// since 순번 다음으로 바뀐 줄을 순번 순서로 limit개까지 준다. now는 다음에 since로 보낼 순번이다.
export async function pullChanges(
  query: Query,
  userId: string,
  since: number,
  limit = PULL_LIMIT,
): Promise<{ changes: Change[]; now: number; more: boolean }> {
  const rows = await query<Row>(
    'SELECT collection, id, data, updated_at, deleted_at, seq FROM records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
    [userId, since, limit + 1],
  )
  const page = rows.slice(0, limit)
  return {
    changes: page.map((row) => ({
      collection: row.collection,
      id: row.id,
      data: row.data,
      updatedAt: Number(row.updated_at),
      deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    })),
    now: page.length > 0 ? Number(page[page.length - 1]!.seq) : since,
    more: rows.length > limit,
  }
}
```

```ts path=server/src/app.ts
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { AuthError, type User, type Verify } from './auth.ts'
import type { Sql } from './db.ts'
import { applyChanges, pullChanges, SyncRequestSchema } from './records.ts'

type Env = { Variables: { user: User } }

export function createApp(deps: { sql: Sql; verify: Verify; corsOrigins: string[] }) {
  const app = new Hono<Env>()

  app.use(
    '*',
    cors({ origin: deps.corsOrigins, allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'OPTIONS'], maxAge: 600 }),
  )

  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: '서버 오류가 났습니다' }, 500)
  })

  app.get('/health', (c) => c.json({ ok: true }))

  // 로그인한 사용자만 쓰는 경로에 붙인다.
  const authenticate = createMiddleware<Env>(async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    if (token === '') return c.json({ error: '로그인이 필요합니다' }, 401)
    try {
      c.set('user', await deps.verify(token))
    } catch (error) {
      if (error instanceof AuthError) return c.json({ error: error.message }, 401)
      throw error
    }
    await next()
  })

  app.get('/me', authenticate, (c) => {
    const user = c.get('user')
    return c.json({ sub: user.sub, name: user.name, username: user.username })
  })

  // 한 번에 올리고 받는다. 받은 줄을 먼저 반영한 뒤 since 다음에 바뀐 줄을 돌려준다(방금 올린 줄도 새 순번으로 돌아온다).
  // 같은 사용자의 동기화는 사용자별 잠금으로 차례로 처리해, 받아 간 순번보다 앞 순번이 늦게 쓰여 빠지는 일이 없게 한다.
  app.post(
    '/sync',
    authenticate,
    bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: '요청이 너무 큽니다' }, 413) }),
    async (c) => {
      const parsed = SyncRequestSchema.safeParse(await c.req.json().catch(() => null))
      if (!parsed.success) return c.json({ error: '요청 형식이 맞지 않습니다', issues: parsed.error.issues.slice(0, 5) }, 400)
      const user = c.get('user')
      const result = await deps.sql.transaction(async (query) => {
        await query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.sub])
        await applyChanges(query, user.sub, parsed.data.changes)
        return pullChanges(query, user.sub, parsed.data.since)
      })
      return c.json(result)
    },
  )

  return app
}
```

```ts path=server/src/index.ts
import { serve } from '@hono/node-server'
import { createRemoteJWKSet } from 'jose'
import { createApp } from './app.ts'
import { createVerifier } from './auth.ts'
import { readConfig } from './config.ts'
import { migrate, pgSql } from './db.ts'

const config = readConfig()
const sql = pgSql(config.databaseUrl)
try {
  await migrate(sql)
} catch (error) {
  console.error(`Postgres(${new URL(config.databaseUrl).host})에 연결하지 못했습니다. npm run infra:up으로 띄웠는지 확인하세요.`)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const verify = createVerifier({ issuers: config.issuers, clients: config.clients, jwks: createRemoteJWKSet(new URL(config.jwksUrl)) })
const app = createApp({ sql, verify, corsOrigins: config.corsOrigins })

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`동기화 서버 http://${info.address}:${info.port} · DB ${new URL(config.databaseUrl).host} · 발급자 ${config.issuers.join(', ')}`)
})

// 끌 때 연결을 정리한다.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void sql.end().finally(() => process.exit(0))
  })
}
```

- [ ] **Step 4: 시험과 형 검사**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS, 형 오류 없음

- [ ] **Step 5: 실제 키클락·Postgres로 확인**

인프라가 떠 있는 상태에서 서버를 띄우고(`npm run server`, 백그라운드), 시험 계정 토큰으로 `/me`와 `/sync`를 부른다.

```bash
TOKEN=$(node infra/dev-token.mjs)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8790/me
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"since":0,"changes":[]}' http://127.0.0.1:8790/sync
```

Expected: `/me`가 `{"sub":"6c1f2b8e-…","name":"시험 사용자","username":"tester"}`, `/sync`가 `{"changes":[],"now":0,"more":false}`.

- [ ] **Step 6: 커밋**

```bash
git add server package.json package-lock.json
git commit -m "feat(server): 기록 동기화 서버(Hono, 키클락 토큰 검증, 나중 쓰기 이김, 사용자별 잠금, PGlite 시험)"
```

---

### Task 4: 앱 로그인과 동기화

**Files:**
- Create: `mobile/src/auth/{config.ts,tokenStore.ts,tokenStore.web.ts,jwt.ts,AuthContext.tsx}`, `mobile/src/sync/{syncOnce.ts,SyncContext.tsx}`, `mobile/src/account/AccountScreen.tsx`, `mobile/src/app/{account,auth}.tsx`
- Modify: `mobile/src/data/persistence.ts`·`persistence.web.ts`(전체), `mobile/src/app/_layout.tsx`, `mobile/src/home/HomeScreen.tsx`, `mobile/src/ui/Icon.tsx`

- [ ] **Step 1: 모듈 설치**

```bash
cd mobile && npx expo install expo-auth-session expo-crypto expo-web-browser expo-secure-store && cd ..
```

모두 Expo Go에 들어 있는 모듈이라 개발 빌드 없이 확인할 수 있다.

- [ ] **Step 2: 설정, 토큰 보관, 토큰 읽기**

```ts path=mobile/src/auth/config.ts
import { Platform } from 'react-native'

// 개발 기본값은 infra/docker-compose.yml의 로컬 키클락과 동기화 서버다.
// 안드로이드 에뮬레이터는 이 컴퓨터를 10.0.2.2로 부른다. 실제 폰은 EXPO_PUBLIC_AUTH_ISSUER, EXPO_PUBLIC_API_URL로 내부망 주소를 준다.
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'

export const authConfig = {
  issuer: process.env.EXPO_PUBLIC_AUTH_ISSUER ?? `http://${host}:8080/realms/chansu-bible`,
  clientId: 'chansu-bible-app',
  // offline_access: 오래 가는 갱신 토큰(앱을 한동안 안 열어도 다시 로그인하지 않게)
  scopes: ['openid', 'profile', 'email', 'offline_access'],
}

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? `http://${host}:8790`
```

```ts path=mobile/src/auth/tokenStore.ts
import * as SecureStore from 'expo-secure-store'

// 갱신 토큰은 기기의 보안 저장소(키체인, 키스토어)에 둔다. 액세스 토큰은 메모리에만 둔다.
const key = 'auth-refresh-token'

export const tokenStore = {
  load: (): Promise<string | null> => SecureStore.getItemAsync(key),
  save: (token: string): Promise<void> => SecureStore.setItemAsync(key, token),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(key),
}
```

```ts path=mobile/src/auth/tokenStore.web.ts
// Expo 웹 미리 보기에서는 탭을 닫으면 사라지는 sessionStorage에 둔다.
const key = 'auth-refresh-token'

export const tokenStore = {
  load: async (): Promise<string | null> => sessionStorage.getItem(key),
  save: async (token: string): Promise<void> => sessionStorage.setItem(key, token),
  clear: async (): Promise<void> => sessionStorage.removeItem(key),
}
```

```ts path=mobile/src/auth/jwt.ts
// 액세스 토큰(JWT)의 내용만 읽는다. 서명 검증은 서버가 한다.
export type TokenClaims = { sub: string; name?: string; preferred_username?: string; email?: string }

export function readClaims(token: string): TokenClaims | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    // atob는 바이트를 글자 하나씩 준다. 한글 이름이 깨지지 않게 UTF-8로 다시 읽는다.
    const json = decodeURIComponent(
      Array.from(atob(base64), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    )
    const claims = JSON.parse(json) as Partial<TokenClaims>
    return typeof claims.sub === 'string' && claims.sub !== '' ? (claims as TokenClaims) : null
  } catch {
    return null
  }
}
```

- [ ] **Step 3: 로그인 상태**

```tsx path=mobile/src/auth/AuthContext.tsx
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authConfig } from './config'
import { readClaims } from './jwt'
import { tokenStore } from './tokenStore'

// 웹 미리 보기: 로그인 창(팝업)이 /auth로 돌아오면 결과를 연 창에 넘기고 닫는다.
// 루트 레이아웃이 이 파일을 불러오므로 어느 경로로 열려도 화면을 그리기 전에 실행된다.
WebBrowser.maybeCompleteAuthSession()

export type AuthUser = { sub: string; name: string | null; username: string | null; email: string | null }

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; message: string | null }
  | { status: 'signedIn'; user: AuthUser }

type AuthValue = {
  state: AuthState
  // 로그인 창(키클락)을 연다. 회원 가입도 그 창에서 한다.
  signIn: () => Promise<void>
  // 갱신 토큰을 무르고 로그인 정보를 지운다(기기 기록 지우기는 부른 쪽이 한다).
  signOut: () => Promise<void>
  // 쓸 수 있는 액세스 토큰. 만료가 가까우면 갱신한다. 로그인이 끝났으면 로그아웃 상태로 바꾸고, 연결이 안 되면 null이다.
  accessToken: () => Promise<string | null>
}

type Tokens = { access: string; refresh: string; expiresAt: number }

const AuthContext = createContext<AuthValue | null>(null)

const unreachable = '로그인 서버에 연결하지 못했어요'

// 토큰은 받았지만 쓸 수 없을 때(사용자 정보나 갱신 토큰이 없음)
class UnusableTokenError extends Error {}

function userOf(accessToken: string): AuthUser | null {
  const claims = readClaims(accessToken)
  return claims
    ? { sub: claims.sub, name: claims.name ?? null, username: claims.preferred_username ?? null, email: claims.email ?? null }
    : null
}

function sameUser(a: AuthUser, b: AuthUser): boolean {
  return a.sub === b.sub && a.name === b.name && a.username === b.username && a.email === b.email
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const discovery = AuthSession.useAutoDiscovery(authConfig.issuer)
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'chansubible', path: 'auth' })
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: authConfig.clientId,
      redirectUri,
      scopes: authConfig.scopes,
      usePKCE: true,
      // 로그아웃한 뒤 다른 계정으로 들어갈 수 있게 늘 로그인 양식을 보인다.
      prompt: AuthSession.Prompt.Login,
    },
    discovery,
  )
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const tokens = useRef<Tokens | null>(null)
  const restored = useRef(false)

  // 받은 토큰을 기억하고 로그인 상태로 둔다. 갱신 토큰은 기기 보안 저장소에 둔다.
  const keep = useCallback(async (response: AuthSession.TokenResponse) => {
    const user = userOf(response.accessToken)
    const refresh = response.refreshToken ?? tokens.current?.refresh
    if (!user || !refresh) throw new UnusableTokenError('토큰에 사용자나 갱신 토큰이 없습니다')
    tokens.current = { access: response.accessToken, refresh, expiresAt: Date.now() + (response.expiresIn ?? 300) * 1000 }
    await tokenStore.save(refresh)
    setState((current) => (current.status === 'signedIn' && sameUser(current.user, user) ? current : { status: 'signedIn', user }))
  }, [])

  // 갱신 토큰으로 새 액세스 토큰을 받는다. invalid는 로그인이 끝난 것(다시 로그인해야 한다), offline은 연결 실패다.
  const refresh = useCallback(
    async (refreshToken: string): Promise<'ok' | 'invalid' | 'offline'> => {
      if (!discovery) return 'offline'
      try {
        await keep(await AuthSession.refreshAsync({ clientId: authConfig.clientId, refreshToken }, discovery))
        return 'ok'
      } catch (error) {
        return error instanceof AuthSession.TokenError || error instanceof UnusableTokenError ? 'invalid' : 'offline'
      }
    },
    [discovery, keep],
  )

  // 앱을 열면 저장해 둔 갱신 토큰으로 조용히 다시 로그인한다.
  useEffect(() => {
    if (!discovery || restored.current) return
    restored.current = true
    void (async () => {
      const saved = await tokenStore.load().catch(() => null)
      if (saved === null) {
        setState({ status: 'signedOut', message: null })
        return
      }
      const result = await refresh(saved)
      if (result === 'invalid') await tokenStore.clear().catch(() => undefined)
      if (result !== 'ok') setState({ status: 'signedOut', message: result === 'offline' ? unreachable : null })
    })()
  }, [discovery, refresh])

  // 키클락에 닿지 않으면 확인 중에 머물지 않고 로그아웃 상태로 둔다.
  useEffect(() => {
    const timer = setTimeout(() => {
      setState((current) => (current.status === 'loading' ? { status: 'signedOut', message: unreachable } : current))
    }, 8000)
    return () => clearTimeout(timer)
  }, [])

  const signIn = useCallback(async () => {
    if (!request || !discovery) {
      setState({ status: 'signedOut', message: unreachable })
      return
    }
    const result = await promptAsync()
    if (result.type !== 'success') {
      if (result.type === 'error') setState({ status: 'signedOut', message: '로그인하지 못했어요' })
      return
    }
    try {
      await keep(
        await AuthSession.exchangeCodeAsync(
          {
            clientId: authConfig.clientId,
            code: result.params.code ?? '',
            redirectUri,
            extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
          },
          discovery,
        ),
      )
    } catch {
      setState({ status: 'signedOut', message: '로그인하지 못했어요' })
    }
  }, [request, discovery, promptAsync, redirectUri, keep])

  const signOut = useCallback(async () => {
    const current = tokens.current
    tokens.current = null
    await tokenStore.clear().catch(() => undefined)
    // 키클락 쪽 세션도 끝낸다(갱신 토큰을 무른다). 연결이 안 되면 기기에서만 로그아웃한다.
    if (current && discovery?.revocationEndpoint) {
      await AuthSession.revokeAsync(
        { clientId: authConfig.clientId, token: current.refresh, tokenTypeHint: AuthSession.TokenTypeHint.RefreshToken },
        discovery,
      ).catch(() => undefined)
    }
    setState({ status: 'signedOut', message: null })
  }, [discovery])

  const accessToken = useCallback(async () => {
    const current = tokens.current
    if (!current) return null
    if (current.expiresAt - Date.now() > 30_000) return current.access
    const result = await refresh(current.refresh)
    if (result === 'ok') return tokens.current?.access ?? null
    if (result === 'invalid') {
      tokens.current = null
      await tokenStore.clear().catch(() => undefined)
      setState({ status: 'signedOut', message: '로그인이 끝났어요. 다시 로그인해 주세요.' })
    }
    return null
  }, [refresh])

  const value = useMemo(() => ({ state, signIn, signOut, accessToken }), [state, signIn, signOut, accessToken])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider 밖에서 useAuth를 불렀습니다')
  return value
}
```

- [ ] **Step 4: 동기화**

```ts path=mobile/src/sync/syncOnce.ts
import { applySyncResponse, type RecordStore, type RemoteRow } from 'reader-core'

export type SyncResult = { since: number; pushed: number; received: number }

export class SyncHttpError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`동기화 서버가 ${status}로 답했습니다`)
    this.status = status
  }
}

// 한 번에 올리는 줄 수(서버 한도와 같다)
const CHUNK = 500

// 한 번 맞춘다: 아직 안 올린 줄을 나눠 올리고, since 다음에 바뀐 줄을 받아 합친다. 받을 것이 더 있으면(more) 이어서 받는다.
export async function syncOnce(store: RecordStore, apiUrl: string, accessToken: string, since: number): Promise<SyncResult> {
  const queue = store.dirtyRows()
  let cursor = since
  let pushed = 0
  let received = 0
  for (let round = 0; round < 200; round++) {
    const sent = queue.splice(0, CHUNK)
    const response = await fetch(`${apiUrl}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        since: cursor,
        changes: sent.map(({ collection, id, data, updatedAt, deletedAt }) => ({ collection, id, data, updatedAt, deletedAt })),
      }),
    })
    if (!response.ok) throw new SyncHttpError(response.status)
    const body = (await response.json()) as { now: number; more: boolean; changes: RemoteRow[] }
    store.writeRows(applySyncResponse(sent, body.changes, (collection, id) => store.getRow(collection, id)))
    pushed += sent.length
    received += body.changes.length
    cursor = body.now
    if (queue.length === 0 && !body.more) break
  }
  return { since: cursor, pushed, received }
}
```

```tsx path=mobile/src/sync/SyncContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../auth/config'
import { store } from '../data/store'
import { kv } from '../storage/kv'
import { SyncHttpError, syncOnce } from './syncOnce'

// 어디까지 받아 갔는지(서버 순번)와, 기기 기록이 어느 계정 것인지
const sinceKey = 'sync-since'
const ownerKey = 'sync-owner'

function readKv(key: string): string | null {
  try {
    return kv.getItem(key)
  } catch {
    return null
  }
}

function writeKv(key: string, value: string): void {
  try {
    kv.setItem(key, value)
  } catch {
    // 적지 못해도 다음 동기화가 처음부터 받으면 합치기 규칙 때문에 결과는 같다.
  }
}

export type SyncStatus = { state: 'idle' | 'syncing' | 'error'; lastAt: number | null; message: string | null }

type SyncValue = {
  status: SyncStatus
  // 아직 올리지 않은 기록 수
  pending: number
  // 지금 맞춘다. 끝난 뒤에도 남은(못 올린) 기록 수를 돌려준다.
  syncNow: () => Promise<number>
}

const SyncContext = createContext<SyncValue | null>(null)

// 로그아웃할 때: 기기 기록과 받아 간 위치, 주인을 지운다.
export function clearLocalRecords(): void {
  store.clear()
  writeKv(sinceKey, '0')
  writeKv(ownerKey, '')
}

// 로그인해 있으면 기록을 맞춘다: 로그인한 때, 앱이 앞으로 올 때, 기록이 바뀌고 3초 뒤.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, accessToken } = useAuth()
  const userSub = state.status === 'signedIn' ? state.user.sub : null
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', lastAt: null, message: null })
  const [pending, setPending] = useState(() => store.dirtyRows().length)
  const inflight = useRef<Promise<number> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const later = useRef<() => void>(() => undefined)

  const run = useCallback(
    async (sub: string): Promise<number> => {
      setStatus((current) => ({ ...current, state: 'syncing', message: null }))
      let ok = false
      try {
        // 로그인이 풀린 뒤 다른 계정으로 들어왔으면 앞 계정의 기록은 올리지 않고 비운다(그 기록은 앞 계정에 있다).
        // 주인이 없는 기록(로그인 전에 쌓은 것)은 이 계정으로 올린다.
        const owner = readKv(ownerKey)
        if (owner && owner !== sub) clearLocalRecords()
        const token = await accessToken()
        if (token === null) {
          setStatus((current) => ({ ...current, state: 'error', message: '로그인 서버에 연결하지 못했어요' }))
        } else {
          const since = readKv(ownerKey) === sub ? Number(readKv(sinceKey) ?? 0) || 0 : 0
          const result = await syncOnce(store, apiUrl, token, since)
          writeKv(sinceKey, String(result.since))
          writeKv(ownerKey, sub)
          setStatus({ state: 'idle', lastAt: Date.now(), message: null })
          ok = true
        }
      } catch (error) {
        const message = error instanceof SyncHttpError && error.status === 401 ? '다시 로그인해 주세요' : '동기화 서버에 연결하지 못했어요'
        setStatus((current) => ({ ...current, state: 'error', message }))
      }
      const left = store.dirtyRows().length
      setPending(left)
      // 맞추는 사이 고친 기록은 조금 뒤 다시 올린다.
      if (ok && left > 0) later.current()
      return left
    },
    [accessToken],
  )

  const syncNow = useCallback((): Promise<number> => {
    if (userSub === null) return Promise.resolve(store.dirtyRows().length)
    if (!inflight.current) {
      inflight.current = run(userSub).finally(() => {
        inflight.current = null
      })
    }
    return inflight.current
  }, [userSub, run])

  later.current = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void syncNow(), 3000)
  }

  // 로그인하거나, 앱을 다시 열어 로그인이 이어지면 맞춘다.
  useEffect(() => {
    if (userSub !== null) void syncNow()
  }, [userSub, syncNow])

  // 앱이 앞으로 오면 맞춘다(다른 기기에서 읽은 것을 받아 온다).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow()
    })
    return () => subscription.remove()
  }, [syncNow])

  // 기록이 바뀌면 3초 뒤 올린다(이어서 바뀌면 마지막 변경에서 3초 뒤).
  useEffect(
    () =>
      store.subscribe(() => {
        const dirty = store.dirtyRows().length
        setPending(dirty)
        if (userSub !== null && dirty > 0 && !inflight.current) later.current()
      }),
    [userSub],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const value = useMemo(() => ({ status, pending, syncNow }), [status, pending, syncNow])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('SyncProvider 밖에서 useSync를 불렀습니다')
  return value
}
```

기기 저장(persistence)은 여러 줄 쓰기와 비우기를 더한다.

```ts path=mobile/src/data/persistence.ts
import { openDatabaseSync } from 'expo-sqlite'
import type { Collection, Persistence, RecordRow } from 'reader-core'

// 기기 기록을 SQLite 파일(reader.db)의 records 표 하나에 둔다. 컬렉션과 id가 키다.
const db = openDatabaseSync('reader.db')
db.execSync(
  'CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL, PRIMARY KEY (collection, id))',
)

type Row = { collection: string; id: string; data: string; updated_at: number; deleted_at: number | null; dirty: number }

function save(row: RecordRow): void {
  db.runSync(
    'INSERT OR REPLACE INTO records (collection, id, data, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, ?)',
    [row.collection, row.id, JSON.stringify(row.data), row.updatedAt, row.deletedAt, row.dirty ? 1 : 0],
  )
}

export const persistence: Persistence = {
  load: () =>
    db.getAllSync<Row>('SELECT collection, id, data, updated_at, deleted_at, dirty FROM records').map(
      (row): RecordRow => ({
        collection: row.collection as Collection,
        id: row.id,
        data: JSON.parse(row.data) as unknown,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        dirty: row.dirty === 1,
      }),
    ),
  save,
  // 동기화로 받은 여러 줄은 트랜잭션 하나로 쓴다(줄마다 디스크에 쓰지 않게).
  saveMany: (rows) => {
    db.withTransactionSync(() => {
      for (const row of rows) save(row)
    })
  },
  clear: () => {
    db.runSync('DELETE FROM records')
  },
}
```

```ts path=mobile/src/data/persistence.web.ts
import type { Persistence, RecordRow } from 'reader-core'

// Expo 웹 미리 보기에서는 localStorage 한 키에 모든 줄을 JSON으로 둔다.
const key = 'reader-records'
let rows: RecordRow[] = []

function read(): RecordRow[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? (value as RecordRow[]) : []
  } catch {
    return []
  }
}

function put(row: RecordRow): void {
  const index = rows.findIndex((item) => item.collection === row.collection && item.id === row.id)
  if (index >= 0) rows[index] = row
  else rows.push(row)
}

function flush(): void {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 이번 세션 동안만 기억한다.
  }
}

export const persistence: Persistence = {
  load: () => {
    rows = read()
    return rows
  },
  save: (row) => {
    put(row)
    flush()
  },
  saveMany: (many) => {
    for (const row of many) put(row)
    flush()
  },
  clear: () => {
    rows = []
    try {
      localStorage.removeItem(key)
    } catch {
      // 위와 같다.
    }
  },
}
```

- [ ] **Step 5: 계정 화면과 돌아오는 경로**

```tsx path=mobile/src/account/AccountScreen.tsx
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthContext'
import { apiUrl, authConfig } from '../auth/config'
import { useSettings } from '../settings/SettingsContext'
import { clearLocalRecords, useSync } from '../sync/SyncContext'
import { fonts, type Palette } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

function syncedLabel(at: number | null): string {
  if (at === null) return '아직 맞추지 않았어요'
  const date = new Date(at)
  return `${date.getHours()}시 ${String(date.getMinutes()).padStart(2, '0')}분에 맞췄어요`
}

type ButtonKind = 'primary' | 'danger' | 'outline' | 'plain'

function Button({ label, kind, palette, onPress, disabled = false }: { label: string; kind: ButtonKind; palette: Palette; onPress: () => void; disabled?: boolean }) {
  const background = kind === 'primary' ? palette.accent : kind === 'danger' ? palette.warn : 'transparent'
  const color = kind === 'primary' || kind === 'danger' ? palette.paper : kind === 'plain' ? palette.inkSoft : palette.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: kind === 'outline' ? palette.line : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  )
}

// 로그아웃 확인 단계: 묻기, 못 올린 기록이 있어 한 번 더 묻기
type Leaving = 'none' | 'confirm' | 'unsynced'

// 로그인, 동기화 상태, 로그아웃
export default function AccountScreen() {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const auth = useAuth()
  const sync = useSync()
  const [leaving, setLeaving] = useState<Leaving>('none')
  const [busy, setBusy] = useState(false)
  const { state } = auth

  // 아직 안 올린 기록을 먼저 올려 보고, 못 올렸으면 한 번 더 묻는다.
  async function signOut(force: boolean) {
    setBusy(true)
    try {
      if (!force && sync.pending > 0 && (await sync.syncNow()) > 0) {
        setLeaving('unsynced')
        return
      }
      await auth.signOut()
      clearLocalRecords()
      setLeaving('none')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="계정과 동기화" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {state.status === 'loading' && (
          <View style={[styles.card, styles.center, { backgroundColor: palette.surface }]}>
            <ActivityIndicator color={palette.accent} />
            <Text style={[styles.body, { color: palette.inkSoft }]}>로그인 정보를 확인하고 있어요</Text>
          </View>
        )}

        {state.status === 'signedOut' && (
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <Text style={[styles.title, { color: palette.ink }]}>로그인하면 다른 기기에서 이어 읽어요</Text>
            <Text style={[styles.body, { color: palette.inkSoft }]}>
              읽은 장면, 읽던 곳, 읽기 계획, 밑줄과 메모를 계정에 맡겨 두고 다른 기기와 맞춰요. 로그인하지 않아도 이 기기에서는 모두 쓸 수
              있어요.
            </Text>
            {state.message !== null && <Text style={[styles.body, { color: palette.warn }]}>{state.message}</Text>}
            <Button label="로그인 / 회원 가입" kind="primary" palette={palette} onPress={() => void auth.signIn()} />
          </View>
        )}

        {state.status === 'signedIn' && (
          <>
            <View style={[styles.card, { backgroundColor: palette.surface }]}>
              <Text style={[styles.caption, { color: palette.inkSoft }]}>로그인한 계정</Text>
              <Text style={[styles.title, { color: palette.ink }]}>{state.user.name ?? state.user.username ?? '이름 없음'}</Text>
              {state.user.email !== null && <Text style={[styles.body, { color: palette.inkSoft }]}>{state.user.email}</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: palette.surface }]}>
              <Text style={[styles.caption, { color: palette.inkSoft }]}>기록 동기화</Text>
              <Text style={[styles.body, { color: palette.ink }]}>
                {sync.status.state === 'syncing' ? '맞추고 있어요' : syncedLabel(sync.status.lastAt)}
              </Text>
              {sync.pending > 0 && <Text style={[styles.body, { color: palette.inkSoft }]}>아직 올리지 않은 기록 {sync.pending}개</Text>}
              {sync.status.message !== null && <Text style={[styles.body, { color: palette.warn }]}>{sync.status.message}</Text>}
              <Button
                label="지금 맞추기"
                kind="outline"
                palette={palette}
                disabled={sync.status.state === 'syncing'}
                onPress={() => void sync.syncNow()}
              />
            </View>

            {leaving === 'none' ? (
              <Button label="로그아웃" kind="outline" palette={palette} onPress={() => setLeaving('confirm')} />
            ) : (
              <View style={[styles.card, { backgroundColor: palette.warnSoft }]}>
                <Text style={[styles.body, { color: palette.ink }]}>
                  {leaving === 'confirm'
                    ? `로그아웃하면 이 기기의 읽기 기록(읽은 장면, 읽던 곳, 계획, 밑줄과 메모)을 지워요. 기록은 계정에 남아 다시 로그인하면 받아 와요.${
                        sync.pending > 0 ? ` 아직 올리지 않은 기록 ${sync.pending}개는 먼저 올려요.` : ''
                      }`
                    : `서버에 연결하지 못해 기록 ${sync.pending}개를 올리지 못했어요. 지금 로그아웃하면 이 기록은 사라져요.`}
                </Text>
                <View style={styles.row}>
                  <Button label="취소" kind="plain" palette={palette} onPress={() => setLeaving('none')} />
                  <Button
                    label={leaving === 'confirm' ? '로그아웃' : '그래도 로그아웃'}
                    kind="danger"
                    palette={palette}
                    disabled={busy}
                    onPress={() => void signOut(leaving === 'unsynced')}
                  />
                </View>
              </View>
            )}
          </>
        )}

        <Text style={[styles.note, { color: palette.inkFaint }]}>{`로그인 서버 ${authConfig.issuer}\n동기화 서버 ${apiUrl}`}</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 16, gap: 10 },
  center: { alignItems: 'center' },
  caption: { fontSize: 12 },
  title: { fontFamily: fonts.serifBold, fontSize: 18 },
  body: { fontSize: 14, lineHeight: 21 },
  button: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  note: { fontSize: 11, lineHeight: 17 },
})
```

```tsx path=mobile/src/app/account.tsx
import AccountScreen from '../account/AccountScreen'

export default function AccountRoute() {
  return <AccountScreen />
}
```

```tsx path=mobile/src/app/auth.tsx
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useSettings } from '../settings/SettingsContext'

// 로그인 창(키클락)이 돌아오는 주소(앱 chansubible://auth, 웹 /auth).
// 결과는 로그인을 연 쪽(AuthContext의 promptAsync)이 받는다. 앱이 이 주소로 열리면 앞 화면으로 돌아간다.
// 웹 미리 보기의 로그인 창은 AuthContext를 불러올 때 결과를 넘기고 스스로 닫힌다.
export default function AuthRoute() {
  const router = useRouter()
  const { palette } = useSettings()
  useEffect(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/account')
  }, [router])
  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ActivityIndicator color={palette.accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
```

- [ ] **Step 6: 공급자, 홈의 계정 단추, 아이콘**

`mobile/src/app/_layout.tsx`: `SettingsProvider` 안쪽을 `AuthProvider` → `SyncProvider` → `Frame` 순서로 감싼다.

```tsx
import { AuthProvider } from '../auth/AuthContext'
import { SyncProvider } from '../sync/SyncContext'
// …
        <SettingsProvider>
          <AuthProvider>
            <SyncProvider>
              <Frame />
            </SyncProvider>
          </AuthProvider>
        </SettingsProvider>
```

`mobile/src/ui/Icon.tsx`: `IconName`에 `'account'`를, 모양에 동그라미 안의 사람을 더한다.

```tsx
  account: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={10} r={3} />
      <Path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
    </>
  ),
```

`mobile/src/home/HomeScreen.tsx`: 머리 오른쪽(연속 읽기 표시 옆)에 계정 단추를 둔다. 로그인해 있으면 강조색이다.

```tsx
import { useAuth } from '../auth/AuthContext'
import { IconButton } from '../ui/IconButton'
// …
  const signedIn = useAuth().state.status === 'signedIn'
// …
          <View style={styles.headerSide}>
            {streak > 0 && (/* 연속 읽기 표시 그대로 */)}
            <IconButton
              name="account"
              label={signedIn ? '계정과 동기화' : '로그인'}
              color={signedIn ? palette.accent : palette.inkSoft}
              onPress={() => router.push('/account')}
            />
          </View>
// styles
  headerSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
```

- [ ] **Step 7: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile package-lock.json
git commit -m "feat(mobile): 키클락 로그인(PKCE, 갱신 토큰 보관)과 기록 동기화, 계정 화면"
```

---

### Task 5: 확인과 문서

- [ ] **Step 1: 두 기기처럼 확인**

인프라와 서버(`npm run server`)를 띄우고 Expo 웹을 연다(새 모듈을 설치했으니 Metro를 다시 띄운다).
1. 로그인 전에 밑줄·메모를 하나 남긴다. 홈의 계정 단추 → "로그인 / 회원 가입" → 키클락 로그인 창(한국어)에서 시험 계정으로 로그인 → 계정 화면에 이름과 "…에 맞췄어요"가 보인다.
2. 시험 토큰으로 `/sync`(since 0)를 불러, 로그인 전 기록(밑줄·메모, 읽던 곳, 읽은 장면)이 서버에 올라갔는지 본다.
3. 다른 기기를 흉내 내어 시험 토큰으로 다른 절의 메모 줄을 `/sync`로 올린다. 앱에서 "지금 맞추기"를 누르면 내 메모 목록과 본문에 그 메모가 나타난다.
4. 앱에서 그 메모를 지우면(밑줄·메모 시트에서 모두 비우고 저장) 3초 뒤 서버의 그 줄에 `deletedAt`이 생긴다.
5. 페이지를 새로 고치면 저장해 둔 갱신 토큰으로 다시 로그인된다(토큰 갱신과 키클락 CORS 확인).
6. 로그아웃(확인 단계 포함) → 기기 기록이 빈다(홈의 이어 읽기가 1장 1절). 다시 로그인하면 받아 온다.

- [ ] **Step 2: 문서**

설계 문서 "진행"에 3단계 완료와 바꾼 것을 적고, 7·8절(동기화, 서버)을 실제와 맞춘다. README의 구조 표에 `server/`, `infra/`를, 명령에 `npm run infra:up`, `npm run server`를 더한다.

- [ ] **Step 3: 전체 시험과 커밋**

Run: `npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run build -w app` → 모두 성공

```bash
git add README.md docs
git commit -m "docs: 네이티브 앱 3단계(로그인과 동기화) 완료"
```
