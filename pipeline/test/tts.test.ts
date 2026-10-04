import { describe, expect, it } from 'vitest'
import { audioName, selectVersesToSpeak } from '../src/tts/select.ts'

describe('audioName', () => {
  it('장은 두 자리, 절은 세 자리로 파일 이름을 만든다', () => {
    expect(audioName(1, 3)).toBe('genesis-01-003.mp3')
    expect(audioName(10, 32)).toBe('genesis-10-032.mp3')
  })
})

describe('selectVersesToSpeak', () => {
  const verses = [
    { verse: 1, text: '가' },
    { verse: 2, text: '나' },
    { verse: 3, text: '다' },
  ]
  const existing = new Set(['genesis-01-002.mp3'])
  const numbers = (selected: { verse: number }[]) => selected.map((verse) => verse.verse)

  it('음성 파일이 없는 절만 고른다', () => {
    expect(numbers(selectVersesToSpeak(1, verses, existing, { force: false }))).toEqual([1, 3])
  })

  it('force면 이미 음성이 있는 절도 고른다', () => {
    expect(numbers(selectVersesToSpeak(1, verses, existing, { force: true }))).toEqual([1, 2, 3])
  })

  it('limit만큼만 고른다', () => {
    expect(numbers(selectVersesToSpeak(1, verses, existing, { force: false, limit: 1 }))).toEqual([1])
  })

  it('다른 장의 음성 파일은 상관하지 않는다', () => {
    expect(numbers(selectVersesToSpeak(2, verses, existing, { force: false }))).toEqual([1, 2, 3])
  })
})
