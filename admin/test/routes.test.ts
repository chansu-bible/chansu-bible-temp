import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Proposal } from 'pipeline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { setAtPath } from '../server/dotPath.ts'
import { JobQueue } from '../server/jobs.ts'
import { parseGitStatus } from '../server/routes/git.ts'
import { eden, flood } from './fixtures.ts'

const proposal: Proposal = {
  id: 'p1',
  createdAt: '2026-10-06T00:00:00.000Z',
  target: 'places/eden',
  field: 'design.landscape',
  value: '네 강이 갈라지는 평야',
  reason: '2:10',
  sources: ['2:10'],
  status: 'open',
}

let dir: string
let queue: JobQueue
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'admin-test-'))
  await writeFile(path.join(dir, 'places.json'), JSON.stringify([eden]))
  await writeFile(path.join(dir, 'eras.json'), JSON.stringify([flood]))
  await writeFile(path.join(dir, 'proposals.json'), JSON.stringify([proposal, { ...proposal, id: 'p2', field: 'facts.sources', value: [] }]))
  queue = new JobQueue()
  app = createApp({
    storyBibleDir: dir,
    queue,
    createRunner: (stage) => async (log) => {
      log(`${stage} 실행`)
      if (stage === 'source') throw new Error('가짜 실패')
    },
  })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
// 응답 본문(시험에서는 모양을 따지지 않는다)
const read = (res: Response): Promise<any> => res.json()
const fileOf = async (name: string) => JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'))

describe('설정집 API', () => {
  it('목록을 읽는다', async () => {
    const res = await app.request('/api/canon/eras')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual([flood])
  })

  it('모르는 종류는 404', async () => {
    const res = await app.request('/api/canon/animals')
    expect(res.status).toBe(404)
    expect((await read(res)).error).toMatch(/모르는 설정집 종류/)
  })

  it('새 항목은 201, 같은 id는 409', async () => {
    const nod = { ...eden, id: 'nod', name: '놋', status: 'draft' }
    const created = await app.request('/api/canon/places', { method: 'POST', ...json(nod) })
    expect(created.status).toBe(201)
    expect((await fileOf('places')).map((item: { id: string }) => item.id)).toEqual(['eden', 'nod'])
    const again = await app.request('/api/canon/places', { method: 'POST', ...json(nod) })
    expect(again.status).toBe(409)
  })

  it('형식에 맞지 않으면 400과 한국어 오류, 파일은 그대로', async () => {
    const res = await app.request('/api/canon/eras/flood', {
      method: 'PUT',
      ...json({ ...flood, range: { from: '여섯', to: '8:22' }, facts: { ...flood.facts, sources: [] } }),
    })
    expect(res.status).toBe(400)
    const { error } = await read(res)
    expect(error).toContain('항목이 형식에 맞지 않습니다')
    expect(error).toContain('range.from')
    expect(error).toContain('facts.sources: 1개 이상')
    expect(await fileOf('eras')).toEqual([flood])
  })

  it('주소와 본문의 id가 다르면 400, 없는 항목은 404', async () => {
    expect((await app.request('/api/canon/eras/flood', { method: 'PUT', ...json({ ...flood, id: 'other' }) })).status).toBe(400)
    expect((await app.request('/api/canon/eras/none', { method: 'PUT', ...json({ ...flood, id: 'none' }) })).status).toBe(404)
  })

  it('고친 항목을 저장한다', async () => {
    const res = await app.request('/api/canon/eras/flood', { method: 'PUT', ...json({ ...flood, name: '대홍수' }) })
    expect(res.status).toBe(200)
    expect((await fileOf('eras'))[0].name).toBe('대홍수')
  })

  it('교차 검증에 걸리면 400', async () => {
    const res = await app.request('/api/canon/eras/flood', {
      method: 'PUT',
      ...json({ ...flood, range: { from: '8:22', to: '6:9' } }),
    })
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('설정집')
  })

  it('승인과 반려', async () => {
    const approved = await app.request('/api/canon/eras/flood/approve', { method: 'POST' })
    expect((await read(approved)).status).toBe('approved')
    expect((await fileOf('eras'))[0].status).toBe('approved')
    const rejected = await app.request('/api/canon/eras/flood/reject', { method: 'POST' })
    expect((await read(rejected)).status).toBe('rejected')
  })
})

