import { describe, expect, it } from 'vitest'
import { BOOKS, sceneIdOf, type BookId } from './books.ts'
import {
  canonPath,
  catalogChapters,
  catalogPath,
  isContentHash,
  isContentPath,
  isMediaExt,
  isPublished,
  lexiconPath,
  mediaKind,
  mediaPath,
  MEDIA_EXTENSIONS,
  packPath,
  validateCanonFile,
  validateCatalog,
  validateLexiconFile,
  validatePack,
  type CanonFile,
  type Catalog,
  type CatalogChapter,
  type ChapterPack,
  type FileRef,
  type LexiconFile,
} from './publish.ts'

const packHash = '3f9c2a1b7d0e'
const imageHash = '9a8b7c6d5e4f'
const audioHash = '0a1b2c3d4e5f'
const canonHash = 'a1b2c3d4e5f6'
const lexiconHash = '0f1e2d3c4b5a'

// 해시가 될 수 없는 글자들이다. 12자리 소문자 16진수가 아니다.
const badHashes = ['', '3f9c2a1b7d0', '3f9c2a1b7d0ee', '3F9C2A1B7D0E', '3f9c2a1b7d0g', '../3f9c2a1b7d', '3f9c2a1b7d0e\n', ' 3f9c2a1b7d0']

// 콘텐츠 뿌리 밖을 가리키거나 경로가 될 수 없는 이름들이다.
const unsafePaths = [
  '',
  '/packs/genesis/4.json',
  '/media/x.jpg',
  '../packs/genesis/4.json',
  '../../SQLite/db',
  '../../../x.mp3',
  'packs/../4.json',
  'packs/./4.json',
  'packs//4.json',
  'packs/genesis/',
  'packs\\genesis\\4.json',
  'media\\x.jpg',
  'C:/packs/4.json',
  'C:4.json',
  'https://example.com/4.json',
  'packs/genesis/4.json?x=1',
  'packs/genesis/4.json#top',
  'packs/genesis/%2e%2e/4.json',
  'packs/장/4.json',
  '.hidden.json',
  'packs/genesis/4.json\n',
]

