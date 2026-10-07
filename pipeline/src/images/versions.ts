import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ImageCatalog } from '../build/buildBundle.ts'
import { imageVersionsFile, imagesDir as defaultImagesDir } from '../paths.ts'
import { ImageVersionSchema, type ImageVersion } from '../schema.ts'

const VersionListSchema = z.array(ImageVersionSchema)

export async function readImageVersions(file: string = imageVersionsFile): Promise<ImageVersion[]> {
  if (!existsSync(file)) return []
  return VersionListSchema.parse(JSON.parse(await readFile(file, 'utf8')))
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

export async function readImageCatalog(
  options: { file?: string; imagesDir?: string } = {},
): Promise<ImageCatalog> {
  const versions = await readImageVersions(options.file)
  const files: Record<string, string[]> = {}
  for (const version of versions) {
    const dir = versionDir(version, options.imagesDir)
    files[version.id] = existsSync(dir) ? (await readdir(dir)).filter((name) => !name.startsWith('.')) : []
  }
  return { versions, files }
}
