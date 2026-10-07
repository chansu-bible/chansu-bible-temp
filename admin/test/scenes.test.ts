import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { makeTempContent, sceneFiles, type TempContent } from './fixtures.ts'

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
const sceneFileOnDisk = async () => JSON.parse(await readFile(path.join(dirs.scenesDir, 'genesis-01.json'), 'utf8'))
const first = sceneFiles[0]!.scenes[0]!

describe('장 읽기', () => {
  it('본문·장면에 그림 버전과 버전별 그림 파일을 더한다', async () => {
    const res = await app.request('/api/scenes/1')
    expect(res.status).toBe(200)
    const body = await read(res)
    expect(body.chapter).toBe(1)
    expect(body.verses.length).toBe(3)
    expect(body.scenes.map((scene: { id: string }) => scene.id)).toEqual(['g1-s1', 'g1-s2', 'g1-s3'])
    expect(body.imageVersions.map((version: { id: string }) => version.id)).toEqual(['v1', 'v2'])
    expect(body.images).toEqual({
      'g1-s1': { v1: 'g1-s1.jpg', v2: 'g1-s1.png' },
      'g1-s2': { v1: 'g1-s2.png' },
    })
  })

  it('장면 파일이 없으면 scenes는 null, images는 비어 있다', async () => {
    const body = await read(await app.request('/api/scenes/2'))
    expect(body.scenes).toBeNull()
    expect(body.images).toEqual({})
  })

  it('본문에 없는 장은 404, 잘못된 장 번호는 400', async () => {
    expect((await app.request('/api/scenes/9')).status).toBe(404)
    expect((await app.request('/api/scenes/abc')).status).toBe(400)
  })
})

describe('최종 프롬프트', () => {
  it('화풍과 장면 묘사로 조립한 프롬프트와 참고 파일을 돌려준다', async () => {
    const res = await app.request('/api/scenes/1/g1-s1/prompt')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({
      prompt: ['Images are style references.', 'Watercolor illustration.', '장면: ', 'No text in the image.'].join('\n\n'),
      references: ['brush.jpg'],
    })
  })

  it('없는 장면이나 장면 파일은 404', async () => {
    expect((await app.request('/api/scenes/1/none/prompt')).status).toBe(404)
    expect((await app.request('/api/scenes/2/g2-s1/prompt')).status).toBe(404)
  })
})

describe('장면 저장', () => {
  it('그 장면만 바꿔 저장한다', async () => {
    const next = { ...first, visual: { description: '빛이 퍼진다', characters: ['adam'], shot: '낮은 시점' } }
    const res = await app.request('/api/scenes/1/g1-s1', { method: 'PUT', ...json(next) })
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual(next)
    const saved = await sceneFileOnDisk()
    expect(saved.scenes[0]).toEqual(next)
    expect(saved.scenes.slice(1)).toEqual(sceneFiles[0]!.scenes.slice(1))

    const prompt = await read(await app.request('/api/scenes/1/g1-s1/prompt'))
    expect(prompt.prompt).toContain('구도: 낮은 시점\n\n장면: 빛이 퍼진다')
  })

  it('스키마에 맞지 않으면 400, 파일은 그대로', async () => {
    const res = await app.request('/api/scenes/1/g1-s1', { method: 'PUT', ...json({ ...first, visual: { description: 3 } }) })
    expect(res.status).toBe(400)
    expect((await read(res)).error).toContain('visual')
    expect(await sceneFileOnDisk()).toEqual(sceneFiles[0])
  })

  it('주소와 본문의 id나 장이 다르면 400', async () => {
    expect((await app.request('/api/scenes/1/g1-s1', { method: 'PUT', ...json({ ...first, id: 'g1-s2' }) })).status).toBe(400)
    expect((await app.request('/api/scenes/1/g1-s1', { method: 'PUT', ...json({ ...first, chapter: 2 }) })).status).toBe(400)
  })

  it('장면 파일이나 장면이 없으면 404', async () => {
    expect((await app.request('/api/scenes/2/g1-s1', { method: 'PUT', ...json({ ...first, chapter: 2 }) })).status).toBe(404)
    expect((await app.request('/api/scenes/1/g1-s9', { method: 'PUT', ...json({ ...first, id: 'g1-s9' }) })).status).toBe(404)
  })
})
