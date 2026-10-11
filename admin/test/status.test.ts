import { describe, expect, it } from 'vitest'
import { computeChapterStatus, summarizeCanon } from '../server/status.ts'
import { canon, eden, flood, sceneFiles, source } from './fixtures.ts'

const catalog = {
  versions: [
    { id: 'v1', label: '1차', note: '' },
    { id: 'v2', label: '2차', note: '' },
  ],
  files: {
    v1: ['genesis-01-01.jpeg', 'genesis-01-02.png', 'genesis-09-01.jpeg', 'genesis-01-03.txt.bak'],
    v2: ['genesis-01-03.jpeg'],
  },
}

describe('computeChapterStatus', () => {
  const audio = new Set(['genesis-01-001.mp3', 'genesis-01-003.mp3', 'genesis-02-005.mp3', 'exodus-02-001.mp3', 'note.txt'])
  const result = computeChapterStatus('genesis', source, sceneFiles, catalog, audio)

  it('본문의 장마다 한 줄을 만든다', () => {
    expect(result.map((item) => item.chapter)).toEqual([1, 2])
    expect(result.map((item) => item.verses)).toEqual([3, 2])
  })

  it('장면 상태 수를 센다', () => {
    expect(result[0]!.hasSceneFile).toBe(true)
    expect(result[0]!.scenes).toEqual({ total: 3, draft: 1, reviewed: 0, flagged: 1, approved: 1 })
  })

  it('장면 파일이 없는 장은 0개이고 hasSceneFile이 false다', () => {
    expect(result[1]!.hasSceneFile).toBe(false)
    expect(result[1]!.scenes).toEqual({ total: 0, draft: 0, reviewed: 0, flagged: 0, approved: 0 })
    expect(result[1]!.images).toEqual({ v1: 0, v2: 0 })
  })

  it('버전마다 그 장 장면 이름의 그림 파일 수를 센다', () => {
    expect(result[0]!.images).toEqual({ v1: 2, v2: 1 })
  })

  it('있는 음성 파일 수와 절 수를 센다', () => {
    expect(result[0]!.audio).toEqual({ have: 2, total: 3 })
    expect(result[1]!.audio).toEqual({ have: 0, total: 2 })
  })
})

describe('summarizeCanon', () => {
  it('종류별로 상태 수를 센다', () => {
    const summary = summarizeCanon(canon({ places: [eden, { ...eden, id: 'nod', status: 'rejected' }], eras: [flood] }))
    expect(summary).toEqual({
      characters: { draft: 0, approved: 0, rejected: 0 },
      places: { draft: 0, approved: 1, rejected: 1 },
      eras: { draft: 1, approved: 0, rejected: 0 },
      things: { draft: 0, approved: 0, rejected: 0 },
    })
  })
})
