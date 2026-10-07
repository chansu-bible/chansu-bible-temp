import { Hono } from 'hono'
import {
  canonItemSchemas,
  CanonKindSchema,
  readCanon,
  writeCanonKind,
  type Canon,
  type CanonKind,
  type ReviewState,
} from 'pipeline'
import { readSceneFiles, readSource } from '../content.ts'
import { errorMessage, HttpError } from '../errors.ts'
import type { AppContext } from '../context.ts'

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

// 목록 전체를 저장한다. 설정집 교차 검증에 걸리면 400.
export async function saveKind(kind: CanonKind, items: Item[], dir: string | undefined): Promise<void> {
  try {
    await writeCanonKind(kind, items as never, dir)
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
    return c.json(listOf(await readCanon(ctx.storyBibleDir), kind))
  })

  app.post('/:kind', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const item = parseItem(kind, await readBody(c.req.raw))
    const items = listOf(await readCanon(ctx.storyBibleDir), kind)
    if (items.some((existing) => existing.id === item.id)) {
      throw new HttpError(409, `${kind}/${item.id} 항목이 이미 있습니다`)
    }
    await saveKind(kind, [...items, item], ctx.storyBibleDir)
    return c.json(item, 201)
  })

  app.put('/:kind/:id', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const id = c.req.param('id')
    const item = parseItem(kind, await readBody(c.req.raw))
    if (item.id !== id) throw new HttpError(400, `본문의 id(${item.id})가 주소의 id(${id})와 다릅니다`)
    const items = [...listOf(await readCanon(ctx.storyBibleDir), kind)]
    items[findIndex(items, kind, id)] = item
    await saveKind(kind, items, ctx.storyBibleDir)
    return c.json(item)
  })

  for (const [action, status] of [
    ['approve', 'approved'],
    ['reject', 'rejected'],
  ] as const) {
    app.post(`/:kind/:id/${action}`, async (c) => {
      const kind = parseKind(c.req.param('kind'))
      const id = c.req.param('id')
      const items = [...listOf(await readCanon(ctx.storyBibleDir), kind)]
      const index = findIndex(items, kind, id)
      const item = { ...items[index]!, status }
      items[index] = item
      await saveKind(kind, items, ctx.storyBibleDir)
      return c.json(item)
    })
  }

  // 이 항목을 쓰는 장면. 인물은 visual.characters, 장소는 placeId, 시대는 eraId(장면에 생기면)로 찾는다.
  app.get('/:kind/:id/usage', async (c) => {
    const kind = parseKind(c.req.param('kind'))
    const id = c.req.param('id')
    findIndex(listOf(await readCanon(ctx.storyBibleDir), kind), kind, id)

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

    const sceneFiles = await readSceneFiles(await readSource())
    const scenes = sceneFiles.flatMap((file) =>
      file.scenes
        .filter((scene) => uses(scene))
        .map((scene) => ({ chapter: file.chapter, id: scene.id, title: scene.title })),
    )
    return c.json({ scenes })
  })

  return app
}
