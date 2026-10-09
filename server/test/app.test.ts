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
