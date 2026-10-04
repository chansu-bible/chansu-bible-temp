// audio: 사이트 루트 기준 절 낭독 파일 경로(예: content/audio/genesis-01-001.mp3). 없으면 null이다.
export type Verse = { verse: number; text: string; audio: string | null }

export type Term = { word: string; meaning: string }

export type Background = { what: string; who: string; where: string; terms: Term[] }

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
  background: Background | null
  history: HistoryNote[]
  placeId: string | null
  image: string | null
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

export type Bundle = { book: string; translation: string; places: Place[]; chapters: Chapter[] }
