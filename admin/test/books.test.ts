import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Character, Scene } from 'pipeline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.ts'
import { eden, makeTempContent, scene, sourceWith, type TempContent } from './fixtures.ts'

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
// 읽을 수 없는 출애굽기 본문 파일
const breakExodus = () => writeFile(path.join(dirs.sourceDir, 'exodus.json'), '{ 깨진 파일')
const writeScenes = (stem: string, chapter: number, scenes: Scene[]) =>
  writeFile(path.join(dirs.scenesDir, `${stem}.json`), JSON.stringify({ chapter, scenes }))
// 인물 ids를 쓰는 장면
const withCharacters = (id: string, chapter: number, ids: string[], overrides: Partial<Scene> = {}) =>
  scene(id, chapter, { visual: { description: '', characters: ids }, ...overrides })

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

  it('다른 책의 본문이 깨져도 이 책의 진행은 보이고, 설정집은 그 책을 인용할 때만 읽지 못하며 까닭은 따로 알린다', async () => {
    const ok = await read(await app.request('/api/books/genesis/status'))
    expect(ok.canonError).toBeNull()

    // 설정집이 출애굽기를 가리키지 않으면 그 본문이 깨져도 설정집은 읽힌다.
    await breakExodus()
    const res = await app.request('/api/books/genesis/status')
    expect(res.status).toBe(200)
    const body = await read(res)
    expect(body.chapters.map((item: { chapter: number }) => item.chapter)).toEqual([1, 2])
    expect(body.canon).not.toBeNull()
    expect(body.proposalsOpen).toBe(0)
    expect(body.canonError).toBeNull()

    // 출애굽기를 가리키는 인용이 있으면 설정집을 확인할 수 없다. 이때도 이 책의 진행은 보인다.
    const horeb = { ...eden, id: 'horeb', facts: { ...eden.facts, firstAppearance: 'exodus 2:1', sources: ['exodus 2:1'] } }
    await writeFile(path.join(dirs.storyBibleDir, 'places.json'), JSON.stringify([horeb]))
    const cited = await read(await app.request('/api/books/genesis/status'))
    expect(cited.chapters.map((item: { chapter: number }) => item.chapter)).toEqual([1, 2])
    expect(cited.canon).toBeNull()
    expect(cited.proposalsOpen).toBeNull()
    expect(cited.canonError).toContain('출애굽기 본문을 읽지 못해')

    // 깨진 책 자신의 상태는 파일 이름을 대며 실패한다.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const broken = await app.request('/api/books/exodus/status')
      expect(broken.status).toBe(500)
      expect((await read(broken)).error).toContain('exodus.json')
    } finally {
      quiet.mockRestore()
    }
  })
})

describe('설정집 항목마다 쓰는 장면 수', () => {
  it('종류마다 한 번에, 두 책의 장면 파일을 모두 세어 돌려준다', async () => {
    await addExodus()
    await writeScenes('genesis-02', 2, [withCharacters('genesis-02-01', 2, ['moses'], { placeId: 'sinai' })])
    await writeScenes('exodus-01', 1, [
      // 한 장면에 같은 인물이 두 번 적혀도 한 장면으로 센다.
      withCharacters('exodus-01-01', 1, ['moses', 'aaron', 'moses']),
      withCharacters('exodus-01-02', 1, ['aaron'], { placeId: 'sinai', eraId: 'exodus-era' }),
    ])

    const characters = await app.request('/api/canon/characters/usage')
    expect(characters.status).toBe(200)
    expect(await read(characters)).toEqual({ moses: 2, aaron: 2 })
    expect(await read(await app.request('/api/canon/places/usage'))).toEqual({ sinai: 2 })
    expect(await read(await app.request('/api/canon/eras/usage'))).toEqual({ 'exodus-era': 1 })
    // 물건은 아직 장면에서 가리키지 않는다.
    expect(await read(await app.request('/api/canon/things/usage'))).toEqual({})
    expect((await app.request('/api/canon/animals/usage')).status).toBe(404)
  })

  it('본문은 읽지 않고 장면 파일 목록으로 장을 찾는다(본문이 깨져도 센다)', async () => {
    await breakExodus()
    await writeScenes('exodus-03', 3, [withCharacters('exodus-03-01', 3, ['moses'])])
    expect(await read(await app.request('/api/canon/characters/usage'))).toEqual({ moses: 1 })
  })

  it('본문이 없는 책의 장면 파일도 세고, 장 파일 이름이 아닌 파일은 건너뛴다', async () => {
    // 레위기에는 본문 파일이 없다.
    await writeScenes('leviticus-01', 1, [withCharacters('leviticus-01-01', 1, ['moses', 'aaron'])])
    await writeScenes('genesis-02', 2, [withCharacters('genesis-02-01', 2, ['moses'])])
    // 자리수가 틀린 이름, 다른 파일, 쓰다 남은 임시 파일
    await writeFile(path.join(dirs.scenesDir, 'genesis-3.json'), '{ 읽으면 깨진다')
    await writeFile(path.join(dirs.scenesDir, 'notes.json'), '{}')
    await writeFile(path.join(dirs.scenesDir, 'genesis-04.json.tmp'), '{')
    expect(await read(await app.request('/api/canon/characters/usage'))).toEqual({ moses: 2, aaron: 1 })
  })

  it('항목 id가 constructor 같은 물려받은 속성 이름이어도 그 수만 센다', async () => {
    const empty = await read(await app.request('/api/canon/characters/usage'))
    expect(Object.hasOwn(empty, 'constructor')).toBe(false)

    await writeScenes('genesis-02', 2, [
      withCharacters('genesis-02-01', 2, ['constructor', 'adam']),
      withCharacters('genesis-02-02', 2, ['constructor']),
    ])
    expect(await read(await app.request('/api/canon/characters/usage'))).toEqual({ constructor: 2, adam: 1 })
  })
})

describe('설정집 항목을 쓰는 장면', () => {
  it('장면 폴더의 모든 책의 장면에서 찾고 책을 함께 돌려준다', async () => {
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

    // 본문이 없는 책(레위기)의 장면 파일도 성경 순서로 함께 찾는다.
    await writeFile(
      path.join(dirs.scenesDir, 'leviticus-08.json'),
      JSON.stringify({ chapter: 8, scenes: [uses('leviticus-08-01', 8)] }),
    )

    const res = await app.request('/api/canon/characters/moses/usage')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({
      scenes: [
        { book: 'genesis', chapter: 2, id: 'genesis-02-01', title: 'genesis-02-01 제목' },
        { book: 'exodus', chapter: 1, id: 'exodus-01-02', title: 'exodus-01-02 제목' },
        { book: 'leviticus', chapter: 8, id: 'leviticus-08-01', title: 'leviticus-08-01 제목' },
      ],
    })
  })
})
