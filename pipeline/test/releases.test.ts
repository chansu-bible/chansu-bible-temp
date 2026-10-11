import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isContentHash, type BookId } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publishDir, releasesFile, repoRoot } from '../src/paths.ts'
import { contentHash, jsonBytes } from '../src/release/hash.ts'
import { publishChapter, readReleases, withdrawChapter, writeReleases, type ReleaseParts, type Releases } from '../src/release/releases.ts'

const NOW = '2026-10-11T09:00:00.000Z'
const LATER = '2026-10-12T09:00:00.000Z'
const HASH_A = 'a1b2c3d4e5f6'
const HASH_B = '0f1e2d3c4b5a'
const HASH_C = '123456789abc'

const parts: ReleaseParts = { text: '111111111111', images: '222222222222', audio: '333333333333', quiz: '444444444444', original: '555555555555' }
const changedParts: ReleaseParts = { ...parts, images: '999999999999' }
const empty: Releases = { revision: 0, books: {} }
const entry = { revision: 1, publishedAt: NOW, hash: HASH_A, parts }

// 한 장을 공개한 다음의 상태만 돌려준다.
function publish(releases: Releases, book: BookId, chapter: number, hash: string, now = NOW): Releases {
  return publishChapter(releases, book, chapter, { hash, parts }, now).releases
}

describe('contentHash', () => {
  it('SHA-256의 앞 12자리를 소문자 16진수로 돌려준다', () => {
    expect(contentHash('abc')).toBe('ba7816bf8f01')
    expect(contentHash('')).toBe('e3b0c44298fc')
  })

  it('글자는 UTF-8 바이트로 해시해서, 같은 내용이면 글자로 주나 바이트로 주나 같다', () => {
    expect(contentHash('창세기')).toBe('cf4f6b77bbd2')
    expect(contentHash(Buffer.from('창세기', 'utf8'))).toBe('cf4f6b77bbd2')
    expect(contentHash(new TextEncoder().encode('창세기'))).toBe('cf4f6b77bbd2')
  })

  it('바이트를 해시하고, 큰 버퍼의 일부만 가리키는 뷰는 그 부분만 해시한다', () => {
    expect(contentHash(Uint8Array.from([0, 1, 2, 255]))).toBe('3d1f57c98497')
    expect(contentHash(Buffer.from('xxabcxx').subarray(2, 5))).toBe('ba7816bf8f01')
  })

  it('내용이 한 글자만 달라도 해시가 달라진다', () => {
    expect(contentHash('abd')).not.toBe(contentHash('abc'))
  })

  it('결과는 reader-core의 isContentHash를 지난다', () => {
    for (const input of ['', 'a', '창세기', '{"a":1}']) expect(isContentHash(contentHash(input))).toBe(true)
  })
})

describe('jsonBytes', () => {
  it('공백 없이 BOM 없는 UTF-8 JSON 바이트로 쓰고, 해시도 이 바이트로 한다', () => {
    const bytes = jsonBytes({ b: 1, a: ['가', null] })
    expect(Buffer.isBuffer(bytes)).toBe(true)
    expect(bytes.toString('utf8')).toBe('{"b":1,"a":["가",null]}')
    expect(contentHash(bytes)).toBe('547f7b3fc6bf')
  })

  it('키 차례는 값이 가진 그대로라, 차례가 다르면 바이트도 해시도 다르다', () => {
    expect(jsonBytes({ a: 1, b: 2 }).toString()).toBe('{"a":1,"b":2}')
    expect(jsonBytes({ b: 2, a: 1 }).toString()).toBe('{"b":2,"a":1}')
    expect(contentHash(jsonBytes({ a: 1, b: 2 }))).not.toBe(contentHash(jsonBytes({ b: 2, a: 1 })))
  })

  it('같은 값이면 언제나 같은 바이트다', () => {
    const value = { chapter: 4, verses: [{ verse: 1, text: '아담이 그 아내 하와와 동침하매' }] }
    expect(jsonBytes(value).equals(jsonBytes(structuredClone(value)))).toBe(true)
  })

  it('JSON으로 쓸 수 없는 값은 오류', () => {
    expect(() => jsonBytes(undefined)).toThrow('JSON으로 쓸 수 없는 값입니다')
    expect(() => jsonBytes(() => 1)).toThrow('JSON으로 쓸 수 없는 값입니다')
    expect(() => jsonBytes(Symbol('x'))).toThrow('JSON으로 쓸 수 없는 값입니다')
  })
})

