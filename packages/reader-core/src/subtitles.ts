import type { KeyValueStore } from './store.ts'

const key = 'reader-subtitles'

// 그림 위 자막은 처음에 켜져 있다.
export function loadSubtitles(store: KeyValueStore): boolean {
  try {
    return store.getItem(key) !== 'off'
  } catch {
    return true
  }
}

export function saveSubtitles(store: KeyValueStore, on: boolean): void {
  try {
    store.setItem(key, on ? 'on' : 'off')
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 자막 설정 저장을 건너뛴다.
  }
}
