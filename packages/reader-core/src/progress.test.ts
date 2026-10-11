import { describe, expect, it } from 'vitest'
import { chapterProgress, loadReadScenes, markRead, saveReadScenes, sceneStatus } from './progress.ts'
import { memoryStore } from './store.ts'
import type { Scene } from './types.ts'

function scene(id: string): Scene {
  return {
    id,
    verseStart: 1,
    verseEnd: 2,
    title: id,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    placeId: null,
    characters: [],
    images: {},
    reviewStatus: 'none',
    audio: null,
    audioMs: null,
  }
}

describe('읽은 장면', () => {
  it('저장된 것이 없으면 빈 Set이다', () => {
    expect(loadReadScenes(memoryStore())).toEqual(new Set())
  })

  it('저장한 장면 id를 배열로 적고 되살린다', () => {
    const store = memoryStore()
    saveReadScenes(store, new Set(['a', 'b']))
    expect(JSON.parse(store.entries.get('reader-read-scenes')!)).toEqual(['a', 'b'])
    expect(loadReadScenes(store)).toEqual(new Set(['a', 'b']))
  })

  it('깨진 값이나 문자열이 아닌 항목은 버린다', () => {
    const store = memoryStore()
    store.setItem('reader-read-scenes', 'nope')
    expect(loadReadScenes(store)).toEqual(new Set())
    store.setItem('reader-read-scenes', JSON.stringify(['a', 3, null]))
    expect(loadReadScenes(store)).toEqual(new Set(['a']))
    store.setItem('reader-read-scenes', JSON.stringify({ a: 1 }))
    expect(loadReadScenes(store)).toEqual(new Set())
  })

  it('저장소가 막혀 있으면 빈 Set을 주고 저장은 조용히 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadReadScenes(broken)).toEqual(new Set())
    expect(() => saveReadScenes(broken, new Set(['a']))).not.toThrow()
  })

  it('markRead는 원래 Set을 건드리지 않고 새 Set을 준다', () => {
    const before = new Set(['a'])
    const after = markRead(before, 'b')
    expect(after).toEqual(new Set(['a', 'b']))
    expect(before).toEqual(new Set(['a']))
    expect(after).not.toBe(before)
  })

  it('이미 읽은 장면이면 같은 Set을 그대로 준다', () => {
    const before = new Set(['a'])
    expect(markRead(before, 'a')).toBe(before)
  })
})

describe('장의 진도', () => {
  const scenes = [scene('a'), scene('b'), scene('c')]

  it('읽은 장면 수와 전체 수를 센다', () => {
    expect(chapterProgress(scenes, new Set(['a', 'c', 'x']))).toEqual({ read: 2, total: 3, done: false })
    expect(chapterProgress(scenes, new Set(['a', 'b', 'c']))).toEqual({ read: 3, total: 3, done: true })
    expect(chapterProgress([], new Set())).toEqual({ read: 0, total: 0, done: false })
  })

  it('장면 상태는 읽는 중이 읽음보다 앞선다', () => {
    expect(sceneStatus('a', 'a', new Set(['a']))).toBe('reading')
    expect(sceneStatus('b', 'a', new Set(['b']))).toBe('read')
    expect(sceneStatus('c', 'a', new Set())).toBe('unread')
  })
})
