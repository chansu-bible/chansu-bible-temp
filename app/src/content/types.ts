// audio: 사이트 루트 기준 절 낭독 파일 경로(예: content/audio/genesis-01-001.mp3). 없으면 null이다.
export type Verse = { verse: number; text: string; audio: string | null }

// 낱말 풀이. word는 그 절 본문에 그대로 나오는 표현이다.
export type Gloss = { verse: number; word: string; meaning: string }

export type HistoryNote = {
  text: string
  basis: string
  certainty: '확실' | '추정' | '견해 갈림'
  sources: string[]
}

export type ReviewStatus = 'none' | 'draft' | 'reviewed' | 'flagged' | 'approved'

export type Scene = {
  id: string
  verseStart: number
  verseEnd: number
  title: string
  commentary: string | null
  // 장면 해설 문단들. 비어 있으면 아직 준비되지 않은 것이다.
  explanation: string[]
  history: HistoryNote[]
  glossary: Gloss[]
  placeId: string | null
  // 그림 버전 id → 그림 경로. 그 버전에 그림이 없으면 키가 없다.
  images: Record<string, string>
  reviewStatus: ReviewStatus
}

export type Place = {
  id: string
  name: string
  description: string
  estimated: boolean
  lat: number | null
  lng: number | null
}

export type Chapter = { chapter: number; verses: Verse[]; scenes: Scene[] }

export type ImageVersion = { id: string; label: string; note: string }

export type Bundle = {
  book: string
  translation: string
  places: Place[]
  imageVersions: ImageVersion[]
  defaultImageVersion: string | null
  chapters: Chapter[]
}
