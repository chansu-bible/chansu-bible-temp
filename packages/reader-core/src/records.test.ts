import { describe, expect, it } from 'vitest'
import { RecordStore, type Persistence, type RecordRow } from './records.ts'

function memory(initial: RecordRow[] = []): Persistence & { saved: RecordRow[] } {
  const saved: RecordRow[] = []
  return { saved, load: () => initial, save: (row) => void saved.push(row) }
}

describe('RecordStore', () => {
  it('넣은 기록을 읽고, 줄마다 수정 시각과 미동기화 표시를 남긴다', () => {
    const persistence = memory()
    const store = new RecordStore(persistence)
    store.put('marks', 'genesis:4:9', { note: '가' }, 1000)
    expect(store.get('marks', 'genesis:4:9')).toEqual({ note: '가' })
    expect(persistence.saved).toEqual([
      { collection: 'marks', id: 'genesis:4:9', data: { note: '가' }, updatedAt: 1000, deletedAt: null, dirty: true },
    ])
  })

  it('지우면 줄을 없애지 않고 지운 시각을 적는다', () => {
    const store = new RecordStore(memory())
    store.put('marks', 'a', { note: '가' }, 1000)
    store.remove('marks', 'a', 2000)
    expect(store.get('marks', 'a')).toBeNull()
    expect(store.list('marks')).toEqual([])
    expect(store.rowsSnapshot()[0]).toMatchObject({ deletedAt: 2000, updatedAt: 2000, dirty: true })
  })

  it('저장해 둔 줄을 불러오고, 컬렉션별로 지우지 않은 것만 늘어놓는다', () => {
    const rows: RecordRow[] = [
      { collection: 'readScenes', id: 'a', data: { day: '2026-10-08' }, updatedAt: 1, deletedAt: null, dirty: false },
      { collection: 'readScenes', id: 'b', data: { day: null }, updatedAt: 1, deletedAt: 5, dirty: false },
      { collection: 'marks', id: 'c', data: {}, updatedAt: 1, deletedAt: null, dirty: false },
    ]
    const store = new RecordStore(memory(rows))
    expect(store.list('readScenes').map((item) => item.id)).toEqual(['a'])
  })

  it('바뀔 때마다 구독자에게 알리고 버전을 올린다', () => {
    const store = new RecordStore(memory())
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    const before = store.getVersion()
    store.put('plan', 'current', { kind: 'free', perDay: 1 })
    expect(calls).toBe(1)
    expect(store.getVersion()).toBe(before + 1)
    unsubscribe()
    store.put('plan', 'current', { kind: 'chapter', perDay: 1 })
    expect(calls).toBe(1)
  })
})
