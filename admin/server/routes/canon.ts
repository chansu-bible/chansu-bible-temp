import { Hono } from 'hono'
import {
  canonItemSchemas,
  CanonKindSchema,
  listSourceBooks,
  readCanon,
  writeCanonKind,
  type Canon,
  type CanonKind,
  type ReviewState,
} from 'pipeline'
import type { AppContext } from '../context.ts'
import { readSceneFiles, readSource } from '../content.ts'
import { errorMessage, HttpError } from '../errors.ts'

type Item = { id: string; status: ReviewState }

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

  // 이 항목을 쓰는 장면. 본문이 있는 모든 책의 장면에서 찾는다(성경 순서).
  // 인물은 visual.characters, 장소는 placeId, 시대는 eraId(장면에 생기면)로 찾는다.
  app.get('/:kind/:id/usage', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const id = c.req.param('id')
    findIndex(listOf(await readCanonOf(ctx), kind), kind, id)

    const uses = (scene: Record<string, unknown> & { visual: { characters: string[] }; placeId: string | null }) => {
      switch (kind) {
        case 'characters':
          return scene.visual.characters.includes(id)
        case 'places':
          return scene.placeId === id
        case 'eras':
          return scene.eraId === id
        case 'things':
          return false
      }
    }

    const books = await listSourceBooks(ctx.sourceDir)
    const perBook = await Promise.all(
      books.map(async (book) => {
        const sceneFiles = await readSceneFiles(book, await readSource(book, ctx.sourceDir), ctx.scenesDir)
        return sceneFiles.flatMap((file) =>
          file.scenes
            .filter((scene) => uses(scene))
            .map((scene) => ({ book, chapter: file.chapter, id: scene.id, title: scene.title })),
        )
      }),
    )
    return c.json({ scenes: perBook.flat() })
  })

  return app
}
