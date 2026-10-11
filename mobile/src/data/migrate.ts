import { loadPosition, loadReadScenes, type RecordStore } from 'reader-core'
import { kv } from '../storage/kv'

const doneKey = 'records-migrated'

// 1단계는 읽기 위치와 읽은 장면을 kv에 적었다. 처음 한 번만 기록 저장소로 옮긴다(kv 값은 두고 간다).
// 그때 읽은 날은 알 수 없어서 null(오늘 이전)로 둔다.
export function migrateFromKv(store: RecordStore): void {
  try {
    if (kv.getItem(doneKey) === '1') return
  } catch {
    return
  }
  const position = loadPosition(kv)
  if (position && store.get('position', 'current') === null) store.put('position', 'current', position)
  for (const id of loadReadScenes(kv)) {
    if (store.get('readScenes', id) === null) store.put('readScenes', id, { day: null })
  }
  try {
    kv.setItem(doneKey, '1')
  } catch {
    // 다음에 다시 옮겨도 이미 있는 줄은 건너뛴다.
  }
}
