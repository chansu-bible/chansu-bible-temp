import { describe, expect, it } from 'vitest'
import {
  ImageVersionSchema,
  IMAGE_VERSION_ID_PATTERN,
  REFERENCE_FILE_PATTERN,
  SceneFileSchema,
  StyleSchema,
} from '../src/schema.ts'

const scene = {
  id: 'genesis-01-01',
  chapter: 1,
  verseStart: 1,
  verseEnd: 2,
  title: '태초에',
  commentary: '성경의 첫 문장이에요.',
  explanation: [],
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

describe('StyleSchema', () => {
  const base = { description: '', promptPrefix: '앞말', promptRules: '규칙', referenceInstruction: '' }

  it('참고 이미지는 파일 이름·이름표·출처 객체다', () => {
    const style = StyleSchema.parse({ ...base, references: [{ file: 'brush-1.jpg', label: '붓질', source: '퍼블릭 도메인' }] })
    expect(style.references[0]).toEqual({ file: 'brush-1.jpg', label: '붓질', source: '퍼블릭 도메인' })
  })

  it('참고 이미지가 없으면 빈 목록이다', () => {
    expect(StyleSchema.parse(base).references).toEqual([])
  })

  it('문자열 참고 이미지나 이름 규칙에 맞지 않는 파일은 거부한다', () => {
    expect(() => StyleSchema.parse({ ...base, references: ['brush.jpg'] })).toThrow()
    for (const file of ['../brush.jpg', 'a/b.jpg', 'a\\b.jpg', 'brushjpg', 'Brush.jpg', 'brush.gif', '-brush.jpg']) {
      expect(() => StyleSchema.parse({ ...base, references: [{ file, label: '', source: '' }] })).toThrow()
    }
  })

  it('파일 이름 규칙', () => {
    expect(REFERENCE_FILE_PATTERN.test('sargent-olive-trees-sky.jpg')).toBe(true)
    expect(REFERENCE_FILE_PATTERN.test('a.webp')).toBe(true)
    expect(REFERENCE_FILE_PATTERN.test('a.jpeg')).toBe(true)
    expect(REFERENCE_FILE_PATTERN.test(`${'a'.repeat(80)}.png`)).toBe(true)
    expect(REFERENCE_FILE_PATTERN.test(`${'a'.repeat(81)}.png`)).toBe(false)
  })
})

describe('ImageVersionSchema', () => {
  it('기존 버전 id를 받아들인다', () => {
    expect(ImageVersionSchema.parse({ id: 'v1-flare', label: '1차', note: '' }).id).toBe('v1-flare')
    expect(IMAGE_VERSION_ID_PATTERN.test('v3-reference')).toBe(true)
  })

  it('하이픈으로 시작하거나 대문자가 있는 id, 빈 이름을 거부한다', () => {
    expect(() => ImageVersionSchema.parse({ id: '-v1', label: '1차', note: '' })).toThrow()
    expect(() => ImageVersionSchema.parse({ id: 'V1', label: '1차', note: '' })).toThrow()
    expect(() => ImageVersionSchema.parse({ id: 'v1', label: '', note: '' })).toThrow()
  })
})