describe('공개 경로', () => {
  it('공개 상태 파일은 content/releases.json이고 공개 폴더는 저장소의 publish/다', () => {
    expect(releasesFile).toBe(path.join(repoRoot, 'content', 'releases.json'))
    expect(publishDir).toBe(path.join(repoRoot, 'publish'))
  })
})

describe('publishChapter', () => {
  it('처음 공개하면 장 판 1, 목록 판 1이다', () => {
    expect(publishChapter(empty, 'genesis', 4, { hash: HASH_A, parts }, NOW)).toEqual({
      changed: true,
      releases: { revision: 1, books: { genesis: { '4': { revision: 1, publishedAt: NOW, hash: HASH_A, parts } } } },
    })
  })

  it('같은 해시로 다시 공개하면 바꾸지 않는다(공개한 때도 그대로다)', () => {
    const first = publish(empty, 'genesis', 4, HASH_A)
    const again = publishChapter(first, 'genesis', 4, { hash: HASH_A, parts }, LATER)
    expect(again.changed).toBe(false)
    expect(again.releases).toEqual(first)
    expect(again.releases.revision).toBe(1)
    expect(again.releases.books.genesis!['4']!.publishedAt).toBe(NOW)
  })

  it('다른 해시로 다시 공개하면 장 판 2, 목록 판 2가 되고 부분 해시와 공개한 때가 새로 바뀐다', () => {
    const first = publish(empty, 'genesis', 4, HASH_A)
    expect(publishChapter(first, 'genesis', 4, { hash: HASH_B, parts: changedParts }, LATER)).toEqual({
      changed: true,
      releases: { revision: 2, books: { genesis: { '4': { revision: 2, publishedAt: LATER, hash: HASH_B, parts: changedParts } } } },
    })
  })

  it('바뀌어 다시 공개할 때마다 장 판과 목록 판이 하나씩 오른다', () => {
    let releases = empty
    for (const hash of [HASH_A, HASH_B, HASH_C]) releases = publish(releases, 'genesis', 4, hash)
    expect(releases.revision).toBe(3)
    expect(releases.books.genesis!['4']!.revision).toBe(3)
    // 같은 해시로 다시 공개해 봐야 오르지 않는다.
    expect(publishChapter(releases, 'genesis', 4, { hash: HASH_C, parts }, LATER).releases.revision).toBe(3)
  })

  it('다른 장과 다른 책의 항목은 그대로 두고 목록 판만 올린다', () => {
    let releases = publish(empty, 'genesis', 4, HASH_A)
    releases = publish(releases, 'exodus', 4, HASH_B)
    releases = publish(releases, 'genesis', 10, HASH_C, LATER)
    expect(releases.revision).toBe(3)
    expect(Object.keys(releases.books)).toEqual(['genesis', 'exodus'])
    expect(releases.books.genesis!['4']).toEqual({ revision: 1, publishedAt: NOW, hash: HASH_A, parts })
    expect(releases.books.genesis!['10']).toEqual({ revision: 1, publishedAt: LATER, hash: HASH_C, parts })
    expect(releases.books.exodus!['4']).toEqual({ revision: 1, publishedAt: NOW, hash: HASH_B, parts })
  })

  it('받은 객체는 바꾸지 않고, 부분 해시 객체도 그대로 끼워 넣지 않는다', () => {
    const base = publish(publish(empty, 'genesis', 4, HASH_A), 'exodus', 3, HASH_B)
    const before = structuredClone(base)
    const pack = { hash: HASH_C, parts: { ...parts } }
    const packBefore = structuredClone(pack)
    const result = publishChapter(base, 'genesis', 4, pack, LATER).releases
    expect(base).toEqual(before)
    expect(pack).toEqual(packBefore)
    expect(result.books.genesis!['4']!.parts).toEqual(parts)
    // 결과가 받은 부분 해시 객체를 끼워 쥐고 있으면 나중에 그쪽을 바꿔도 공개 상태가 바뀐다.
    pack.parts.text = 'changed'
    expect(result.books.genesis!['4']!.parts.text).toBe(parts.text)
  })

  it('책에 없는 장이면 오류', () => {
    for (const chapter of [0, 51, -1, 1.5, Number.NaN]) {
      expect(() => publishChapter(empty, 'genesis', chapter, { hash: HASH_A, parts }, NOW)).toThrow(
        `창세기에는 ${chapter}장이 없습니다`,
      )
    }
  })

  it('해시가 12자리 소문자 16진수가 아니거나 부분 해시가 빠지면 오류', () => {
    for (const hash of ['', 'abc', 'A1B2C3D4E5F6', 'a1b2c3d4e5f67', 'g1b2c3d4e5f6']) {
      expect(() => publishChapter(empty, 'genesis', 4, { hash, parts }, NOW)).toThrow('해시는 12자리 소문자 16진수여야 합니다')
    }
    expect(() => publishChapter(empty, 'genesis', 4, { hash: HASH_A, parts: { text: HASH_A } as ReleaseParts }, NOW)).toThrow()
  })
})

