import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sceneFilePath } from '../src/paths.ts'
import { readSceneFile, writeSceneFile } from '../src/scenes/files.ts'
import type { Scene, SceneFile } from '../src/schema.ts'

function scene(id: string, chapter = 1): Scene {
  return {
    id,
    chapter,
    verseStart: 1,
    verseEnd: 1,
    title: '제목',
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    visual: { description: '어두운 물', characters: [] },
    placeId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
  }
}

const sceneFile: SceneFile = { chapter: 1, scenes: [scene('genesis-01-01'), scene('genesis-01-02')] }

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scenes-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('sceneFilePath', () => {
  it('폴더를 바꿔 줄 수 있다', () => {
    expect(sceneFilePath(3, dir)).toBe(path.join(dir, 'genesis-03.json'))
  })
})

describe('readSceneFile', () => {
  it('없으면 null', async () => {
    expect(await readSceneFile(1, dir)).toBeNull()
  })

  it('장면 파일을 읽는다', async () => {
    await writeFile(sceneFilePath(1, dir), JSON.stringify(sceneFile))
    expect(await readSceneFile(1, dir)).toEqual(sceneFile)
  })

  it('장면의 장 번호가 파일과 다르면 오류', async () => {
    await writeFile(sceneFilePath(1, dir), JSON.stringify({ chapter: 1, scenes: [scene('genesis-02-01', 2)] }))
    await expect(readSceneFile(1, dir)).rejects.toThrow('genesis-02-01 장면의 장 번호(2)가 파일의 장 번호(1)와 다릅니다')
  })

  it('파일의 장 번호가 요청한 장과 다르면 오류', async () => {
    await writeFile(sceneFilePath(1, dir), JSON.stringify({ chapter: 2, scenes: [] }))
    await expect(readSceneFile(1, dir)).rejects.toThrow('장 번호(2)가 1장이 아닙니다')
  })

  it('id가 겹치면 오류', async () => {
    await writeFile(sceneFilePath(1, dir), JSON.stringify({ chapter: 1, scenes: [scene('a'), scene('a')] }))
    await expect(readSceneFile(1, dir)).rejects.toThrow('장면 id가 겹칩니다: a')
  })

  it('스키마에 맞지 않으면 오류', async () => {
    await writeFile(sceneFilePath(1, dir), JSON.stringify({ chapter: 1, scenes: [{ id: 'a' }] }))
    await expect(readSceneFile(1, dir)).rejects.toThrow()
  })
})

describe('writeSceneFile', () => {
  it('두 칸 들여쓰기와 끝 줄바꿈으로 쓴다', async () => {
    await writeSceneFile(sceneFile, dir)
    expect(await readFile(sceneFilePath(1, dir), 'utf8')).toBe(`${JSON.stringify(sceneFile, null, 2)}\n`)
  })

  it('장 번호가 맞지 않거나 id가 겹치면 쓰지 않는다', async () => {
    await expect(writeSceneFile({ chapter: 1, scenes: [scene('b', 2)] }, dir)).rejects.toThrow('장 번호')
    await expect(writeSceneFile({ chapter: 1, scenes: [scene('a'), scene('a')] }, dir)).rejects.toThrow('겹칩니다')
    expect(await readSceneFile(1, dir)).toBeNull()
  })
})
