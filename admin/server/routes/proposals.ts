import { Hono } from 'hono'
import { readCanon, writeProposals, type CanonKind, type Proposal } from 'pipeline'
import type { AppContext } from '../context.ts'
import { setAtPath } from '../dotPath.ts'
import { errorMessage, HttpError } from '../errors.ts'
import { parseItem, saveKind } from './canon.ts'

function findOpen(proposals: Proposal[], id: string): number {
  const index = proposals.findIndex((proposal) => proposal.id === id)
  if (index < 0) throw new HttpError(404, `제안이 없습니다: ${id}`)
  const status = proposals[index]!.status
  if (status !== 'open') throw new HttpError(409, `이미 처리한 제안입니다 (${status})`)
  return index
}

async function saveProposals(proposals: Proposal[], dir: string | undefined): Promise<void> {
  try {
    await writeProposals(proposals, dir)
  } catch (error) {
    throw new HttpError(400, errorMessage(error, '제안 목록 검증에 실패했습니다'))
  }
}

export function proposalRoutes(ctx: AppContext): Hono {
  const app = new Hono()

  app.get('/', async (c) => c.json((await readCanon(ctx.storyBibleDir)).proposals))

  // target 항목의 field에 value를 넣고 검증해 저장한 뒤, 제안을 applied로 바꾼다. 바뀐 제안을 돌려준다.
  app.post('/:id/apply', async (c) => {
    const canon = await readCanon(ctx.storyBibleDir)
    const proposals = [...canon.proposals]
    const index = findOpen(proposals, c.req.param('id'))
    const proposal = proposals[index]!

    const [kind, targetId] = proposal.target.split('/') as [CanonKind, string]
    const items = [...(canon[kind] as { id: string }[])]
    const itemIndex = items.findIndex((item) => item.id === targetId)
    if (itemIndex < 0) throw new HttpError(404, `제안 대상 ${proposal.target} 항목이 없습니다`)

    let changed: unknown
    try {
      changed = setAtPath(items[itemIndex], proposal.field, proposal.value)
    } catch (error) {
      throw new HttpError(400, errorMessage(error))
    }
    items[itemIndex] = parseItem(kind, changed)
    if ((items[itemIndex] as { id: string }).id !== targetId) {
      throw new HttpError(400, '제안이 항목의 id를 바꿀 수 없습니다')
    }
    await saveKind(kind, items as never, ctx.storyBibleDir)

    const applied: Proposal = { ...proposal, status: 'applied' }
    proposals[index] = applied
    await saveProposals(proposals, ctx.storyBibleDir)
    return c.json(applied)
  })

  app.post('/:id/dismiss', async (c) => {
    const proposals = [...(await readCanon(ctx.storyBibleDir)).proposals]
    const index = findOpen(proposals, c.req.param('id'))
    const dismissed: Proposal = { ...proposals[index]!, status: 'dismissed' }
    proposals[index] = dismissed
    await saveProposals(proposals, ctx.storyBibleDir)
    return c.json(dismissed)
  })

  return app
}
