import { z } from 'zod'
import type { Query } from './db.ts'

export const COLLECTIONS = ['position', 'readScenes', 'plan', 'marks', 'quizDone'] as const
// 한 줄의 데이터는 JSON으로 1만 자까지
export const MAX_DATA = 10_000
// 한 번에 올리는 줄은 500개까지(앱이 나눠 올린다)
export const MAX_CHANGES = 500
// 한 번에 내려 주는 줄. 더 있으면 more로 알린다.
export const PULL_LIMIT = 1000

export const ChangeSchema = z.object({
  collection: z.enum(COLLECTIONS),
  id: z.string().min(1).max(200),
  data: z.unknown().refine((value) => JSON.stringify(value ?? null).length <= MAX_DATA, { error: '데이터가 너무 큽니다' }),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
})

export const SyncRequestSchema = z.object({
  since: z.number().int().nonnegative(),
  changes: z.array(ChangeSchema).max(MAX_CHANGES),
})

export type Change = z.infer<typeof ChangeSchema>

// 받은 줄을 반영한다. 같은 줄이 이미 있으면 updatedAt이 더 클 때만 바꾼다(나중 쓰기 이김). 바뀐 줄은 새 순번을 받는다.
export async function applyChanges(query: Query, userId: string, changes: Change[]): Promise<void> {
  for (const change of changes) {
    await query(
      `INSERT INTO records (user_id, collection, id, data, updated_at, deleted_at, seq)
       VALUES ($1, $2, $3, $4, $5, $6, nextval('record_seq'))
       ON CONFLICT (user_id, collection, id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, seq = EXCLUDED.seq
         WHERE records.updated_at < EXCLUDED.updated_at`,
      [userId, change.collection, change.id, JSON.stringify(change.data ?? null), change.updatedAt, change.deletedAt],
    )
  }
}

type Row = {
  collection: Change['collection']
  id: string
  data: unknown
  updated_at: string | number | bigint
  deleted_at: string | number | bigint | null
  seq: string | number | bigint
}

// since 순번 다음으로 바뀐 줄을 순번 순서로 limit개까지 준다. now는 다음에 since로 보낼 순번이다.
export async function pullChanges(
  query: Query,
  userId: string,
  since: number,
  limit = PULL_LIMIT,
): Promise<{ changes: Change[]; now: number; more: boolean }> {
  const rows = await query<Row>(
    'SELECT collection, id, data, updated_at, deleted_at, seq FROM records WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3',
    [userId, since, limit + 1],
  )
  const page = rows.slice(0, limit)
  return {
    changes: page.map((row) => ({
      collection: row.collection,
      id: row.id,
      data: row.data,
      updatedAt: Number(row.updated_at),
      deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    })),
    now: page.length > 0 ? Number(page[page.length - 1]!.seq) : since,
    more: rows.length > limit,
  }
}
