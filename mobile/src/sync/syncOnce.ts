import { applySyncResponse, type RecordStore, type RemoteRow } from 'reader-core'

export type SyncResult = { since: number; pushed: number; received: number }

export class SyncHttpError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`동기화 서버가 ${status}로 답했습니다`)
    this.status = status
  }
}

// 한 번에 올리는 줄 수(서버 한도와 같다)
const CHUNK = 500

// 한 번 맞춘다: 아직 안 올린 줄을 나눠 올리고, since 다음에 바뀐 줄을 받아 합친다. 받을 것이 더 있으면(more) 이어서 받는다.
export async function syncOnce(store: RecordStore, apiUrl: string, accessToken: string, since: number): Promise<SyncResult> {
  const queue = store.dirtyRows()
  let cursor = since
  let pushed = 0
  let received = 0
  for (let round = 0; round < 200; round++) {
    const sent = queue.splice(0, CHUNK)
    const response = await fetch(`${apiUrl}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        since: cursor,
        changes: sent.map(({ collection, id, data, updatedAt, deletedAt }) => ({ collection, id, data, updatedAt, deletedAt })),
      }),
    })
    if (!response.ok) throw new SyncHttpError(response.status)
    const body = (await response.json()) as { now: number; more: boolean; changes: RemoteRow[] }
    store.writeRows(applySyncResponse(sent, body.changes, (collection, id) => store.getRow(collection, id)))
    pushed += sent.length
    received += body.changes.length
    cursor = body.now
    if (queue.length === 0 && !body.more) break
  }
  return { since: cursor, pushed, received }
}
