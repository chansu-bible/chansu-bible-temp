import { describe, expect, it } from 'vitest'
import type { Bundle, Scene } from './types.ts'
import { widgetSnapshot } from './widget.ts'

const scene = (id: string, verseStart: number, verseEnd: number, title: string): Scene => ({
  id,
  verseStart,
  verseEnd,
  title,
  commentary: null,
  explanation: [],
  history: [],
  glossary: [],
  placeId: null,
  characters: [],
  images: { v1: `content/images/v1/${id}.jpg` },
  reviewStatus: 'none',
  audio: null,
  audioMs: null,
})

const bundle = {
  schemaVersion: 1,
  book: '창세기',
  translation: '개역한글',
  places: [],
  characters: [],
  eras: [],
  things: [],
  imageVersions: [{ id: 'v1', label: '기본', note: '' }],
  defaultImageVersion: 'v1',
  chapters: [
    {
      chapter: 4,
      verses: Array.from({ length: 16 }, (_, index) => ({ verse: index + 1, text: '', audio: null, audioMs: null })),
      scenes: [scene('genesis-04-01', 1, 12, '가인과 아벨'), scene('genesis-04-02', 13, 16, '가인의 표와 떠남')],
    },
  ],
} as unknown as Bundle

describe('widgetSnapshot', () => {
  it('저장된 읽기 위치의 장면과 연속 읽기 날수를 보인다', () => {
    expect(widgetSnapshot(bundle, { chapter: 4, verse: 14 }, ['2026-10-08', '2026-10-09'], '2026-10-09')).toEqual({
      sceneId: 'genesis-04-02',
      image: 'content/images/v1/genesis-04-02.jpg',
      kicker: '오늘의 장면 · 창세기 4장',
      title: '가인의 표와 떠남',
      detail: '4:13~16절 · 2일째 이어 읽는 중',
    })
  })

  it('읽은 날이 없으면 절 범위만 보이고, 위치가 없으면 첫 장면이다', () => {
    expect(widgetSnapshot(bundle, null, [], '2026-10-09')).toMatchObject({ sceneId: 'genesis-04-01', detail: '4:1~12절' })
  })
})
