export type Position = { chapter: number; sceneId: string }

const key = 'reader-position'

export function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Position>
    if (typeof value.chapter !== 'number' || typeof value.sceneId !== 'string') return null
    return { chapter: value.chapter, sceneId: value.sceneId }
  } catch {
    return null
  }
}

export function savePosition(position: Position): void {
  try {
    localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 위치 저장을 건너뛴다.
  }
}
