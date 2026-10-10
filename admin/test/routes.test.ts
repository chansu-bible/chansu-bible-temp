import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Proposal } from 'pipeline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.ts'
import { setAtPath } from '../server/dotPath.ts'
import { JobQueue, type JobOptions, type Stage } from '../server/jobs.ts'
import { parseGitStatus } from '../server/routes/git.ts'
import { eden, flood, sourceWith } from './fixtures.ts'

const proposal: Proposal = {
  id: 'p1',
  createdAt: '2026-10-06T00:00:00.000Z',
  target: 'places/eden',
  field: 'design.landscape',
  value: '네 강이 갈라지는 평야',
  reason: '2:10',
  sources: ['genesis 2:10'],
  status: 'open',
}

// 설정집 인용(창세기 2:8, 2:10, 6:9~8:22, 6:14-16)을 검증할 만큼만 든 창세기 본문
const genesis = sourceWith('창세기', { 2: 25, 6: 22, 8: 22 })

let root: string
// 설정집 폴더
let dir: string
let sourceDir: string
let queue: JobQueue
let app: ReturnType<typeof createApp>
// createRunner가 받은 단계와 옵션
let runnerCalls: { stage: Stage; options: JobOptions }[]

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'admin-test-'))
  dir = path.join(root, 'story-bible')
  sourceDir = path.join(root, 'source')
  await mkdir(dir)
  await mkdir(sourceDir)
  await writeFile(path.join(sourceDir, 'genesis.json'), JSON.stringify(genesis))
  await writeFile(path.join(dir, 'places.json'), JSON.stringify([eden]))
  await writeFile(path.join(dir, 'eras.json'), JSON.stringify([flood]))
  await writeFile(path.join(dir, 'proposals.json'), JSON.stringify([proposal, { ...proposal, id: 'p2', field: 'facts.sources', value: [] }]))
  queue = new JobQueue()
  runnerCalls = []
  app = createApp({
    storyBibleDir: dir,
    sourceDir,
    queue,
    createRunner: (stage, options) => {
      runnerCalls.push({ stage, options })
      return async (log) => {
        log(`${stage} 실행`)
        if (stage === 'source') throw new Error('가짜 실패')
      }
    },
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
// 응답 본문(시험에서는 모양을 따지지 않는다)
const read = (res: Response): Promise<any> => res.json()
const fileOf = async (name: string) => JSON.parse(await readFile(path.join(dir, `${name}.json`), 'utf8'))
const startJob = (body: unknown) => app.request('/api/jobs', { method: 'POST', ...json(body) })

describe('책 목록 API', () => {
  it('본문 파일이 있는 책을 성경 순서로, 책의 장 수와 본문의 장 수·첫 장·끝 장을 함께 돌려준다', async () => {
    await writeFile(path.join(sourceDir, 'exodus.json'), JSON.stringify(sourceWith('출애굽기', { 3: 2 })))
    await writeFile(path.join(sourceDir, 'notes.json'), '{}')
    const res = await app.request('/api/books')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual([
      { id: 'genesis', name: '창세기', chapters: 50, sourceChapters: 3, sourceRange: { from: 2, to: 8 } },
      { id: 'exodus', name: '출애굽기', chapters: 40, sourceChapters: 1, sourceRange: { from: 3, to: 3 } },
    ])
  })

  it('본문 하나가 깨져도 그 책은 오류와 함께 넣고 다른 책은 그대로 돌려준다', async () => {
    await writeFile(path.join(sourceDir, 'exodus.json'), '{ 깨진 파일')
    const res = await app.request('/api/books')
    expect(res.status).toBe(200)
    const [genesisBook, exodusBook] = await read(res)
    expect(genesisBook).toEqual({ id: 'genesis', name: '창세기', chapters: 50, sourceChapters: 3, sourceRange: { from: 2, to: 8 } })
    expect(exodusBook).toMatchObject({ id: 'exodus', name: '출애굽기', chapters: 40, sourceChapters: 0, sourceRange: null })
    expect(exodusBook.error).toContain('exodus.json')
  })

  it('본문이 하나도 없으면 빈 목록', async () => {
    await rm(path.join(sourceDir, 'genesis.json'))
    expect(await read(await app.request('/api/books'))).toEqual([])
  })
})

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

  it('절 인용은 sourceDir의 본문으로 검증한다', async () => {
    const horeb = {
      ...eden,
      id: 'horeb',
      name: '호렙',
      status: 'draft',
      facts: { firstAppearance: 'exodus 3:1', description: '하나님의 산', sources: ['exodus 3:1'] },
    }
    const missing = await app.request('/api/canon/places', { method: 'POST', ...json(horeb) })
    expect(missing.status).toBe(400)
    expect((await read(missing)).error).toContain('출애굽기 본문이 없어 절 인용을 확인할 수 없습니다')

    await writeFile(path.join(sourceDir, 'exodus.json'), JSON.stringify(sourceWith('출애굽기', { 3: 22 })))
    expect((await app.request('/api/canon/places', { method: 'POST', ...json(horeb) })).status).toBe(201)
  })

  it('형식에 맞지 않으면 400과 한국어 오류, 파일은 그대로', async () => {
    const res = await app.request('/api/canon/eras/flood', {
      method: 'PUT',
      ...json({ ...flood, range: { from: '여섯', to: 'genesis 8:22' }, facts: { ...flood.facts, sources: [] } }),
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
      ...json({ ...flood, range: { from: 'genesis 8:22', to: 'genesis 6:9' } }),
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
    const res = await startJob({ stage: 'build', options: {} })
    expect(res.status).toBe(202)
    const { id } = await read(res)
    await queue.wait(id)
    const job = await read(await app.request(`/api/jobs/${id}`))
    expect(job.status).toBe('done')
    expect(job.lines).toEqual(['build 실행'])
    expect((await read(await app.request('/api/jobs')))[0].id).toBe(id)
  })

  it('잘못된 요청은 400, 실행 중이면 409', async () => {
    expect((await startJob({ stage: 'review' })).status).toBe(400)
    expect((await startJob({ stage: 'canon', options: { book: 'genesis' } })).status).toBe(400)
    const first = await startJob({ stage: 'build' })
    const busy = await startJob({ stage: 'build' })
    expect(busy.status).toBe(409)
    await queue.wait((await read(first)).id)
  })

  it('장 단계와 source에 책이 없으면 400', async () => {
    for (const stage of ['source', 'canon', 'scenario', 'review-text', 'images', 'tts', 'quiz']) {
      const res = await startJob({ stage, options: { chapter: 1 } })
      expect(res.status).toBe(400)
      expect((await read(res)).error).toBe(`${stage} 단계에는 책(book)이 필요합니다`)
    }
    const unknown = await startJob({ stage: 'canon', options: { book: 'nobook', chapter: 1 } })
    expect(unknown.status).toBe(400)
    expect((await read(unknown)).error).toBe('알 수 없는 책입니다: nobook')
    expect(runnerCalls).toEqual([])
  })

  it('build와 original-gloss에 책이 오면 CLI와 같은 글로 400', async () => {
    const build = await startJob({ stage: 'build', options: { book: 'genesis' } })
    expect(build.status).toBe(400)
    expect((await read(build)).error).toBe('build는 본문이 있는 모든 책을 함께 만듭니다. --book은 받지 않습니다.')
    const gloss = await startJob({ stage: 'original-gloss', options: { book: 'genesis' } })
    expect(gloss.status).toBe(400)
    expect((await read(gloss)).error).toBe('original-gloss는 모든 책이 함께 쓰는 사전을 채웁니다. --book은 받지 않습니다.')
    expect(runnerCalls).toEqual([])
  })

  it('source의 장 범위가 틀리면 400', async () => {
    for (const chapters of ['1~10', '3-', 'all', '']) {
      const res = await startJob({ stage: 'source', options: { book: 'genesis', chapters } })
      expect(res.status).toBe(400)
      expect((await read(res)).error).toBe(`장 범위는 3-7이나 3처럼 씁니다: ${chapters}`)
    }
    expect(runnerCalls).toEqual([])
  })

  it('장 범위나 장 번호가 그 책에 없으면 400', async () => {
    for (const [chapters, range] of [
      ['45-55', '45~55'],
      ['7-3', '7~3'],
      ['0', '0~0'],
    ]) {
      const res = await startJob({ stage: 'source', options: { book: 'genesis', chapters } })
      expect(res.status).toBe(400)
      expect((await read(res)).error).toBe(`창세기의 장 범위가 틀렸습니다: ${range} (1~50장)`)
    }
    const chapter = await startJob({ stage: 'quiz', options: { book: 'ruth', chapter: 5 } })
    expect(chapter.status).toBe(400)
    expect((await read(chapter)).error).toBe('룻기에는 5장이 없습니다')
    const last = await startJob({ stage: 'quiz', options: { book: 'ruth', chapter: 4 } })
    expect(last.status).toBe(202)
    expect(runnerCalls).toEqual([{ stage: 'quiz', options: { book: 'ruth', chapter: 4 } }])
    await queue.wait((await read(last)).id)
  })

  it('source의 책과 장 범위를 작업에 넘기고, 작업 목록에 책이 남는다', async () => {
    const res = await startJob({ stage: 'source', options: { book: 'exodus', chapters: '3-7', chapter: 2 } })
    expect(res.status).toBe(202)
    const { id } = await read(res)
    expect(runnerCalls).toEqual([{ stage: 'source', options: { book: 'exodus', chapters: '3-7' } }])
    await queue.wait(id)
    expect((await read(await app.request('/api/jobs')))[0].options).toEqual({ book: 'exodus', chapters: '3-7' })

    const whole = await startJob({ stage: 'source', options: { book: 'ruth' } })
    expect(whole.status).toBe(202)
    expect(runnerCalls[1]).toEqual({ stage: 'source', options: { book: 'ruth' } })
    await queue.wait((await read(whole)).id)
  })

  it('original은 책을 고르지 않아도 받는다', async () => {
    const res = await startJob({ stage: 'original', options: {} })
    expect(res.status).toBe(202)
    expect(runnerCalls).toEqual([{ stage: 'original', options: {} }])
    await queue.wait((await read(res)).id)
  })

  // 신약 책은 400으로 막지 않고, 작업이 파이프라인의 거절 글로 실패한다(본문을 읽거나 받기 전에 멈춘다).
  // 진짜 작업 본체를 쓰므로, 거절이 늦어져도 네트워크에 나가지 않게 fetch를 막아 둔다.
  it('original에 신약 책을 고르면 작업이 파이프라인의 거절 글로 실패한다', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('시험에서는 받지 않습니다')
    })
    try {
      const realQueue = new JobQueue()
      const real = createApp({ storyBibleDir: dir, sourceDir, queue: realQueue })
      const res = await real.request('/api/jobs', { method: 'POST', ...json({ stage: 'original', options: { book: 'matthew' } }) })
      expect(res.status).toBe(202)
      const { id } = await read(res)
      await realQueue.wait(id)
      const job = await read(await real.request(`/api/jobs/${id}`))
      expect(job.status).toBe('failed')
      expect(job.options).toEqual({ book: 'matthew' })
      expect(job.error).toBe('신약 원어 자료는 아직 정하지 않았어요(마태복음)')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('SSE로 줄과 끝을 보낸다', async () => {
    const res = await startJob({ stage: 'source', options: { book: 'genesis' } })
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
