import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sceneFilePath } from '../src/paths.ts'
import { listSceneChapters, readSceneFile, writeSceneFile } from '../src/scenes/files.ts'
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
    eraId: null,
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
    expect(sceneFilePath('genesis', 3, dir)).toBe(path.join(dir, 'genesis-03.json'))
  })

  it('장 번호는 그 책의 장 수 자리수로 채운다', () => {
    expect(sceneFilePath('psalms', 23, dir)).toBe(path.join(dir, 'psalms-023.json'))
    expect(() => sceneFilePath('genesis', 51, dir)).toThrow('창세기에는 51장이 없습니다')
  })
})

describe('readSceneFile', () => {
  it('없으면 null', async () => {
    expect(await readSceneFile('genesis', 1, dir)).toBeNull()
  })

  it('책에 없는 장이면 null', async () => {
    expect(await readSceneFile('genesis', 51, dir)).toBeNull()
  })

  it('장면 파일을 읽는다', async () => {
    await writeFile(sceneFilePath('genesis', 1, dir), JSON.stringify(sceneFile))
    expect(await readSceneFile('genesis', 1, dir)).toEqual(sceneFile)
  })

  it('장면의 장 번호가 파일과 다르면 오류', async () => {
    await writeFile(sceneFilePath('genesis', 1, dir), JSON.stringify({ chapter: 1, scenes: [scene('genesis-02-01', 2)] }))
    await expect(readSceneFile('genesis', 1, dir)).rejects.toThrow('genesis-02-01 장면의 장 번호(2)가 파일의 장 번호(1)와 다릅니다')
  })

  it('파일의 장 번호가 요청한 장과 다르면 오류', async () => {
    await writeFile(sceneFilePath('genesis', 1, dir), JSON.stringify({ chapter: 2, scenes: [] }))
    await expect(readSceneFile('genesis', 1, dir)).rejects.toThrow('장 번호(2)가 1장이 아닙니다')
  })

  it('id가 겹치면 오류', async () => {
    await writeFile(sceneFilePath('genesis', 1, dir), JSON.stringify({ chapter: 1, scenes: [scene('a'), scene('a')] }))
    await expect(readSceneFile('genesis', 1, dir)).rejects.toThrow('장면 id가 겹칩니다: a')
  })

  it('스키마에 맞지 않으면 오류', async () => {
    await writeFile(sceneFilePath('genesis', 1, dir), JSON.stringify({ chapter: 1, scenes: [{ id: 'a' }] }))
    await expect(readSceneFile('genesis', 1, dir)).rejects.toThrow()
  })
})

describe('writeSceneFile', () => {
  it('두 칸 들여쓰기와 끝 줄바꿈으로 쓴다', async () => {
    await writeSceneFile('genesis', sceneFile, dir)
    expect(await readFile(sceneFilePath('genesis', 1, dir), 'utf8')).toBe(`${JSON.stringify(sceneFile, null, 2)}\n`)
  })

  it('장 번호가 맞지 않거나 id가 겹치면 쓰지 않는다', async () => {
    await expect(writeSceneFile('genesis', { chapter: 1, scenes: [scene('b', 2)] }, dir)).rejects.toThrow('장 번호')
    await expect(writeSceneFile('genesis', { chapter: 1, scenes: [scene('a'), scene('a')] }, dir)).rejects.toThrow('겹칩니다')
    expect(await readSceneFile('genesis', 1, dir)).toBeNull()
  })

  it('장면 id가 그 책·그 장의 id가 아니면 쓰지 않는다', async () => {
    for (const id of ['exodus-01-01', 'genesis-02-01', 'genesis-1-01', 'g1-s1']) {
      await expect(writeSceneFile('genesis', { chapter: 1, scenes: [scene('genesis-01-01'), scene(id)] }, dir)).rejects.toThrow(
        `창세기 1장의 장면 id가 아닙니다(genesis-01-01 모양이어야 합니다): ${id}`,
      )
    }
    expect(await readSceneFile('genesis', 1, dir)).toBeNull()
  })

  it('책마다 그 책의 이름으로 쓴다', async () => {
    await writeSceneFile('1-samuel', { chapter: 3, scenes: [scene('1-samuel-03-01', 3)] }, dir)
    expect((await readSceneFile('1-samuel', 3, dir))!.scenes[0]!.id).toBe('1-samuel-03-01')
    expect(await readSceneFile('genesis', 3, dir)).toBeNull()
  })
})

describe('listSceneChapters', () => {
  it('그 책의 장면 파일이 있는 장만 오름차순으로 돌려준다', async () => {
    for (const name of ['genesis-10.json', 'genesis-04.json', 'exodus-03.json', 'notes.json', 'genesis-4.json', 'genesis-04.json.tmp']) {
      await writeFile(path.join(dir, name), '{}')
    }
    expect(await listSceneChapters('genesis', dir)).toEqual([4, 10])
    expect(await listSceneChapters('exodus', dir)).toEqual([3])
    expect(await listSceneChapters('leviticus', dir)).toEqual([])
  })

  it('폴더가 없으면 빈 목록', async () => {
    expect(await listSceneChapters('genesis', path.join(dir, 'none'))).toEqual([])
  })
})
