import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { ImageCatalog } from '../build/buildBundle.ts'
import { imageVersionsFile, imagesDir } from '../paths.ts'
import { ImageVersionSchema, type ImageVersion } from '../schema.ts'

export async function readImageVersions(): Promise<ImageVersion[]> {
  if (!existsSync(imageVersionsFile)) return []
  return z.array(ImageVersionSchema).parse(JSON.parse(await readFile(imageVersionsFile, 'utf8')))
}

// 지금 그림을 만들어 넣는 버전은 목록의 마지막 버전이다.
export async function activeImageVersion(): Promise<ImageVersion> {
  const version = (await readImageVersions()).at(-1)
  if (!version) throw new Error('그림 버전이 없습니다. content/images/versions.json에 버전을 추가하세요.')
  return version
}

export function versionDir(version: ImageVersion): string {
  return path.join(imagesDir, version.id)
}

export async function readImageCatalog(): Promise<ImageCatalog> {
  const versions = await readImageVersions()
  const files: Record<string, string[]> = {}
  for (const version of versions) {
    const dir = versionDir(version)
    files[version.id] = existsSync(dir) ? (await readdir(dir)).filter((name) => !name.startsWith('.')) : []
  }
  return { versions, files }
}
