import { describe, expect, it } from 'vitest'
import { findActiveIndex } from './activeScene.ts'

// 장면 블록 세 개의 위쪽 위치
const offsets = [0, 200, 500]

describe('findActiveIndex', () => {
  it('맨 위에서는 첫 장면이다', () => {
    expect(findActiveIndex(offsets, 0, 24, false)).toBe(0)
  })

  it('기준선이 둘째 장면의 시작에 닿으면 둘째 장면이다', () => {
    expect(findActiveIndex(offsets, 176, 24, false)).toBe(1)
  })

  it('기준선이 둘째 장면에 닿기 전에는 첫 장면이다', () => {
    expect(findActiveIndex(offsets, 175, 24, false)).toBe(0)
  })

  it('끝까지 스크롤하면 기준선에 닿지 않았어도 마지막 장면이다', () => {
    expect(findActiveIndex(offsets, 300, 24, true)).toBe(2)
  })

  it('장면이 없으면 0이다', () => {
    expect(findActiveIndex([], 0, 24, false)).toBe(0)
  })
})
