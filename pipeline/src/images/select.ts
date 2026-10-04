import type { Scene } from '../schema.ts'

export type SelectOptions = { allowDraft: boolean; force: boolean; limit?: number }

// 글 검수를 통과한 장면만 그린다. 확인 필요(flagged) 장면은 사람이 고치기 전에는 그리지 않는다.
export function selectScenesToDraw(scenes: Scene[], options: SelectOptions): Scene[] {
  const selected = scenes.filter((scene) => {
    const status = scene.review.status
    const passed = status === 'reviewed' || status === 'approved' || (options.allowDraft && status === 'draft')
    return passed && (options.force || scene.image === null)
  })
  return options.limit === undefined ? selected : selected.slice(0, options.limit)
}