describe('withdrawChapter', () => {
  it('항목을 지우고 목록 판을 올린다', () => {
    const two = publish(publish(empty, 'genesis', 4, HASH_A), 'genesis', 5, HASH_B)
    expect(withdrawChapter(two, 'genesis', 4)).toEqual({
      revision: 3,
      books: { genesis: { '5': { revision: 1, publishedAt: NOW, hash: HASH_B, parts } } },
    })
  })

  it('책의 마지막 공개 장을 취소하면 책 항목도 지운다', () => {
    const two = publish(publish(empty, 'genesis', 4, HASH_A), 'exodus', 3, HASH_B)
    expect(withdrawChapter(two, 'genesis', 4)).toEqual({
      revision: 3,
      books: { exodus: { '3': { revision: 1, publishedAt: NOW, hash: HASH_B, parts } } },
    })
    expect(withdrawChapter(withdrawChapter(two, 'genesis', 4), 'exodus', 3)).toEqual({ revision: 4, books: {} })
  })

  it('공개되지 않은 장이면 오류', () => {
    const one = publish(empty, 'genesis', 4, HASH_A)
    expect(() => withdrawChapter(empty, 'genesis', 4)).toThrow('창세기 4장은 공개되지 않았습니다')
    // 같은 책의 다른 장, 다른 책의 같은 장 번호
    expect(() => withdrawChapter(one, 'genesis', 5)).toThrow('창세기 5장은 공개되지 않았습니다')
    expect(() => withdrawChapter(one, 'exodus', 4)).toThrow('출애굽기 4장은 공개되지 않았습니다')
    // 이미 취소한 장
    expect(() => withdrawChapter(withdrawChapter(one, 'genesis', 4), 'genesis', 4)).toThrow('창세기 4장은 공개되지 않았습니다')
  })

  it('책에 없는 장이면 오류', () => {
    expect(() => withdrawChapter(empty, 'genesis', 51)).toThrow('창세기에는 51장이 없습니다')
    expect(() => withdrawChapter(empty, 'genesis', 0)).toThrow('창세기에는 0장이 없습니다')
  })

  it('받은 객체는 바꾸지 않는다', () => {
    const base = publish(publish(empty, 'genesis', 4, HASH_A), 'genesis', 5, HASH_B)
    const before = structuredClone(base)
    const result = withdrawChapter(base, 'genesis', 4)
    expect(base).toEqual(before)
    expect(result.books.genesis).toEqual({ '5': base.books.genesis!['5'] })
  })

  it('취소한 장을 다시 공개하면 처음 공개와 같다(장 판 1부터, 목록 판은 계속 오른다)', () => {
    let releases = publish(publish(empty, 'genesis', 4, HASH_A), 'genesis', 4, HASH_B)
    expect(releases.books.genesis!['4']!.revision).toBe(2)
    releases = withdrawChapter(releases, 'genesis', 4)
    releases = publish(releases, 'genesis', 4, HASH_C, LATER)
    expect(releases).toEqual({
      revision: 4,
      books: { genesis: { '4': { revision: 1, publishedAt: LATER, hash: HASH_C, parts } } },
    })
  })
})

