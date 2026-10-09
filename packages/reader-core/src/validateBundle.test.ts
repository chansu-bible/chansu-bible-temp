import { describe, expect, it } from 'vitest'
import { validateBundle } from './bundle.ts'

const chapter = { chapter: 1, verses: [{ verse: 1, text: '태초에', audio: null }], scenes: [] }

describe('validateBundle', () => {
  it('형식 버전이 1이고 장이 있으면 그대로 준다', () => {
    const bundle = { schemaVersion: 1, chapters: [chapter] }
    expect(validateBundle(bundle)).toBe(bundle)
  })

  it('형식 버전이 다르면 오류를 던진다', () => {
    expect(() => validateBundle({ schemaVersion: 2, chapters: [chapter] })).toThrow('묶음 형식이 다릅니다 (schemaVersion 2)')
  })

  it('장이 없으면 오류를 던진다', () => {
    expect(() => validateBundle({ schemaVersion: 1, chapters: [] })).toThrow('묶음에 장이 없습니다')
  })

  it('객체가 아니면 오류를 던진다', () => {
    expect(() => validateBundle(null)).toThrow('묶음이 비어 있습니다')
  })
})
