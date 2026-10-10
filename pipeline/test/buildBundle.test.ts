import type { BookId } from 'reader-core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { buildBundle, sceneAudioParts } from '../src/build/buildBundle.ts'
import {
  BundleSchema,
  type Bundle,
  type Character,
  type Era,
  type Place,
  type Scene,
  type Source,
  type Thing,
} from '../src/schema.ts'

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

// 1장 1~7절만 있는 출애굽기 본문
const exodusSource: Source = {
  book: '출애굽기',
  translation: '개역한글',
  chapters: [{ chapter: 1, verses: Array.from({ length: 7 }, (_, index) => ({ verse: index + 1, text: '말' })) }],
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

function character(overrides: Partial<Character> & { id: string; name: string }): Character {
  return {
    aliases: [],
    status: 'approved',
    facts: {
      firstAppearance: '1:1',
      gender: '남',
      years: { born: null, died: null },
      relations: [],
      attire: [],
      notes: '',
      sources: ['1:1'],
    },
    design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    refs: [],
    ...overrides,
  }
}

function era(overrides: Partial<Era> & { id: string; name: string }): Era {
  return {
    status: 'approved',
    range: { from: '1:1', to: '1:3' },
    years: { from: 0, to: null },
    facts: { description: '설명', present: ['빛'], absent: ['비'], sources: ['1:1'] },
    design: { visualNotes: '' },
    ...overrides,
  }
}

function canonOf(placeList: Place[], characters: Character[] = [], eras: Era[] = [], things: Thing[] = []) {
  return { characters, places: placeList, eras, things }
}

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
    expect(buildBundle('genesis', source, [], canonOf(places)).schemaVersion).toBe(1)
  })

  it('설정집의 장소를 앱이 쓰는 장소 형식으로 바꿔 넣는다', () => {
    const sure: Place = { ...places[0], id: 'ararat', location: { lat: 39.7, lng: 44.3, certainty: '확실' } }
    expect(buildBundle('genesis', source, [], canonOf([...places, sure])).places).toEqual([
      { id: 'eden', name: '에덴', description: '동산', estimated: true, lat: 31, lng: 47 },
      { id: 'ararat', name: '에덴', description: '동산', estimated: false, lat: 39.7, lng: 44.3 },
    ])
  })

  it('그림 버전이 없으면 기본 버전도 없다', () => {
    const bundle = buildBundle('genesis', source, [], canonOf(places))
    expect(bundle.imageVersions).toEqual([])
    expect(bundle.defaultImageVersion).toBeNull()
  })

  it('음성 파일이 있는 절에는 경로를 넣고 없는 절은 null로 둔다', () => {
    const bundle = buildBundle('genesis', source, [], canonOf(places), new Set(['genesis-01-002.mp3']))
    expect(bundle.chapters[0].verses.map((verse) => verse.audio)).toEqual([
      null,
      'content/audio/genesis-01-002.mp3',
      null,
    ])
  })

  it('음성 길이를 알면 절에 audioMs를 넣고, 모르거나 음성이 없으면 null이다', () => {
    const audio = new Map<string, number | null>([
      ['genesis-01-001.mp3', 4210],
      ['genesis-01-002.mp3', null],
    ])
    const bundle = buildBundle('genesis', source, [], canonOf(places), audio)
    expect(bundle.chapters[0].verses.map((verse) => verse.audioMs)).toEqual([4210, null, null])
    expect(bundle.chapters[0].verses.map((verse) => verse.audio)).toEqual([
      'content/audio/genesis-01-001.mp3',
      'content/audio/genesis-01-002.mp3',
      null,
    ])
  })

  it('장면에 든 절 가운데 음성이 있는 절을 이어 장면 낭독으로 둔다(길이는 합)', () => {
    const audio = new Map<string, number | null>([
      ['genesis-01-001.mp3', 1000],
      ['genesis-01-003.mp3', 2500],
    ])
    const bundle = buildBundle('genesis', source, [{ chapter: 1, scenes: [scene({})] }], canonOf(places), audio)
    const built = bundle.chapters[0].scenes[0]
    expect(built.audio).toBe('content/audio/scenes/genesis-01-01.mp3')
    expect(built.audioMs).toBe(3500)
    expect(sceneAudioParts(built, bundle.chapters[0].verses)).toEqual([
      'content/audio/genesis-01-001.mp3',
      'content/audio/genesis-01-003.mp3',
    ])
  })

  it('음성이 하나도 없는 장면은 낭독이 null이고, 길이를 모르는 절이 있으면 길이만 null이다', () => {
    const none = buildBundle('genesis', source, [{ chapter: 1, scenes: [scene({})] }], canonOf(places))
    expect(none.chapters[0].scenes[0]).toMatchObject({ audio: null, audioMs: null })
    const unknown = buildBundle('genesis', source, [], canonOf(places), new Set(['genesis-02-001.mp3']))
    expect(unknown.chapters[1].scenes[0]).toMatchObject({ audio: 'content/audio/scenes/genesis-02-00.mp3', audioMs: null })
  })

  it('원어 낱말에 한국어 품사를 붙이고, 사전에는 나오는 번호만, 한국어 뜻은 승인된 것만 넣는다', () => {
    const original = {
      chapters: [
        {
          chapter: 1,
          verses: [
            {
              verse: 1,
              words: [
                { text: 'בְּרֵאשִׁית', strong: 'H7225', morph: 'HR/Ncfsa' },
                { text: 'בָּרָא', strong: 'H1254', morph: 'HVqp3ms' },
              ],
            },
          ],
        },
      ],
    }
    const base = { lemma: 'x', xlit: 'x', pos: 'n', definition: 'def', usage: 'use', count: 1 }
    const lexicon = {
      entries: [
        { ...base, strong: 'H7225', korean: { meaning: '처음', note: '', status: 'approved' as const } },
        { ...base, strong: 'H1254', korean: { meaning: '창조하다', note: '메모', status: 'draft' as const } },
        { ...base, strong: 'H9999', korean: null },
      ],
    }
    const bundle = buildBundle('genesis', source, [], canonOf(places), new Map(), undefined, { original, lexicon })
    expect(bundle.chapters[0].original?.[0]?.words.map((word) => word.pos)).toEqual(['전치사 + 명사', '동사(칼 완료)'])
    expect(bundle.chapters[1].original).toBeNull()
    expect(bundle.lexicon).toEqual({
      H7225: { lemma: 'x', xlit: 'x', english: 'def', korean: '처음', note: null, count: 1 },
      H1254: { lemma: 'x', xlit: 'x', english: 'def', korean: null, note: null, count: 1 },
    })
  })

  it('승인된 퀴즈만 넣고, 자료 출처는 그대로 넣는다', () => {
    const question = { question: '질문', options: ['가', '나', '다', '라'], answer: 1, explanation: '해설', verse: 2, issues: [] }
    const quizzes = [
      {
        chapter: 1,
        questions: [
          { ...question, id: 'genesis-01-q1', status: 'approved' as const },
          { ...question, id: 'genesis-01-q2', status: 'reviewed' as const },
        ],
      },
    ]
    const sources = [{ id: 'oshb', title: 'OSHB', detail: '형태', license: 'CC BY 4.0', url: null }]
    const bundle = buildBundle('genesis', source, [], canonOf(places), new Map(), undefined, { quizzes, sources })
    expect(bundle.chapters[0].quiz).toEqual([
      { id: 'genesis-01-q1', question: '질문', options: ['가', '나', '다', '라'], answer: 1, explanation: '해설', verse: 2 },
    ])
    expect(bundle.chapters[1].quiz).toEqual([])
    expect(bundle.sources).toEqual(sources)
  })

  it('승인된 물건만 앱 형식으로 넣는다', () => {
    const thing: Thing = {
      id: 'tree-of-life',
      name: '생명나무',
      aliases: [],
      status: 'approved',
      facts: { description: '동산 가운데 있는 나무', details: ['길이 지켜졌다'], sources: ['2:9', '3:24'] },
      design: { visualNotes: '' },
    }
    const draft: Thing = { ...thing, id: 'fig-leaves', name: '무화과나무 잎', status: 'draft' }
    expect(buildBundle('genesis', source, [], canonOf(places, [], [], [thing, draft])).things).toEqual([
      {
        id: 'tree-of-life',
        name: '생명나무',
        aliases: [],
        description: '동산 가운데 있는 나무',
        details: ['길이 지켜졌다'],
        sources: ['2:9', '3:24'],
      },
    ])
  })

  it('본문은 원본 그대로 들어간다', () => {
    const bundle = buildBundle('genesis', source, [], canonOf(places))
    expect(textOf(bundle.chapters[0].verses)).toEqual(source.chapters[0].verses)
  })

  it('장면 파일이 없는 장은 장 전체를 덮는 기본 장면 하나를 만든다', () => {
    const bundle = buildBundle('genesis', source, [], canonOf(places))
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
        characters: [],
        images: {},
        reviewStatus: 'none',
        audio: null,
        audioMs: null,
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
    const bundle = buildBundle('genesis', source, [file], canonOf(places), new Set(), catalog)
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
    expect(buildBundle('genesis', source, [file], canonOf(places)).chapters[0].scenes[0].glossary).toEqual([{ verse: 2, word: '나', meaning: '뜻' }])
  })

  it('풀이한 낱말이 그 절 본문에 없으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ glossary: [{ verse: 2, word: '없는말', meaning: '뜻' }] })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow("genesis-01-01: 낱말 '없는말'이 1:2 본문에 없습니다")
  })

  it('풀이한 낱말의 절이 장면 범위 밖이면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2, glossary: [{ verse: 3, word: '다', meaning: '뜻' }] }), scene({ id: 'genesis-01-02', verseStart: 3, verseEnd: 3 })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow("genesis-01-01: 낱말 '다'의 절(3)이 장면 범위 밖입니다")
  })

  it('절 범위가 맞지 않으면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ verseEnd: 2 })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow('1장 장면의 절 범위가 맞지 않습니다')
  })

  it('없는 장소를 가리키면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ placeId: 'nowhere' })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow(
      'genesis-01-01: 장소 nowhere가 places.json의 승인된 항목에 없습니다',
    )
  })

  it('승인되지 않은 장소는 묶음에 넣지 않고, 장면이 가리키면 오류를 낸다', () => {
    const draft: Place = { ...places[0], id: 'nod', name: '놋', status: 'draft' }
    expect(buildBundle('genesis', source, [], canonOf([...places, draft])).places.map((place) => place.id)).toEqual(['eden'])
    const file = { chapter: 1, scenes: [scene({ placeId: 'nod' })] }
    expect(() => buildBundle('genesis', source, [file], canonOf([...places, draft]))).toThrow('승인된 항목에 없습니다')
  })

  it('장면 파일이 있는 장도 본문은 원본 그대로 들어간다', () => {
    const file = { chapter: 1, scenes: [scene({})] }
    expect(textOf(buildBundle('genesis', source, [file], canonOf(places)).chapters[0].verses)).toEqual(source.chapters[0].verses)
  })

  it('같은 장의 장면 파일이 둘 이상이면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({})] }
    expect(() => buildBundle('genesis', source, [file, file], canonOf(places))).toThrow('1장의 장면 파일이 둘 이상입니다')
  })

  it('본문에 없는 장의 장면 파일이면 오류를 낸다', () => {
    const file = { chapter: 5, scenes: [scene({ chapter: 5, id: 'genesis-05-01' })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow('5장은 본문에 없습니다')
  })

  it('장면의 chapter가 파일의 chapter와 다르면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ chapter: 2 })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow(
      'genesis-01-01: chapter가 2인데 1장 파일에 들어 있습니다',
    )
  })

  it('승인된 인물만 앱이 쓰는 인물 형식으로 파일 순서대로 넣는다', () => {
    const adam = character({
      id: 'adam',
      name: '아담',
      aliases: ['사람'],
      facts: {
        firstAppearance: '2:19',
        gender: '남',
        years: { born: 0, died: 930 },
        relations: [{ type: '아내', to: 'eve' }],
        attire: [{ from: '3:21', description: '가죽옷' }],
        notes: '첫 문단\n둘째 문단',
        sources: ['2:7', '5:5'],
      },
    })
    const eve = character({ id: 'eve', name: '하와', facts: { ...adam.facts, gender: '여', relations: [], attire: [] } })
    const draft = character({ id: 'cain', name: '가인', status: 'draft' })
    const bundle = buildBundle('genesis', source, [], canonOf(places, [adam, draft, eve]))
    expect(bundle.characters.map((item) => item.id)).toEqual(['adam', 'eve'])
    expect(bundle.characters[0]).toEqual({
      id: 'adam',
      name: '아담',
      aliases: ['사람'],
      gender: '남',
      firstAppearance: '2:19',
      years: { born: 0, died: 930 },
      relations: [{ type: '아내', to: 'eve' }],
      attire: [{ from: '3:21', description: '가죽옷' }],
      notes: '첫 문단\n둘째 문단',
      sources: ['2:7', '5:5'],
    })
  })

  it('승인되지 않은 인물을 가리키는 관계는 뺀다', () => {
    const cain = character({ id: 'cain', name: '가인', status: 'draft' })
    const adam = character({
      id: 'adam',
      name: '아담',
      facts: { ...character({ id: 'x', name: 'x' }).facts, relations: [{ type: '아들', to: 'cain' }, { type: '아들', to: 'seth' }, { type: '아내', to: 'eve' }] },
    })
    const eve = character({ id: 'eve', name: '하와' })
    const bundle = buildBundle('genesis', source, [], canonOf(places, [adam, cain, eve]))
    expect(bundle.characters[0].relations).toEqual([{ type: '아내', to: 'eve' }])
  })

  it('승인된 시대만 앱이 쓰는 시대 형식으로 파일 순서대로 넣는다', () => {
    const creation = era({ id: 'creation', name: '창조' })
    const flood = era({ id: 'flood', name: '홍수', years: { from: 1656, to: 1657 }, range: { from: '1:1', to: '1:2' } })
    const draft = era({ id: 'later', name: '나중', status: 'draft' })
    const bundle = buildBundle('genesis', source, [], canonOf(places, [], [flood, draft, creation]))
    expect(bundle.eras).toEqual([
      {
        id: 'flood',
        name: '홍수',
        range: { from: '1:1', to: '1:2' },
        years: { from: 1656, to: 1657 },
        description: '설명',
        present: ['빛'],
        absent: ['비'],
      },
      {
        id: 'creation',
        name: '창조',
        range: { from: '1:1', to: '1:3' },
        years: { from: 0, to: null },
        description: '설명',
        present: ['빛'],
        absent: ['비'],
      },
    ])
  })

  it('설정집 인용("genesis 2:7")은 책 없는 인용("2:7")으로 넣는다', () => {
    const adam = character({
      id: 'adam',
      name: '아담',
      facts: {
        ...character({ id: 'x', name: 'x' }).facts,
        firstAppearance: 'genesis 2:7',
        attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
        sources: ['genesis 2:7', 'genesis 5:1-5'],
      },
    })
    const flood = era({ id: 'flood', name: '홍수', range: { from: 'genesis 6:9', to: 'genesis 8:22' } })
    const thing: Thing = {
      id: 'ark',
      name: '방주',
      aliases: [],
      status: 'approved',
      facts: { description: '잣나무 배', details: [], sources: ['genesis 6:14-16'] },
      design: { visualNotes: '' },
    }
    const bundle = buildBundle('genesis', source, [], canonOf(places, [adam], [flood], [thing]))
    expect(bundle.characters[0]).toMatchObject({
      firstAppearance: '2:7',
      attire: [{ from: '3:21', description: '가죽옷' }],
      sources: ['2:7', '5:1-5'],
    })
    expect(bundle.eras[0]?.range).toEqual({ from: '6:9', to: '8:22' })
    expect(bundle.things[0]?.sources).toEqual(['6:14-16'])
  })

  it('장면의 인물은 묶음에 있는 인물 id만 남긴다', () => {
    const adam = character({ id: 'adam', name: '아담' })
    const cain = character({ id: 'cain', name: '가인', status: 'draft' })
    const file = {
      chapter: 1,
      scenes: [scene({ visual: { description: '그림', characters: ['adam', 'cain', 'serpent'] } })],
    }
    expect(buildBundle('genesis', source, [file], canonOf(places, [adam, cain])).chapters[0].scenes[0].characters).toEqual(['adam'])
  })

  it('장면 id가 순서대로가 아니면 오류를 낸다', () => {
    const file = { chapter: 1, scenes: [scene({ id: 'genesis-01-02' })] }
    expect(() => buildBundle('genesis', source, [file], canonOf(places))).toThrow('genesis-01-02: id가 genesis-01-01여야 합니다')
  })
})

