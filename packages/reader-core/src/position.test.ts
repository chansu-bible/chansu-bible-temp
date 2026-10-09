import { describe, expect, it } from 'vitest'
import { loadPosition, parsePosition, savePosition } from './position.ts'
import { memoryStore } from './store.ts'

describe('parsePosition', () => {
  it('장과 절이 있으면 위치로 읽는다', () => {
    expect(parsePosition('{"chapter":2,"verse":5}')).toEqual({ chapter: 2, verse: 5 })
  })

  it('저장된 값이 없으면 null이다', () => {
    expect(parsePosition(null)).toBeNull()
  })

  it('예전 형식(장면 id)은 무시한다', () => {
    expect(parsePosition('{"chapter":2,"sceneId":"gen-02-a"}')).toBeNull()
  })

  it('JSON이 아니면 null이다', () => {
    expect(parsePosition('{')).toBeNull()
    expect(parsePosition('null')).toBeNull()
  })
})

describe('loadPosition / savePosition', () => {
  it('저장한 위치를 되살린다', () => {
    const store = memoryStore()
    savePosition(store, { chapter: 3, verse: 7 })
    expect(store.entries.get('reader-position')).toBe('{"chapter":3,"verse":7}')
    expect(loadPosition(store)).toEqual({ chapter: 3, verse: 7 })
  })

  it('저장소가 막혀 있으면 null이고 저장은 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadPosition(broken)).toBeNull()
    expect(() => savePosition(broken, { chapter: 1, verse: 1 })).not.toThrow()
  })
})
