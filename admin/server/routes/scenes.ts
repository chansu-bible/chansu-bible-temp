import { Hono } from 'hono'
import { readSceneFile, readSource } from '../content.ts'
import { HttpError } from '../errors.ts'

export function sceneRoutes(): Hono {
  const app = new Hono()

  // 장 본문과 장면. 장면 파일이 없으면 scenes는 null이다.
  app.get('/:chapter', async (c) => {
    const raw = c.req.param('chapter')
    const chapter = Number(raw)
    if (!Number.isInteger(chapter) || chapter < 1) throw new HttpError(400, `장 번호가 잘못되었습니다: ${raw}`)
    const sourceChapter = (await readSource()).chapters.find((item) => item.chapter === chapter)
    if (!sourceChapter) throw new HttpError(404, `본문에 ${chapter}장이 없습니다`)
    const sceneFile = await readSceneFile(chapter)
    return c.json({ chapter, verses: sourceChapter.verses, scenes: sceneFile?.scenes ?? null })
  })

  return app
}
