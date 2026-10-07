import { Hono } from 'hono'
import {
  buildImagePrompt,
  paths,
  readImageCatalog,
  readStyle,
  REFERENCE_FILE_PATTERN,
  SceneSchema,
  writeSceneFile,
  type ImageCatalog,
  type Scene,
} from 'pipeline'
import type { AppContext } from '../context.ts'
import { readSceneFile, readSource } from '../content.ts'
import { errorMessage, HttpError, readJsonBody } from '../errors.ts'

function parseChapter(raw: string): number {
  const chapter = Number(raw)
  if (!Number.isInteger(chapter) || chapter < 1) throw new HttpError(400, `장 번호가 잘못되었습니다: ${raw}`)
  return chapter
}

// 장면 id → 버전 id → 그림 파일 이름. 확장자를 뗀 이름이 장면 id인 파일만 본다. 그림이 없는 버전은 키가 없다.
export function sceneImages(scenes: Scene[], catalog: ImageCatalog): Record<string, Record<string, string>> {
  const images: Record<string, Record<string, string>> = {}
  for (const scene of scenes) {
    for (const version of catalog.versions) {
      const name = (catalog.files[version.id] ?? []).find(
        (file) => REFERENCE_FILE_PATTERN.test(file) && file.slice(0, file.lastIndexOf('.')) === scene.id,
      )
      if (name) (images[scene.id] ??= {})[version.id] = name
    }
  }
  return images
}

export function sceneRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const scenesDir = ctx.scenesDir ?? paths.scenesDir

  const findScene = async (chapter: number, id: string) => {
    const sceneFile = await readSceneFile(chapter, scenesDir)
    if (!sceneFile) throw new HttpError(404, `${chapter}장의 장면 파일이 없습니다`)
    const index = sceneFile.scenes.findIndex((scene) => scene.id === id)
    if (index < 0) throw new HttpError(404, `${id} 장면이 ${chapter}장에 없습니다`)
    return { sceneFile, index }
  }

  // 장 본문과 장면, 그림 버전, 장면별 버전 그림. 장면 파일이 없으면 scenes는 null이다.
  app.get('/:chapter', async (c) => {
    const chapter = parseChapter(c.req.param('chapter'))
    const sourceChapter = (await readSource(ctx.sourceFile)).chapters.find((item) => item.chapter === chapter)
    if (!sourceChapter) throw new HttpError(404, `본문에 ${chapter}장이 없습니다`)
    const [sceneFile, catalog] = await Promise.all([
      readSceneFile(chapter, scenesDir),
      readImageCatalog({ file: ctx.imageVersionsFile, imagesDir: ctx.imagesDir }),
    ])
    return c.json({
      chapter,
      verses: sourceChapter.verses,
      scenes: sceneFile?.scenes ?? null,
      imageVersions: catalog.versions,
      images: sceneImages(sceneFile?.scenes ?? [], catalog),
    })
  })

  // images 단계가 모델에 보낼 최종 프롬프트와 함께 보낼 참고 이미지 파일 이름
  app.get('/:chapter/:id/prompt', async (c) => {
    const chapter = parseChapter(c.req.param('chapter'))
    const { sceneFile, index } = await findScene(chapter, c.req.param('id'))
    const style = await readStyle(ctx.styleFile, { refsDir: ctx.refsDir, requireFiles: false })
    return c.json({
      prompt: buildImagePrompt(style, sceneFile.scenes[index]!),
      references: style.references.map((reference) => reference.file),
    })
  })

  // 장면 하나를 전체 검증한 뒤 그 장면만 바꿔 파일을 다시 쓴다.
  app.put('/:chapter/:id', async (c) => {
    const chapter = parseChapter(c.req.param('chapter'))
    const id = c.req.param('id')
    const parsed = SceneSchema.safeParse(await readJsonBody(c.req.raw))
    if (!parsed.success) throw new HttpError(400, errorMessage(parsed.error, '장면이 형식에 맞지 않습니다'))
    const scene = parsed.data
    if (scene.id !== id) throw new HttpError(400, `본문의 id(${scene.id})가 주소의 id(${id})와 다릅니다`)
    if (scene.chapter !== chapter) throw new HttpError(400, `본문의 장 번호(${scene.chapter})가 주소의 장 번호(${chapter})와 다릅니다`)
    const { sceneFile, index } = await findScene(chapter, id)
    const scenes = [...sceneFile.scenes]
    scenes[index] = scene
    try {
      await writeSceneFile({ ...sceneFile, scenes }, scenesDir)
    } catch (error) {
      throw new HttpError(400, errorMessage(error, '장면 파일 검증에 실패했습니다'))
    }
    return c.json(scene)
  })

  return app
}
