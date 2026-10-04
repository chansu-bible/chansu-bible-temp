import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { appContentDir, audioDir, imagesDir, placesFile, repoRoot, scenesDir, sourceFile } from '../paths.ts'
import { BundleSchema, PlaceSchema, SceneFileSchema, SourceSchema, type Bundle, type SceneFile } from '../schema.ts'
import { buildBundle } from './buildBundle.ts'

function relativeName(file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

async function readJson<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${relativeName(file)}: ${message}`)
  }
}

async function readSceneFiles(): Promise<SceneFile[]> {
  if (!existsSync(scenesDir)) return []
  const names = (await readdir(scenesDir)).filter((name) => name.endsWith('.json')).sort()
  return Promise.all(
    names.map(async (name) => {
      const sceneFile = await readJson(path.join(scenesDir, name), (value) => SceneFileSchema.parse(value))
      const match = name.match(/^genesis-(\d+)\.json$/)
      if (match && Number(match[1]) !== sceneFile.chapter) {
        throw new Error(`${name}: 파일 이름과 chapter(${sceneFile.chapter})가 맞지 않습니다`)
      }
      return sceneFile
    }),
  )
}

function checkImages(sceneFiles: SceneFile[]): void {
  for (const file of sceneFiles) {
    for (const scene of file.scenes) {
      if (scene.image && !existsSync(path.join(imagesDir, scene.image))) {
        throw new Error(`${scene.id}: 그림 파일 ${scene.image}이 content/images에 없습니다`)
      }
    }
  }
}

export async function writeBundle(): Promise<Bundle> {
  const source = await readJson(sourceFile, (value) => SourceSchema.parse(value))
  const places = await readJson(placesFile, (value) => z.array(PlaceSchema).parse(value))
  const sceneFiles = await readSceneFiles()
  const audioNames = existsSync(audioDir) ? new Set(await readdir(audioDir)) : new Set<string>()
  const bundle = BundleSchema.parse(buildBundle(source, sceneFiles, places, audioNames))
  checkImages(sceneFiles)

  await rm(appContentDir, { recursive: true, force: true })
  await mkdir(appContentDir, { recursive: true })
  await writeFile(path.join(appContentDir, 'genesis.json'), JSON.stringify(bundle), 'utf8')
  for (const [from, to] of [
    [imagesDir, 'images'],
    [audioDir, 'audio'],
  ]) {
    if (!existsSync(from)) continue
    await cp(from, path.join(appContentDir, to), {
      recursive: true,
      filter: (src) => src === from || !path.basename(src).startsWith('.'),
    })
  }
  return bundle
}
