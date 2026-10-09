import { openDatabaseSync } from 'expo-sqlite'
import type { Collection, Persistence, RecordRow } from 'reader-core'

// 기기 기록을 SQLite 파일(reader.db)의 records 표 하나에 둔다. 컬렉션과 id가 키다.
const db = openDatabaseSync('reader.db')
db.execSync(
  'CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL, PRIMARY KEY (collection, id))',
)

type Row = { collection: string; id: string; data: string; updated_at: number; deleted_at: number | null; dirty: number }

function save(row: RecordRow): void {
  db.runSync(
    'INSERT OR REPLACE INTO records (collection, id, data, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, ?)',
    [row.collection, row.id, JSON.stringify(row.data), row.updatedAt, row.deletedAt, row.dirty ? 1 : 0],
  )
}

export const persistence: Persistence = {
  load: () =>
    db.getAllSync<Row>('SELECT collection, id, data, updated_at, deleted_at, dirty FROM records').map(
      (row): RecordRow => ({
        collection: row.collection as Collection,
        id: row.id,
        data: JSON.parse(row.data) as unknown,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        dirty: row.dirty === 1,
      }),
    ),
  save,
  // 동기화로 받은 여러 줄은 트랜잭션 하나로 쓴다(줄마다 디스크에 쓰지 않게).
  saveMany: (rows) => {
    db.withTransactionSync(() => {
      for (const row of rows) save(row)
    })
  },
  clear: () => {
    db.runSync('DELETE FROM records')
  },
}
