import { describe, expect, it } from 'vitest'
import { SceneFileSchema } from '../src/schema.ts'

const scene = {
  id: 'genesis-01-01',
  chapter: 1,
  verseStart: 1,
  verseEnd: 2,
  title: '태초에',
  commentary: '성경의 첫 문장이에요.',
  background: { what: '무슨 일', who: '누가', where: '어디서' },
  history: [],
  glossary: [],
  visual: { description: '어두운 물', characters: [] },
  placeId: null,
  image: null,
  review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
}

describe('SceneFileSchema', () => {
  it('올바른 장면 파일을 받아들인다', () => {
    const file = SceneFileSchema.parse({ chapter: 1, scenes: [scene] })
    expect(file.scenes[0].id).toBe('genesis-01-01')
  })

  it('알 수 없는 검수 상태를 거부한다', () => {
    const bad = { ...scene, review: { ...scene.review, status: 'done' } }
    expect(() => SceneFileSchema.parse({ chapter: 1, scenes: [bad] })).toThrow()
  })

  it('역사 배경의 확실성 표시가 정해진 값이 아니면 거부한다', () => {
    const bad = { ...scene, history: [{ text: '내용', basis: '근거', certainty: '아마도', sources: [] }] }
    expect(() => SceneFileSchema.parse({ chapter: 1, scenes: [bad] })).toThrow()
  })
})
