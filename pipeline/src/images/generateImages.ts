import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { imagesDir, sceneFilePath, styleFile } from '../paths.ts'
import { SceneFileSchema, StyleSchema } from '../schema.ts'
import { detectImageExtension } from './format.ts'
import { buildImagePrompt } from './prompt.ts'
import { selectScenesToDraw } from './select.ts'

export type DrawImage = (prompt: string) => Promise<Uint8Array>

export type ImagesOptions = {
  chapter: number
  allowDraft: boolean
  force: boolean
  dryRun: boolean
  limit?: number
  sceneIds?: string[]
}

export type ImagesResult = { selected: number; drawn: string[]; failed: { id: string; reason: string }[] }

export async function generateImages(
  options: ImagesOptions,
  draw: DrawImage,
  log: (line: string) => void,
): Promise<ImagesResult> {
  const file = sceneFilePath(options.chapter)
  if (!existsSync(file)) throw new Error(`${options.chapter}장의 장면 파일이 없습니다`)

  const sceneFile = SceneFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  const style = StyleSchema.parse(JSON.parse(await readFile(styleFile, 'utf8')))
  for (const id of options.sceneIds ?? []) {
    if (!sceneFile.scenes.some((scene) => scene.id === id)) {
      throw new Error(`${id} 장면이 ${options.chapter}장에 없습니다`)
    }
  }
  const selected = selectScenesToDraw(sceneFile.scenes, options)
  const result: ImagesResult = { selected: selected.length, drawn: [], failed: [] }

  await mkdir(imagesDir, { recursive: true })
  for (const scene of selected) {
    const prompt = buildImagePrompt(style, scene)
    if (options.dryRun) {
      log(`--- ${scene.id} ${scene.title}\n${prompt}\n`)
      continue
    }
    try {
      log(`${scene.id} ${scene.title}: 그리는 중`)
      const bytes = await draw(prompt)
      const name = `${scene.id}.${detectImageExtension(bytes)}`
      await writeFile(path.join(imagesDir, name), bytes)
      scene.image = name
      // 중간에 멈춰도 이어서 할 수 있게 장면마다 바로 저장한다.
      await writeFile(file, `${JSON.stringify(sceneFile, null, 2)}\n`, 'utf8')
      result.drawn.push(scene.id)
    } catch (error) {
      result.failed.push({ id: scene.id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
