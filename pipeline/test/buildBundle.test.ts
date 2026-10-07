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

const places: Place[] = [
  {
    id: 'eden',
    name: '에덴',
    aliases: [],
    status: 'approved',
    facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
    location: { lat: 31, lng: 47, certainty: '추정' },
    design: { landscape: '', notes: '' },
  },
]

function scene(overrides: Partial<Scene>): Scene {
  return {
    id: 'genesis-01-01',
    chapter: 1,
    verseStart: 1,
    verseEnd: 3,
    title: '제목',
    commentary: '해설',
    explanation: [],
    history: [],
  glossary: [],
    visual: { description: '그림', characters: [] },
    placeId: null,
    eraId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

const textOf = (verses: { verse: number; text: string }[]) => verses.map(({ verse, text }) => ({ verse, text }))

describe('buildBundle', () => {
  it('묶음 형식 버전을 넣는다', () => {
    expect(buildBundle(source, [], places).schemaVersion).toBe(1)
  })

  it('설정집의 장소를 앱이 쓰는 장소 형식으로 바꿔 넣는다', () => {
    const sure: Place = { ...places[0], id: 'ararat', location: { lat: 39.7, lng: 44.3, certainty: '확실' } }
    expect(buildBundle(source, [], [...places, sure]).places).toEqual([
      { id: 'eden', name: '에덴', description: '동산', estimated: true, lat: 31, lng: 47 },
      { id: 'ararat', name: '에덴', description: '동산', estimated: false, lat: 39.7, lng: 44.3 },
    ])
  })

  it('그림 버전이 없으면 기본 버전도 없다', () => {
    const bundle = buildBundle(source, [], places)
    expect(bundle.imageVersions).toEqual([])
    expect(bundle.defaultImageVersion).toBeNull()
  })

  it('음성 파일이 있는 절에는 경로를 넣고 없는 절은 null로 둔다', () => {
    const bundle = buildBundle(source, [], places, new Set(['genesis-01-002.mp3']))
    expect(bundle.chapters[0].verses.map((verse) => verse.audio)).toEqual([
      null,
      'content/audio/genesis-01-002.mp3',
      null,
    ])
  })

  it('본문은 원본 그대로 들어간다', () => {
    const bundle = buildBundle(source, [], places)
    expect(textOf(bundle.chapters[0].verses)).toEqual(source.chapters[0].verses)
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
        explanation: [],
        history: [],
  glossary: [],
        placeId: null,
        images: {},
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
    const catalog = {
      versions: [
        { id: 'v1', label: '1차', note: '' },
        { id: 'v2', label: '2차', note: '' },
      ],
      files: { v1: ['genesis-01-01.png'], v2: ['genesis-01-01.jpg', 'genesis-01-02.jpg'] },
    }
    const bundle = buildBundle(source, [file], places, new Set(), catalog)
    const [first, second] = bundle.chapters[0].scenes
    expect(bundle.imageVersions.map((version) => version.id)).toEqual(['v1', 'v2'])
    expect(bundle.defaultImageVersion).toBe('v2')
    expect(first.images).toEqual({
      v1: 'content/images/v1/genesis-01-01.png',
      v2: 'content/images/v2/genesis-01-01.jpg',
    })
    expect(first.reviewStatus).toBe('draft')
    expect(first.placeId).toBe('eden')
    expect(first).not.toHaveProperty('visual')
    expect(second.images).toEqual({ v2: 'content/images/v2/genesis-01-02.jpg' })
  })

  it('낱말 풀이는 그대로 묶음에 들어간다', () => {
    const file = { chapter: 1, scenes: [scene({ glossary: [{ verse: 2, word: '나', meaning: '뜻' }] })] }
    expect(buildBundle(source, [file], places).chapters[0].scenes[0].glossary).toEqual([{ verse: 2, word: '나', meaning: '뜻' }])
  })

  it('풀이한 낱말이 그 절 본문에 없으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ glossary: [{ verse: 2, word: '없는말', meaning: '뜻' }] })] }
    expect(() => buildBundle(source, [file], places)).toThrow("genesis-01-01: 낱말 '없는말'이 1:2 본문에 없습니다")
  })

  it('풀이한 낱말의 절이 장면 범위 밖이면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2, glossary: [{ verse: 3, word: '다', meaning: '뜻' }] }), scene({ id: 'genesis-01-02', verseStart: 3, verseEnd: 3 })] }
    expect(() => buildBundle(source, [file], places)).toThrow("genesis-01-01: 낱말 '다'의 절(3)이 장면 범위 밖입니다")
  })

  it('절 범위가 맞지 않으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2 })] }
    expect(() => buildBundle(source, [file], places)).toThrow('1장 장면의 절 범위가 맞지 않습니다')
  })

  it('없는 장소를 가리키면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ placeId: 'nowhere' })] }
    expect(() => buildBundle(source, [file], places)).toThrow(
      'genesis-01-01: 장소 nowhere가 places.json의 승인된 항목에 없습니다',
    )
  })

  it('승인되지 않은 장소는 묶음에 넣지 않고, 장면이 가리키면 오류를 낸다', () => {
    const draft: Place = { ...places[0], id: 'nod', name: '놋', status: 'draft' }
    expect(buildBundle(source, [], [...places, draft]).places.map((place) => place.id)).toEqual(['eden'])
    const file = { chapter: 1, scenes: [scene({ placeId: 'nod' })] }
    expect(() => buildBundle(source, [file], [...places, draft])).toThrow('승인된 항목에 없습니다')
  })

  it('장면 파일이 있는 장도 본문은 원본 그대로 들어간다', () => {
    const file = { chapter: 1, scenes: [scene({})] }
    expect(textOf(buildBundle(source, [file], places).chapters[0].verses)).toEqual(source.chapters[0].verses)
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
