import { readFile, rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { JobQueue } from '../server/jobs.ts'
import { lexicon, makeTempContent, pretty, type TempContent } from './fixtures.ts'

let dirs: TempContent
let queue: JobQueue
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dirs = await makeTempContent()
  queue = new JobQueue()
  app = createApp({ ...dirs, queue })
})

afterEach(async () => {
  await rm(dirs.root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const read = (res: Response): Promise<any> => res.json()
const fileText = () => readFile(dirs.lexiconFile, 'utf8')
const put = (strong: string, body: unknown) => app.request(`/api/lexicon/${strong}`, { method: 'PUT', ...json(body) })
const [h1, h776, h7225] = lexicon.entries as [(typeof lexicon.entries)[number], (typeof lexicon.entries)[number], (typeof lexicon.entries)[number]]

describe('원어 사전 읽기', () => {
  it('사전 파일을 그대로 돌려준다', async () => {
    const res = await app.request('/api/lexicon')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual(lexicon)
  })

  it('파일이 없으면 404와 한국어 안내', async () => {
    await rm(dirs.lexiconFile)
    const res = await app.request('/api/lexicon')
    expect(res.status).toBe(404)
    expect((await read(res)).error).toContain('original')
  })
})

describe('한국어 뜻 저장', () => {
  it('그 항목의 뜻만 바꾸고 같은 모양으로 쓴다', async () => {
    const res = await put('H1', { meaning: '아버지', note: '조상도 뜻해요.', status: 'approved' })
    expect(res.status).toBe(200)
    const changed = { ...h1, korean: { meaning: '아버지', note: '조상도 뜻해요.', status: 'approved' } }
    expect(await read(res)).toEqual(changed)
    expect(await fileText()).toBe(pretty({ entries: [changed, h776, h7225] }))
  })

  it('뜻이 없던 항목에 초안을 넣고, 앞뒤 공백은 뗀다', async () => {
    const res = await put('H7225', { meaning: '  처음, 시작 ', note: ' 1:1 ', status: 'draft' })
    expect(res.status).toBe(200)
    expect((await read(res)).korean).toEqual({ meaning: '처음, 시작', note: '1:1', status: 'draft' })
    expect(JSON.parse(await fileText()).entries[2].korean).toEqual({ meaning: '처음, 시작', note: '1:1', status: 'draft' })
  })

  it('뜻을 비우면(공백뿐이어도) korean을 null로 지운다', async () => {
    const res = await put('H776', { meaning: '   ', note: '메모는 무시', status: 'approved' })
    expect(res.status).toBe(200)
    expect((await read(res)).korean).toBeNull()
    expect(await fileText()).toBe(pretty({ entries: [h1, { ...h776, korean: null }, h7225] }))
  })

  it('본문 형식이 틀리면 400과 한국어 오류, 파일은 그대로', async () => {
    const before = await fileText()
    for (const body of [
      { meaning: '아버지', note: '', status: 'final' },
      { meaning: 3, note: '', status: 'draft' },
      { meaning: '아버지', status: 'draft' },
      ['아버지'],
      null,
    ]) {
      const res = await put('H1', body)
      expect(res.status).toBe(400)
      expect((await read(res)).error).toContain('한국어 뜻이 형식에 맞지 않습니다')
    }
    const notJson = await app.request('/api/lexicon/H1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })
    expect(notJson.status).toBe(400)
    expect(await fileText()).toBe(before)
  })

  it('사전에 없는 번호는 404, 파일은 그대로', async () => {
    const before = await fileText()
    const res = await put('H9999', { meaning: '없음', note: '', status: 'draft' })
    expect(res.status).toBe(404)
    expect((await read(res)).error).toContain('H9999')
    expect(await fileText()).toBe(before)
  })

  it('사전 파일이 없으면 404', async () => {
    await rm(dirs.lexiconFile)
    expect((await put('H1', { meaning: '아버지', note: '', status: 'draft' })).status).toBe(404)
  })

  it('원어 작업이 도는 동안에는 409, 끝나면 저장된다', async () => {
    let finish!: () => void
    const job = queue.enqueue('original-gloss', {}, () => new Promise<void>((resolve) => (finish = resolve)))
    const before = await fileText()
    const busy = await put('H1', { meaning: '아버지', note: '', status: 'approved' })
    expect(busy.status).toBe(409)
    expect((await read(busy)).error).toContain('original-gloss')
    expect(await fileText()).toBe(before)

    await new Promise((resolve) => setTimeout(resolve, 0))
    finish()
    await queue.wait(job.id)
    expect((await put('H1', { meaning: '아버지', note: '', status: 'approved' })).status).toBe(200)
  })

  it('동시에 들어온 저장 둘이 모두 남는다', async () => {
    const [a, b] = await Promise.all([
      put('H1', { meaning: '아버지', note: '', status: 'approved' }),
      put('H7225', { meaning: '처음', note: '', status: 'draft' }),
    ])
    expect([a.status, b.status]).toEqual([200, 200])
    const saved = JSON.parse(await fileText())
    expect(saved.entries[0].korean.meaning).toBe('아버지')
    expect(saved.entries[2].korean.meaning).toBe('처음')
  })
})
