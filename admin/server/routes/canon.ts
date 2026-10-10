import { Hono } from 'hono'
import {
  canonItemSchemas,
  CanonKindSchema,
  listSceneChapters,
  listSourceBooks,
  paths,
  readCanon,
  writeCanonKind,
  type Canon,
  type CanonKind,
  type ReviewState,
  type Scene,
} from 'pipeline'
import type { BookId } from 'reader-core'
import type { AppContext } from '../context.ts'
import { readSceneFile } from '../content.ts'
import { errorMessage, HttpError } from '../errors.ts'

type Item = { id: string; status: ReviewState }

// 장면이 가리키는 설정집 항목 id. 인물은 visual.characters, 장소는 placeId, 시대는 eraId로 가리킨다.
// 물건은 아직 장면에서 가리키지 않는다.
function referencedIds(kind: CanonKind, scene: Scene): string[] {
  switch (kind) {
    case 'characters':
      return scene.visual.characters
    case 'places':
      return scene.placeId ? [scene.placeId] : []
    case 'eras':
      return scene.eraId ? [scene.eraId] : []
    case 'things':
      return []
  }
}

// 본문이 있는 모든 책의 장면(성경 순서). 장은 장면 파일 목록(listSceneChapters)으로 찾고 본문은 읽지 않는다.
async function readAllScenes(ctx: AppContext): Promise<{ book: BookId; chapter: number; scene: Scene }[]> {
  const scenesDir = ctx.scenesDir ?? paths.scenesDir
  const perBook = await Promise.all(
    (await listSourceBooks(ctx.sourceDir)).map(async (book) => {
      const chapters = await listSceneChapters(book, scenesDir)
      const files = await Promise.all(chapters.map((chapter) => readSceneFile(book, chapter, scenesDir)))
      return files.flatMap((file) => (file ? file.scenes.map((scene) => ({ book, chapter: file.chapter, scene })) : []))
    }),
  )
  return perBook.flat()
}

export function parseKind(value: string): CanonKind {
  const parsed = CanonKindSchema.safeParse(value)
  if (!parsed.success) throw new HttpError(404, `모르는 설정집 종류입니다: ${value} (characters, places, eras, things 중 하나)`)
  return parsed.data
}

// 항목 하나를 그 종류의 스키마로 검증한다. 실패하면 400.
export function parseItem(kind: CanonKind, value: unknown): Item {
  const result = canonItemSchemas[kind].safeParse(value)
  if (!result.success) throw new HttpError(400, errorMessage(result.error))
  return result.data as Item
}

// 설정집을 읽는다. 절 인용은 ctx.sourceDir의 본문으로 검증한다.
export function readCanonOf(ctx: AppContext): Promise<Canon> {
  return readCanon(ctx.storyBibleDir, { sourceDir: ctx.sourceDir })
}

// 목록 전체를 저장한다. 설정집 교차 검증에 걸리면 400.
export async function saveKind(kind: CanonKind, items: Item[], ctx: AppContext): Promise<void> {
  try {
    await writeCanonKind(kind, items as never, ctx.storyBibleDir, { sourceDir: ctx.sourceDir })
  } catch (error) {
    throw new HttpError(400, errorMessage(error, '설정집 검증에 실패했습니다'))
  }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, '본문이 JSON이 아닙니다')
  }
}

function findIndex(items: Item[], kind: CanonKind, id: string): number {
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) throw new HttpError(404, `${kind}/${id} 항목이 없습니다`)
  return index
}

const listOf = (canon: Canon, kind: CanonKind) => canon[kind] as Item[]

export function canonRoutes(ctx: AppContext): Hono {
  const app = new Hono()

  app.get('/:kind', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    return c.json(listOf(await readCanonOf(ctx), kind))
  })

  app.post('/:kind', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const item = parseItem(kind, await readBody(c.req.raw))
    const items = listOf(await readCanonOf(ctx), kind)
    if (items.some((existing) => existing.id === item.id)) {
      throw new HttpError(409, `${kind}/${item.id} 항목이 이미 있습니다`)
    }
    await saveKind(kind, [...items, item], ctx)
    return c.json(item, 201)
  })

  app.put('/:kind/:id', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const id = c.req.param('id')
    const item = parseItem(kind, await readBody(c.req.raw))
    if (item.id !== id) throw new HttpError(400, `본문의 id(${item.id})가 주소의 id(${id})와 다릅니다`)
    const items = [...listOf(await readCanonOf(ctx), kind)]
    items[findIndex(items, kind, id)] = item
    await saveKind(kind, items, ctx)
    return c.json(item)
  })

  for (const [action, status] of [
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ] as const) {
    app.post(`/:kind/:id/${action}`, async (c) => {
      const kind = parseKind(c.req.param('kind'))
      const id = c.req.param('id')
      const items = [...listOf(await readCanonOf(ctx), kind)]
      const index = findIndex(items, kind, id)
      const item = { ...items[index]!, status }
      items[index] = item
      await saveKind(kind, items, ctx)
      return c.json(item)
    })
  }

  // 종류의 항목마다 쓰는 장면 수 { 항목 id: 장면 수 }. 목록 화면이 종류마다 한 번 받는다.
  // 모든 장면 파일을 한 번만 읽는다. 장면이 가리키지 않는 항목은 없다(0으로 본다).
  app.get('/:kind/usage', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const counts: Record<string, number> = {}
    if (kind === 'things') return c.json(counts)
    for (const { scene } of await readAllScenes(ctx)) {
      for (const id of new Set(referencedIds(kind, scene))) counts[id] = (counts[id] ?? 0) + 1
    }
    return c.json(counts)
  })

  // 이 항목을 쓰는 장면. 본문이 있는 모든 책의 장면에서 찾는다(성경 순서).
  app.get('/:kind/:id/usage', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const id = c.req.param('id')
    findIndex(listOf(await readCanonOf(ctx), kind), kind, id)
    if (kind === 'things') return c.json({ scenes: [] })
    const scenes = (await readAllScenes(ctx))
      .filter(({ scene }) => referencedIds(kind, scene).includes(id))
      .map(({ book, chapter, scene }) => ({ book, chapter, id: scene.id, title: scene.title }))
    return c.json({ scenes })
  })

  return app
}
