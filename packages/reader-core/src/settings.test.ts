import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, FONT_SCALES, loadSettings, parseSettings, saveSettings } from './settings.ts'
import { memoryStore } from './store.ts'

describe('settings', () => {
  it('저장된 값이 없으면 기본값이다', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ fontScale: 3, theme: 'auto', speed: 1, placeFlash: true })
  })

  it('저장한 값을 그대로 되살린다', () => {
    const store = memoryStore()
    const settings = { fontScale: 5, theme: 'dark', speed: 1.2, placeFlash: false } as const
    saveSettings(store, settings)
    expect(store.entries.has('reader-settings')).toBe(true)
    expect(loadSettings(store)).toEqual(settings)
  })

  it('JSON이 깨졌으면 기본값이다', () => {
    expect(loadSettings(memoryStore({ 'reader-settings': '{oops' }))).toEqual(DEFAULT_SETTINGS)
  })

  it('잘못된 항목만 기본값으로 바꾸고 나머지는 살린다', () => {
    expect(parseSettings(JSON.stringify({ fontScale: 9, theme: 'dark', speed: 3, placeFlash: 'yes' }))).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
    })
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS)
  })

  it('저장소를 쓸 수 없어도 기본값을 주고 저장은 조용히 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow()
  })

  it('글자 크기 3이 기준 크기다', () => {
    expect(FONT_SCALES[3]).toBe(1)
    expect(FONT_SCALES[1]).toBeLessThan(FONT_SCALES[5])
  })
})
