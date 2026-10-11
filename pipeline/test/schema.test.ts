import { describe, expect, it } from 'vitest'
import {
  CitationSchema,
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

  it('eraId가 없으면 null로 읽는다', () => {
    const file = SceneFileSchema.parse({ chapter: 1, scenes: [scene] })
    expect(file.scenes[0].eraId).toBeNull()
    const withEra = SceneFileSchema.parse({ chapter: 1, scenes: [{ ...scene, eraId: 'creation-week' }] })
    expect(withEra.scenes[0].eraId).toBe('creation-week')
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

describe('CitationSchema', () => {
  it('책이 붙은 표준 모양의 절 인용만 받는다', () => {
    for (const value of ['genesis 2:7', 'genesis 2:7-8', 'exodus 3:2', '1-samuel 3:4', 'psalms 119:105']) {
      expect(CitationSchema.safeParse(value).success).toBe(true)
    }
    // 책 없음, 앞뒤 공백, 앞에 0, 끝이 시작과 같은 범위, 그 책에 없는 장, 대문자 책 id, 두 칸 띄어쓰기
    for (const value of ['2:7', ' genesis 2:7 ', 'genesis 02:07', 'genesis 2:7-7', 'genesis 51:1', 'Genesis 2:7', 'genesis  2:7']) {
      expect(CitationSchema.safeParse(value).success).toBe(false)
    }
  })

  it('표준 모양이 아니면 책 장:절 모양이어야 한다고 알린다', () => {
    for (const value of [' genesis 2:7 ', 'genesis 02:07', 'genesis 2:7-7']) {
      expect(CitationSchema.safeParse(value).error?.issues[0]?.message).toBe('절 인용은 "책 장:절" 모양이어야 합니다(예: "genesis 2:7")')
    }
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

  it('영문 소문자로 시작하지 않는 id를 거부한다. 숫자로 시작하면 객체의 키 차례가 숫자순으로 바뀌기 때문이다', () => {
    // 정수로 읽히는 키는 객체에서 숫자순으로 앞에 온다. 장면의 images 키 차례가 그림 버전 목록 차례와 달라진다.
    expect(Object.keys({ v1: 0, 10: 0, 2: 0 })).toEqual(['2', '10', 'v1'])
    for (const id of ['2', '10', '0', '007', '4294967294', '2-sunburst', '1e3']) {
      expect(() => ImageVersionSchema.parse({ id, label: '버전', note: '' }), id).toThrow()
      expect(IMAGE_VERSION_ID_PATTERN.test(id), id).toBe(false)
    }
  })

  it('영문 소문자로 시작하는 id는 받고, 그 id를 키로 넣은 차례가 키 차례가 된다', () => {
    const ids = ['v10', 'v2', 'b', 'a1', 'v1-flare', 'z-9']
    for (const id of ids) expect(ImageVersionSchema.parse({ id, label: '버전', note: '' }).id).toBe(id)
    expect(Object.keys(Object.fromEntries(ids.map((id) => [id, 0])))).toEqual(ids)
  })
})
