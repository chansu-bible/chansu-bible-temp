import { describe, expect, it } from 'vitest'
import type { Collection, RecordRow } from './records.ts'
import { applySyncResponse, mergeRemote, type RemoteRow } from './sync.ts'

const row = (overrides: Partial<RecordRow> = {}): RecordRow => ({
  collection: 'marks',
  id: 'genesis:4:9',
  data: { note: '기기' },
  updatedAt: 100,
  deletedAt: null,
  dirty: false,
  ...overrides,
})
const remote = (overrides: Partial<RemoteRow> = {}): RemoteRow => ({
  collection: 'marks',
  id: 'genesis:4:9',
  data: { note: '서버' },
  updatedAt: 200,
  deletedAt: null,
  ...overrides,
})
const table = (...rows: RecordRow[]) => {
  const map = new Map(rows.map((item) => [`${item.collection}/${item.id}`, item]))
  return (collection: Collection, id: string) => map.get(`${collection}/${id}`)
}

describe('mergeRemote', () => {
  it('기기에 없는 줄은 받아서 올린 것으로 둔다', () => {
    expect(mergeRemote(undefined, remote())).toEqual({ ...remote(), dirty: false })
  })

  it('서버 줄이 더 새로우면 바꾼다(지운 것도 그대로 받는다)', () => {
    expect(mergeRemote(row({ dirty: true }), remote({ deletedAt: 200 }))).toEqual({ ...remote({ deletedAt: 200 }), dirty: false })
  })

  it('기기 줄이 더 새로우면(아직 안 올린 변경) 그대로 둔다', () => {
    expect(mergeRemote(row({ updatedAt: 300, dirty: true }), remote())).toBeNull()
  })

  it('시각이 같으면 내가 올린 것이 돌아온 것이라 올린 것으로만 표시한다', () => {
    expect(mergeRemote(row({ updatedAt: 200, dirty: true }), remote())).toEqual(row({ updatedAt: 200 }))
    expect(mergeRemote(row({ updatedAt: 200 }), remote())).toBeNull()
  })
})

describe('applySyncResponse', () => {
  it('올린 뒤 그대로인 줄을 올린 것으로 표시하고, 돌아온 같은 줄은 다시 쓰지 않는다', () => {
    const sent = row({ dirty: true })
    const echo = remote({ data: sent.data, updatedAt: 100 })
    expect(applySyncResponse([sent], [echo], table(sent))).toEqual([row()])
  })

  it('올리는 사이 다시 고친 줄은 그대로 두어 다음에 올린다', () => {
    const sent = row({ dirty: true })
    const edited = row({ updatedAt: 150, data: { note: '고침' }, dirty: true })
    expect(applySyncResponse([sent], [], table(edited))).toEqual([])
  })

  it('다른 기기가 더 나중에 고친 줄을 받으면 내 것을 바꾼다', () => {
    const sent = row({ dirty: true })
    expect(applySyncResponse([sent], [remote()], table(sent))).toEqual([{ ...remote(), dirty: false }])
  })

  it('처음 보는 줄은 그대로 받는다', () => {
    const first = remote({ id: 'genesis:1:1' })
    expect(applySyncResponse([], [first], table())).toEqual([{ ...first, dirty: false }])
  })
})