describe('책마다 묶음', () => {
  const facts = character({ id: 'x', name: 'x' }).facts
  const verses = (count: number) => Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: '말' }))
  // 시대의 끝을 맞출 본문: 창세기는 12:20, 출애굽기는 16:36에서 끝난다.
  const genesisTo12: Source = { ...source, chapters: [...source.chapters, { chapter: 12, verses: verses(20) }] }
  const exodusTo16: Source = { ...exodusSource, chapters: [...exodusSource.chapters, { chapter: 16, verses: verses(36) }] }
  // 두 책에 걸친 설정집. 아담과 에덴은 창세기에 처음 나오고 아담은 출애굽기에도 근거가 있다. 모세와 미디안은 출애굽기에 처음 나온다.
  // 족장 시대는 창세기에서 시작해 출애굽기에서 끝나고, 광야 시대는 출애굽기에서 시작해 민수기에서 끝난다.
  const eden: Place = { ...places[0]!, facts: { ...places[0]!.facts, firstAppearance: 'genesis 2:8', sources: ['genesis 2:8'] } }
  const midian: Place = {
    ...eden,
    id: 'midian',
    name: '미디안',
    facts: { firstAppearance: 'exodus 2:15', description: '광야', sources: ['exodus 2:15'] },
  }
  const adam = character({
    id: 'adam',
    name: '아담',
    facts: { ...facts, firstAppearance: 'genesis 2:7', sources: ['genesis 2:7', 'exodus 1:1'] },
  })
  const moses = character({ id: 'moses', name: '모세', facts: { ...facts, firstAppearance: 'exodus 2:10', sources: ['exodus 2:10'] } })
  const patriarchs = era({ id: 'patriarchs', name: '족장 시대', range: { from: 'genesis 12:1', to: 'exodus 1:7' } })
  const wilderness = era({ id: 'wilderness', name: '광야 시대', range: { from: 'exodus 16:1', to: 'numbers 14:45' } })
  const canonWithMoses = canonOf([eden, midian], [adam, moses], [patriarchs, wilderness])

  it('책 id를 넣고, 그 책까지 나온 설정집 항목을 넣는다(같은 책은 책 없이, 앞 책은 책 이름으로, 뒤 책은 뺀다)', () => {
    const genesis = buildBundle('genesis', genesisTo12, [], canonWithMoses)
    expect(genesis.bookId).toBe('genesis')
    expect(Object.keys(genesis).slice(0, 3)).toEqual(['schemaVersion', 'bookId', 'book'])
    expect(genesis.characters.map((item) => item.id)).toEqual(['adam'])
    expect(genesis.characters[0]!.firstAppearance).toBe('2:7')
    expect(genesis.characters[0]!.sources).toEqual(['2:7'])
    expect(genesis.places.map((item) => item.id)).toEqual(['eden'])
    // 시대의 끝이 뒤 책이면 이 책 본문의 마지막 절로 둔다. 광야 시대는 뒤 책에서 시작해 넣지 않는다.
    expect(genesis.eras.map((item) => [item.id, item.range])).toEqual([['patriarchs', { from: '12:1', to: '12:20' }]])

    const exodus = buildBundle('exodus', exodusTo16, [], canonWithMoses)
    expect(exodus.bookId).toBe('exodus')
    expect(exodus.characters.map((item) => item.id)).toEqual(['adam', 'moses'])
    expect(exodus.characters[0]!.firstAppearance).toBe('창세기 2:7')
    expect(exodus.characters[0]!.sources).toEqual(['창세기 2:7', '1:1'])
    expect(exodus.characters[1]!.firstAppearance).toBe('2:10')
    // 앞 책의 장소도 들어간다. 묶음의 장소에는 인용이 없어서, 장소의 인용이 "창세기 2:8"이 되는 것은 canonForBook 시험이 본다.
    expect(exodus.places.map((item) => item.id)).toEqual(['eden', 'midian'])
    expect(exodus.eras.map((item) => [item.id, item.range])).toEqual([
      ['patriarchs', { from: '창세기 12:1', to: '1:7' }],
      ['wilderness', { from: '16:1', to: '16:36' }],
    ])
  })

  it('장면 파일이 없는 장의 대체 장면 id와 제목에 책을 쓴다', () => {
    const sourceWithChapter6: Source = { ...source, chapters: [...source.chapters, { chapter: 6, verses: [{ verse: 1, text: '바' }] }] }
    const bundle = buildBundle('genesis', sourceWithChapter6, [], canonOf(places))
    const fallback = bundle.chapters.find((chapter) => chapter.chapter === 6)!.scenes[0]!
    expect(fallback.id).toBe('genesis-06-00')
    expect(fallback.title).toBe('창세기 6장')

    const exodus = buildBundle('exodus', exodusSource, [], canonOf(places)).chapters[0]!.scenes[0]!
    expect(exodus.id).toBe('exodus-01-00')
    expect(exodus.title).toBe('출애굽기 1장')
  })

  it('본문의 책 이름이 그 책이 아니면 오류를 낸다', () => {
    expect(() => buildBundle('exodus', source, [], canonOf(places))).toThrow('본문의 책 이름(창세기)이 출애굽기가 아닙니다')
  })

  it('장면이 뒤 책에서 처음 나오는 장소를 가리키면 오류이고, 뒤 책 인물은 장면과 관계에서 뺀다', () => {
    // 뒤 책에서 처음 나오는 장소는 그 책 묶음에 없다. 없는 장소나 승인되지 않은 장소와 달리, 처음 나오는 곳을 밝혀 알린다.
    const placeFile = { chapter: 1, scenes: [scene({ placeId: 'midian' })] }
    expect(() => buildBundle('genesis', source, [placeFile], canonWithMoses)).toThrow(
      'genesis-01-01: 장소 midian는 출애굽기 2:15에서 처음 나와 창세기 묶음에 넣을 수 없습니다',
    )
    const descendant = character({ id: 'adam', name: '아담', facts: { ...adam.facts, relations: [{ type: '후손', to: 'moses' }] } })
    const file = { chapter: 1, scenes: [scene({ visual: { description: '그림', characters: ['adam', 'moses'] } })] }
    const genesis = buildBundle('genesis', source, [file], canonOf([eden], [descendant, moses]))
    expect(genesis.characters[0]!.relations).toEqual([])
    expect(genesis.chapters[0]!.scenes[0]!.characters).toEqual(['adam'])
    expect(buildBundle('exodus', exodusSource, [], canonOf([eden], [descendant, moses])).characters[0]!.relations).toEqual([
      { type: '후손', to: 'moses' },
    ])
  })

  it('뒤 책 장소라도 승인되지 않았거나 설정집에 없으면 승인된 항목에 없다고 알리고, 처음 나오는 책 묶음에서는 가리킬 수 있다', () => {
    // 승인되지 않았거나 설정집에 없는 장소는 어느 책에서 처음 나오든 승인된 항목에 없는 것이다.
    const placeFile = { chapter: 1, scenes: [scene({ placeId: 'midian' })] }
    const notApproved = 'genesis-01-01: 장소 midian가 places.json의 승인된 항목에 없습니다'
    const draft: Place = { ...midian, status: 'draft' }
    expect(() => buildBundle('genesis', source, [placeFile], canonOf([eden, draft]))).toThrow(notApproved)
    expect(() => buildBundle('genesis', source, [placeFile], canonOf([eden]))).toThrow(notApproved)
    const exodusFile = { chapter: 1, scenes: [scene({ id: 'exodus-01-01', verseEnd: 7, placeId: 'midian' })] }
    const exodus = buildBundle('exodus', exodusSource, [exodusFile], canonOf([eden, midian]))
    expect(exodus.chapters[0]!.scenes[0]!.placeId).toBe('midian')
  })

  it('묶음 스키마는 알 수 없는 bookId를 받지 않는다', () => {
    // 스키마의 bookId는 책 id 형(BookId)으로 읽힌다.
    expectTypeOf<Bundle['bookId']>().toEqualTypeOf<BookId>()
    const bundle = buildBundle('genesis', source, [], canonOf(places))
    expect(BundleSchema.parse(bundle).bookId).toBe('genesis')
    const result = BundleSchema.safeParse({ ...bundle, bookId: 'genesis-2' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ['bookId'], message: '알 수 없는 책 id입니다' })
  })

  it('본문에 장이 없으면 시대의 끝을 맞출 수 없어 어느 시대인지 적은 오류를 낸다', () => {
    // 본문 파일 형식(SourceSchema)은 빈 장 목록도 받으므로, 손으로 고친 본문 파일이면 일어날 수 있다.
    expect(() => buildBundle('genesis', { ...source, chapters: [] }, [], canonWithMoses)).toThrow(
      'eras/patriarchs range.to: 본문에 절이 없어 시대의 끝(exodus 1:7)을 이 책의 마지막 절로 둘 수 없습니다',
    )
  })

  it('사전의 횟수는 이 묶음의 원어에서 센다(lexicon.json의 count는 모든 책의 합이다)', () => {
    const word = { text: 'אֱלֹהִים', strong: 'H430', morph: 'HNcmpa' }
    const original = {
      chapters: [
        { chapter: 1, verses: [{ verse: 1, words: [word, word] }, { verse: 2, words: [word] }] },
        // 본문에 없는 장의 원어는 묶음에 들지 않으니 세지 않는다.
        { chapter: 3, verses: [{ verse: 1, words: [word] }] },
      ],
    }
    const lexicon = {
      entries: [{ strong: 'H430', lemma: 'אֱלֹהִים', xlit: 'ʼĕlôhîym', pos: 'n', definition: 'God', usage: '', count: 2600, korean: null }],
    }
    const bundle = buildBundle('genesis', source, [], canonOf(places), new Map(), undefined, { original, lexicon })
    expect(bundle.lexicon.H430?.count).toBe(3)
  })
})
