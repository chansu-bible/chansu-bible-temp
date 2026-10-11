import type { BookId } from './books.ts'

// audio: 묶음에서는 사이트 루트 기준 절 낭독 파일 경로(예: content/audio/genesis-01-001.mp3)이고, 없으면 null이다.
//   장 꾸러미(publish.ts)에서는 늘 null이다(앱은 장면 낭독을 재생한다). 그래서 audio !== null || audioMs != null이면 낭독된 절이다.
// audioMs: 낭독 길이(ms). 옛 묶음에는 없어서 불러올 때 null로 채운다.
export type Verse = { verse: number; text: string; audio: string | null; audioMs?: number | null }

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
  // 장면 낭독(장면에 든 절 낭독을 이은 파일)과 길이(ms). 음성이 없거나 옛 묶음이면 null이다(불러올 때 채운다).
  audio: string | null
  audioMs: number | null
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

// 설정집에서 검수된 물건(생명나무, 방주 등). sources는 본문 근거 절이다.
export type Thing = {
  id: string
  name: string
  aliases: string[]
  description: string
  details: string[]
  sources: string[]
}

export type Place = {
  id: string
  name: string
  description: string
  estimated: boolean
  lat: number | null
  lng: number | null
}

// 원어 보기: 절마다 히브리어 낱말. strong은 스트롱 번호(H7225), 접두사뿐인 낱말은 null. pos는 한국어 품사 이름
export type OriginalWord = { text: string; strong: string | null; morph: string; pos: string }
export type OriginalVerse = { verse: number; words: OriginalWord[] }

// 사전 항목. korean·note는 사람이 승인한 한국어 뜻이고, 아직 없으면 null이다. count는 이 묶음의 장에 나오는 횟수
export type LexiconEntry = { lemma: string; xlit: string; english: string; korean: string | null; note: string | null; count: number }

// 사람이 승인한 이해 확인 문제. answer는 정답 보기 번호(0~3), verse는 근거 절
export type QuizQuestion = { id: string; question: string; options: string[]; answer: number; explanation: string; verse: number }

// 자료 출처와 이용 조건
export type BundleSource = { id: string; title: string; detail: string; license: string; url: string | null }

// original은 원어 자료가 없는 장이면 null, quiz는 승인된 문제(없으면 빈 배열). 옛 묶음에는 없어서 불러올 때 채운다.
export type Chapter = { chapter: number; verses: Verse[]; scenes: Scene[]; original: OriginalVerse[] | null; quiz: QuizQuestion[] }

export type ImageVersion = { id: string; label: string; note: string }

export type Bundle = {
  // 묶음 형식 버전. 이 앱은 1만 읽는다. 형식은 docs/content-bundle.md에 있다.
  schemaVersion: number
  book: string
  // 책 id(books.ts). 옛 묶음에는 없어서 불러올 때 book(한국어 이름)으로 채운다.
  bookId: BookId
  translation: string
  places: Place[]
  // 옛 묶음에는 없어서 불러올 때 []로 채운다.
  characters: Character[]
  eras: Era[]
  // 옛 묶음에는 없어서 불러올 때 []로 채운다.
  things: Thing[]
  imageVersions: ImageVersion[]
  defaultImageVersion: string | null
  chapters: Chapter[]
  // 스트롱 번호 → 사전 항목(옛 묶음에는 없어서 불러올 때 {}로 채운다)
  lexicon: Record<string, LexiconEntry>
  // 자료 출처(옛 묶음에는 없어서 []로 채운다)
  sources: BundleSource[]
}
