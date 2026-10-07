import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, FONT_SCALES, loadSettings, parseSettings, saveSettings } from './settings.ts'

// 시험 환경에는 localStorage가 없어서 Map으로 흉내 낸다.
function fakeStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    store,
  }
}

describe('settings', () => {
  let storage: ReturnType<typeof fakeStorage>
  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('저장된 값이 없으면 기본값이다', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ fontScale: 3, theme: 'auto', speed: 1, placeFlash: true })
  })

  it('저장한 값을 그대로 되살린다', () => {
    const settings = { fontScale: 5, theme: 'dark', speed: 1.2, placeFlash: false } as const
    saveSettings(settings)
    expect(storage.store.has('reader-settings')).toBe(true)
    expect(loadSettings()).toEqual(settings)
  })

  it('JSON이 깨졌으면 기본값이다', () => {
    storage.setItem('reader-settings', '{oops')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
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
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    })
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow()
  })

  it('글자 크기 3이 기준 크기다', () => {
    expect(FONT_SCALES[3]).toBe(1)
    expect(FONT_SCALES[1]).toBeLessThan(FONT_SCALES[5])
  })
})
