// 관리 서버 API 계약의 타입. pipeline/src/schema.ts와 계획 문서의 "공통 계약"을 손으로 옮겼다.
// 화면 묶음에 Node 코드가 들어가지 않도록 pipeline을 불러오지 않는다(reader-core는 브라우저에서도 돈다).
import type { BookId } from 'reader-core'

export type { BookId }

// 저장 모양은 책 id가 붙은 "genesis 1:26", "genesis 2:7-8"이고, 화면에는 "창세기 1:26"으로 보인다.
export type Citation = string
export type ReviewState = 'draft' | 'approved' | 'rejected'
export type CanonKind = 'characters' | 'places' | 'eras' | 'things'
export const CANON_KINDS: CanonKind[] = ['characters', 'places', 'eras', 'things']

export type Character = {
  id: string
  name: string
  aliases: string[]
  status: ReviewState
  facts: {
    firstAppearance: Citation
    gender: '남' | '여' | '불명'
    years: { born: number | null; died: number | null }
    relations: { type: string; to: string }[]
    attire: { from: Citation; description: string }[]
    notes: string
    sources: Citation[]
  }
  design: { build: string; face: string; hair: string; skin: string; ageNotes: string; notes: string }
  refs: string[]
}

export type Place = {
  id: string
  name: string
  aliases: string[]
  status: ReviewState
  facts: { firstAppearance: Citation; description: string; sources: Citation[] }
  location: { lat: number | null; lng: number | null; certainty: '확실' | '추정' | '불명' }
  design: { landscape: string; notes: string }
}

export type Era = {
  id: string
  name: string
  status: ReviewState
  range: { from: Citation; to: Citation }
  years: { from: number | null; to: number | null }
  facts: { description: string; present: string[]; absent: string[]; sources: Citation[] }
  design: { visualNotes: string }
}

export type Thing = {
  id: string
  name: string
  aliases: string[]
  status: ReviewState
  facts: { description: string; details: string[]; sources: Citation[] }
  design: { visualNotes: string }
}

export type CanonEntryMap = { characters: Character; places: Place; eras: Era; things: Thing }
export type CanonEntry = Character | Place | Era | Thing

export type ProposalStatus = 'open' | 'applied' | 'dismissed'
export type Proposal = {
  id: string
  createdAt: string
  target: string // "characters/adam"
  field: string // 점 표기 경로
  value: unknown
  reason: string
  sources: Citation[]
  status: ProposalStatus
}

// 본문과 장면
export type Verse = { verse: number; text: string }
export type Gloss = { verse: number; word: string; meaning: string }
export type HistoryNote = { text: string; basis: string; certainty: '확실' | '추정' | '견해 갈림'; sources: string[] }
export type SceneReviewStatus = 'draft' | 'reviewed' | 'flagged' | 'approved'
export type Verdict = { verdict: 'pass' | 'fail'; issues: string[] }

export type Scene = {
  id: string
  chapter: number
  verseStart: number
  verseEnd: number
  title: string
  commentary: string | null
  explanation: string[]
  history: HistoryNote[]
  glossary: Gloss[]
  visual: { description: string; characters: string[]; shot?: string }
  placeId: string | null
  eraId: string | null
  image: string | null
  review: {
    status: SceneReviewStatus
    text: Verdict | null
    facts: Verdict | null
    image: Verdict | null
    attempts: number
  }
}

export type ImageVersion = { id: string; label: string; note: string }

// 원어 사전(content/original/lexicon.json). korean은 original-gloss 단계의 초안이나 사람이 승인한 뜻, 없으면 null
export type KoreanGlossStatus = 'draft' | 'approved'
export type KoreanGloss = { meaning: string; note: string; status: KoreanGlossStatus }
export type LexiconEntry = {
  strong: string // 스트롱 번호 "H7225"
  lemma: string // 히브리어 원형
  xlit: string // 음역
  pos: string // 스트롱 품사 부호 "n-f"
  definition: string // 영어 정의
  usage: string // KJV 번역어
  count: number // 원어를 받은 모든 책에 나오는 횟수
  korean: KoreanGloss | null
}
export type LexiconFile = { entries: LexiconEntry[] }
// PUT /api/lexicon/:strong 본문. meaning을 비우면 뜻을 지운다.
export type GlossInput = { meaning: string; note: string; status: KoreanGlossStatus }

