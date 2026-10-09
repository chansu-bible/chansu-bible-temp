import { describe, expect, it } from 'vitest'
import { memoryStore } from './store.ts'
import { loadSubtitles, saveSubtitles } from './subtitles.ts'

describe('그림 위 자막', () => {
  it('처음에는 켜져 있고, 끈 것을 기억한다', () => {
    const store = memoryStore()
    expect(loadSubtitles(store)).toBe(true)
    saveSubtitles(store, false)
    expect(store.entries.get('reader-subtitles')).toBe('off')
    expect(loadSubtitles(store)).toBe(false)
    saveSubtitles(store, true)
    expect(loadSubtitles(store)).toBe(true)
  })

  it('저장소가 막혀 있으면 켜진 것으로 보고 저장은 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadSubtitles(broken)).toBe(true)
    expect(() => saveSubtitles(broken, false)).not.toThrow()
  })
})
