import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { sanitizeReferenceName, uniqueName } from '../server/files.ts'
import { JPEG, makeTempContent, PNG, testStyle, type TempContent } from './fixtures.ts'

let dirs: TempContent
let app: ReturnType<typeof createApp>
let fetched: string[]
// 가짜 fetch가 돌려줄 응답
let fetchResponse: () => Response

beforeEach(async () => {
  dirs = await makeTempContent()
  fetched = []
  fetchResponse = () => new Response(PNG, { headers: { 'content-type': 'image/png' } })
  const fetchImpl = (async (input: string | URL | Request) => {
    fetched.push(String(input))
    return fetchResponse()
  }) as typeof fetch
  app = createApp({ ...dirs, fetchImpl })
})

afterEach(async () => {
  await rm(dirs.root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const read = (res: Response): Promise<any> => res.json()
const styleOnDisk = async () => JSON.parse(await readFile(dirs.styleFile, 'utf8'))

function upload(bytes: Uint8Array, name: string, fields: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', new File([bytes], name))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return app.request('/api/style/refs', { method: 'POST', body: form })
}

describe('화풍 읽기·저장', () => {
  it('화풍을 읽는다', async () => {
    const res = await app.request('/api/style')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual(testStyle)
  })

  it('고친 화풍을 저장한다', async () => {
    const next = { ...testStyle, promptPrefix: '새 앞말', references: [{ ...testStyle.references[0]!, label: '나뭇잎' }] }
    const res = await app.request('/api/style', { method: 'PUT', ...json(next) })
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual(next)
    expect(await styleOnDisk()).toEqual(next)
    expect(await readFile(dirs.styleFile, 'utf8')).toBe(`${JSON.stringify(next, null, 2)}\n`)
  })

  it('스키마에 맞지 않으면 400, 파일은 그대로', async () => {
    const res = await app.request('/api/style', { method: 'PUT', ...json({ ...testStyle, promptRules: '' }) })
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('promptRules')
    expect(await styleOnDisk()).toEqual(testStyle)
  })

  it('없는 참고 파일을 가리키면 400', async () => {
    const res = await app.request('/api/style', {
      method: 'PUT',
      ...json({ ...testStyle, references: [{ file: 'none.png', label: '', source: '' }] }),
    })
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('화풍 참고 이미지가 없습니다: none.png')
  })

  it('본문이 JSON이 아니면 400', async () => {
    const res = await app.request('/api/style', { method: 'PUT', body: '{', headers: { 'content-type': 'application/json' } })
    expect(res.status).toBe(400)
  })
})

describe('참고 이미지 내보내기', () => {
  it('바이트와 Content-Type을 돌려준다', async () => {
    const res = await app.request('/api/style/refs/brush.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
  })

  it('이름 규칙에 맞지 않으면 400, 없으면 404', async () => {
    expect((await app.request('/api/style/refs/..%2Fstyle.json')).status).toBe(400)
    expect((await app.request('/api/style/refs/Brush.JPG')).status).toBe(400)
    expect((await app.request('/api/style/refs/none.png')).status).toBe(404)
  })
})

describe('참고 이미지 올리기', () => {
  it('이름을 규칙에 맞게 고치고 내용으로 확장자를 정해 목록에 더한다', async () => {
    const res = await upload(PNG, 'Olive Trees (1).JPG', { label: '잎', source: '내 사진' })
    expect(res.status).toBe(201)
    const body = await read(res)
    expect(body.added).toBe('olive-trees-1.png')
    expect(body.style.references.at(-1)).toEqual({ file: 'olive-trees-1.png', label: '잎', source: '내 사진' })
    expect(await styleOnDisk()).toEqual(body.style)
    expect(new Uint8Array(await readFile(path.join(dirs.refsDir, 'olive-trees-1.png')))).toEqual(PNG)
  })

  it('같은 이름이 있으면 -2를 붙이고, 이름표·출처가 없으면 빈 문자열', async () => {
    const res = await upload(JPEG, 'brush.png')
    expect(res.status).toBe(201)
    const body = await read(res)
    expect(body.added).toBe('brush-2.jpg')
    expect(body.style.references.at(-1)).toEqual({ file: 'brush-2.jpg', label: '', source: '' })
  })

  it('파일이 없거나 그림이 아니면 400', async () => {
    const noFile = await app.request('/api/style/refs', { method: 'POST', body: new FormData() })
    expect(noFile.status).toBe(400)
    expect((await read(noFile)).error).toContain('파일')
    const text = await upload(new TextEncoder().encode('hello'), 'a.png')
    expect(text.status).toBe(400)
    expect(await styleOnDisk()).toEqual(testStyle)
  })

  it('15MB를 넘으면 400', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1)
    big.set(PNG)
    const res = await upload(big, 'big.png')
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('15MB')
  })
})

describe('주소로 가져오기', () => {
  it('받은 그림을 목록에 더하고, 출처가 비면 주소를 적는다', async () => {
    const url = 'https://example.org/art/Sky%20Detail.jpg?size=full'
    const res = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url, label: '하늘' }) })
    expect(res.status).toBe(201)
    const body = await read(res)
    expect(fetched).toEqual([url])
    expect(body.added).toBe('sky-detail.png')
    expect(body.style.references.at(-1)).toEqual({ file: 'sky-detail.png', label: '하늘', source: url })
    expect(existsSync(path.join(dirs.refsDir, 'sky-detail.png'))).toBe(true)
  })

  it('출처를 주면 그대로 적는다', async () => {
    const res = await app.request('/api/style/refs/import', {
      method: 'POST',
      ...json({ url: 'http://example.org/a.png', source: '퍼블릭 도메인' }),
    })
    expect((await read(res)).style.references.at(-1).source).toBe('퍼블릭 도메인')
  })

  it('http(s)가 아니면 400이고 요청하지 않는다', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.org/a.png', '주소 아님', 42]) {
      const res = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url }) })
      expect(res.status).toBe(400)
    }
    expect(fetched).toEqual([])
  })

  it('받은 것이 그림이 아니면 400', async () => {
    fetchResponse = () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    const res = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url: 'https://example.org/a' }) })
    expect(res.status).toBe(400)
    expect(await styleOnDisk()).toEqual(testStyle)
  })

  it('받기에 실패하면 400', async () => {
    fetchResponse = () => new Response('없음', { status: 404 })
    const notFound = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url: 'https://example.org/a' }) })
    expect(notFound.status).toBe(400)
    expect((await read(notFound)).error).toContain('404')
    fetchResponse = () => {
      throw new Error('연결 거부')
    }
    const refused = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url: 'https://example.org/a' }) })
    expect(refused.status).toBe(400)
    expect((await read(refused)).error).toContain('연결 거부')
  })

  it('너무 크면 400', async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1)
    big.set(PNG)
    fetchResponse = () => new Response(big)
    const res = await app.request('/api/style/refs/import', { method: 'POST', ...json({ url: 'https://example.org/a.png' }) })
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('15MB')
  })
})

