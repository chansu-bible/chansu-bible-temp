import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isMediaExt, mediaKind } from 'reader-core'
import { z } from 'zod'
import type { ImageCatalog } from '../build/buildBundle.ts'
import { displayPath, imageVersionsFile, imagesDir as defaultImagesDir } from '../paths.ts'
import { ImageVersionSchema, type ImageVersion } from '../schema.ts'

const VersionListSchema = z.array(ImageVersionSchema)

// 버전 목록을 읽는다. 없으면 빈 목록이고, 깨졌거나 형식에 맞지 않으면 파일 이름을 앞에 붙여 오류를 낸다.
export async function readImageVersions(file: string = imageVersionsFile): Promise<ImageVersion[]> {
  if (!existsSync(file)) return []
  try {
    return VersionListSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 검증한 뒤 쓴다. id가 겹치면 오류. 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거친다.
export async function writeImageVersions(versions: ImageVersion[], file: string = imageVersionsFile): Promise<void> {
  const parsed = VersionListSchema.parse(versions)
  const seen = new Set<string>()
  for (const version of parsed) {
    if (seen.has(version.id)) throw new Error(`그림 버전 id가 겹칩니다: ${version.id}`)
    seen.add(version.id)
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await rename(`${file}.tmp`, file)
}

// 새 버전을 목록 끝에 붙이고 그 폴더를 만든다. images 단계는 이제 이 버전에 그린다.
export async function addImageVersion(
  version: ImageVersion,
  options: { file?: string; imagesDir?: string } = {},
): Promise<ImageVersion[]> {
  const file = options.file ?? imageVersionsFile
  const versions = await readImageVersions(file)
  if (versions.some((existing) => existing.id === version.id)) {
    throw new Error(`그림 버전이 이미 있습니다: ${version.id}`)
  }
  const next = [...versions, version]
  await writeImageVersions(next, file)
  await mkdir(versionDir(version, options.imagesDir), { recursive: true })
  return next
}

// 지금 그림을 만들어 넣는 버전은 목록의 마지막 버전이다.
export async function activeImageVersion(): Promise<ImageVersion> {
  const version = (await readImageVersions()).at(-1)
  if (!version) throw new Error('그림 버전이 없습니다. content/images/versions.json에 버전을 추가하세요.')
  return version
}

export function versionDir(version: Pick<ImageVersion, 'id'>, dir: string = defaultImagesDir): string {
  return path.join(dir, version.id)
}

// 버전 목록과 버전 폴더마다 그림 파일 이름을 읽는다. 파일 이름은 이름순이다.
// 폴더 목록의 순서는 운영체제마다 달라서, 목록 순서 그대로 두면 장면의 그림을 고르는 순서(imagesFor)가 컴퓨터마다 달라진다.
export async function readImageCatalog(
  options: { file?: string; imagesDir?: string } = {},
): Promise<ImageCatalog> {
  const versions = await readImageVersions(options.file)
  const files: Record<string, string[]> = {}
  for (const version of versions) {
    const dir = versionDir(version, options.imagesDir)
    // 기본 정렬은 UTF-16 코드 단위 순서라 로케일에 따라 달라지지 않는다.
    files[version.id] = existsSync(dir) ? (await readdir(dir)).filter((name) => !name.startsWith('.')).sort() : []
  }
  return { versions, files }
}

// 장면 그림 파일이면 확장자를 뗀 이름을 돌려준다. 장면 그림은 이 이름이 장면 id인 파일이다.
// 장면 그림은 확장자가 꾸러미가 받는 그림 확장자(소문자 jpg, jpeg, png, webp. reader-core의 isMediaExt와 mediaKind)인 파일이다.
// 대문자 확장자, .gif, 남은 .bak, 끊긴 작업이 남긴 .tmp, 점이 없는 이름은 null이다.
// 장면의 그림을 고르는 곳(묶음의 imagesFor, 공개 점검, 장 꾸러미)과 한 장면의 그림이 둘인지 보는 곳이 모두 이 규칙을 쓴다.
export function sceneImageStem(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || !isMediaExt(name.slice(dot + 1)) || mediaKind(name) !== 'image') return null
  return name.slice(0, dot)
}

// 한 버전 폴더에 같은 장면의 그림(sceneImageStem이 같은 파일)이 둘 이상이면 그 파일 이름들을 밝혀 오류를 낸다.
// 한 장면의 그림은 버전마다 하나여야 한다. 둘이면 어느 쪽이 그 장면의 그림인지 사람이 정해야 한다.
// 장면 그림이 아닌 파일(.bak 같은 남은 파일)은 그림으로 고르지 않으니 세지 않는다.
// 다른 버전 폴더에 같은 이름이 하나씩 있는 것은 당연하다.
export function assertUniqueImageStems(catalog: ImageCatalog, imagesDir: string = defaultImagesDir): void {
  for (const version of catalog.versions) {
    const byStem = new Map<string, string[]>()
    for (const name of catalog.files[version.id] ?? []) {
      const stem = sceneImageStem(name)
      if (stem === null) continue
      byStem.set(stem, [...(byStem.get(stem) ?? []), name])
    }
    for (const names of byStem.values()) {
      if (names.length > 1) {
        throw new Error(`${displayPath(versionDir(version, imagesDir))}: 같은 장면의 그림이 둘 이상입니다(${names.join(', ')}). 하나만 남기세요`)
      }
    }
  }
}
