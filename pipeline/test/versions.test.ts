import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageCatalog } from '../src/build/buildBundle.ts'
import {
  addImageVersion,
  assertUniqueImageStems,
  readImageCatalog,
  readImageVersions,
  sceneImageStem,
  versionDir,
  writeImageVersions,
} from '../src/images/versions.ts'
import { displayPath } from '../src/paths.ts'
import type { ImageVersion } from '../src/schema.ts'

// 폴더 목록의 순서는 운영체제마다 다르다(NTFS는 이름순이고 macOS는 아니다). reversed를 켜면 readdir이 목록을 거꾸로 돌려준다.
// 어느 운영체제에서 돌려도 "목록 순서에 기대면 결과가 달라지는" 상태가 되어, 이름순으로 정렬하지 않는 코드를 잡는다.
const listing = vi.hoisted(() => ({ reversed: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const list = actual.readdir as (...args: unknown[]) => Promise<unknown[]>
  const readdirOrReversed = async (...args: unknown[]) => {
    const names = await list(...args)
    return listing.reversed ? [...names].reverse() : names
  }
  return { ...actual, readdir: readdirOrReversed }
})

const v1: ImageVersion = { id: 'v1-flare', label: '1차', note: '' }
const v2: ImageVersion = { id: 'v2-sunburst', label: '2차', note: '최상위 모델' }

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'versions-test-'))
  file = path.join(dir, 'versions.json')
})

afterEach(async () => {
  listing.reversed = false
  await rm(dir, { recursive: true, force: true })
})

describe('readImageVersions', () => {
  it('목록 파일이 없으면 빈 목록이다', async () => {
    expect(await readImageVersions(file)).toEqual([])
  })

  it('깨졌거나 형식에 맞지 않으면 파일 이름을 앞에 붙여 오류를 낸다', async () => {
    for (const text of ['{ 깨진 JSON', JSON.stringify([{ ...v1, id: 'V1 flare' }]), JSON.stringify({ versions: [v1] })]) {
      await writeFile(file, text)
      await expect(readImageVersions(file), text).rejects.toThrow(`${displayPath(file)}: `)
    }
  })
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

// 버전 폴더에 빈 그림 파일들을 만든다.
async function putImages(version: ImageVersion, names: string[]): Promise<void> {
  await mkdir(versionDir(version, dir), { recursive: true })
  for (const name of names) await writeFile(path.join(versionDir(version, dir), name), '')
}

describe('readImageCatalog', () => {
  beforeEach(async () => {
    await writeFile(file, JSON.stringify([v1, v2]))
  })

  it('버전 목록과, 버전마다 그림 파일 이름을 이름순으로 읽는다. 숨김 파일은 뺀다', async () => {
    await putImages(v1, ['b.png', 'a.jpg', '.DS_Store', 'c.webp'])
    const catalog = await readImageCatalog({ file, imagesDir: dir })
    expect(catalog.versions).toEqual([v1, v2])
    // 폴더가 없는 버전(v2)은 파일이 없다.
    expect(catalog.files).toEqual({ 'v1-flare': ['a.jpg', 'b.png', 'c.webp'], 'v2-sunburst': [] })
  })

  it('폴더 목록이 어떤 순서로 와도 이름순이다. 대문자가 소문자보다 앞이다(로케일 순서가 아니다)', async () => {
    // 이름의 반대 순서로 만든다. 만든 순서가 아니라 이름이 순서를 정해야 한다.
    await putImages(v1, ['genesis-01-02.png', 'genesis-01-01.png', 'Genesis-01-03.png'])
    await putImages(v2, ['b.webp', 'a.webp'])
    const sorted = {
      'v1-flare': ['Genesis-01-03.png', 'genesis-01-01.png', 'genesis-01-02.png'],
      'v2-sunburst': ['a.webp', 'b.webp'],
    }

    // 시험용 readdir이 정말 목록을 뒤집는다.
    const listed = await readdir(versionDir(v1, dir))
    listing.reversed = true
    expect(await readdir(versionDir(v1, dir))).toEqual([...listed].reverse())

    expect((await readImageCatalog({ file, imagesDir: dir })).files).toEqual(sorted)
    listing.reversed = false
    expect((await readImageCatalog({ file, imagesDir: dir })).files).toEqual(sorted)
  })
})

describe('sceneImageStem', () => {
  it('그림 확장자(소문자 jpg, jpeg, png, webp)의 파일이면 확장자를 뗀 이름을 돌려준다', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) expect(sceneImageStem(`genesis-01-01.${ext}`), ext).toBe('genesis-01-01')
    // 확장자는 마지막 점 뒤다.
    expect(sceneImageStem('a.b.png')).toBe('a.b')
  })

  it.each([
    ['대문자 확장자', 'x.PNG'],
    ['꾸러미가 받지 않는 그림 확장자', 'x.gif'],
    ['남은 파일', 'x.bak'],
    ['끊긴 작업이 남긴 임시 파일', 'x.png.tmp'],
    ['낭독 파일', 'x.mp3'],
    ['점이 없는 이름', 'x'],
    ['점으로 끝나는 이름', 'x.'],
    ['점으로 시작하는 이름', '.png'],
  ])('%s(%s)은 장면 그림이 아니다', (_name, file) => {
    expect(sceneImageStem(file)).toBeNull()
  })
})

