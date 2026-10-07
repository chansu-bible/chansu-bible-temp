import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { JPEG, makeTempContent, type TempContent } from './fixtures.ts'

let dirs: TempContent
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dirs = await makeTempContent()
  app = createApp({ ...dirs })
})

afterEach(async () => {
  await rm(dirs.root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const read = (res: Response): Promise<any> => res.json()
const versionsOnDisk = async () => JSON.parse(await readFile(dirs.imageVersionsFile, 'utf8'))

describe('그림 버전', () => {
  it('목록을 읽는다', async () => {
    const res = await app.request('/api/images/versions')
    expect(res.status).toBe(200)
    expect((await read(res)).map((version: { id: string }) => version.id)).toEqual(['v1', 'v2'])
  })

  it('새 버전을 끝에 붙이고 폴더를 만든다', async () => {
    const res = await app.request('/api/images/versions', { method: 'POST', ...json({ id: 'v3-test', label: '3차', note: '메모' }) })
    expect(res.status).toBe(201)
    expect((await read(res)).at(-1)).toEqual({ id: 'v3-test', label: '3차', note: '메모' })
    expect((await versionsOnDisk()).map((version: { id: string }) => version.id)).toEqual(['v1', 'v2', 'v3-test'])
    expect(existsSync(path.join(dirs.imagesDir, 'v3-test'))).toBe(true)
  })

  it('id 규칙을 어기거나 이름이 비면 400', async () => {
    for (const body of [
      { id: 'V3', label: '3차', note: '' },
      { id: '../v3', label: '3차', note: '' },
      { id: 'v3', label: '', note: '' },
      { id: 'v3', label: '3차' },
    ]) {
      expect((await app.request('/api/images/versions', { method: 'POST', ...json(body) })).status).toBe(400)
    }
    expect((await versionsOnDisk()).length).toBe(2)
  })

  it('같은 id는 409', async () => {
    const res = await app.request('/api/images/versions', { method: 'POST', ...json({ id: 'v1', label: '다시', note: '' }) })
    expect(res.status).toBe(409)
    expect((await read(res)).error).toContain('v1')
  })
})

describe('장면 그림 내보내기', () => {
  it('바이트와 Content-Type을 돌려준다', async () => {
    const res = await app.request('/api/images/v1/g1-s1.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
    expect((await app.request('/api/images/v2/g1-s1.png')).headers.get('content-type')).toBe('image/png')
  })

  it('이름 규칙을 어기면 400, 없는 버전·파일은 404', async () => {
    expect((await app.request('/api/images/v1/..%2Fversions.json')).status).toBe(400)
    expect((await app.request('/api/images/v1/g1-s1.txt')).status).toBe(400)
    expect((await app.request('/api/images/v9/g1-s1.jpg')).status).toBe(404)
    expect((await app.request('/api/images/v2/g1-s2.png')).status).toBe(404)
  })
})
