import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import {
  detectImageExtension,
  MAX_REFERENCE_BYTES,
  paths,
  readStyle,
  REFERENCE_FILE_PATTERN,
  StyleSchema,
  writeStyle,
  type Style,
} from 'pipeline'
import type { AppContext } from '../context.ts'
import { errorMessage, HttpError, readJsonBody } from '../errors.ts'
import { sanitizeReferenceName, serveImage, uniqueName } from '../files.ts'

const TOO_BIG = `파일이 너무 큽니다. 15MB까지 올릴 수 있습니다`

// 주소의 파일 이름이 참고 이미지 이름 규칙에 맞는지 본다. 규칙상 폴더 밖을 가리킬 수 없다.
export function parseReferenceFile(value: string): string {
  if (!REFERENCE_FILE_PATTERN.test(value)) {
    throw new HttpError(400, `파일 이름이 규칙에 맞지 않습니다: ${value} (영문 소문자·숫자·.-_, 확장자 jpg·jpeg·png·webp)`)
  }
  return value
}

// 선택 문자열 필드. 없으면 빈 문자열, 문자열이 아니면 400.
function optionalText(value: unknown, name: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new HttpError(400, `${name}은 문자열이어야 합니다`)
  return value
}

// 그림이 아니면 400. jpg·png·webp만 받는다.
function imageExtension(bytes: Uint8Array): 'jpg' | 'png' | 'webp' {
  try {
    return detectImageExtension(bytes)
  } catch {
    throw new HttpError(400, '그림 파일이 아닙니다. jpg·png·webp만 쓸 수 있습니다')
  }
}

// 응답 본문을 한도까지만 읽는다. 넘으면 400.
async function readLimited(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (declared > MAX_REFERENCE_BYTES) throw new HttpError(400, TOO_BIG)
  if (!response.body) return new Uint8Array(await response.arrayBuffer())

  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_REFERENCE_BYTES) {
      await reader.cancel()
      throw new HttpError(400, TOO_BIG)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function styleRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const styleFile = ctx.styleFile ?? paths.styleFile
  const refsDir = ctx.refsDir ?? paths.refsDir

  // 참고 파일이 없어도 화면에서 보고 지울 수 있게, 읽을 때는 파일 존재를 따지지 않는다.
  const read = () => readStyle(styleFile, { refsDir, requireFiles: false })

  const save = async (style: Style) => {
    try {
      await writeStyle(style, { file: styleFile, refsDir })
    } catch (error) {
      throw new HttpError(400, errorMessage(error, '화풍이 형식에 맞지 않습니다'))
    }
  }

  // 그림 바이트를 refs 폴더에 새 이름으로 쓰고 목록 끝에 더한다. 화풍 저장에 실패하면 쓴 파일을 지운다.
  const addReference = async (bytes: Uint8Array, originalName: string, label: string, source: string) => {
    const ext = imageExtension(bytes)
    const style = await read()
    const taken = style.references.map((reference) => reference.file)
    const added = uniqueName(refsDir, sanitizeReferenceName(originalName, ext), taken)
    await mkdir(refsDir, { recursive: true })
    await writeFile(path.join(refsDir, added), bytes)
    const next: Style = { ...style, references: [...style.references, { file: added, label, source }] }
    try {
      await save(next)
    } catch (error) {
      await rm(path.join(refsDir, added), { force: true })
      throw error
    }
    return { style: next, added }
  }

  app.get('/', async (c) => c.json(await read()))

  app.put('/', async (c) => {
    const parsed = StyleSchema.safeParse(await readJsonBody(c.req.raw))
    if (!parsed.success) throw new HttpError(400, errorMessage(parsed.error, '화풍이 형식에 맞지 않습니다'))
    await save(parsed.data)
    return c.json(parsed.data)
  })

  app.get('/refs/:file', async (c) => {
    const file = parseReferenceFile(c.req.param('file'))
    return serveImage(c, path.join(refsDir, file))
  })

  // multipart: file(필수), label, source
  app.post('/refs', async (c) => {
    let body: Record<string, unknown>
    try {
      body = await c.req.parseBody()
    } catch {
      throw new HttpError(400, '본문이 multipart 형식이 아닙니다')
    }
    const file = body.file
    if (!(file instanceof File)) throw new HttpError(400, '올릴 파일(file)이 없습니다')
    if (file.size > MAX_REFERENCE_BYTES) throw new HttpError(400, TOO_BIG)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await addReference(bytes, file.name, optionalText(body.label, 'label'), optionalText(body.source, 'source'))
    return c.json(result, 201)
  })

  // { url, label?, source? }. 서버가 바깥으로 요청하는 유일한 경로라 주소를 로그에 남긴다.
  app.post('/refs/import', async (c) => {
    const body = await readJsonBody(c.req.raw)
    const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
    const raw = fields.url
    if (typeof raw !== 'string' || raw === '') throw new HttpError(400, '가져올 주소(url)가 필요합니다')
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new HttpError(400, `주소가 올바르지 않습니다: ${raw}`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new HttpError(400, `http(s) 주소만 가져올 수 있습니다: ${raw}`)
    }
    const label = optionalText(fields.label, 'label')
    const source = optionalText(fields.source, 'source') || raw

    console.log(`참고 이미지 가져오기: ${raw}`)
    let response: Response
    try {
      response = await (ctx.fetchImpl ?? fetch)(raw)
    } catch (error) {
      throw new HttpError(400, `그림을 받지 못했습니다: ${errorMessage(error)}`)
    }
    if (!response.ok) throw new HttpError(400, `그림을 받지 못했습니다: HTTP ${response.status}`)
    const bytes = await readLimited(response)

    let name = ''
    try {
      name = decodeURIComponent(path.posix.basename(url.pathname))
    } catch {
      name = path.posix.basename(url.pathname)
    }
    return c.json(await addReference(bytes, name, label, source), 201)
  })

  // 목록에서 빼고 파일을 지운다. 파일이 이미 없어도 목록에서는 뺀다.
  app.delete('/refs/:file', async (c) => {
    const file = parseReferenceFile(c.req.param('file'))
    const style = await read()
    if (!style.references.some((reference) => reference.file === file)) {
      throw new HttpError(404, `화풍 참고 이미지 목록에 없습니다: ${file}`)
    }
    const next: Style = { ...style, references: style.references.filter((reference) => reference.file !== file) }
    await save(next)
    await rm(path.join(refsDir, file), { force: true })
    return c.json(next)
  })

  return app
}
