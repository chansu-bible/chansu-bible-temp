import type { Scene } from '../schema.ts'

export type SelectOptions = { allowDraft: boolean; force: boolean; limit?: number; sceneIds?: string[] }

// 글 검수를 통과한 장면만 그린다. 확인 필요(flagged) 장면은 사람이 고치기 전에는 그리지 않는다.
// sceneIds로 장면을 지정하면 그 장면만 고르고, 이미 그림이 있어도 다시 그린다.
export function selectScenesToDraw(scenes: Scene[], options: SelectOptions): Scene[] {
  const only = options.sceneIds ? new Set(options.sceneIds) : null
  const selected = scenes.filter((scene) => {
    if (only && !only.has(scene.id)) return false
    const status = scene.review.status
    const passed = status === 'reviewed' || status === 'approved' || (options.allowDraft && status === 'draft')
    return passed && (options.force || only !== null || scene.image === null)
  })
  return options.limit === undefined ? selected : selected.slice(0, options.limit)
}
