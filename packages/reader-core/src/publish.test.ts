import { describe, expect, it } from 'vitest'
import { sceneIdOf, type BookId } from './books.ts'
import {
  catalogChapters,
  isPublished,
  mediaPath,
  packPath,
  validateCatalog,
  validatePack,
  type Catalog,
  type CatalogChapter,
  type ChapterPack,
  type FileRef,
} from './publish.ts'

const packHash = '3f9c2a1b7d0e'
const imageHash = '9a8b7c6d5e4f'
const audioHash = '0a1b2c3d4e5f'

describe('packPath와 mediaPath', () => {
  it('장 꾸러미 경로의 장 번호는 0을 채우지 않는다', () => {
    expect(packPath('genesis', 4, packHash)).toBe('packs/genesis/4.3f9c2a1b7d0e.json')
    expect(packPath('psalms', 1, packHash)).toBe('packs/psalms/1.3f9c2a1b7d0e.json')
    expect(packPath('psalms', 119, packHash)).toBe('packs/psalms/119.3f9c2a1b7d0e.json')
    expect(packPath('1-samuel', 31, packHash)).toBe('packs/1-samuel/31.3f9c2a1b7d0e.json')
    expect(packPath('obadiah', 1, packHash)).toBe('packs/obadiah/1.3f9c2a1b7d0e.json')
  })

  it('미리 보기 경로는 preview/ 아래다', () => {
    expect(packPath('genesis', 4, packHash, true)).toBe('preview/packs/genesis/4.3f9c2a1b7d0e.json')
    expect(packPath('psalms', 119, packHash, true)).toBe('preview/packs/psalms/119.3f9c2a1b7d0e.json')
    expect(mediaPath('genesis-04-03', imageHash, 'jpg', true)).toBe('preview/media/genesis-04-03.9a8b7c6d5e4f.jpg')
  })

  it('미디어 경로는 장면 id, 해시, 확장자로 이룬다', () => {
    expect(mediaPath('genesis-04-03', imageHash, 'jpg')).toBe('media/genesis-04-03.9a8b7c6d5e4f.jpg')
    expect(mediaPath('psalms-119-02', audioHash, 'mp3')).toBe('media/psalms-119-02.0a1b2c3d4e5f.mp3')
    expect(mediaPath('1-samuel-01-02', imageHash, 'webp')).toBe('media/1-samuel-01-02.9a8b7c6d5e4f.webp')
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'mp3'] as const) {
      expect(mediaPath('genesis-01-01', imageHash, ext)).toBe(`media/genesis-01-01.${imageHash}.${ext}`)
    }
  })

  it('해시가 12자리 소문자 16진수가 아니면 오류를 던진다', () => {
    const bad = ['', '3f9c2a1b7d0', '3f9c2a1b7d0ee', '3F9C2A1B7D0E', '3f9c2a1b7d0g', '../3f9c2a1b7d', '3f9c2a1b7d0e\n', ' 3f9c2a1b7d0']
    for (const hash of bad) {
      expect(() => packPath('genesis', 4, hash), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
      expect(() => mediaPath('genesis-04-03', hash, 'jpg'), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
    }
    expect(() => packPath('genesis', 4, 123456789012 as never)).toThrow('해시')
  })

  it('책에 없는 장이거나 모르는 책이면 packPath가 오류를 던진다', () => {
    expect(() => packPath('genesis', 51, packHash)).toThrow('창세기에는 51장이 없습니다')
    expect(() => packPath('genesis', 0, packHash)).toThrow('창세기에는 0장이 없습니다')
    expect(() => packPath('genesis', 4.5, packHash)).toThrow('창세기에는 4.5장이 없습니다')
    expect(() => packPath('psalms', 151, packHash)).toThrow('시편에는 151장이 없습니다')
    expect(() => packPath('obadiah', 2, packHash)).toThrow('오바댜에는 2장이 없습니다')
    expect(() => packPath('nope' as never, 1, packHash)).toThrow('알 수 없는 책입니다: nope')
    expect(() => packPath('../genesis' as never, 1, packHash)).toThrow('알 수 없는 책입니다')
  })

  it('파일 이름 한 조각이 될 수 없는 장면 id와 모르는 확장자는 mediaPath가 오류를 던진다', () => {
    for (const id of ['', '../genesis-04-03', 'genesis/04-03', 'genesis-04-03.jpg', 'Genesis-04-03', 'genesis 04', '-genesis']) {
      expect(() => mediaPath(id, imageHash, 'jpg'), JSON.stringify(id)).toThrow('장면 id가 올바르지 않습니다')
    }
    expect(() => mediaPath('genesis-04-03', imageHash, 'gif' as never)).toThrow('미디어 확장자가 올바르지 않습니다: gif')
    expect(() => mediaPath('genesis-04-03', imageHash, 'JPG' as never)).toThrow('미디어 확장자')
    expect(() => mediaPath('genesis-04-03', imageHash, '/../x' as never)).toThrow('미디어 확장자')
  })
})

