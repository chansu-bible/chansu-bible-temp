// 관리 서버 API 계약의 타입. pipeline/src/schema.ts와 계획 문서의 "공통 계약"을 손으로 옮겼다.
// 화면 묶음에 Node 코드가 들어가지 않도록 pipeline을 불러오지 않는다.

export type Citation = string // "1:26", "2:7-8"
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
export type StateCounts = { draft: number; approved: number; rejected: number }

export type ChapterStatus = {
  chapter: number
  verses: number
  hasSceneFile: boolean
  scenes: { total: number; draft: number; reviewed: number; flagged: number; approved: number }
  images: Record<string, number> // 버전 id → 그림 있는 장면 수
  audio: { have: number; total: number }
}

export type StatusResponse = {
  chapters: ChapterStatus[]
  canon: Record<CanonKind, StateCounts>
  proposalsOpen: number
  imageVersions: ImageVersion[]
}

export type UsageResponse = { scenes: { chapter: number; id: string; title: string }[] }

export type ScenesResponse = {
  chapter: number
  verses: Verse[]
  scenes: Scene[] | null
  imageVersions: ImageVersion[]
  images: Record<string, Record<string, string>> // 장면 id → 버전 id → 파일 이름(있을 때만)
}

export type PromptResponse = { prompt: string; references: string[] }
export type StyleRefResponse = { style: Style; added: string }

export type Stage = 'source' | 'canon' | 'scenario' | 'review-text' | 'images' | 'tts' | 'build'
export const STAGES: Stage[] = ['source', 'canon', 'scenario', 'review-text', 'images', 'tts', 'build']

export type JobOptions = {
  chapter?: number
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
