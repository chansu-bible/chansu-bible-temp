// 작업 실행 폼 → JobOptions. 단계마다 쓰는 옵션만 보낸다(계획 문서의 "공통 계약").
import { splitIds } from './ids.ts'
import type { JobOptions, Stage } from './types.ts'

export type OptionKey = keyof JobOptions

export const STAGE_OPTIONS: Record<Stage, OptionKey[]> = {
  source: [],
  canon: ['chapter', 'dryRun'],
  images: ['chapter', 'scenes', 'force', 'allowDraft', 'dryRun', 'limit'],
  tts: ['chapter', 'force', 'limit', 'dryRun'],
  build: [],
}

// chapter를 쓰는 단계에서는 장 번호가 꼭 있어야 한다.
export function chapterRequired(stage: Stage): boolean {
  return STAGE_OPTIONS[stage].includes('chapter')
}

export type JobForm = {
  chapter: string
  scenes: string // 쉼표·공백·줄바꿈으로 구분한 장면 id
  force: boolean
  allowDraft: boolean
  dryRun: boolean
  limit: string
}

export const EMPTY_JOB_FORM: JobForm = { chapter: '1', scenes: '', force: false, allowDraft: false, dryRun: false, limit: '' }

export type BuildResult = { ok: true; options: JobOptions } | { ok: false; error: string }

export function buildJobOptions(stage: Stage, form: JobForm): BuildResult {
  const keys = STAGE_OPTIONS[stage]
  const options: JobOptions = {}

  if (keys.includes('chapter')) {
    const n = Number(form.chapter.trim())
    if (!form.chapter.trim() || !Number.isInteger(n) || n < 1) return { ok: false, error: '장 번호를 넣으세요' }
    options.chapter = n
  }
  if (keys.includes('scenes')) {
    const ids = splitIds(form.scenes)
    if (ids.length) options.scenes = ids
  }
  if (keys.includes('limit') && form.limit.trim()) {
    const n = Number(form.limit.trim())
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: '최대 개수는 1 이상의 정수여야 해요' }
    options.limit = n
  }
  if (keys.includes('force') && form.force) options.force = true
  if (keys.includes('allowDraft') && form.allowDraft) options.allowDraft = true
  if (keys.includes('dryRun') && form.dryRun) options.dryRun = true

  return { ok: true, options }
}

export function describeOptions(options: JobOptions): string {
  const parts: string[] = []
  if (options.chapter !== undefined) parts.push(`${options.chapter}장`)
  if (options.scenes?.length) parts.push(`장면 ${options.scenes.join(', ')}`)
  if (options.limit !== undefined) parts.push(`최대 ${options.limit}`)
  if (options.force) parts.push('다시 만들기')
  if (options.allowDraft) parts.push('초안 허용')
  if (options.dryRun) parts.push('미리 보기')
  return parts.join(' · ') || '—'
}