function ref(file: string, size = 1000): FileRef {
  return { file, size }
}

// 공개된 장: 꾸러미 하나와 첫 장면의 그림, 낭독이 딸린다.
function published(book: BookId, chapter: number): CatalogChapter {
  const scene = sceneIdOf(book, chapter, 1)
  return {
    revision: 2,
    pack: ref(packPath(book, chapter, packHash), 31877),
    media: [ref(mediaPath(scene, imageHash, 'jpg'), 158204), ref(mediaPath(scene, audioHash, 'mp3'), 90211)],
  }
}

// 미리 보기 장: 판은 0이고 점검 결과가 붙는다.
function previewed(book: BookId, chapter: number): CatalogChapter {
  return {
    revision: 0,
    pack: ref(packPath(book, chapter, packHash, true), 20112),
    media: [ref(mediaPath(sceneIdOf(book, chapter, 1), imageHash, 'jpg', true), 150000)],
    preview: true,
    checks: {
      required: { scenesApproved: false, imagesComplete: true, audioComplete: true },
      optional: { quizApproved: 3, glossesApproved: 10, glossesTotal: 24 },
    },
  }
}

// 공개된 장 넷(창세기 둘, 사무엘상, 시편)과 미리 보기 장 하나
function catalog(): Catalog {
  return {
    schemaVersion: 1,
    revision: 5,
    translation: '개역한글',
    canon: ref('canon.a1b2c3d4e5f6.json', 48211),
    lexicon: ref('lexicon.0f1e2d3c4b5a.json', 120394),
    imageVersions: [{ id: 'v1-flare', label: '플레어', note: '' }],
    defaultImageVersion: 'v1-flare',
    sources: [{ id: 'krv-genesis', title: '개역한글판', detail: '창세기', license: '공개', url: null }],
    books: {
      genesis: { '1': published('genesis', 1), '4': published('genesis', 4), '5': previewed('genesis', 5) },
      '1-samuel': { '3': published('1-samuel', 3) },
      psalms: { '119': published('psalms', 119) },
    },
  }
}

// 창세기 4장만 바꾼 목록. 장 항목의 틀린 모양을 시험할 때 쓴다.
function withChapter(chapter: unknown, key = '4'): unknown {
  return { ...catalog(), books: { genesis: { [key]: chapter } } }
}

