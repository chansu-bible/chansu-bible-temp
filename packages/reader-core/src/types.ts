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
  // 장면에 나오는 인물 id. 묶음의 characters에 있는 인물만 들어 있다. 옛 묶음에는 없어서 불러올 때 []로 채운다.
  characters: string[]
  // 그림 버전 id → 그림 경로. 그 버전에 그림이 없으면 키가 없다.
  images: Record<string, string>
  reviewStatus: ReviewStatus
}

// 설정집에서 검수된 인물. years는 창조 원년(0년) 기준 햇수다.
export type Character = {
  id: string
  name: string
  aliases: string[]
  gender: '남' | '여' | '불명'
  // 처음 나오는 절(예: "4:1")
  firstAppearance: string
  years: { born: number | null; died: number | null }
  // to는 묶음에 있는 인물 id만
  relations: { type: string; to: string }[]
  // from은 옷차림이 나오는 절(예: "3:21")
  attire: { from: string; description: string }[]
  // 줄바꿈(\n)으로 문단을 나눈다.
  notes: string
  // 본문 근거(예: "4:1-5")
  sources: string[]
}

// 설정집에서 검수된 시대. years는 창조 원년 기준이고 본문에 없으면 null이다.
export type Era = {
  id: string
  name: string
  range: { from: string; to: string }
  years: { from: number | null; to: number | null }
  description: string
  present: string[]
  absent: string[]
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
  // 묶음 형식 버전. 이 앱은 1만 읽는다. 형식은 docs/content-bundle.md에 있다.
  schemaVersion: number
  book: string
  translation: string
  places: Place[]
  // 옛 묶음에는 없어서 불러올 때 []로 채운다.
  characters: Character[]
  eras: Era[]
  imageVersions: ImageVersion[]
  defaultImageVersion: string | null
  chapters: Chapter[]
}
