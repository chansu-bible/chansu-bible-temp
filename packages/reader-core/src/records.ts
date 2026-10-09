// 기기 기록(읽은 장면, 읽기 위치, 계획, 밑줄·메모)을 담는 저장소.
// 줄마다 수정 시각, 지운 시각, 아직 서버에 올리지 않았는지를 적어 3단계 동기화가 그대로 쓴다.
// 기록은 작아서(수백 줄) 모두 메모리에 두고, 바뀐 줄만 persistence로 내려 쓴다.
export type Collection = 'position' | 'readScenes' | 'plan' | 'marks' | 'quizDone'

export type RecordRow = {
  collection: Collection
  id: string
  data: unknown
  updatedAt: number
  // 지운 시각. 지운 줄도 다른 기기에 알려야 하므로 바로 없애지 않는다.
  deletedAt: number | null
  dirty: boolean
}

export type Persistence = {
  load(): RecordRow[]
  save(row: RecordRow): void
}

const keyOf = (collection: Collection, id: string) => `${collection}/${id}`

export class RecordStore {
  private rows = new Map<string, RecordRow>()
  private listeners = new Set<() => void>()
  private version = 0
  private persistence: Persistence

  constructor(persistence: Persistence) {
    this.persistence = persistence
    for (const row of persistence.load()) this.rows.set(keyOf(row.collection, row.id), row)
  }

  get<T>(collection: Collection, id: string): T | null {
    const row = this.rows.get(keyOf(collection, id))
    return row && row.deletedAt === null ? (row.data as T) : null
  }

  list<T>(collection: Collection): { id: string; data: T; updatedAt: number }[] {
    const items: { id: string; data: T; updatedAt: number }[] = []
    for (const row of this.rows.values()) {
      if (row.collection === collection && row.deletedAt === null) items.push({ id: row.id, data: row.data as T, updatedAt: row.updatedAt })
    }
    return items
  }

  put(collection: Collection, id: string, data: unknown, now = Date.now()): void {
    this.write({ collection, id, data, updatedAt: now, deletedAt: null, dirty: true })
  }

  remove(collection: Collection, id: string, now = Date.now()): void {
    const existing = this.rows.get(keyOf(collection, id))
    if (!existing || existing.deletedAt !== null) return
    this.write({ ...existing, updatedAt: now, deletedAt: now, dirty: true })
  }

  // 동기화가 쓴다: 모든 줄(지운 줄 포함)과, 서버에서 받은 줄을 그대로 쓰기
  rowsSnapshot(): RecordRow[] {
    return [...this.rows.values()]
  }

  writeRow(row: RecordRow): void {
    this.write(row)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  private write(row: RecordRow): void {
    this.rows.set(keyOf(row.collection, row.id), row)
    this.persistence.save(row)
    this.version++
    for (const listener of this.listeners) listener()
  }
}
