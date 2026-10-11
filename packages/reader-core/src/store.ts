// 읽기 기록을 적는 저장소. 웹은 localStorage, 앱은 expo-sqlite의 kv-store를 넘긴다.
// 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)도 있어서, 이 저장소를 쓰는 함수들은 오류를 삼키고 기본값을 쓴다.
export type KeyValueStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type MemoryStore = KeyValueStore & { entries: Map<string, string> }

// 시험과 저장소가 없는 환경에서 쓰는 메모리 저장소
export function memoryStore(initial: Record<string, string> = {}): MemoryStore {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}
