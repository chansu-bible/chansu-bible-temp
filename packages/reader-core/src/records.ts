// 기기 기록(읽은 장면, 읽기 위치, 계획, 밑줄·메모)을 담는 저장소.
// 줄마다 수정 시각, 지운 시각, 아직 서버에 올리지 않았는지를 적어 동기화(sync.ts)가 그대로 쓴다.
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
  // 여러 줄을 한 번에 쓴다(SQLite는 트랜잭션 하나로). 없으면 줄마다 save를 부른다.
  saveMany?(rows: RecordRow[]): void
  // 모든 줄을 지운다(로그아웃).
  clear?(): void
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
    this.write([{ collection, id, data, updatedAt: this.stamp(collection, id, now), deletedAt: null, dirty: true }])
  }

  remove(collection: Collection, id: string, now = Date.now()): void {
    const existing = this.rows.get(keyOf(collection, id))
    if (!existing || existing.deletedAt !== null) return
    const at = this.stamp(collection, id, now)
    // 지운 줄은 지웠다는 것만 알리면 되므로 내용(메모 등)은 남기지 않는다.
    this.write([{ ...existing, data: null, updatedAt: at, deletedAt: at, dirty: true }])
  }

  // 아래는 동기화가 쓴다.
  getRow(collection: Collection, id: string): RecordRow | undefined {
    return this.rows.get(keyOf(collection, id))
  }

  // 모든 줄(지운 줄 포함)
  rowsSnapshot(): RecordRow[] {
    return [...this.rows.values()]
  }

  // 아직 서버에 올리지 않은 줄(지운 줄 포함)
  dirtyRows(): RecordRow[] {
    return [...this.rows.values()].filter((row) => row.dirty)
  }

  // 서버와 맞춘 줄을 그대로 쓴다. 여러 줄이어도 구독자에게는 한 번 알린다.
  writeRows(rows: RecordRow[]): void {
    if (rows.length > 0) this.write(rows)
  }

  // 로그아웃할 때 기기 기록을 모두 지운다.
  clear(): void {
    this.rows.clear()
    this.persistence.clear?.()
    this.changed()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  // 고친 시각은 그 줄이 이미 가진 시각보다 늘 뒤로 둔다.
  // 기기 시계가 늦어도 새로 고친 것이 앞의 것(다른 기기에서 받은 것 포함)을 이겨 서버에 올라간다.
  private stamp(collection: Collection, id: string, now: number): number {
    const existing = this.rows.get(keyOf(collection, id))
    return existing ? Math.max(now, existing.updatedAt + 1) : now
  }

  private write(rows: RecordRow[]): void {
    for (const row of rows) this.rows.set(keyOf(row.collection, row.id), row)
    if (rows.length > 1 && this.persistence.saveMany) this.persistence.saveMany(rows)
    else for (const row of rows) this.persistence.save(row)
    this.changed()
  }

  private changed(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}
