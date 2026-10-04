import { describe, expect, it } from 'vitest'
import { findCoverageProblems } from '../src/scenes/coverage.ts'

describe('findCoverageProblems', () => {
  it('모든 절을 순서대로 덮으면 문제가 없다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 2 },
      { id: 'b', verseStart: 3, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual([])
  })

  it('절이 빠지면 알려준다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 2 },
      { id: 'b', verseStart: 4, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual(['b: 3절에서 시작해야 하는데 4절에서 시작합니다'])
  })

  it('절이 겹치면 알려준다', () => {
    const scenes = [
      { id: 'a', verseStart: 1, verseEnd: 3 },
      { id: 'b', verseStart: 3, verseEnd: 5 },
    ]
    expect(findCoverageProblems(scenes, 5)).toEqual(['b: 4절에서 시작해야 하는데 3절에서 시작합니다'])
  })

  it('마지막 절까지 덮지 않으면 알려준다', () => {
    const scenes = [{ id: 'a', verseStart: 1, verseEnd: 4 }]
    expect(findCoverageProblems(scenes, 5)).toEqual(['마지막 장면이 5절에서 끝나야 하는데 4절에서 끝납니다'])
  })

  it('끝 절이 시작 절보다 앞이면 알려준다', () => {
    const scenes = [{ id: 'a', verseStart: 3, verseEnd: 2 }]
    expect(findCoverageProblems(scenes, 2)).toEqual([
      'a: 끝 절(2)이 시작 절(3)보다 앞입니다',
      'a: 1절에서 시작해야 하는데 3절에서 시작합니다',
    ])
  })

  it('장면이 없으면 알려준다', () => {
    expect(findCoverageProblems([], 5)).toEqual(['장면이 하나도 없습니다'])
  })
})