describe('validateCatalog', () => {
  it('올바른 목록은 그대로 준다', () => {
    const value = catalog()
    expect(validateCatalog(value)).toBe(value)
  })

  it('JSON으로 쓰고 읽은 목록도 받는다', () => {
    const value = JSON.parse(JSON.stringify(catalog())) as unknown
    expect(validateCatalog(value)).toEqual(catalog())
  })

  it('공개된 장이 없는 목록과 그림 버전이 없는 목록도 받는다', () => {
    const empty = { ...catalog(), books: {} }
    expect(validateCatalog(empty)).toBe(empty)
    const noImages = { ...catalog(), imageVersions: [], defaultImageVersion: null, sources: [], books: { genesis: {} } }
    expect(validateCatalog(noImages)).toBe(noImages)
  })

  it('schemaVersion이 1이 아니면 오류를 던진다', () => {
    expect(() => validateCatalog({ ...catalog(), schemaVersion: 2 })).toThrow('공개 목록 형식이 다릅니다 (schemaVersion 2)')
    expect(() => validateCatalog({ ...catalog(), schemaVersion: '1' })).toThrow('공개 목록 형식이 다릅니다')
    expect(() => validateCatalog({ ...catalog(), schemaVersion: undefined })).toThrow('공개 목록 형식이 다릅니다 (schemaVersion undefined)')
  })

  it('객체가 아니면 오류를 던진다', () => {
    for (const value of [null, undefined, [], 'catalog', 3]) {
      expect(() => validateCatalog(value), String(value)).toThrow('공개 목록이 비어 있습니다')
    }
  })

  it('꼭 있어야 하는 키가 없거나 형이 다르면 오류를 던진다', () => {
    const cases: [string, unknown][] = [
      ['revision', undefined],
      ['revision', -1],
      ['revision', 1.5],
      ['revision', '5'],
      ['translation', undefined],
      ['translation', 3],
      ['canon', undefined],
      ['canon', { file: 'canon.a1b2c3d4e5f6.json' }],
      ['lexicon', { file: 'lexicon.0f1e2d3c4b5a.json', size: '120394' }],
      ['imageVersions', undefined],
      ['imageVersions', {}],
      ['defaultImageVersion', undefined],
      ['defaultImageVersion', 1],
      ['sources', undefined],
      ['sources', 'none'],
      ['books', undefined],
      ['books', null],
      ['books', []],
    ]
    for (const [key, bad] of cases) {
      expect(() => validateCatalog({ ...catalog(), [key]: bad }), `${key}=${String(bad)}`).toThrow(`공개 목록의 ${key} 값이 올바르지 않습니다`)
    }
  })

  it('알 수 없는 책 키는 오류를 던진다', () => {
    expect(() => validateCatalog({ ...catalog(), books: { nope: {} } })).toThrow('공개 목록의 책을 알 수 없습니다: nope')
    expect(() => validateCatalog({ ...catalog(), books: { 창세기: {} } })).toThrow('공개 목록의 책을 알 수 없습니다')
    expect(() => validateCatalog({ ...catalog(), books: { samuel: {} } })).toThrow('공개 목록의 책을 알 수 없습니다')
    const proto = JSON.parse('{"__proto__": {}}') as unknown
    expect(() => validateCatalog({ ...catalog(), books: proto })).toThrow('공개 목록의 책을 알 수 없습니다: __proto__')
  })

  it('책 아래가 장 목록 객체가 아니면 오류를 던진다', () => {
    expect(() => validateCatalog({ ...catalog(), books: { genesis: [] } })).toThrow('공개 목록의 genesis 값이 올바르지 않습니다')
    expect(() => validateCatalog({ ...catalog(), books: { genesis: null } })).toThrow('공개 목록의 genesis 값이 올바르지 않습니다')
  })

  it('책에 없는 장 키는 오류를 던진다', () => {
    const entry = published('genesis', 4)
    expect(() => validateCatalog(withChapter(entry, '51'))).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: 51')
    expect(() => validateCatalog(withChapter(entry, '0'))).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: 0')
    expect(() => validateCatalog({ ...catalog(), books: { obadiah: { '2': entry } } })).toThrow('공개 목록의 오바댜 장 번호가 올바르지 않습니다: 2')
    expect(() => validateCatalog({ ...catalog(), books: { psalms: { '151': entry } } })).toThrow('공개 목록의 시편 장 번호가 올바르지 않습니다: 151')
    expect(validateCatalog({ ...catalog(), books: { psalms: { '150': entry } } })).toBeTruthy()
  })

  it('정수의 기본 표기가 아닌 장 키는 오류를 던진다', () => {
    const entry = published('genesis', 4)
    for (const key of ['04', '4.0', '+4', ' 4', '4 ', '1e0', '0x4', '-4', '', 'four', '٤']) {
      expect(() => validateCatalog(withChapter(entry, key)), JSON.stringify(key)).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다')
    }
  })

  it('장 항목이 객체가 아니면 오류를 던진다', () => {
    for (const chapter of [null, undefined, [], '4', 4]) {
      expect(() => validateCatalog(withChapter(chapter)), String(chapter)).toThrow('공개 목록의 창세기 4장의 정보가 비어 있습니다')
    }
  })

  it('장의 revision은 0 이상의 정수여야 한다', () => {
    const entry = published('genesis', 4)
    for (const revision of [undefined, -1, 1.5, '2', null]) {
      expect(() => validateCatalog(withChapter({ ...entry, revision })), String(revision)).toThrow(
        '공개 목록의 창세기 4장의 revision 값이 올바르지 않습니다',
      )
    }
    expect(validateCatalog(withChapter({ ...entry, revision: 0 }))).toBeTruthy()
  })

  it('pack.size가 숫자가 아니면 오류를 던진다', () => {
    const entry = published('genesis', 4)
    const message = '공개 목록의 창세기 4장의 pack 값이 올바르지 않습니다'
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: '31877' } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: null } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: -1 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: 1.5 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: Number.NaN } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { size: 100 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: entry.pack.file }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: undefined }))).toThrow(message)
    expect(validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: 0 } }))).toBeTruthy()
  })

  it('media는 파일 정보의 배열이어야 한다', () => {
    const entry = published('genesis', 4)
    const message = '공개 목록의 창세기 4장의 media 값이 올바르지 않습니다'
    expect(() => validateCatalog(withChapter({ ...entry, media: undefined }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: entry.media[0] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [entry.media[0], { file: 'media/a.jpg' }] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [{ file: 'media/a.jpg', size: '10' }] }))).toThrow(message)
    expect(validateCatalog(withChapter({ ...entry, media: [] }))).toBeTruthy()
  })

  it('콘텐츠 뿌리 밖을 가리키거나 경로가 될 수 없는 파일 이름은 오류를 던진다', () => {
    const entry = published('genesis', 4)
    const files = [
      '',
      '/packs/genesis/4.json',
      '../packs/genesis/4.json',
      'packs/../4.json',
      'packs/./4.json',
      'packs//4.json',
      'packs/genesis/',
      'packs\\genesis\\4.json',
      'C:/packs/4.json',
      'C:4.json',
      'https://example.com/4.json',
      'packs/genesis/4.json?x=1',
      'packs/genesis/4.json#top',
      'packs/genesis/%2e%2e/4.json',
      'packs/장/4.json',
      '.hidden.json',
    ]
    for (const file of files) {
      expect(() => validateCatalog(withChapter({ ...entry, pack: ref(file) })), JSON.stringify(file)).toThrow('pack 값이 올바르지 않습니다')
      expect(() => validateCatalog(withChapter({ ...entry, media: [ref(file)] })), JSON.stringify(file)).toThrow('media 값이 올바르지 않습니다')
    }
    expect(() => validateCatalog({ ...catalog(), canon: ref('../canon.a1b2c3d4e5f6.json') })).toThrow('공개 목록의 canon 값이 올바르지 않습니다')
    expect(() => validateCatalog({ ...catalog(), lexicon: ref('/lexicon.0f1e2d3c4b5a.json') })).toThrow('공개 목록의 lexicon 값이 올바르지 않습니다')
  })

  it('preview는 true만 받고 점검 결과는 모양이 맞아야 한다', () => {
    const entry = previewed('genesis', 4)
    expect(validateCatalog(withChapter(entry))).toBeTruthy()
    for (const preview of [false, 'true', 1, null]) {
      expect(() => validateCatalog(withChapter({ ...entry, preview })), String(preview)).toThrow('공개 목록의 창세기 4장의 preview 값이 올바르지 않습니다')
    }
    const checks = entry.checks!
    const badChecks: unknown[] = [
      null,
      [],
      {},
      { required: checks.required },
      { optional: checks.optional },
      { required: { ...checks.required, scenesApproved: 'yes' }, optional: checks.optional },
      { required: { scenesApproved: true, imagesComplete: true }, optional: checks.optional },
      { required: checks.required, optional: { ...checks.optional, quizApproved: -1 } },
      { required: checks.required, optional: { ...checks.optional, glossesTotal: '24' } },
      { required: checks.required, optional: { quizApproved: 3, glossesApproved: 10 } },
    ]
    for (const bad of badChecks) {
      expect(() => validateCatalog(withChapter({ ...entry, checks: bad })), JSON.stringify(bad)).toThrow(
        '공개 목록의 창세기 4장의 checks 값이 올바르지 않습니다',
      )
    }
    // 점검 결과가 없는 미리 보기 장과 공개된 장의 점검 결과도 받는다.
    const { checks: _checks, ...withoutChecks } = entry
    expect(validateCatalog(withChapter(withoutChecks))).toBeTruthy()
    expect(validateCatalog(withChapter({ ...published('genesis', 4), checks: entry.checks }))).toBeTruthy()
  })

  it('모르는 키는 무시한다', () => {
    const value = { ...catalog(), futureKey: { a: 1 }, books: { genesis: { '4': { ...published('genesis', 4), futureKey: true } } } }
    expect(validateCatalog(value)).toBe(value)
  })
})

