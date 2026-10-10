// 화면에 보이는 한국어 이름
import { findBook } from 'reader-core'
import type { CanonKind, JobStatus, ProposalStatus, QuizStatus, ReviewState, SceneReviewStatus, Stage } from './types.ts'

// 책 id의 한국어 이름(genesis → 창세기). 모르는 id는 그대로 보인다.
export function bookName(id: string): string {
  return findBook(id)?.name ?? id
}

export const KIND_LABEL: Record<CanonKind, string> = {
  characters: '인물',
  places: '장소',
  eras: '시대',
  things: '물건',
}

// 한국어 뜻(draft·approved)과 퀴즈 문제(draft·reviewed·flagged·approved·rejected)도 같은 이름을 쓴다.
export type AnyStatus = ReviewState | SceneReviewStatus | JobStatus | ProposalStatus | QuizStatus

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
  scenario: 'scenario · 장면 쓰기',
  'review-text': 'review-text · 글 검수',
  images: 'images · 그림',
  tts: 'tts · 음성',
  original: 'original · 원어(OSHB·스트롱 사전) 받기',
  'original-gloss': 'original-gloss · 원어 낱말 한국어 뜻 초안',
  quiz: 'quiz · 이해 확인 퀴즈 쓰기·검수',
  build: 'build · 묶음 생성',
}

// force가 무엇을 다시 만드는지. 사람이 승인한 것을 남기는 단계만 적는다.
export const FORCE_HINT: Partial<Record<Stage, string>> = {
  'original-gloss': '초안이 있는 항목도 다시 써요. 승인한 뜻은 그대로 둬요',
  quiz: '퀴즈 파일이 있어도 다시 써요. 승인한 문제는 남겨요',
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
