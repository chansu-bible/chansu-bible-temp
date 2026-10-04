import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { appContentDir, imagesDir, placesFile, scenesDir, sourceFile } from '../paths.ts'
import { BundleSchema, PlaceSchema, SceneFileSchema, SourceSchema, type Bundle, type SceneFile } from '../schema.ts'
import { buildBundle } from './buildBundle.ts'

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'))
}

async function readSceneFiles(): Promise<SceneFile[]> {
  if (!existsSync(scenesDir)) return []
  const names = (await readdir(scenesDir)).filter((name) => name.endsWith('.json')).sort()
  return Promise.all(names.map(async (name) => SceneFileSchema.parse(await readJson(path.join(scenesDir, name)))))
}

export async function writeBundle(): Promise<Bundle> {
  const source = SourceSchema.parse(await readJson(sourceFile))
  const places = z.array(PlaceSchema).parse(await readJson(placesFile))
  const bundle = BundleSchema.parse(buildBundle(source, await readSceneFiles(), places))

  await rm(appContentDir, { recursive: true, force: true })
  await mkdir(appContentDir, { recursive: true })
  await writeFile(path.join(appContentDir, 'genesis.json'), JSON.stringify(bundle), 'utf8')
  await cp(imagesDir, path.join(appContentDir, 'images'), { recursive: true })
  return bundle
}
