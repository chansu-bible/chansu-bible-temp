import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addImageVersion, readImageVersions, versionDir, writeImageVersions } from '../src/images/versions.ts'
import type { ImageVersion } from '../src/schema.ts'

const v1: ImageVersion = { id: 'v1-flare', label: '1차', note: '' }
const v2: ImageVersion = { id: 'v2-sunburst', label: '2차', note: '최상위 모델' }

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'versions-test-'))
  file = path.join(dir, 'versions.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeImageVersions', () => {
  it('목록을 쓰고 다시 읽는다', async () => {
    await writeImageVersions([v1, v2], file)
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify([v1, v2], null, 2)}\n`)
    expect(await readImageVersions(file)).toEqual([v1, v2])
  })

  it('id가 겹치면 쓰지 않는다', async () => {
    await expect(writeImageVersions([v1, { ...v2, id: 'v1-flare' }], file)).rejects.toThrow('그림 버전 id가 겹칩니다: v1-flare')
    expect(existsSync(file)).toBe(false)
  })

  it('id 규칙에 맞지 않으면 쓰지 않는다', async () => {
    await expect(writeImageVersions([{ ...v1, id: 'V1 flare' }], file)).rejects.toThrow()
  })
})

describe('addImageVersion', () => {
  it('목록 끝에 붙이고 버전 폴더를 만든다', async () => {
    await writeFile(file, JSON.stringify([v1]))
    const versions = await addImageVersion(v2, { file, imagesDir: dir })
    expect(versions).toEqual([v1, v2])
    expect(await readImageVersions(file)).toEqual([v1, v2])
    expect(existsSync(path.join(dir, 'v2-sunburst'))).toBe(true)
  })

  it('목록 파일이 없으면 새로 만든다', async () => {
    expect(await addImageVersion(v1, { file, imagesDir: dir })).toEqual([v1])
  })

  it('이미 있는 id면 오류를 낸다', async () => {
    await writeFile(file, JSON.stringify([v1]))
    await expect(addImageVersion(v1, { file, imagesDir: dir })).rejects.toThrow('그림 버전이 이미 있습니다: v1-flare')
  })
})

describe('versionDir', () => {
  it('버전 폴더 경로', () => {
    expect(versionDir(v1, '/images')).toBe(path.join('/images', 'v1-flare'))
  })
})
