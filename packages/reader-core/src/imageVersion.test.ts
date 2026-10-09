import { describe, expect, it } from 'vitest'
import type { ImageVersion } from './types.ts'
import { loadImageVersion, nextImageVersion, pickImageVersion, saveImageVersion } from './imageVersion.ts'
import { memoryStore } from './store.ts'

const versions: ImageVersion[] = [
  { id: 'v1', label: '1차', note: '' },
  { id: 'v2', label: '2차', note: '' },
  { id: 'v3', label: '3차', note: '' },
]

describe('pickImageVersion', () => {
  it('저장된 버전이 아직 있으면 그 버전을 고른다', () => {
    expect(pickImageVersion({ imageVersions: versions, defaultImageVersion: 'v3' }, 'v1')).toBe('v1')
  })

  it('저장된 버전이 없거나 사라졌으면 기본 버전을 고른다', () => {
    expect(pickImageVersion({ imageVersions: versions, defaultImageVersion: 'v3' }, null)).toBe('v3')
    expect(pickImageVersion({ imageVersions: versions, defaultImageVersion: 'v3' }, 'old')).toBe('v3')
  })

  it('버전이 하나도 없으면 null이다', () => {
    expect(pickImageVersion({ imageVersions: [], defaultImageVersion: null }, 'v1')).toBeNull()
  })
})

describe('nextImageVersion', () => {
  it('다음 버전으로 넘어간다', () => {
    expect(nextImageVersion(versions, 'v1')).toBe('v2')
  })

  it('마지막 버전 다음은 첫 버전이다', () => {
    expect(nextImageVersion(versions, 'v3')).toBe('v1')
  })

  it('지금 버전을 모르면 첫 버전이다', () => {
    expect(nextImageVersion(versions, null)).toBe('v1')
  })

  it('버전이 없으면 null이다', () => {
    expect(nextImageVersion([], 'v1')).toBeNull()
  })
})

describe('그림 버전 저장', () => {
  it('고른 버전을 저장하고 되살린다', () => {
    const store = memoryStore()
    expect(loadImageVersion(store)).toBeNull()
    saveImageVersion(store, 'v2')
    expect(loadImageVersion(store)).toBe('v2')
  })
})
