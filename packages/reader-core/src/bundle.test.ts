import { describe, expect, it } from 'vitest'
import { fillMissing } from './bundle.ts'
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
