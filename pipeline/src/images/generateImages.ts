import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readSceneFile, writeSceneFile } from '../scenes/files.ts'
import { detectImageExtension } from './format.ts'
import { buildImagePrompt } from './prompt.ts'
import { selectScenesToDraw } from './select.ts'
import { readStyle, referencePaths } from './style.ts'
import { activeImageVersion, versionDir } from './versions.ts'

// references: 화풍 참고 이미지 파일 경로
export type DrawImage = (prompt: string, references: string[]) => Promise<Uint8Array>

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
  const sceneFile = await readSceneFile(options.chapter)
  if (!sceneFile) throw new Error(`${options.chapter}장의 장면 파일이 없습니다`)

  // 참고 이미지 파일이 없으면 여기서 오류가 난다.
  const style = await readStyle()
  for (const id of options.sceneIds ?? []) {
    if (!sceneFile.scenes.some((scene) => scene.id === id)) {
      throw new Error(`${id} 장면이 ${options.chapter}장에 없습니다`)
    }
  }
  const references = referencePaths(style)
  const selected = selectScenesToDraw(sceneFile.scenes, options)
  const result: ImagesResult = { selected: selected.length, drawn: [], failed: [] }

  const version = await activeImageVersion()
  const outDir = versionDir(version)
  await mkdir(outDir, { recursive: true })
  if (!options.dryRun && selected.length > 0) log(`그림 버전: ${version.label} (${version.id})`)
  for (const scene of selected) {
    const prompt = buildImagePrompt(style, scene)
    if (options.dryRun) {
      log(`--- ${scene.id} ${scene.title}\n${prompt}\n`)
      continue
    }
    try {
      log(`${scene.id} ${scene.title}: 그리는 중`)
      const bytes = await draw(prompt, references)
      const name = `${scene.id}.${detectImageExtension(bytes)}`
      await writeFile(path.join(outDir, name), bytes)
      scene.image = name
      // 중간에 멈춰도 이어서 할 수 있게 장면마다 바로 저장한다.
      await writeSceneFile(sceneFile)
      result.drawn.push(scene.id)
    } catch (error) {
      result.failed.push({ id: scene.id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
