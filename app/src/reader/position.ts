// 장 번호와 그 장 안의 절 번호로 읽던 곳을 나타낸다.
export type Position = { chapter: number; verse: number }

const key = 'reader-position'

export function parsePosition(raw: string | null): Position | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Position> | null
    // 예전 형식({ chapter, sceneId })은 저장된 위치가 없는 것으로 본다.
    if (typeof value?.chapter !== 'number' || typeof value.verse !== 'number') return null
    return { chapter: value.chapter, verse: value.verse }
  } catch {
    return null
  }
}

export function loadPosition(): Position | null {
  try {
    return parsePosition(localStorage.getItem(key))
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
