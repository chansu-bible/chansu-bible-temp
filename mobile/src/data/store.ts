import { useSyncExternalStore } from 'react'
import { RecordStore } from 'reader-core'
import { migrateFromKv } from './migrate'
import { persistence } from './persistence'

// 앱 전체가 함께 쓰는 기록 저장소
export const store = new RecordStore(persistence)
migrateFromKv(store)

// 기록이 바뀔 때마다 다시 그리게 하는 훅. 돌려준 버전을 useMemo 의존성으로 쓴다.
export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
}