// 오류 글을 받는다. 오류가 나지 않으면 시험이 실패한다.
function messageOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('오류가 나지 않았습니다')
}

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
    for (const ext of MEDIA_EXTENSIONS) {
      expect(mediaPath('genesis-01-01', imageHash, ext)).toBe(`media/genesis-01-01.${imageHash}.${ext}`)
    }
  })

  it('해시가 12자리 소문자 16진수가 아니면 오류를 던진다', () => {
    for (const hash of badHashes) {
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

describe('isContentHash와 isMediaExt', () => {
  it('12자리 소문자 16진수만 해시로 받는다', () => {
    for (const hash of [packHash, imageHash, audioHash, '000000000000', 'ffffffffffff']) {
      expect(isContentHash(hash), hash).toBe(true)
    }
    for (const hash of badHashes) expect(isContentHash(hash), JSON.stringify(hash)).toBe(false)
  })

  it('글자가 아닌 값은 해시로 받지 않는다', () => {
    for (const value of [123456789012, null, undefined, [packHash], { hash: packHash }]) {
      expect(isContentHash(value), String(value)).toBe(false)
    }
  })

  it('미디어 확장자는 jpg, jpeg, png, webp, mp3다', () => {
    expect(MEDIA_EXTENSIONS).toEqual(['jpg', 'jpeg', 'png', 'webp', 'mp3'])
    for (const ext of MEDIA_EXTENSIONS) expect(isMediaExt(ext), ext).toBe(true)
    for (const ext of ['', 'gif', 'JPG', 'Mp3', '.jpg', 'jpg ', 'json', '/../x']) {
      expect(isMediaExt(ext), JSON.stringify(ext)).toBe(false)
    }
  })
})

describe('isContentPath', () => {
  it('콘텐츠 뿌리 아래의 상대 경로를 받는다', () => {
    const files = [
      'catalog.json',
      'preview/catalog.json',
      'canon.a1b2c3d4e5f6.json',
      'preview/lexicon.0f1e2d3c4b5a.json',
      'packs/genesis/4.3f9c2a1b7d0e.json',
      'preview/packs/1-samuel/31.3f9c2a1b7d0e.json',
      'media/genesis-04-03.9a8b7c6d5e4f.jpg',
      'media/psalms-119-02.0a1b2c3d4e5f.mp3',
    ]
    for (const file of files) expect(isContentPath(file), file).toBe(true)
  })

  it('뿌리 밖을 가리키거나 경로가 될 수 없는 이름은 받지 않는다', () => {
    for (const file of unsafePaths) expect(isContentPath(file), JSON.stringify(file)).toBe(false)
  })

  it('글자가 아닌 값은 받지 않는다', () => {
    for (const value of [undefined, null, 4, true, {}, [], ['media/a.jpg']]) expect(isContentPath(value), String(value)).toBe(false)
  })
})

describe('canonPath, lexiconPath, catalogPath', () => {
  it('설정집, 사전, 목록은 콘텐츠 뿌리 바로 아래에 둔다', () => {
    expect(canonPath(canonHash)).toBe('canon.a1b2c3d4e5f6.json')
    expect(lexiconPath(lexiconHash)).toBe('lexicon.0f1e2d3c4b5a.json')
    expect(catalogPath()).toBe('catalog.json')
  })

  it('미리 보기 경로는 preview/ 아래다', () => {
    expect(canonPath(canonHash, true)).toBe('preview/canon.a1b2c3d4e5f6.json')
    expect(lexiconPath(lexiconHash, true)).toBe('preview/lexicon.0f1e2d3c4b5a.json')
    expect(catalogPath(true)).toBe('preview/catalog.json')
    expect(canonPath(canonHash, false)).toBe(canonPath(canonHash))
    expect(lexiconPath(lexiconHash, false)).toBe(lexiconPath(lexiconHash))
    expect(catalogPath(false)).toBe(catalogPath())
  })

  it('해시가 12자리 소문자 16진수가 아니면 오류를 던진다', () => {
    for (const hash of badHashes) {
      expect(() => canonPath(hash), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
      expect(() => canonPath(hash, true), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
      expect(() => lexiconPath(hash), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
      expect(() => lexiconPath(hash, true), JSON.stringify(hash)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
    }
    expect(() => canonPath(123456789012 as never)).toThrow('해시')
    expect(() => lexiconPath(undefined as never)).toThrow('해시')
  })

  it('만든 경로는 isContentPath를 통과한다', () => {
    for (const preview of [false, true]) {
      for (const path of [canonPath(canonHash, preview), lexiconPath(lexiconHash, preview), catalogPath(preview)]) {
        expect(isContentPath(path), path).toBe(true)
      }
    }
  })
})

describe('mediaKind', () => {
  it('.mp3는 낭독이고 그림 확장자는 그림이다', () => {
    expect(mediaKind('media/genesis-04-03.0a1b2c3d4e5f.mp3')).toBe('audio')
    expect(mediaKind('media/genesis-04-03.9a8b7c6d5e4f.jpg')).toBe('image')
    expect(mediaKind('media/genesis-04-03.9a8b7c6d5e4f.jpeg')).toBe('image')
    expect(mediaKind('media/genesis-04-03.9a8b7c6d5e4f.png')).toBe('image')
    expect(mediaKind('media/genesis-04-03.9a8b7c6d5e4f.webp')).toBe('image')
    expect(mediaKind('preview/media/genesis-04-03.9a8b7c6d5e4f.jpg')).toBe('image')
  })

  it('mediaPath가 만든 경로는 모든 확장자에서 종류가 맞다', () => {
    for (const ext of MEDIA_EXTENSIONS) {
      for (const preview of [false, true]) {
        const path = mediaPath('genesis-04-03', imageHash, ext, preview)
        expect(mediaKind(path), path).toBe(ext === 'mp3' ? 'audio' : 'image')
      }
    }
  })

  it('모르는 확장자이거나 확장자가 없으면 오류를 던진다', () => {
    const files = [
      '',
      'media/x.gif',
      'media/x.JPG',
      'media/x.json',
      'media/x',
      'jpg',
      'mp3',
      '.jpg',
      'media/.mp3',
      'media.jpg/x',
      'media/x.jpg/',
      'media/x.mp3?x=1',
      'media/x.mp3 ',
    ]
    for (const file of files) expect(() => mediaKind(file), JSON.stringify(file)).toThrow('미디어 파일의 종류를 알 수 없습니다')
  })

  it('긴 파일 이름은 오류 글에 40자까지만 넣는다', () => {
    expect(messageOf(() => mediaKind('x'.repeat(5000)))).toBe(`미디어 파일의 종류를 알 수 없습니다: "${'x'.repeat(40)}"…`)
    expect(messageOf(() => mediaKind('media/x.gif'))).toBe('미디어 파일의 종류를 알 수 없습니다: "media/x.gif"')
  })
})

function ref(file: string, size = 1000): FileRef {
  return { file, size }
}

// 목록의 모든 장에 든 media 파일 경로
function mediaFiles(value: Catalog): string[] {
  return Object.values(value.books).flatMap((chapters) => Object.values(chapters ?? {}).flatMap((item) => item.media.map((media) => media.file)))
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
      ['revision', 1e300],
      ['revision', Number.MAX_SAFE_INTEGER + 2],
      ['revision', Number.POSITIVE_INFINITY],
      ['translation', undefined],
      ['translation', 3],
      ['canon', undefined],
      ['canon', { file: 'canon.a1b2c3d4e5f6.json' }],
      ['canon', { file: 'canon.a1b2c3d4e5f6.json', size: 1e300 }],
      ['lexicon', { file: 'lexicon.0f1e2d3c4b5a.json', size: '120394' }],
      ['lexicon', { file: 'lexicon.0f1e2d3c4b5a.json', size: Number.MAX_SAFE_INTEGER + 2 }],
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
    // 안전한 정수의 끝까지는 받는다.
    expect(validateCatalog({ ...catalog(), revision: Number.MAX_SAFE_INTEGER })).toBeTruthy()
  })

  it('알 수 없는 책 키는 오류를 던진다', () => {
    expect(() => validateCatalog({ ...catalog(), books: { nope: {} } })).toThrow('공개 목록의 책을 알 수 없습니다: "nope"')
    expect(() => validateCatalog({ ...catalog(), books: { 창세기: {} } })).toThrow('공개 목록의 책을 알 수 없습니다')
    expect(() => validateCatalog({ ...catalog(), books: { samuel: {} } })).toThrow('공개 목록의 책을 알 수 없습니다')
    expect(() => validateCatalog({ ...catalog(), books: { constructor: {} } })).toThrow('공개 목록의 책을 알 수 없습니다: "constructor"')
    const proto = JSON.parse('{"__proto__": {}}') as unknown
    expect(() => validateCatalog({ ...catalog(), books: proto })).toThrow('공개 목록의 책을 알 수 없습니다: "__proto__"')
  })

  it('책 아래가 장 목록 객체가 아니면 책의 한국어 이름으로 오류를 던진다', () => {
    expect(() => validateCatalog({ ...catalog(), books: { genesis: [] } })).toThrow('공개 목록의 창세기 장 목록이 올바르지 않습니다')
    expect(() => validateCatalog({ ...catalog(), books: { genesis: null } })).toThrow('공개 목록의 창세기 장 목록이 올바르지 않습니다')
    expect(() => validateCatalog({ ...catalog(), books: { '1-samuel': 'list' } })).toThrow('공개 목록의 사무엘상 장 목록이 올바르지 않습니다')
    // 책 id를 필드 이름처럼 쓰지 않는다.
    expect(messageOf(() => validateCatalog({ ...catalog(), books: { genesis: [] } }))).not.toContain('genesis')
  })

  it('책에 없는 장 키는 오류를 던진다', () => {
    const entry = published('genesis', 4)
    expect(() => validateCatalog(withChapter(entry, '51'))).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: "51"')
    expect(() => validateCatalog(withChapter(entry, '0'))).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: "0"')
    expect(() => validateCatalog({ ...catalog(), books: { obadiah: { '2': entry } } })).toThrow('공개 목록의 오바댜 장 번호가 올바르지 않습니다: "2"')
    expect(() => validateCatalog({ ...catalog(), books: { psalms: { '151': entry } } })).toThrow('공개 목록의 시편 장 번호가 올바르지 않습니다: "151"')
    expect(validateCatalog({ ...catalog(), books: { psalms: { '150': entry } } })).toBeTruthy()
  })

  it('__proto__와 constructor는 장 키가 될 수 없다', () => {
    const entry = published('genesis', 4)
    const proto = JSON.parse(`{"__proto__": ${JSON.stringify(entry)}}`) as unknown
    expect(() => validateCatalog({ ...catalog(), books: { genesis: proto } })).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: "__proto__"')
    expect(() => validateCatalog(withChapter(entry, 'constructor'))).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: "constructor"')
    // 올바른 장과 함께 있어도 같다.
    const mixed = { ...catalog(), books: { genesis: { '4': entry, constructor: entry } } }
    expect(() => validateCatalog(mixed)).toThrow('공개 목록의 창세기 장 번호가 올바르지 않습니다: "constructor"')
  })

  it('오류 글에 넣는 키는 따옴표로 묶고 40자까지만 보인다', () => {
    const entry = published('genesis', 4)
    const long = 'x'.repeat(5000)
    const cut = `"${'x'.repeat(40)}"…`
    expect(messageOf(() => validateCatalog({ ...catalog(), books: { [long]: {} } }))).toBe(`공개 목록의 책을 알 수 없습니다: ${cut}`)
    expect(messageOf(() => validateCatalog(withChapter(entry, long)))).toBe(`공개 목록의 창세기 장 번호가 올바르지 않습니다: ${cut}`)
    // 한글도 글자 수로 센다. 40자까지는 자르지 않는다.
    const korean = '한'.repeat(41)
    expect(messageOf(() => validateCatalog(withChapter(entry, korean)))).toBe(`공개 목록의 창세기 장 번호가 올바르지 않습니다: "${'한'.repeat(40)}"…`)
    const exact = '9'.repeat(40)
    expect(messageOf(() => validateCatalog(withChapter(entry, exact)))).toBe(`공개 목록의 창세기 장 번호가 올바르지 않습니다: "${exact}"`)
    // 줄바꿈 같은 제어 문자는 이스케이프되어 한 줄로 보인다.
    const message = messageOf(() => validateCatalog({ ...catalog(), books: { 'a\nb\u0000': {} } }))
    expect(message).toBe('공개 목록의 책을 알 수 없습니다: "a\\nb\\u0000"')
    expect(message).not.toContain('\n')
  })

  it('오류 글에 넣는 키는 코드 포인트로 40자를 센다. 이모지가 가운데서 잘리지 않는다', () => {
    const unknownBook = (key: string) => messageOf(() => validateCatalog({ ...catalog(), books: { [key]: {} } }))
    const expected = (shown: string) => `공개 목록의 책을 알 수 없습니다: ${shown}`
    // 이모지가 40번째 글자이고 뒤에 글자가 더 있다. 이모지는 온전히 남기고 그 뒤를 자른다.
    const midway = unknownBook(`${'가'.repeat(39)}😀나`)
    expect(midway).toBe(expected(`"${'가'.repeat(39)}😀"…`))
    // 잘린 자리에 짝을 잃은 반쪽 글자(서로게이트)가 남지 않는다.
    expect(midway).not.toContain('\\ud83d')
    // 이모지가 마지막인 40번째 글자이면 자르지 않는다.
    expect(unknownBook(`${'가'.repeat(39)}😀`)).toBe(expected(`"${'가'.repeat(39)}😀"`))
    // 이모지만 40개는 그대로, 41개는 40개만 남긴다.
    expect(unknownBook('😀'.repeat(40))).toBe(expected(`"${'😀'.repeat(40)}"`))
    expect(unknownBook('😀'.repeat(41))).toBe(expected(`"${'😀'.repeat(40)}"…`))
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
    for (const revision of [undefined, -1, 1.5, '2', null, 1e300, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => validateCatalog(withChapter({ ...entry, revision })), String(revision)).toThrow(
        '공개 목록의 창세기 4장의 revision 값이 올바르지 않습니다',
      )
    }
    expect(validateCatalog(withChapter({ ...entry, revision: 0 }))).toBeTruthy()
    expect(validateCatalog(withChapter({ ...entry, revision: Number.MAX_SAFE_INTEGER }))).toBeTruthy()
  })

  it('pack.size가 0 이상의 안전한 정수가 아니면 오류를 던진다', () => {
    const entry = published('genesis', 4)
    const message = '공개 목록의 창세기 4장의 pack 값이 올바르지 않습니다'
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: '31877' } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: null } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: -1 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: 1.5 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: Number.NaN } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: Number.POSITIVE_INFINITY } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: 1e300 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: Number.MAX_SAFE_INTEGER + 2 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: { size: 100 } }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: entry.pack.file }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, pack: undefined }))).toThrow(message)
    expect(validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: 0 } }))).toBeTruthy()
    expect(validateCatalog(withChapter({ ...entry, pack: { file: entry.pack.file, size: Number.MAX_SAFE_INTEGER } }))).toBeTruthy()
  })

  it('media는 파일 정보의 배열이어야 한다', () => {
    const entry = published('genesis', 4)
    const message = '공개 목록의 창세기 4장의 media 값이 올바르지 않습니다'
    expect(() => validateCatalog(withChapter({ ...entry, media: undefined }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: entry.media[0] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [entry.media[0], { file: 'media/a.jpg' }] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [{ file: 'media/a.jpg', size: '10' }] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [ref('media/a.jpg', 1e300)] }))).toThrow(message)
    expect(() => validateCatalog(withChapter({ ...entry, media: [ref('media/a.jpg', Number.MAX_SAFE_INTEGER + 2)] }))).toThrow(message)
    expect(validateCatalog(withChapter({ ...entry, media: [] }))).toBeTruthy()
    expect(validateCatalog(withChapter({ ...entry, media: [ref('media/a.jpg', Number.MAX_SAFE_INTEGER)] }))).toBeTruthy()
  })

  it('media 파일의 확장자는 미디어 확장자여야 한다', () => {
    const entry = published('genesis', 4)
    const message = '공개 목록의 창세기 4장의 media 값이 올바르지 않습니다'
    // 경로 규칙은 지키지만 확장자가 미디어 확장자가 아니거나 없다.
    const noMedia = ['media/x.gif', 'media/x', 'mp3', 'media/x.json', 'media/x.JPG', 'media/x.mp3.json', packPath('genesis', 4, packHash)]
    for (const file of noMedia) {
      expect(isContentPath(file), file).toBe(true)
      expect(() => validateCatalog(withChapter({ ...entry, media: [ref(file)] })), file).toThrow(message)
      // 올바른 파일과 함께 있어도 같다.
      expect(() => validateCatalog(withChapter({ ...entry, media: [...entry.media, ref(file)] })), file).toThrow(message)
    }
    // 이름이 점으로 시작하는 .mp3는 경로 규칙에서도 걸린다.
    for (const file of ['.mp3', 'media/.mp3']) {
      expect(isContentPath(file), file).toBe(false)
      expect(() => validateCatalog(withChapter({ ...entry, media: [ref(file)] })), file).toThrow(message)
    }
    // 미디어 확장자는 모두 받고, 받은 목록의 media는 모두 종류를 알 수 있다.
    for (const ext of MEDIA_EXTENSIONS) {
      const files = mediaFiles(validateCatalog(withChapter({ ...entry, media: [ref(`media/x.${ext}`)] })))
      expect(files.map(mediaKind), ext).toEqual([ext === 'mp3' ? 'audio' : 'image'])
    }
    expect(new Set(mediaFiles(validateCatalog(catalog())).map(mediaKind))).toEqual(new Set(['image', 'audio']))
  })

  it('콘텐츠 뿌리 밖을 가리키거나 경로가 될 수 없는 파일 이름은 오류를 던진다', () => {
    const entry = published('genesis', 4)
    for (const file of unsafePaths) {
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
      { required: checks.required, optional: { ...checks.optional, quizApproved: Number.MAX_SAFE_INTEGER + 2 } },
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

describe('경로 도우미와 validateCatalog', () => {
  // 꾸러미 경로에서 책, 장 번호, 해시를 되읽는다. 앞의 preview/는 있어도 없어도 된다.
  const packPattern = /^(?:preview\/)?packs\/([^/]+)\/([1-9][0-9]*)\.([0-9a-f]{12})\.json$/

  it('66권의 모든 장의 꾸러미·그림 경로는 경로 규칙과 목록 검사를 통과하고, 그림 파일은 종류를 알 수 있다', () => {
    expect(BOOKS).toHaveLength(66)
    for (const preview of [false, true]) {
      const books: Catalog['books'] = {}
      const unsafe: string[] = []
      const misread: string[] = []
      let total = 0
      for (const book of BOOKS) {
        const chapters: Record<string, CatalogChapter> = {}
        for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
          const pack = packPath(book.id, chapter, packHash, preview)
          const image = mediaPath(sceneIdOf(book.id, chapter, 1), imageHash, 'jpg', preview)
          if (!isContentPath(pack) || !isContentPath(image)) unsafe.push(pack, image)
          const match = packPattern.exec(pack)
          if (match?.[1] !== book.id || Number(match[2]) !== chapter || match[3] !== packHash || pack.startsWith('preview/') !== preview) {
            misread.push(pack)
          }
          chapters[String(chapter)] = { revision: 1, pack: ref(pack), media: [ref(image)] }
          total += 1
        }
        books[book.id] = chapters
      }
      // 구약 929장과 신약 260장이다.
      expect(total).toBe(1189)
      expect(unsafe).toEqual([])
      expect(misread).toEqual([])
      const validated = validateCatalog({ ...catalog(), books })
      for (const book of BOOKS) {
        expect(catalogChapters(validated, book.id), book.id).toEqual(Array.from({ length: book.chapters }, (_, index) => index + 1))
      }
      // 목록의 media 파일은 모두 종류를 알 수 있다. 앱이 목록 전체에 mediaKind를 부른다.
      const files = mediaFiles(validated)
      expect(files).toHaveLength(total)
      expect(new Set(files.map(mediaKind))).toEqual(new Set(['image']))
    }
  })

  it('설정집·사전·목록의 경로도 경로 규칙을 통과하고 목록에 들어간다', () => {
    for (const preview of [false, true]) {
      const value = { ...catalog(), canon: ref(canonPath(canonHash, preview)), lexicon: ref(lexiconPath(lexiconHash, preview)) }
      expect(validateCatalog(value)).toBe(value)
      expect(isContentPath(catalogPath(preview))).toBe(true)
    }
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

// 첫 장면의 키 몇 개만 바꾼 꾸러미. 장면의 틀린 모양을 시험할 때 쓴다.
function withScene(changes: Record<string, unknown>): unknown {
  const value = pack()
  return { ...value, scenes: [{ ...value.scenes[0], ...changes }] }
}

// 절만 바꾼 꾸러미. 절의 틀린 모양을 시험할 때 쓴다.
function withVerses(verses: unknown[]): unknown {
  return { ...pack(), verses }
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

  it('절의 낭독(audio)은 키가 있고 null이어야 한다', () => {
    const text = '아담이 그 아내 하와와 동침하매'
    const message = '꾸러미 1절의 낭독은 null이어야 합니다'
    // 경로가 있으면 콘텐츠 뿌리 밖이든 묶음 모양의 안이든 받지 않는다.
    expect(() => validatePack(withVerses([{ verse: 1, text, audio: '../../../x.mp3' }]))).toThrow(message)
    expect(() => validatePack(withVerses([{ verse: 1, text, audio: 'content/audio/genesis-04-001.mp3' }]))).toThrow(message)
    expect(() => validatePack(withVerses([{ verse: 1, text, audio: mediaPath('genesis-04-01', audioHash, 'mp3'), audioMs: 1200 }]))).toThrow(message)
    // 키가 없거나 null이 아닌 값도 받지 않는다.
    expect(() => validatePack(withVerses([{ verse: 1, text }]))).toThrow(message)
    expect(() => validatePack(withVerses([{ verse: 1, text, audioMs: 1200 }]))).toThrow(message)
    for (const audio of [undefined, '', 0, false, {}, []]) {
      expect(() => validatePack(withVerses([{ verse: 1, text, audio }])), `audio=${String(audio)}`).toThrow(message)
    }
    // audio가 null이면 audioMs는 있어도 없어도 된다.
    const valid = { verse: 1, text, audio: null, audioMs: 1200 }
    expect(validatePack(withVerses([valid]))).toBeTruthy()
    expect(validatePack(withVerses([{ verse: 1, text, audio: null }]))).toBeTruthy()
    expect(validatePack(withVerses([valid, { verse: 2, text, audio: null, audioMs: null }]))).toBeTruthy()
  })

  it('절이 객체가 아니면 몇 번째 절인지 알린다', () => {
    const valid = { verse: 1, text: '아담이 그 아내 하와와 동침하매', audio: null, audioMs: 1200 }
    for (const bad of [null, undefined, [], 'verse', 4]) {
      expect(() => validatePack(withVerses([bad])), String(bad)).toThrow('꾸러미의 1번째 절이 비어 있습니다')
      expect(() => validatePack(withVerses([valid, bad])), String(bad)).toThrow('꾸러미의 2번째 절이 비어 있습니다')
    }
  })

  it('절 낭독 오류에는 절 번호를 넣고, 절 번호가 안전한 정수가 아니면 몇 번째 절인지를 넣는다', () => {
    const valid = { verse: 1, text: '아담이 그 아내 하와와 동침하매', audio: null, audioMs: 1200 }
    const bad = { text: '가인이 그 아우 아벨에게', audio: 'content/audio/genesis-04-008.mp3' }
    // 위치와 다른 절 번호는 절 번호로 쓴다.
    expect(() => validatePack(withVerses([{ ...bad, verse: 8 }]))).toThrow('꾸러미 8절의 낭독은 null이어야 합니다')
    expect(() => validatePack(withVerses([valid, { ...bad, verse: 8 }]))).toThrow('꾸러미 8절의 낭독은 null이어야 합니다')
    // 절 번호가 없거나 안전한 정수가 아니면 위치(1부터)를 쓴다. 네트워크에서 온 값을 글에 넣지 않는다.
    const notNumbers = [undefined, null, '8', 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2, {}, 'x'.repeat(5000)]
    for (const verse of notNumbers) {
      expect(messageOf(() => validatePack(withVerses([valid, { ...bad, verse }]))), String(verse).slice(0, 20)).toBe('꾸러미 2절의 낭독은 null이어야 합니다')
    }
    expect(messageOf(() => validatePack(withVerses([{ ...bad, verse: Number.MAX_SAFE_INTEGER }])))).toBe(
      `꾸러미 ${Number.MAX_SAFE_INTEGER}절의 낭독은 null이어야 합니다`,
    )
  })

  // 꾸러미의 절 낭독은 늘 null이라, 앱은 절의 낭독 길이로 그 절이 장면 낭독에 들었는지와 절 구간을 정한다(narration.ts의 sceneTrack).
  it('절의 낭독 길이(audioMs)는 없거나 null이거나 0 이상의 정수여야 한다', () => {
    const text = '아담이 그 아내 하와와 동침하매'
    for (const audioMs of [0, 1200, Number.MAX_SAFE_INTEGER, null, undefined]) {
      expect(validatePack(withVerses([{ verse: 1, text, audio: null, audioMs }])), String(audioMs)).toBeTruthy()
    }
    expect(validatePack(withVerses([{ verse: 1, text, audio: null }]))).toBeTruthy()
    const bad = [-1, 1.5, '1200', '', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, true, {}, [1200]]
    for (const audioMs of bad) {
      expect(() => validatePack(withVerses([{ verse: 1, text, audio: null, audioMs }])), String(audioMs)).toThrow(
        '꾸러미 1절의 낭독 길이가 올바르지 않습니다',
      )
    }
  })

  it('절 낭독 길이 오류에도 절 번호를 넣고, 절 번호가 안전한 정수가 아니면 몇 번째 절인지를 넣는다', () => {
    const valid = { verse: 1, text: '아담이 그 아내 하와와 동침하매', audio: null, audioMs: 1200 }
    const bad = { text: '가인이 그 아우 아벨에게', audio: null, audioMs: -5 }
    expect(messageOf(() => validatePack(withVerses([valid, { ...bad, verse: 8 }])))).toBe('꾸러미 8절의 낭독 길이가 올바르지 않습니다')
    for (const verse of [undefined, '8', 1.5, 'x'.repeat(5000)]) {
      expect(messageOf(() => validatePack(withVerses([valid, { ...bad, verse }]))), String(verse).slice(0, 20)).toBe(
        '꾸러미 2절의 낭독 길이가 올바르지 않습니다',
      )
    }
    // 낭독 경로와 길이가 모두 틀리면 낭독 경로를 먼저 알린다.
    expect(messageOf(() => validatePack(withVerses([{ ...bad, verse: 1, audio: 'content/audio/genesis-04-001.mp3' }])))).toBe(
      '꾸러미 1절의 낭독은 null이어야 합니다',
    )
  })

  it('장면의 낭독 길이(audioMs)도 없거나 null이거나 0 이상의 정수여야 한다', () => {
    for (const audioMs of [0, 1200, Number.MAX_SAFE_INTEGER, null, undefined]) {
      expect(validatePack(withScene({ audioMs })), String(audioMs)).toBeTruthy()
    }
    const bad = [-1, 1.5, '1200', Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, false, {}, [1200]]
    for (const audioMs of bad) {
      expect(() => validatePack(withScene({ audioMs })), String(audioMs)).toThrow('꾸러미 장면 "genesis-04-01"의 낭독 길이가 올바르지 않습니다')
    }
    // 장면 id가 글자가 아니면 몇 번째 장면인지 알린다.
    expect(() => validatePack(withScene({ id: 4, audioMs: -1 }))).toThrow('꾸러미의 1번째 장면의 낭독 길이가 올바르지 않습니다')
  })

  it('장면의 그림 경로가 콘텐츠 뿌리 밖을 가리키면 오류를 던진다', () => {
    const message = '꾸러미 장면 "genesis-04-01"의 그림 경로가 올바르지 않습니다'
    expect(() => validatePack(withScene({ images: { v1: '../../SQLite/db' } }))).toThrow(message)
    expect(() => validatePack(withScene({ images: { v1: '/data/user/0/app/db' } }))).toThrow(message)
    expect(() => validatePack(withScene({ images: { v1: 'media\\genesis-04-01.jpg' } }))).toThrow(message)
  })

  it('장면의 낭독 경로가 콘텐츠 뿌리 밖을 가리키면 오류를 던진다', () => {
    const message = '꾸러미 장면 "genesis-04-01"의 낭독 경로가 올바르지 않습니다'
    expect(() => validatePack(withScene({ audio: '../../../x.mp3' }))).toThrow(message)
    expect(() => validatePack(withScene({ audio: '/sdcard/x.mp3' }))).toThrow(message)
    expect(() => validatePack(withScene({ audio: 'media\\genesis-04-01.mp3' }))).toThrow(message)
  })

  it('경로 규칙에 어긋나는 이름은 그림과 낭독 어디서든 오류를 던진다', () => {
    for (const file of unsafePaths) {
      expect(() => validatePack(withScene({ images: { v1: file } })), JSON.stringify(file)).toThrow('그림 경로가 올바르지 않습니다')
      expect(() => validatePack(withScene({ audio: file })), JSON.stringify(file)).toThrow('낭독 경로가 올바르지 않습니다')
    }
  })

  it('그림 버전 가운데 하나만 틀려도 오류를 던진다', () => {
    const good = mediaPath('genesis-04-01', imageHash, 'jpg')
    expect(() => validatePack(withScene({ images: { v1: good, v2: '../v2.jpg' } }))).toThrow('그림 경로가 올바르지 않습니다')
    expect(() => validatePack(withScene({ images: { v1: good, v2: null } }))).toThrow('그림 경로가 올바르지 않습니다')
    expect(() => validatePack(withScene({ images: { v1: good, v2: 4 } }))).toThrow('그림 경로가 올바르지 않습니다')
  })

  it('올바른 media 경로는 받는다', () => {
    const image = mediaPath('genesis-04-03', imageHash, 'jpg')
    expect(image).toBe('media/genesis-04-03.9a8b7c6d5e4f.jpg')
    const images = { v1: image, v2: mediaPath('genesis-04-03', imageHash, 'png', true) }
    const value = withScene({ images, audio: mediaPath('genesis-04-03', audioHash, 'mp3') })
    expect(validatePack(value)).toBe(value)
    // 그림도 낭독도 없는 장면도 받는다.
    expect(validatePack(withScene({ images: {}, audio: null }))).toBeTruthy()
  })

  it('images가 객체가 아니거나 audio가 null도 경로도 아니면 오류를 던진다', () => {
    for (const images of [undefined, null, [], ['media/a.jpg'], 'media/a.jpg', 4]) {
      expect(() => validatePack(withScene({ images })), `images=${String(images)}`).toThrow('그림 경로가 올바르지 않습니다')
    }
    for (const audio of [undefined, '', 4, false, {}, ['media/a.mp3']]) {
      expect(() => validatePack(withScene({ audio })), `audio=${String(audio)}`).toThrow('낭독 경로가 올바르지 않습니다')
    }
  })

  it('그림 경로는 그림 확장자, 낭독 경로는 .mp3여야 한다', () => {
    const image = mediaPath('genesis-04-01', imageHash, 'jpg')
    const audio = mediaPath('genesis-04-01', audioHash, 'mp3')
    const imageMessage = '꾸러미 장면 "genesis-04-01"의 그림 경로가 올바르지 않습니다'
    const audioMessage = '꾸러미 장면 "genesis-04-01"의 낭독 경로가 올바르지 않습니다'
    // 그림 자리에 낭독 파일, 낭독 자리에 그림 파일
    expect(() => validatePack(withScene({ images: { v1: audio } }))).toThrow(imageMessage)
    expect(() => validatePack(withScene({ audio: image }))).toThrow(audioMessage)
    // 그림 버전 가운데 하나만 틀려도 같다.
    expect(() => validatePack(withScene({ images: { v1: image, v2: audio } }))).toThrow(imageMessage)
    // 경로 규칙은 지키지만 확장자가 없거나 미디어 확장자가 아니다.
    for (const file of ['media/x.gif', 'media/x', 'mp3', 'media/x.json', 'media/x.JPG']) {
      expect(() => validatePack(withScene({ images: { v1: file } })), file).toThrow(imageMessage)
      expect(() => validatePack(withScene({ audio: file })), file).toThrow(audioMessage)
    }
    // 그림 확장자는 모두 그림으로 받고, 낭독은 .mp3만 받는다.
    for (const ext of MEDIA_EXTENSIONS) {
      const file = mediaPath('genesis-04-01', imageHash, ext)
      if (ext === 'mp3') {
        expect(validatePack(withScene({ audio: file })), ext).toBeTruthy()
        expect(() => validatePack(withScene({ images: { v1: file } })), ext).toThrow(imageMessage)
      } else {
        expect(validatePack(withScene({ images: { v1: file } })), ext).toBeTruthy()
        expect(() => validatePack(withScene({ audio: file })), ext).toThrow(audioMessage)
      }
    }
  })

  it('장면이 객체가 아니면 오류를 던진다', () => {
    const scenes = pack().scenes
    for (const scene of [null, undefined, [], 'genesis-04-01', 4]) {
      expect(() => validatePack({ ...pack(), scenes: [...scenes, scene] }), String(scene)).toThrow('꾸러미의 2번째 장면이 비어 있습니다')
    }
  })

  it('장면 id가 글자가 아니면 몇 번째 장면인지 알린다', () => {
    expect(() => validatePack(withScene({ id: undefined, images: { v1: '../x.jpg' } }))).toThrow('꾸러미의 1번째 장면의 그림 경로가 올바르지 않습니다')
    expect(() => validatePack(withScene({ id: 4, audio: '../x.mp3' }))).toThrow('꾸러미의 1번째 장면의 낭독 경로가 올바르지 않습니다')
  })

  it('오류 글에 넣는 장면 id는 따옴표로 묶고 40자까지만 보인다', () => {
    const id = `genesis-04-${'x'.repeat(5000)}`
    const message = messageOf(() => validatePack(withScene({ id, audio: '../x.mp3' })))
    expect(message).toBe(`꾸러미 장면 "${'genesis-04-'.padEnd(40, 'x')}"…의 낭독 경로가 올바르지 않습니다`)
  })

  it('기대하는 책·장을 주면 꾸러미와 같아야 한다', () => {
    const value = pack()
    expect(validatePack(value, { book: 'genesis', chapter: 4 })).toBe(value)
    expect(() => validatePack(value, { book: 'genesis', chapter: 5 })).toThrow('꾸러미의 책·장(창세기 4장)이 목록(창세기 5장)과 다릅니다')
    expect(() => validatePack(value, { book: 'exodus', chapter: 4 })).toThrow('꾸러미의 책·장(창세기 4장)이 목록(출애굽기 4장)과 다릅니다')
    expect(() => validatePack(value, { book: 'psalms', chapter: 119 })).toThrow('꾸러미의 책·장(창세기 4장)이 목록(시편 119장)과 다릅니다')
    // 주지 않으면 견주지 않는다.
    expect(validatePack(value)).toBe(value)
    expect(validatePack(value, undefined)).toBe(value)
  })

  it('꾸러미 자체의 책·장이 틀리면 기대하는 책·장과 견주기 전에 그 오류를 알린다', () => {
    expect(() => validatePack({ ...pack(), chapter: 51 }, { book: 'genesis', chapter: 4 })).toThrow('꾸러미의 장 번호가 올바르지 않습니다: 창세기 51')
    expect(() => validatePack({ ...pack(), bookId: 'nope' }, { book: 'genesis', chapter: 4 })).toThrow('꾸러미의 책을 알 수 없습니다')
  })
})

function canonFile(): CanonFile {
  return {
    schemaVersion: 1,
    characters: [
      {
        id: 'adam',
        name: '아담',
        aliases: [],
        facts: {
          firstAppearance: 'genesis 2:7',
          gender: '남',
          years: { born: 0, died: null },
          relations: [],
          attire: [{ from: 'genesis 3:21', description: '가죽옷' }],
          notes: '',
          sources: ['genesis 2:7'],
        },
      },
    ],
    places: [
      {
        id: 'eden',
        name: '에덴',
        aliases: [],
        facts: { firstAppearance: 'genesis 2:8', description: '', sources: ['genesis 2:8'] },
        location: { lat: null, lng: null, certainty: '불명' },
      },
    ],
    eras: [],
    things: [],
  }
}

describe('validateCanonFile', () => {
  it('올바른 설정집은 그대로 준다', () => {
    const value = canonFile()
    expect(validateCanonFile(value)).toBe(value)
  })

  it('JSON으로 쓰고 읽은 설정집도 받는다', () => {
    const value = JSON.parse(JSON.stringify(canonFile())) as unknown
    expect(validateCanonFile(value)).toEqual(canonFile())
  })

  it('항목이 하나도 없는 설정집도 받는다', () => {
    const value = { schemaVersion: 1, characters: [], places: [], eras: [], things: [] }
    expect(validateCanonFile(value)).toBe(value)
  })

  it('schemaVersion이 1이 아니면 오류를 던진다', () => {
    expect(() => validateCanonFile({ ...canonFile(), schemaVersion: 2 })).toThrow('공용 설정집 형식이 다릅니다 (schemaVersion 2)')
    expect(() => validateCanonFile({ ...canonFile(), schemaVersion: '1' })).toThrow('공용 설정집 형식이 다릅니다')
    expect(() => validateCanonFile({ ...canonFile(), schemaVersion: undefined })).toThrow('공용 설정집 형식이 다릅니다 (schemaVersion undefined)')
  })

  it('객체가 아니면 오류를 던진다', () => {
    for (const value of [null, undefined, [], 'canon', 3]) {
      expect(() => validateCanonFile(value), String(value)).toThrow('공용 설정집이 비어 있습니다')
    }
  })

  it('인물, 장소, 시대, 물건이 배열이 아니면 오류를 던진다', () => {
    for (const key of ['characters', 'places', 'eras', 'things']) {
      for (const bad of [undefined, null, {}, 'list', 3]) {
        expect(() => validateCanonFile({ ...canonFile(), [key]: bad }), `${key}=${String(bad)}`).toThrow(`공용 설정집의 ${key} 값이 올바르지 않습니다`)
      }
    }
  })

  it('맨 위만 본다. 안의 항목과 모르는 키는 보지 않는다', () => {
    const value = { ...canonFile(), characters: [null, 1, 'adam'], places: [{}], futureKey: { a: 1 } }
    expect(validateCanonFile(value)).toBe(value)
  })
})

function lexiconFile(): LexiconFile {
  return {
    schemaVersion: 1,
    entries: { H120: { lemma: 'אדם', xlit: 'adam', english: 'man', korean: '사람', note: null, count: 5 } },
  }
}

describe('validateLexiconFile', () => {
  it('올바른 사전은 그대로 준다', () => {
    const value = lexiconFile()
    expect(validateLexiconFile(value)).toBe(value)
  })

  it('JSON으로 쓰고 읽은 사전도 받는다', () => {
    const value = JSON.parse(JSON.stringify(lexiconFile())) as unknown
    expect(validateLexiconFile(value)).toEqual(lexiconFile())
  })

  it('항목이 하나도 없는 사전도 받는다', () => {
    const value = { schemaVersion: 1, entries: {} }
    expect(validateLexiconFile(value)).toBe(value)
  })

  it('schemaVersion이 1이 아니면 오류를 던진다', () => {
    expect(() => validateLexiconFile({ ...lexiconFile(), schemaVersion: 2 })).toThrow('공용 사전 형식이 다릅니다 (schemaVersion 2)')
    expect(() => validateLexiconFile({ ...lexiconFile(), schemaVersion: '1' })).toThrow('공용 사전 형식이 다릅니다')
    expect(() => validateLexiconFile({ ...lexiconFile(), schemaVersion: undefined })).toThrow('공용 사전 형식이 다릅니다 (schemaVersion undefined)')
  })

  it('객체가 아니면 오류를 던진다', () => {
    for (const value of [null, undefined, [], 'lexicon', 3]) {
      expect(() => validateLexiconFile(value), String(value)).toThrow('공용 사전이 비어 있습니다')
    }
  })

  it('entries가 객체가 아니거나 배열이면 오류를 던진다', () => {
    for (const bad of [undefined, null, [], [['H120', {}]], 'entries', 3]) {
      expect(() => validateLexiconFile({ ...lexiconFile(), entries: bad }), `entries=${String(bad)}`).toThrow('공용 사전의 entries 값이 올바르지 않습니다')
    }
  })

  it('맨 위만 본다. 안의 항목과 모르는 키는 보지 않는다', () => {
    const value = { schemaVersion: 1, entries: { H120: 'man', H121: null }, futureKey: true }
    expect(validateLexiconFile(value)).toBe(value)
  })
})

describe('네트워크에서 온 값을 오류 글에 넣는 방법', () => {
  // 네 가지 파일이 모두 같은 schemaVersion 검사를 쓴다.
  const validators: [string, (value: unknown) => unknown, () => object][] = [
    ['공개 목록', validateCatalog, catalog],
    ['꾸러미', validatePack, pack],
    ['공용 설정집', validateCanonFile, canonFile],
    ['공용 사전', validateLexiconFile, lexiconFile],
  ]

  it('toString이 글자인 객체를 schemaVersion에 넣어도 영어 TypeError 대신 형식 오류를 던진다', () => {
    // String()에 넘기면 TypeError(Cannot convert object to primitive value)가 난다.
    expect(() => String({ toString: 'x' })).toThrow(TypeError)
    for (const [where, validate, make] of validators) {
      const message = messageOf(() => validate({ ...make(), schemaVersion: { toString: 'x' } }))
      expect(message, where).toBe(`${where} 형식이 다릅니다 (schemaVersion object)`)
    }
  })

  it('schemaVersion은 글자면 따옴표로 묶고 40자까지만, 수·참거짓·null·undefined는 그대로, 나머지는 형 이름으로 쓴다', () => {
    const cases: [unknown, string][] = [
      [2, '2'],
      [0, '0'],
      [1.5, '1.5'],
      [Number.NaN, 'NaN'],
      [true, 'true'],
      [null, 'null'],
      [undefined, 'undefined'],
      ['1', '"1"'],
      ['a\nb', '"a\\nb"'],
      ['x'.repeat(5000), `"${'x'.repeat(40)}"…`],
      [{}, 'object'],
      [[], 'object'],
      [{ toString: 'x' }, 'object'],
      [Object.create(null), 'object'],
      [() => 1, 'function'],
      [10n, 'bigint'],
      [Symbol('s'), 'symbol'],
    ]
    for (const [bad, text] of cases) {
      for (const [where, validate, make] of validators) {
        const message = messageOf(() => validate({ ...make(), schemaVersion: bad }))
        expect(message, `${where} ${typeof bad}`).toBe(`${where} 형식이 다릅니다 (schemaVersion ${text})`)
      }
    }
  })

  it('꾸러미의 장 번호도 같은 방법으로 알린다', () => {
    const cases: [unknown, string][] = [
      [51, '51'],
      [0, '0'],
      [4.5, '4.5'],
      ['4', '"4"'],
      [null, 'null'],
      [undefined, 'undefined'],
      [true, 'true'],
      ['x'.repeat(5000), `"${'x'.repeat(40)}"…`],
      [{ toString: 'x' }, 'object'],
      [[4], 'object'],
    ]
    for (const [bad, text] of cases) {
      const message = messageOf(() => validatePack({ ...pack(), chapter: bad }))
      expect(message, `chapter ${typeof bad}`).toBe(`꾸러미의 장 번호가 올바르지 않습니다: 창세기 ${text}`)
    }
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
