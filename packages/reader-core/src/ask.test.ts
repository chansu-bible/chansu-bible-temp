import { describe, expect, it } from 'vitest'
import { askSuggestions } from './ask.ts'
import type { Bundle, Chapter, Scene } from './types.ts'

const scene = (id: string, extra: Partial<Scene> = {}): Scene => ({
  id,
  verseStart: 1,
  verseEnd: 2,
  title: id,
  commentary: null,
  explanation: [],
  history: [],
  glossary: [],
  placeId: null,
  characters: [],
  images: {},
  reviewStatus: 'none',
  audio: null,
  audioMs: null,
  ...extra,
})

const chapter = (number: number, scenes: Scene[]): Chapter => ({ chapter: number, verses: [], scenes, original: null, quiz: [] })

describe('askSuggestions', () => {
  const bundle = {
    places: [{ id: 'nod', name: '놋', description: '', estimated: true, lat: null, lng: null }],
    characters: [
      { id: 'adam', name: '아담', firstAppearance: '2:7' },
      { id: 'cain', name: '가인', firstAppearance: '4:1' },
      { id: 'lamech', name: '라멕', firstAppearance: '4:18' },
    ],
    chapters: [
      chapter(4, [
        scene('s1', { glossary: [{ verse: 15, word: '칠 배', meaning: '일곱 배' }] }),
        scene('s2', { placeId: 'nod' }),
      ]),
      chapter(5, [scene('s3')]),
    ],
  } as unknown as Bundle

  it('그 장의 장소, 처음 나오는 인물, 풀이한 낱말로 질문을 제안한다', () => {
    expect(askSuggestions(bundle, 4)).toEqual(['놋은 어디예요?', '가인은 누구예요?', "'칠 배'는 무슨 뜻이에요?"])
  })

  it('거리가 없으면 그만큼 적게 제안하고, 없는 장이면 비운다', () => {
    expect(askSuggestions(bundle, 5)).toEqual([])
    expect(askSuggestions(bundle, 9)).toEqual([])
  })
})
