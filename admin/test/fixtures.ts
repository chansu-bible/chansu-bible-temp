import type { Canon, Era, Place, Scene, SceneFile, Source } from 'pipeline'

// 시험용 장면. 필요한 필드만 바꿔 쓴다.
export function scene(id: string, chapter: number, overrides: Partial<Scene> = {}): Scene {
  return {
    id,
    chapter,
    verseStart: 1,
    verseEnd: 1,
    title: `${id} 제목`,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    visual: { description: '', characters: [] },
    placeId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

export function withStatus(item: Scene, status: Scene['review']['status']): Scene {
  return { ...item, review: { ...item.review, status } }
}

export const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    { chapter: 1, verses: [1, 2, 3].map((verse) => ({ verse, text: `1장 ${verse}절` })) },
    { chapter: 2, verses: [1, 2].map((verse) => ({ verse, text: `2장 ${verse}절` })) },
  ],
}

export const sceneFiles: SceneFile[] = [
  {
    chapter: 1,
    scenes: [
      withStatus(scene('g1-s1', 1), 'draft'),
      withStatus(scene('g1-s2', 1), 'approved'),
      withStatus(scene('g1-s3', 1), 'flagged'),
    ],
  },
]

export const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
  location: { lat: 31.02, lng: 47.43, certainty: '추정' },
  design: { landscape: '평야', notes: '' },
}

export const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'draft',
  range: { from: '6:9', to: '8:22' },
  years: { from: 1656, to: 1657 },
  facts: { description: '홍수', present: ['방주'], absent: [], sources: ['6:14-16'] },
  design: { visualNotes: '' },
}

export function canon(overrides: Partial<Canon> = {}): Canon {
  return { characters: [], places: [eden], eras: [flood], things: [], proposals: [], ...overrides }
}
