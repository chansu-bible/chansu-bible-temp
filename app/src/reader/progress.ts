import type { Scene } from '../content/types.ts'

const key = 'reader-read-scenes'

// 읽은 장면 id들. 장면의 마지막 절까지 오면 읽은 것으로 본다.
export function loadReadScenes(): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return new Set()
    return new Set(value.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function saveReadScenes(scenes: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...scenes]))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 진도 저장을 건너뛴다.
  }
}

// 장면을 읽음으로 적은 새 Set. 이미 읽었으면 같은 Set을 돌려주어 상태가 쓸데없이 바뀌지 않게 한다.
export function markRead(scenes: Set<string>, sceneId: string): Set<string> {
  if (scenes.has(sceneId)) return scenes
  return new Set([...scenes, sceneId])
}

export type ChapterProgress = { read: number; total: number; done: boolean }

export function chapterProgress(scenes: Scene[], readScenes: Set<string>): ChapterProgress {
  const read = scenes.filter((scene) => readScenes.has(scene.id)).length
  return { read, total: scenes.length, done: scenes.length > 0 && read === scenes.length }
}

export type SceneStatus = 'reading' | 'read' | 'unread'

// 지금 읽는 장면이면 읽었더라도 '읽는 중'이다.
export function sceneStatus(sceneId: string, currentSceneId: string, readScenes: Set<string>): SceneStatus {
  if (sceneId === currentSceneId) return 'reading'
  return readScenes.has(sceneId) ? 'read' : 'unread'
}
