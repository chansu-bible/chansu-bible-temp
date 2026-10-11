import Storage from 'expo-sqlite/kv-store'
import type { KeyValueStore } from 'reader-core'

// 기기 저장소. expo-sqlite의 키·값 저장소를 동기 API로 쓴다(앱을 껐다 켜도 남는다).
export const kv: KeyValueStore = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
}
