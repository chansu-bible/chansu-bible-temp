import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../content/types.ts'
import { chapterProgress, loadReadScenes, markRead, saveReadScenes, sceneStatus } from './progress.ts'

function fakeStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  }
}

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
  }
}

describe('읽은 장면', () => {
  let storage: ReturnType<typeof fakeStorage>
  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('저장된 것이 없으면 빈 Set이다', () => {
    expect(loadReadScenes()).toEqual(new Set())
  })

  it('저장한 장면 id를 배열로 적고 되살린다', () => {
    saveReadScenes(new Set(['a', 'b']))
    expect(JSON.parse(storage.store.get('reader-read-scenes')!)).toEqual(['a', 'b'])
    expect(loadReadScenes()).toEqual(new Set(['a', 'b']))
  })

  it('깨진 값이나 문자열이 아닌 항목은 버린다', () => {
    storage.setItem('reader-read-scenes', 'nope')
    expect(loadReadScenes()).toEqual(new Set())
    storage.setItem('reader-read-scenes', JSON.stringify(['a', 3, null]))
    expect(loadReadScenes()).toEqual(new Set(['a']))
    storage.setItem('reader-read-scenes', JSON.stringify({ a: 1 }))
    expect(loadReadScenes()).toEqual(new Set())
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
