import type { KeyValueStore } from 'reader-core'

// Expo 웹 미리 보기에서는 브라우저의 localStorage를 쓴다.
export const kv: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}