function pack(): ChapterPack {
  return {
    schemaVersion: 1,
    bookId: 'genesis',
    chapter: 4,
    verses: [{ verse: 1, text: '아담이 그 아내 하와와 동침하매', audio: null, audioMs: 1200 }],
    scenes: [
      {
        id: 'genesis-04-01',
        verseStart: 1,
        verseEnd: 1,
        title: '가인과 아벨',
        commentary: null,
        explanation: [],
        history: [],
        glossary: [],
        placeId: null,
        characters: [],
        images: { 'v1-flare': mediaPath('genesis-04-01', imageHash, 'jpg') },
        reviewStatus: 'approved',
        audio: mediaPath('genesis-04-01', audioHash, 'mp3'),
        audioMs: 1200,
      },
    ],
    original: null,
    quiz: [],
  }
}

describe('validatePack', () => {
  it('올바른 꾸러미는 그대로 준다', () => {
    const value = pack()
    expect(validatePack(value)).toBe(value)
  })

  it('원어가 없으면 null, 있으면 배열을 받는다', () => {
    const withOriginal = { ...pack(), original: [{ verse: 1, words: [{ text: 'אדם', strong: 'H120', morph: 'HNcmsa', pos: '명사' }] }] }
    expect(validatePack(withOriginal)).toBe(withOriginal)
    expect(validatePack({ ...pack(), original: [] })).toBeTruthy()
    expect(validatePack({ ...pack(), original: null })).toBeTruthy()
  })

  it('JSON으로 쓰고 읽은 꾸러미도 받는다', () => {
    const value = JSON.parse(JSON.stringify(pack())) as unknown
    expect(validatePack(value)).toEqual(pack())
  })

  it('schemaVersion이 1이 아니면 오류를 던진다', () => {
    expect(() => validatePack({ ...pack(), schemaVersion: 2 })).toThrow('꾸러미 형식이 다릅니다 (schemaVersion 2)')
    expect(() => validatePack({ ...pack(), schemaVersion: undefined })).toThrow('꾸러미 형식이 다릅니다 (schemaVersion undefined)')
  })

  it('객체가 아니면 오류를 던진다', () => {
    for (const value of [null, undefined, [], 'pack', 4]) {
      expect(() => validatePack(value), String(value)).toThrow('꾸러미가 비어 있습니다')
    }
  })

  it('알 수 없는 책이면 오류를 던진다', () => {
    for (const bookId of ['nope', '창세기', '', undefined, null, 1]) {
      expect(() => validatePack({ ...pack(), bookId }), String(bookId)).toThrow('꾸러미의 책을 알 수 없습니다')
    }
  })

  it('책에 없는 장이면 오류를 던진다', () => {
    expect(() => validatePack({ ...pack(), chapter: 51 })).toThrow('꾸러미의 장 번호가 올바르지 않습니다: 창세기 51')
    expect(() => validatePack({ ...pack(), chapter: 0 })).toThrow('꾸러미의 장 번호가 올바르지 않습니다: 창세기 0')
    expect(() => validatePack({ ...pack(), chapter: 4.5 })).toThrow('꾸러미의 장 번호가 올바르지 않습니다')
    expect(() => validatePack({ ...pack(), chapter: '4' })).toThrow('꾸러미의 장 번호가 올바르지 않습니다')
    expect(() => validatePack({ ...pack(), chapter: undefined })).toThrow('꾸러미의 장 번호가 올바르지 않습니다')
    expect(() => validatePack({ ...pack(), bookId: 'obadiah', chapter: 2 })).toThrow('꾸러미의 장 번호가 올바르지 않습니다: 오바댜 2')
    expect(validatePack({ ...pack(), bookId: 'psalms', chapter: 119 })).toBeTruthy()
  })

  it('절, 장면, 퀴즈는 배열이어야 하고 원어는 배열이거나 null이어야 한다', () => {
    for (const key of ['verses', 'scenes', 'quiz', 'original']) {
      for (const bad of [undefined, {}, 'list']) {
        expect(() => validatePack({ ...pack(), [key]: bad }), `${key}=${String(bad)}`).toThrow(`꾸러미의 ${key} 값이 올바르지 않습니다`)
      }
    }
    for (const key of ['verses', 'scenes', 'quiz']) {
      expect(() => validatePack({ ...pack(), [key]: null }), key).toThrow(`꾸러미의 ${key} 값이 올바르지 않습니다`)
    }
    expect(validatePack({ ...pack(), verses: [], scenes: [], quiz: [] })).toBeTruthy()
  })
})