describe('공개 상태 파일', () => {
  const sample: Releases = {
    revision: 3,
    books: {
      genesis: {
        '4': { revision: 2, publishedAt: NOW, hash: HASH_A, parts },
        '10': { revision: 1, publishedAt: LATER, hash: HASH_B, parts: changedParts },
      },
      exodus: { '3': { revision: 1, publishedAt: NOW, hash: HASH_C, parts } },
    },
  }

  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'releases-test-'))
    file = path.join(dir, 'releases.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function writeRaw(value: unknown): Promise<void> {
    await writeFile(file, JSON.stringify(value))
  }

  describe('readReleases', () => {
    it('파일이 없으면 빈 상태이고, 파일을 만들지는 않는다', async () => {
      expect(await readReleases(file)).toEqual({ revision: 0, books: {} })
      expect(existsSync(file)).toBe(false)
    })

    it('빈 상태는 읽을 때마다 새 객체다', async () => {
      const first = await readReleases(file)
      first.revision = 9
      first.books.genesis = {}
      expect(await readReleases(file)).toEqual({ revision: 0, books: {} })
    })

    it('파일을 읽는다', async () => {
      await writeRaw(sample)
      expect(await readReleases(file)).toEqual(sample)
    })

    it('알 수 없는 책 키는 파일 이름과 함께 오류', async () => {
      await writeRaw({ revision: 1, books: { genesiss: { '1': entry } } })
      await expect(readReleases(file)).rejects.toThrow('releases.json: 알 수 없는 책입니다: genesiss')
      // 책 id가 아닌 이름이나 이름이 다른 책도 받지 않는다.
      for (const key of ['창세기', 'Genesis', '', 'constructor']) {
        await writeRaw({ revision: 1, books: { genesis: { '1': entry }, [key]: { '1': entry } } })
        await expect(readReleases(file)).rejects.toThrow(`releases.json: 알 수 없는 책입니다: ${key}`)
      }
    })

    it('책에 없거나 쓰는 규칙(앞에 0이 없는 정수)에 어긋난 장 키는 파일 이름과 함께 오류', async () => {
      for (const key of ['0', '51', '04', '4.0', '1e1', '0x4', ' 4', '4 ', '-1', '+4', 'abc', '']) {
        await writeRaw({ revision: 1, books: { genesis: { [key]: entry } } })
        await expect(readReleases(file), `장 키 ${JSON.stringify(key)}`).rejects.toThrow(
          `releases.json: 창세기의 장 번호가 올바르지 않습니다: ${key}`,
        )
      }
      // 책마다 그 책의 장 수로 본다. 창세기에는 없는 51장이 시편에는 있다.
      await writeRaw({ revision: 1, books: { psalms: { '51': entry } } })
      expect(await readReleases(file)).toEqual({ revision: 1, books: { psalms: { '51': entry } } })
      await writeRaw({ revision: 1, books: { genesis: { '4': entry }, obadiah: { '2': entry } } })
      await expect(readReleases(file)).rejects.toThrow('releases.json: 오바댜의 장 번호가 올바르지 않습니다: 2')
    })

    it.each([
      ['목록 판이 음수', { revision: -1, books: {} }],
      ['목록 판이 정수가 아님', { revision: 1.5, books: {} }],
      ['목록 판이 없음', { books: {} }],
      ['책 목록이 없음', { revision: 1 }],
      ['책 아래가 장 목록이 아님', { revision: 1, books: { genesis: [] } }],
      ['장 판이 0', { revision: 1, books: { genesis: { '1': { ...entry, revision: 0 } } } }],
      ['장 판이 정수가 아님', { revision: 1, books: { genesis: { '1': { ...entry, revision: 1.5 } } } }],
      ['공개한 때가 없음', { revision: 1, books: { genesis: { '1': { revision: 1, hash: HASH_A, parts } } } }],
      ['해시가 대문자', { revision: 1, books: { genesis: { '1': { ...entry, hash: 'A1B2C3D4E5F6' } } } }],
      ['해시가 11자리', { revision: 1, books: { genesis: { '1': { ...entry, hash: 'a1b2c3d4e5f' } } } }],
      ['해시가 16진수가 아님', { revision: 1, books: { genesis: { '1': { ...entry, hash: 'a1b2c3d4e5fg' } } } }],
      ['부분 해시가 빠짐', { revision: 1, books: { genesis: { '1': { ...entry, parts: { ...parts, audio: undefined } } } } }],
      ['부분 해시가 글자가 아님', { revision: 1, books: { genesis: { '1': { ...entry, parts: { ...parts, quiz: 4 } } } } }],
    ])('형식이 맞지 않으면 파일 이름과 함께 오류: %s', async (_name, value) => {
      await writeRaw(value)
      await expect(readReleases(file)).rejects.toThrow('releases.json')
    })

    it('해시 오류는 규칙을 한국어로 밝힌다', async () => {
      await writeRaw({ revision: 1, books: { genesis: { '1': { ...entry, hash: 'ABC' } } } })
      await expect(readReleases(file)).rejects.toThrow('해시는 12자리 소문자 16진수여야 합니다')
    })

    it('JSON이 아니면 파일 이름과 함께 오류', async () => {
      await writeFile(file, '{ "revision": 1, ')
      await expect(readReleases(file)).rejects.toThrow('releases.json')
    })
  })

  describe('writeReleases', () => {
    it('두 칸 들여쓰기와 끝 줄바꿈으로 쓰고, 다시 읽으면 같다', async () => {
      await writeReleases(sample, file)
      expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(sample, null, 2)}\n`)
      expect(await readReleases(file)).toEqual(sample)
    })

    it('있는 파일은 바꿔 쓰고, 임시 파일을 남기지 않는다', async () => {
      await writeReleases(empty, file)
      await writeReleases(sample, file)
      expect(await readdir(dir)).toEqual(['releases.json'])
      expect(await readReleases(file)).toEqual(sample)
    })

    it('쓰다 실패해도 임시 파일을 남기지 않는다', async () => {
      // 파일 자리에 폴더가 있으면 임시 파일의 이름을 바꿔 넣을 수 없다.
      await mkdir(file)
      await expect(writeReleases(sample, file)).rejects.toThrow()
      expect(await readdir(dir)).toEqual(['releases.json'])
    })

    it('폴더가 없으면 만든다', async () => {
      const nested = path.join(dir, 'content', 'releases.json')
      await writeReleases(sample, nested)
      expect(await readReleases(nested)).toEqual(sample)
      expect(await readdir(path.dirname(nested))).toEqual(['releases.json'])
    })

    it('검증에 걸리면 아무것도 쓰지 않는다', async () => {
      await expect(writeReleases({ revision: 1, books: { nope: { '1': entry } } }, file)).rejects.toThrow('알 수 없는 책입니다: nope')
      await expect(writeReleases({ revision: 1, books: { genesis: { '51': entry } } }, file)).rejects.toThrow(
        '창세기의 장 번호가 올바르지 않습니다: 51',
      )
      await expect(writeReleases({ revision: 1, books: { genesis: { '1': { ...entry, hash: 'x' } } } }, file)).rejects.toThrow()
      expect(await readdir(dir)).toEqual([])
    })

    it('검증에 걸리면 있던 파일은 그대로 둔다', async () => {
      await writeReleases(sample, file)
      await expect(writeReleases({ revision: 9, books: { nope: {} } }, file)).rejects.toThrow('알 수 없는 책입니다: nope')
      expect(await readReleases(file)).toEqual(sample)
    })

    it('공개와 취소를 이어 쓴 상태가 파일을 거쳐도 그대로다', async () => {
      let releases = await readReleases(file)
      releases = publish(releases, 'genesis', 4, HASH_A)
      await writeReleases(releases, file)
      releases = publish(await readReleases(file), 'genesis', 5, HASH_B, LATER)
      await writeReleases(releases, file)
      releases = withdrawChapter(await readReleases(file), 'genesis', 4)
      await writeReleases(releases, file)
      expect(await readReleases(file)).toEqual({
        revision: 3,
        books: { genesis: { '5': { revision: 1, publishedAt: LATER, hash: HASH_B, parts } } },
      })
    })
  })
})