describe('참고 이미지 지우기', () => {
  it('목록에서 빼고 파일을 지운다', async () => {
    const res = await app.request('/api/style/refs/brush.jpg', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await read(res)).references).toEqual([])
    expect((await styleOnDisk()).references).toEqual([])
    expect(existsSync(path.join(dirs.refsDir, 'brush.jpg'))).toBe(false)
  })

  it('파일이 이미 없어도 목록에서 뺀다', async () => {
    await rm(path.join(dirs.refsDir, 'brush.jpg'))
    const res = await app.request('/api/style/refs/brush.jpg', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await styleOnDisk()).references).toEqual([])
  })

  it('목록에 없으면 404', async () => {
    await writeFile(path.join(dirs.refsDir, 'other.png'), PNG)
    expect((await app.request('/api/style/refs/other.png', { method: 'DELETE' })).status).toBe(404)
    expect(existsSync(path.join(dirs.refsDir, 'other.png'))).toBe(true)
  })
})

describe('파일 이름 도움 함수', () => {
  it('sanitizeReferenceName', () => {
    expect(sanitizeReferenceName('Sargent Olive--Trees.JPG', 'jpg')).toBe('sargent-olive-trees.jpg')
    expect(sanitizeReferenceName('photo.webp', 'png')).toBe('photo.png')
    expect(sanitizeReferenceName('--Photo_.jpg', 'jpg')).toBe('photo.jpg')
    expect(sanitizeReferenceName('올리브 나무.jpg', 'jpg')).toMatch(/^ref-\d{8}-\d{6}\.jpg$/)
    expect(sanitizeReferenceName('', 'webp')).toMatch(/^ref-\d{8}-\d{6}\.webp$/)
    expect(sanitizeReferenceName(`${'a'.repeat(200)}.png`, 'png').length).toBeLessThanOrEqual(84)
  })

  it('uniqueName은 있는 이름에 -2, -3을 붙인다', async () => {
    expect(uniqueName(dirs.refsDir, 'new.png')).toBe('new.png')
    expect(uniqueName(dirs.refsDir, 'brush.jpg')).toBe('brush-2.jpg')
    await writeFile(path.join(dirs.refsDir, 'brush-2.jpg'), JPEG)
    expect(uniqueName(dirs.refsDir, 'brush.jpg')).toBe('brush-3.jpg')
    expect(uniqueName(dirs.refsDir, 'gone.png', ['gone.png'])).toBe('gone-2.png')
  })
})