describe('catalogChapters', () => {
  it('그 책의 장을 번호순으로 준다. 미리 보기 장도 든다', () => {
    const value: Catalog = {
      ...catalog(),
      books: {
        psalms: {
          '119': published('psalms', 119),
          '9': published('psalms', 9),
          '10': previewed('psalms', 10),
          '100': published('psalms', 100),
          '2': published('psalms', 2),
        },
      },
    }
    expect(catalogChapters(value, 'psalms')).toEqual([2, 9, 10, 100, 119])
  })

  it('책마다 따로 센다', () => {
    const value = catalog()
    expect(catalogChapters(value, 'genesis')).toEqual([1, 4, 5])
    expect(catalogChapters(value, '1-samuel')).toEqual([3])
    expect(catalogChapters(value, 'psalms')).toEqual([119])
  })

  it('목록에 없는 책이나 장이 없는 책은 빈 배열이다', () => {
    expect(catalogChapters(catalog(), 'exodus')).toEqual([])
    expect(catalogChapters({ ...catalog(), books: {} }, 'genesis')).toEqual([])
    expect(catalogChapters({ ...catalog(), books: { genesis: {} } }, 'genesis')).toEqual([])
  })
})

describe('isPublished', () => {
  it('목록에 있는 공개된 장은 true다', () => {
    const value = catalog()
    expect(isPublished(value, 'genesis', 1)).toBe(true)
    expect(isPublished(value, 'genesis', 4)).toBe(true)
    expect(isPublished(value, '1-samuel', 3)).toBe(true)
    expect(isPublished(value, 'psalms', 119)).toBe(true)
  })

  it('미리 보기 장은 목록에 있어도 false다', () => {
    const value = catalog()
    expect(catalogChapters(value, 'genesis')).toContain(5)
    expect(isPublished(value, 'genesis', 5)).toBe(false)
  })

  it('목록에 없는 장이나 책은 false다', () => {
    const value = catalog()
    expect(isPublished(value, 'genesis', 2)).toBe(false)
    expect(isPublished(value, 'genesis', 4.5)).toBe(false)
    expect(isPublished(value, 'genesis', Number.NaN)).toBe(false)
    expect(isPublished(value, 'exodus', 1)).toBe(false)
    expect(isPublished({ ...value, books: {} }, 'genesis', 1)).toBe(false)
  })
})
