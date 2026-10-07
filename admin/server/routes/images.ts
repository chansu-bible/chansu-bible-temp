import path from 'node:path'
import { Hono } from 'hono'
import {
  addImageVersion,
  ImageVersionSchema,
  paths,
  readImageVersions,
  REFERENCE_FILE_PATTERN,
  versionDir,
} from 'pipeline'
import type { AppContext } from '../context.ts'
import { errorMessage, HttpError, readJsonBody } from '../errors.ts'
import { serveImage } from '../files.ts'

export function imageRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const file = ctx.imageVersionsFile ?? paths.imageVersionsFile
  const imagesDir = ctx.imagesDir ?? paths.imagesDir

  app.get('/versions', async (c) => c.json(await readImageVersions(file)))

  // 새 버전을 목록 끝에 붙이고 폴더를 만든다. images 단계는 이제 이 버전에 그린다.
  app.post('/versions', async (c) => {
    const parsed = ImageVersionSchema.safeParse(await readJsonBody(c.req.raw))
    if (!parsed.success) {
      throw new HttpError(400, errorMessage(parsed.error, '그림 버전이 형식에 맞지 않습니다(id는 영문 소문자·숫자·-)'))
    }
    const version = parsed.data
    if ((await readImageVersions(file)).some((existing) => existing.id === version.id)) {
      throw new HttpError(409, `그림 버전이 이미 있습니다: ${version.id}`)
    }
    return c.json(await addImageVersion(version, { file, imagesDir }), 201)
  })

  // 장면 그림. 파일 이름 규칙에 맞지 않으면 400, 목록에 없는 버전이나 없는 파일은 404.
  app.get('/:version/:file', async (c) => {
    const id = c.req.param('version')
    const name = c.req.param('file')
    if (!REFERENCE_FILE_PATTERN.test(name)) throw new HttpError(400, `파일 이름이 규칙에 맞지 않습니다: ${name}`)
    const version = (await readImageVersions(file)).find((item) => item.id === id)
    if (!version) throw new HttpError(404, `그림 버전이 없습니다: ${id}`)
    return serveImage(c, path.join(versionDir(version, imagesDir), name))
  })

  return app
}