// 이해 확인 퀴즈(content/quiz/<책 id>-NN.json). reviewed는 검수 모델 통과, flagged는 지적 있음,
// approved는 사람이 승인(앱에 나간다), rejected는 버린 것
export type QuizStatus = 'draft' | 'reviewed' | 'flagged' | 'approved' | 'rejected'
export type QuizQuestion = {
  id: string // "genesis-04-q1"
  question: string
  options: string[] // 넷
  answer: number // 정답 보기 번호 0~3
  explanation: string
  verse: number // 근거 절
  status: QuizStatus
  issues: string[] // 검수 지적(기록이라 저장해도 바뀌지 않는다)
}
// PUT /api/books/:book/quiz/:chapter/:id 본문
export type QuizEdit = Omit<QuizQuestion, 'id' | 'issues'>

// 화풍. 참고 파일 이름은 폴더 구분자 없이 영문 소문자·숫자·점·밑줄·하이픈(.jpg·.png·.webp).
export type StyleReference = { file: string; label: string; source: string }
export type Style = {
  description: string
  promptPrefix: string
  promptRules: string
  references: StyleReference[]
  referenceInstruction: string
}

// 관리 서버 응답

// GET /api/books: 본문 파일이 있는 책(성경 순서). chapters는 책의 장 수, sourceChapters는 본문에 든 장 수,
// sourceRange는 본문의 첫 장·끝 장(장이 없거나 읽지 못하면 null). 본문 파일을 읽지 못한 책은 error에 까닭(파일 이름)이 있다.
export type BookSummary = {
  id: BookId
  name: string
  chapters: number
  sourceChapters: number
  sourceRange: { from: number; to: number } | null
  error?: string
}

export type StateCounts = { draft: number; approved: number; rejected: number }

export type ChapterStatus = {
  chapter: number
  verses: number
  hasSceneFile: boolean
  scenes: { total: number; draft: number; reviewed: number; flagged: number; approved: number }
  images: Record<string, number> // 버전 id → 그림 있는 장면 수
  audio: { have: number; total: number }
}

// 설정집을 읽지 못하면(설정집이 깨졌거나, 설정집이 인용한 책의 본문을 읽지 못할 때) canon과 proposalsOpen은 null이고 canonError에 까닭이 있다.
export type StatusResponse = {
  chapters: ChapterStatus[]
  canon: Record<CanonKind, StateCounts> | null
  proposalsOpen: number | null
  canonError: string | null
  imageVersions: ImageVersion[]
}

// 설정집 항목을 쓰는 장면. 본문이 있는 모든 책에서 찾는다.
export type UsageResponse = { scenes: { book: BookId; chapter: number; id: string; title: string }[] }

export type ScenesResponse = {
  chapter: number
  verses: Verse[]
  scenes: Scene[] | null
  imageVersions: ImageVersion[]
  images: Record<string, Record<string, string>> // 장면 id → 버전 id → 파일 이름(있을 때만)
}

export type QuizResponse = { chapter: number; verses: Verse[]; questions: QuizQuestion[] }
export type QuizChapterSummary = {
  chapter: number
  hasFile: boolean
  total: number
  counts: Record<QuizStatus, number>
}

export type PromptResponse = { prompt: string; references: string[] }
export type StyleRefResponse = { style: Style; added: string }

export type Stage =
  | 'source'
  | 'canon'
  | 'scenario'
  | 'review-text'
  | 'images'
  | 'tts'
  | 'original'
  | 'original-gloss'
  | 'quiz'
  | 'build'
export const STAGES: Stage[] = [
  'source',
  'canon',
  'scenario',
  'review-text',
  'images',
  'tts',
  'original',
  'original-gloss',
  'quiz',
  'build',
]

export type JobOptions = {
  book?: BookId
  chapter?: number
  chapters?: string // source가 받을 장 범위("1-10", "3"). 없으면 책 전체
  scenes?: string[]
  force?: boolean
  allowDraft?: boolean
  dryRun?: boolean
  limit?: number
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: string
  stage: Stage
  options: JobOptions
  status: JobStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  lines: string[]
  error: string | null
}

export type Run = {
  at: string
  stage: string
  model: string
  chapter: number | null
  inputTokens: number
  outputTokens: number
  ms: number
  ok: boolean
  note: string
}

export type RunsResponse = {
  runs: Run[]
  totals: { inputTokens: number; outputTokens: number; estimatedUsd: number | null }
}

export type GitStatus = { branch: string; changes: { path: string; status: string }[] }
