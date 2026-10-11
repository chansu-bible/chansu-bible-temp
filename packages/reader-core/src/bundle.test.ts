import { describe, expect, it } from 'vitest'
import { fillMissing, validateBundle } from './bundle.ts'
import type { Bundle } from './types.ts'

describe('fillMissing', () => {
  it('인물·시대·장면 인물이 없는 옛 묶음은 빈 배열로 채운다', () => {
    const old = {
      schemaVersion: 1,
      book: '창세기',
      translation: '개역한글',
      places: [],
      imageVersions: [],
      defaultImageVersion: null,
      chapters: [{ chapter: 1, verses: [], scenes: [{ id: 'a' }] }],
    } as unknown as Bundle
    const filled = fillMissing(old)
    expect(filled.characters).toEqual([])
    expect(filled.eras).toEqual([])
    expect(filled.things).toEqual([])
    expect(filled.chapters[0].scenes[0].characters).toEqual([])
  })

  it('있는 값은 그대로 둔다', () => {
    const bundle = {
      schemaVersion: 1,
      book: '창세기',
      characters: [{ id: 'adam' }],
      eras: [{ id: 'flood' }],
      things: [{ id: 'ark' }],
      chapters: [{ chapter: 1, verses: [{ verse: 1, text: '', audio: null, audioMs: 1200 }], scenes: [{ id: 'a', characters: ['adam'] }] }],
    } as unknown as Bundle
    const filled = fillMissing(bundle)
    expect(filled.characters).toEqual([{ id: 'adam' }])
    expect(filled.eras).toEqual([{ id: 'flood' }])
    expect(filled.things).toEqual([{ id: 'ark' }])
    expect(filled.chapters[0].verses[0].audioMs).toBe(1200)
    expect(filled.chapters[0].scenes[0].characters).toEqual(['adam'])
  })
})

describe('묶음의 책', () => {
  // bookId가 없는 옛 창세기 묶음
  const oldBundle = {
    schemaVersion: 1,
    book: '창세기',
    translation: '개역한글',
    places: [],
    imageVersions: [],
    defaultImageVersion: null,
    chapters: [{ chapter: 1, verses: [], scenes: [] }],
  }

  it('bookId가 없는 옛 묶음은 책 이름으로 책을 찾는다', () => {
    const filled = fillMissing(validateBundle(oldBundle))
    expect(filled.bookId).toBe('genesis')
  })

  it('bookId가 있으면 그대로 쓴다', () => {
    const exodus = { ...oldBundle, book: '출애굽기', bookId: 'exodus' }
    expect(fillMissing(validateBundle(exodus)).bookId).toBe('exodus')
  })

  it('bookId만 있고 책 이름이 없어도 받는다', () => {
    const nameless = { ...oldBundle, book: undefined, bookId: 'exodus' }
    expect(fillMissing(validateBundle(nameless)).bookId).toBe('exodus')
  })

  it('책을 알 수 없는 묶음은 받지 않는다', () => {
    expect(() => validateBundle({ ...oldBundle, book: '없는 책' })).toThrow('묶음의 책을 알 수 없습니다')
  })

  it('모르는 bookId는 책 이름이 맞아도 받지 않는다', () => {
    expect(() => validateBundle({ ...oldBundle, bookId: 'nope' })).toThrow('묶음의 책을 알 수 없습니다')
    expect(() => validateBundle({ ...oldBundle, bookId: null })).toThrow('묶음의 책을 알 수 없습니다')
  })

  it('bookId와 책 이름이 다른 책이면 받지 않는다', () => {
    expect(() => validateBundle({ ...oldBundle, bookId: 'exodus' })).toThrow('묶음의 책 이름(창세기)이 bookId(exodus)와 다릅니다')
  })

  it('fillMissing도 책을 알 수 없으면 오류를 던진다', () => {
    expect(() => fillMissing({ ...oldBundle, book: '없는 책' } as unknown as Bundle)).toThrow('묶음의 책을 알 수 없습니다')
  })

  it('fillMissing도 모르는 bookId는 책 이름으로 대신하지 않고 오류를 던진다', () => {
    expect(() => fillMissing({ ...oldBundle, bookId: 'nope', book: '창세기' } as unknown as Bundle)).toThrow('묶음의 책을 알 수 없습니다')
  })
})
