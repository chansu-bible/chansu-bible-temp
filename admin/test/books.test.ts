import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Character } from 'pipeline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { makeTempContent, scene, sourceWith, type TempContent } from './fixtures.ts'

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

// 출애굽기 1장(3절)과 2장(2절) 본문을 더한다.
const addExodus = () => writeFile(path.join(dirs.sourceDir, 'exodus.json'), JSON.stringify(sourceWith('출애굽기', { 1: 3, 2: 2 })))

describe('책을 가리는 주소', () => {
  it('모르는 책은 상태·장면·퀴즈 모두 404', async () => {
    for (const [method, url] of [
      ['GET', '/api/books/nobook/status'],
      ['GET', '/api/books/nobook/scenes/1'],
      ['GET', '/api/books/nobook/scenes/1/genesis-01-01/prompt'],
      ['PUT', '/api/books/nobook/scenes/1/genesis-01-01'],
      ['GET', '/api/books/nobook/quiz'],
      ['GET', '/api/books/nobook/quiz/1'],
      ['PUT', '/api/books/nobook/quiz/1/genesis-01-q1'],
    ] as const) {
      const res = await app.request(url, { method, ...(method === 'PUT' ? json({}) : {}) })
      expect(res.status, `${method} ${url}`).toBe(404)
      expect((await read(res)).error).toBe('알 수 없는 책입니다: nobook')
    }
  })

  it('책이 없는 옛 주소는 없다', async () => {
    for (const url of ['/api/status', '/api/scenes/1', '/api/quiz', '/api/quiz/1']) {
      expect((await app.request(url)).status, url).toBe(404)
    }
  })
})

describe('책의 상태', () => {
  it('그 책의 장만 세고, 설정집 요약과 그림 버전은 함께 돌려준다', async () => {
    await addExodus()
    const res = await app.request('/api/books/genesis/status')
    expect(res.status).toBe(200)
    const body = await read(res)
    expect(body.chapters.map((item: { chapter: number }) => item.chapter)).toEqual([1, 2])
    expect(body.chapters[0].scenes).toEqual({ total: 3, draft: 1, reviewed: 0, flagged: 1, approved: 1 })
    expect(body.chapters[0].images).toEqual({ v1: 2, v2: 1 })
    expect(body.canon.places).toEqual({ draft: 0, approved: 0, rejected: 0 })
    expect(body.proposalsOpen).toBe(0)
    expect(body.imageVersions.map((version: { id: string }) => version.id)).toEqual(['v1', 'v2'])
  })

  it('다른 책의 음성은 그 책의 파일 이름(verseAudioName)으로 센다', async () => {
    await addExodus()
    for (const name of ['exodus-01-001.mp3', 'exodus-01-003.mp3', 'exodus-02-002.mp3', 'genesis-01-002.mp3', 'exodus-1-002.mp3']) {
      await writeFile(path.join(dirs.audioDir, name), '')
    }
    const exodus = await read(await app.request('/api/books/exodus/status'))
    expect(exodus.chapters.map((item: { chapter: number; audio: unknown }) => [item.chapter, item.audio])).toEqual([
      [1, { have: 2, total: 3 }],
      [2, { have: 1, total: 2 }],
    ])
    expect(exodus.chapters[0].hasSceneFile).toBe(false)

    const genesis = await read(await app.request('/api/books/genesis/status'))
    expect(genesis.chapters.map((item: { audio: unknown }) => item.audio)).toEqual([
      { have: 1, total: 3 },
      { have: 0, total: 2 },
    ])
  })

  it('본문이 없는 책은 장이 없다', async () => {
    const res = await app.request('/api/books/leviticus/status')
    expect(res.status).toBe(200)
    expect((await read(res)).chapters).toEqual([])
  })
})

describe('설정집 항목을 쓰는 장면', () => {
  it('본문이 있는 모든 책의 장면에서 찾고 책을 함께 돌려준다', async () => {
    await addExodus()
    const moses: Character = {
      id: 'moses',
      name: '모세',
      aliases: [],
      status: 'draft',
      facts: {
        firstAppearance: 'exodus 2:1',
        gender: '남',
        years: { born: null, died: null },
        relations: [],
        attire: [],
        notes: '',
        sources: ['exodus 2:1'],
      },
      design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
      refs: [],
    }
    await writeFile(path.join(dirs.storyBibleDir, 'characters.json'), JSON.stringify([moses]))
    const uses = (id: string, chapter: number) => scene(id, chapter, { visual: { description: '', characters: ['moses'] } })
    await writeFile(
      path.join(dirs.scenesDir, 'genesis-02.json'),
      JSON.stringify({ chapter: 2, scenes: [uses('genesis-02-01', 2)] }),
    )
    await writeFile(
      path.join(dirs.scenesDir, 'exodus-01.json'),
      JSON.stringify({ chapter: 1, scenes: [scene('exodus-01-01', 1), uses('exodus-01-02', 1)] }),
    )

    const res = await app.request('/api/canon/characters/moses/usage')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({
      scenes: [
        { book: 'genesis', chapter: 2, id: 'genesis-02-01', title: 'genesis-02-01 제목' },
        { book: 'exodus', chapter: 1, id: 'exodus-01-02', title: 'exodus-01-02 제목' },
      ],
    })
  })
})
