import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { IMAGE_VERSION_ID_PATTERN } from 'pipeline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { isImageVersionId } from '../src/ids.ts'
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

  it('숫자로 시작하는 id는 400이고 목록에도 폴더에도 더하지 않는다(객체 키 차례가 숫자순으로 바뀐다)', async () => {
    for (const id of ['3', '10', '3-test']) {
      const res = await app.request('/api/images/versions', { method: 'POST', ...json({ id, label: '3차', note: '' }) })
      expect(res.status, id).toBe(400)
      expect((await read(res)).error, id).toContain('id는 영문 소문자로 시작하고')
      expect(existsSync(path.join(dirs.imagesDir, id)), id).toBe(false)
    }
    expect((await versionsOnDisk()).length).toBe(2)
  })

  it('화면의 id 규칙(isImageVersionId)은 서버가 쓰는 규칙(IMAGE_VERSION_ID_PATTERN)과 같다', () => {
    // 화면 코드는 pipeline을 가져오지 못해 규칙을 옮겨 두었다. 어긋나면 화면은 받고 서버가 400을 주거나 그 반대가 된다.
    for (const id of ['v1', 'v2-sunburst', 'a', 'z9', 'v10', '2', '10', '2-test', '0', '-v1', 'v-', 'V1', 'v_1', 'v.1', 'v 1', '', '가나']) {
      expect(isImageVersionId(id), JSON.stringify(id)).toBe(IMAGE_VERSION_ID_PATTERN.test(id))
    }
  })

  it('같은 id는 409', async () => {
    const res = await app.request('/api/images/versions', { method: 'POST', ...json({ id: 'v1', label: '다시', note: '' }) })
    expect(res.status).toBe(409)
    expect((await read(res)).error).toContain('v1')
  })
})

describe('장면 그림 내보내기', () => {
  it('바이트와 Content-Type을 돌려준다', async () => {
    const res = await app.request('/api/images/v1/genesis-01-01.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
    expect((await app.request('/api/images/v2/genesis-01-01.png')).headers.get('content-type')).toBe('image/png')
  })

  it('이름 규칙을 어기면 400, 없는 버전·파일은 404', async () => {
    expect((await app.request('/api/images/v1/..%2Fversions.json')).status).toBe(400)
    expect((await app.request('/api/images/v1/genesis-01-01.txt')).status).toBe(400)
    expect((await app.request('/api/images/v9/genesis-01-01.jpg')).status).toBe(404)
    expect((await app.request('/api/images/v2/genesis-01-02.png')).status).toBe(404)
  })
})
