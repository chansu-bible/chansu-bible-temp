import type { Collection, RecordRow } from './records.ts'

// 서버가 돌려주는 줄(올렸는지 표시가 없다)
export type RemoteRow = {
  collection: Collection
  id: string
  data: unknown
  updatedAt: number
  deletedAt: number | null
}

const keyOf = (collection: Collection, id: string) => `${collection}/${id}`

// 서버에서 받은 줄을 기기 줄과 합친다. 바꿀 줄을 돌려주고, 그대로 두면 null이다.
// 나중에 고친 쪽(updatedAt이 큰 쪽)이 이긴다. 기기 줄이 더 새로우면(아직 안 올린 변경) 기기 것을 두고 다음에 올린다.
// 시각이 같으면 같은 쓰기라서(내가 올린 것이 돌아왔다) 올린 것으로만 표시한다.
export function mergeRemote(local: RecordRow | undefined, remote: RemoteRow): RecordRow | null {
  if (!local || remote.updatedAt > local.updatedAt) {
    return { collection: remote.collection, id: remote.id, data: remote.data, updatedAt: remote.updatedAt, deletedAt: remote.deletedAt, dirty: false }
  }
  if (remote.updatedAt === local.updatedAt && local.dirty) return { ...local, dirty: false }
  return null
}

// 한 번 주고받은 뒤 기기에 쓸 줄을 정한다.
// sent: 올린 줄(올릴 때의 모습), received: 서버가 돌려준 줄, current: 지금 기기의 줄.
// 올린 뒤 다시 고치지 않은 줄은 올린 것으로 표시하고, 받은 줄은 mergeRemote로 합친다.
export function applySyncResponse(
  sent: readonly RecordRow[],
  received: readonly RemoteRow[],
  current: (collection: Collection, id: string) => RecordRow | undefined,
): RecordRow[] {
  const writes = new Map<string, RecordRow>()
  const lookup = (collection: Collection, id: string) => writes.get(keyOf(collection, id)) ?? current(collection, id)
  for (const row of sent) {
    const now = lookup(row.collection, row.id)
    if (now && now.dirty && now.updatedAt === row.updatedAt) writes.set(keyOf(row.collection, row.id), { ...now, dirty: false })
  }
  for (const remote of received) {
    const merged = mergeRemote(lookup(remote.collection, remote.id), remote)
    if (merged) writes.set(keyOf(remote.collection, remote.id), merged)
  }
  return [...writes.values()]
}
