import { describe, expect, it } from 'vitest'
import { fillMissing, validateBundle } from './bundle.ts'
import type { Bundle } from './types.ts'

describe('fillMissing', () => {
  it('인물·시대·장면 인물이 없는 옛 묶음은 빈 배열로 채운다', () => {
    const old = {
      schemaVersion: 1,
      book: 'genesis',
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

  it('책을 알 수 없는 묶음은 받지 않는다', () => {
    expect(() => validateBundle({ ...oldBundle, book: '없는 책' })).toThrow('묶음의 책을 알 수 없습니다')
  })

  it('bookId가 있으면 그대로 쓴다', () => {
    const exodus = { ...oldBundle, book: '출애굽기', bookId: 'exodus' }
    expect(fillMissing(validateBundle(exodus)).bookId).toBe('exodus')
  })
})
