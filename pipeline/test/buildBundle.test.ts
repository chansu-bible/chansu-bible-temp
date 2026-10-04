import { describe, expect, it } from 'vitest'
import { buildBundle } from '../src/build/buildBundle.ts'
import type { Place, Scene, Source } from '../src/schema.ts'

const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    {
      chapter: 1,
      verses: [
        { verse: 1, text: '가' },
        { verse: 2, text: '나' },
        { verse: 3, text: '다' },
      ],
    },
    {
      chapter: 2,
      verses: [
        { verse: 1, text: '라' },
        { verse: 2, text: '마' },
      ],
    },
  ],
}

const places: Place[] = [{ id: 'eden', name: '에덴', description: '동산', estimated: true, lat: 31, lng: 47 }]

function scene(overrides: Partial<Scene>): Scene {
  return {
    id: 'genesis-01-01',
    chapter: 1,
    verseStart: 1,
    verseEnd: 3,
    title: '제목',
    commentary: '해설',
    background: { what: '무슨 일', who: '누가', where: '어디서', terms: [] },
    history: [],
    visual: { description: '그림', characters: [] },
    placeId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

describe('buildBundle', () => {
  it('본문은 원본 그대로 들어간다', () => {
    const bundle = buildBundle(source, [], places)
    expect(bundle.chapters[0].verses).toEqual(source.chapters[0].verses)
  })

  it('장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나를 만든다', () => {
    const bundle = buildBundle(source, [], places)
    expect(bundle.chapters[1].scenes).toEqual([
      {
        id: 'genesis-02-00',
        verseStart: 1,
        verseEnd: 2,
        title: '창세기 2장',
        commentary: null,
        background: null,
        history: [],
        placeId: null,
        image: null,
        reviewStatus: 'none',
      },
    ])
  })

  it('장면 파일이 있으면 장면을 옮기고 검수 상태와 그림 경로를 바꿔 넣는다', () => {
    const file = {
      chapter: 1,
      scenes: [
        scene({ verseEnd: 2, image: 'genesis-01-01.png', placeId: 'eden' }),
        scene({ id: 'genesis-01-02', verseStart: 3, verseEnd: 3 }),
      ],
    }
    const [first, second] = buildBundle(source, [file], places).chapters[0].scenes
    expect(first.image).toBe('content/images/genesis-01-01.png')
    expect(first.reviewStatus).toBe('draft')
    expect(first.placeId).toBe('eden')
    expect(first).not.toHaveProperty('visual')
    expect(second.image).toBeNull()
  })

  it('절 범위가 맞지 않으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2 })] }
    expect(() => buildBundle(source, [file], places)).toThrow('1장 장면의 절 범위가 맞지 않습니다')
  })

  it('없는 장소를 가리키면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ placeId: 'nowhere' })] }
    expect(() => buildBundle(source, [file], places)).toThrow('genesis-01-01: 장소 nowhere가 places.json에 없습니다')
  })

  it('장면 파일이 있는 장도 본문은 원본 그대로 들어간다', () => {
    const file = { chapter: 1, scenes: [scene({})] }
    expect(buildBundle(source, [file], places).chapters[0].verses).toEqual(source.chapters[0].verses)
  })

  it('같은 장의 장면 파일이 둘 이상이면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({})] }
    expect(() => buildBundle(source, [file, file], places)).toThrow('1장의 장면 파일이 둘 이상입니다')
  })

  it('본문에 없는 장의 장면 파일이면 오류를 낸다', () => {
    const file = { chapter: 5, scenes: [scene({ chapter: 5, id: 'genesis-05-01' })] }
    expect(() => buildBundle(source, [file], places)).toThrow('5장은 본문에 없습니다')
  })

  it('장면의 chapter가 파일의 chapter와 다르면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ chapter: 2 })] }
    expect(() => buildBundle(source, [file], places)).toThrow(
      'genesis-01-01: chapter가 2인데 1장 파일에 들어 있습니다',
    )
  })

  it('장면 id가 순서대로가 아니면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ id: 'genesis-01-02' })] }
    expect(() => buildBundle(source, [file], places)).toThrow('genesis-01-02: id가 genesis-01-01여야 합니다')
  })
})