describe('assertUniqueImageStems', () => {
  const catalogOf = (files: Record<string, string[]>): ImageCatalog => ({ versions: [v1, v2], files })

  it('한 버전 폴더에서 확장자를 뗀 이름이 모두 다르면 통과한다. 다른 버전에 같은 이름이 있어도 괜찮다', () => {
    const catalog = catalogOf({ 'v1-flare': ['genesis-01-01.png', 'genesis-01-02.png'], 'v2-sunburst': ['genesis-01-01.jpg', 'genesis-01-02.jpg'] })
    expect(() => assertUniqueImageStems(catalog, dir)).not.toThrow()
  })

  it('확장자를 뗀 이름이 같은 파일이 한 버전 폴더에 둘이면 두 파일 이름과 폴더를 밝혀 던진다', () => {
    const catalog = catalogOf({ 'v1-flare': ['genesis-01-01.png'], 'v2-sunburst': ['genesis-01-01.jpg', 'genesis-01-01.png', 'genesis-01-02.jpg'] })
    expect(() => assertUniqueImageStems(catalog, dir)).toThrow(
      `${displayPath(versionDir(v2, dir))}: 같은 장면의 그림이 둘 이상입니다(genesis-01-01.jpg, genesis-01-01.png). 하나만 남기세요`,
    )
  })

  it('셋이면 셋을 모두 밝힌다', () => {
    const catalog = catalogOf({ 'v1-flare': ['a.jpg', 'a.png', 'a.webp'], 'v2-sunburst': [] })
    expect(() => assertUniqueImageStems(catalog, dir)).toThrow('(a.jpg, a.png, a.webp)')
  })

  it('장면 그림이 아닌 파일(남은 파일, 대문자 확장자, 다른 그림 확장자, 점이 없는 이름)은 세지 않는다', () => {
    // 장면의 그림을 고르는 규칙(sceneImageStem)이 이 파일들을 고르지 않으니, 이름 앞부분이 같아도 어느 쪽을 고를지 헷갈리지 않는다.
    const catalog = catalogOf({ 'v1-flare': ['a', 'a.PNG', 'a.bak', 'a.gif', 'a.png'], 'v2-sunburst': [] })
    expect(() => assertUniqueImageStems(catalog, dir)).not.toThrow()
    // 오류 글에도 장면 그림만 밝힌다.
    const twice = catalogOf({ 'v1-flare': ['a.bak', 'a.jpg', 'a.png'], 'v2-sunburst': [] })
    expect(() => assertUniqueImageStems(twice, dir)).toThrow('같은 장면의 그림이 둘 이상입니다(a.jpg, a.png)')
  })

  it('이름이 .png.tmp로 끝나는 임시 파일은 .png 파일과 다른 이름으로 본다', () => {
    const catalog = catalogOf({ 'v1-flare': ['genesis-01-01.png', 'genesis-01-01.png.tmp'], 'v2-sunburst': [] })
    expect(() => assertUniqueImageStems(catalog, dir)).not.toThrow()
  })

  it('파일 목록이 없는 버전은 비어 있는 것으로 본다', () => {
    expect(() => assertUniqueImageStems({ versions: [v1, v2], files: {} }, dir)).not.toThrow()
  })
})
