import type { KeyValueStore } from 'reader-core'

// 브라우저의 localStorage. 막힌 환경(사생활 보호 모드 등)에서는 읽기·쓰기가 오류를 던지고, reader-core가 그 오류를 삼킨다.
export const browserStore: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}
