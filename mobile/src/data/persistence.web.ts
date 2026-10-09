import type { Persistence, RecordRow } from 'reader-core'

// Expo 웹 미리 보기에서는 localStorage 한 키에 모든 줄을 JSON으로 둔다.
const key = 'reader-records'
let rows: RecordRow[] = []

function read(): RecordRow[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? (value as RecordRow[]) : []
  } catch {
    return []
  }
}

export const persistence: Persistence = {
  load: () => {
    rows = read()
    return rows
  },
  save: (row) => {
    const index = rows.findIndex((item) => item.collection === row.collection && item.id === row.id)
    if (index >= 0) rows[index] = row
    else rows.push(row)
    try {
      localStorage.setItem(key, JSON.stringify(rows))
    } catch {
      // 저장소를 쓸 수 없는 환경에서는 이번 세션 동안만 기억한다.
    }
  },
}
