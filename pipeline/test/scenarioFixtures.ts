// scenario·review-text 시험이 같이 쓰는 본문, 설정집, 화풍, 출력 장면
import type { ScenarioScene } from '../src/scenario/output.ts'
import type { Canon, Character, Era, Place, Source, SourceChapter, Style } from '../src/schema.ts'

export const chapter3: SourceChapter = {
  chapter: 3,
  verses: [
    { verse: 1, text: '여호와 하나님의 지으신 들짐승 중에 뱀이 가장 간교하더라' },
    { verse: 2, text: '여자가 뱀에게 말하되 동산 나무의 실과를 우리가 먹을 수 있으나' },
    { verse: 3, text: '동산 중앙에 있는 나무의 실과는 하나님의 말씀에 너희는 먹지도 말고' },
    { verse: 4, text: '뱀이 여자에게 이르되 너희가 결코 죽지 아니하리라' },
  ],
}

export const source: Source = { book: '창세기', translation: '개역한글', chapters: [chapter3] }

export const adam: Character = {
  id: 'adam',
  name: '아담',
  aliases: ['사람'],
  status: 'approved',
  facts: {
    firstAppearance: 'genesis 2:7',
    gender: '남',
    years: { born: 0, died: 930 },
    relations: [{ type: '유혹한 자', to: 'serpent' }],
    attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
    notes: '흙으로 지어졌다.',
    sources: ['genesis 2:7'],
  },
  design: { build: '', face: '', hair: '짧은 검은 곱슬머리', skin: '', ageNotes: '', notes: '' },
  refs: [],
}

export const serpentDraft: Character = {
  ...adam,
  id: 'serpent',
  name: '뱀',
  aliases: [],
  status: 'draft',
  facts: { ...adam.facts, relations: [], attire: [], notes: '간교하다.' },
  design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
}

export const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: 'genesis 2:8', description: '동산이 있던 땅', sources: ['genesis 2:8'] },
  location: { lat: null, lng: null, certainty: '불명' },
  design: { landscape: '', notes: '' },
}

export const edenEra: Era = {
  id: 'eden-era',
  name: '에덴',
  status: 'approved',
  range: { from: 'genesis 2:4', to: 'genesis 3:24' },
  years: { from: null, to: null },
  facts: { description: '동산 시절', present: ['동산과 네 강(2:8-14)'], absent: ['성읍'], sources: ['genesis 2:8'] },
  design: { visualNotes: '' },
}

export const canon: Canon = {
  characters: [adam, serpentDraft],
  places: [eden, { ...eden, id: 'nod', name: '놋', status: 'draft' }],
  eras: [edenEra],
  things: [],
  proposals: [],
}

// runScenario·runReviewText 시험이 임시 폴더에 쓰는 설정집. 설정집은 읽을 때 그 폴더 본문(3장 1~4절)의 절 수로
// 인용을 검증하므로 인용을 모두 본문 안의 절로 바꾼다. 이 시험들은 인용 글을 보지 않는다.
const inSource = 'genesis 3:1'
export const storedCanon: Canon = {
  ...canon,
  characters: canon.characters.map((item) => ({
    ...item,
    facts: {
      ...item.facts,
      firstAppearance: inSource,
      attire: item.facts.attire.map((attire) => ({ ...attire, from: inSource })),
      sources: [inSource],
    },
  })),
  places: canon.places.map((item) => ({ ...item, facts: { ...item.facts, firstAppearance: inSource, sources: [inSource] } })),
  eras: canon.eras.map((item) => ({ ...item, range: { from: inSource, to: inSource }, facts: { ...item.facts, sources: [inSource] } })),
}

export const style: Style = {
  description: '수채화',
  promptPrefix: 'Watercolor.',
  promptRules: 'Rules: God is never shown as a figure.',
  references: [],
  referenceInstruction: '',
}

// 출력 장면 하나. 필요한 필드만 바꿔 쓴다.
export function outScene(overrides: Partial<ScenarioScene> = {}): ScenarioScene {
  return {
    verseStart: 1,
    verseEnd: 4,
    title: '간교한 뱀',
    explanation: ['뱀이 여자에게 말을 걸어요.'],
    history: [],
    glossary: [{ verse: 1, word: '간교하더라', meaning: '간사하고 꾀가 많았다.' }],
    visual: { description: '동산의 나무 사이.', shot: '낮은 시점', characters: ['adam'] },
    placeId: 'eden',
    eraId: 'eden-era',
    ...overrides,
  }
}