describe('제안 API', () => {
  it('적용하면 항목이 바뀌고 제안은 applied', async () => {
    const res = await app.request('/api/proposals/p1/apply', { method: 'POST' })
    expect(res.status).toBe(200)
    expect((await read(res)).status).toBe('applied')
    expect((await fileOf('places'))[0].design.landscape).toBe('네 강이 갈라지는 평야')
    expect((await fileOf('proposals'))[0].status).toBe('applied')
    expect((await app.request('/api/proposals/p1/apply', { method: 'POST' })).status).toBe(409)
  })

  it('적용 결과가 검증에 걸리면 400이고 아무것도 바뀌지 않는다', async () => {
    const res = await app.request('/api/proposals/p2/apply', { method: 'POST' })
    expect(res.status).toBe(400)
    expect(await fileOf('places')).toEqual([eden])
    expect((await fileOf('proposals'))[1].status).toBe('open')
  })

  it('버리면 dismissed, 없는 제안은 404', async () => {
    const res = await app.request('/api/proposals/p2/dismiss', { method: 'POST' })
    expect((await read(res)).status).toBe('dismissed')
    expect((await app.request('/api/proposals/nope/dismiss', { method: 'POST' })).status).toBe(404)
  })
})

describe('작업 API', () => {
  it('작업을 받고 끝까지 실행한다', async () => {
    const res = await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'build', options: {} }) })
    expect(res.status).toBe(202)
    const { id } = await read(res)
    await queue.wait(id)
    const job = await read(await app.request(`/api/jobs/${id}`))
    expect(job.status).toBe('done')
    expect(job.lines).toEqual(['build 실행'])
    expect((await read(await app.request('/api/jobs')))[0].id).toBe(id)
  })

  it('잘못된 요청은 400, 실행 중이면 409', async () => {
    expect((await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'review' }) })).status).toBe(400)
    expect((await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'canon', options: {} }) })).status).toBe(400)
    const first = await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'build' }) })
    const busy = await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'build' }) })
    expect(busy.status).toBe(409)
    await queue.wait((await read(first)).id)
  })

  it('SSE로 줄과 끝을 보낸다', async () => {
    const res = await app.request('/api/jobs', { method: 'POST', ...json({ stage: 'source' }) })
    const { id } = await read(res)
    const events = await app.request(`/api/jobs/${id}/events`)
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    const text = await events.text()
    expect(text).toContain('data: {"line":"source 실행"}')
    expect(text).toContain('event: end\ndata: {"status":"failed"}')
  })

  it('없는 작업은 404', async () => {
    expect((await app.request('/api/jobs/nope')).status).toBe(404)
  })
})

describe('도움 함수', () => {
  it('setAtPath는 점 경로에 값을 넣고 중간 객체를 만든다', () => {
    const before = { a: { b: 1 }, list: [{ x: 1 }] }
    expect(setAtPath(before, 'a.b', 2)).toEqual({ a: { b: 2 }, list: [{ x: 1 }] })
    expect(setAtPath(before, 'c.d.e', 'v')).toEqual({ ...before, c: { d: { e: 'v' } } })
    expect(setAtPath(before, 'list.0.x', 5).list[0]!.x).toBe(5)
    expect(before.a.b).toBe(1)
    expect(() => setAtPath(before, 'a..b', 1)).toThrow()
  })

  it('parseGitStatus는 브랜치와 바뀐 파일을 읽는다', () => {
    const output = '## feat/x...origin/feat/x [ahead 1]\n M admin/a.ts\n?? admin/새 파일.ts\nR  old.ts -> new.ts\n'
    expect(parseGitStatus(output)).toEqual({
      branch: 'feat/x',
      changes: [
        { path: 'admin/a.ts', status: 'M' },
        { path: 'admin/새 파일.ts', status: '??' },
        { path: 'new.ts', status: 'R' },
      ],
    })
    expect(parseGitStatus('## No commits yet on main\n').branch).toBe('main')
  })
})
