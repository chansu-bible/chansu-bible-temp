// 화면에 보이는 한국어 이름
import type { CanonKind, JobStatus, ProposalStatus, ReviewState, SceneReviewStatus, Stage } from './types.ts'

export const KIND_LABEL: Record<CanonKind, string> = {
  characters: '인물',
  places: '장소',
  eras: '시대',
  things: '물건',
}

export type AnyStatus = ReviewState | SceneReviewStatus | JobStatus | ProposalStatus

export const STATUS_LABEL: Record<AnyStatus, string> = {
  draft: '초안',
  approved: '승인',
  rejected: '반려',
  reviewed: '검수 통과',
  flagged: '확인 필요',
  queued: '대기',
  running: '실행 중',
  done: '완료',
  failed: '실패',
  open: '열림',
  applied: '적용됨',
  dismissed: '버림',
}

export const STAGE_LABEL: Record<Stage, string> = {
  source: 'source · 본문 받기',
  canon: 'canon · 설정집 초안',
  images: 'images · 그림',
  tts: 'tts · 음성',
  build: 'build · 묶음 생성',
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
