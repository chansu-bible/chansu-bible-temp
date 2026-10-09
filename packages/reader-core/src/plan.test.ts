import { describe, expect, it } from 'vitest'
import { parsePlan, planSummary, type ReadingPlan } from './plan.ts'
import type { Chapter, Scene } from './types.ts'

function scene(id: string, verseStart: number, verseEnd: number): Scene {
  return {
    id,
    verseStart,
    verseEnd,
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

function chapter(number: number, scenes: Scene[], audioMs = 1000): Chapter {
  const last = scenes.at(-1)?.verseEnd ?? 0
  return {
    chapter: number,
    verses: Array.from({ length: last }, (_, index) => ({ verse: index + 1, text: '', audio: null, audioMs })),
    scenes,
  }
}

// 1장: a(1-2) b(3-4), 2장: c(1) d(2), 3장: e(1-3)
const chapters = [
  chapter(1, [scene('a', 1, 2), scene('b', 3, 4)]),
  chapter(2, [scene('c', 1, 1), scene('d', 2, 2)]),
  chapter(3, [scene('e', 1, 3)]),
]
const today = '2026-10-09'
const yesterday = '2026-10-08'
const byChapter: ReadingPlan = { kind: 'chapter', perDay: 1 }

const ids = (summary: ReturnType<typeof planSummary>) => summary.today.map((item) => item.scene.id)
const statuses = (summary: ReturnType<typeof planSummary>) => summary.chapters.map((item) => item.status)

describe('하루 한 장', () => {
  it('아무것도 안 읽었으면 오늘은 1장이고 사흘 남는다', () => {
    const summary = planSummary(byChapter, chapters, new Map(), today)
    expect(ids(summary)).toEqual(['a', 'b'])
    expect(statuses(summary)).toEqual(['today', 'todo', 'todo'])
    expect(summary.remainingDays).toBe(3)
    expect(summary.finishDay).toBe('2026-10-11')
    expect(summary.todayDone).toBe(false)
    expect(summary.todayAudioMs).toBe(4000)
  })

  it('어제 1장을 다 읽었으면 오늘은 2장이다. 오늘 일부를 읽어도 오늘 분량은 그대로다', () => {
    const read = new Map([
      ['a', yesterday],
      ['b', yesterday],
      ['c', today],
    ])
    const summary = planSummary(byChapter, chapters, read, today)
    expect(ids(summary)).toEqual(['c', 'd'])
    expect(statuses(summary)).toEqual(['done', 'today', 'todo'])
    expect(summary.remainingDays).toBe(2)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('오늘 분량을 다 읽으면 남은 장은 내일부터 센다', () => {
    const read = new Map([
      ['a', yesterday],
      ['b', null],
      ['c', today],
      ['d', today],
    ])
    const summary = planSummary(byChapter, chapters, read, today)
    expect(summary.todayDone).toBe(true)
    expect(statuses(summary)).toEqual(['done', 'done', 'todo'])
    expect(summary.remainingDays).toBe(1)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('다 읽었으면 남은 날이 0이고 끝나는 날이 없다', () => {
    const read = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, yesterday] as const))
    const summary = planSummary(byChapter, chapters, read, today)
    expect(summary.allDone).toBe(true)
    expect(summary.today).toEqual([])
    expect(summary.remainingDays).toBe(0)
    expect(summary.finishDay).toBeNull()
  })
})

describe('하루 장면 N개와 자유', () => {
  it('하루 장면 3개면 앞에서부터 셋이고, 남은 날은 남은 장면 수를 3으로 나눠 올린다', () => {
    const summary = planSummary({ kind: 'scenes', perDay: 3 }, chapters, new Map(), today)
    expect(ids(summary)).toEqual(['a', 'b', 'c'])
    expect(statuses(summary)).toEqual(['today', 'today', 'todo'])
    expect(summary.remainingDays).toBe(2)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('자유 계획은 다음 장면 하나만 보이고 남은 날을 세지 않는다', () => {
    const summary = planSummary({ kind: 'free', perDay: 1 }, chapters, new Map([['a', yesterday]]), today)
    expect(ids(summary)).toEqual(['b'])
    expect(summary.remainingDays).toBeNull()
    expect(summary.finishDay).toBeNull()
  })
})

describe('parsePlan', () => {
  it('저장된 값이 없거나 깨졌으면 하루 한 장이다', () => {
    expect(parsePlan(null)).toEqual({ kind: 'chapter', perDay: 1 })
    expect(parsePlan({ kind: 'weekly', perDay: 9 })).toEqual({ kind: 'chapter', perDay: 1 })
  })

  it('맞는 값은 그대로 읽는다', () => {
    expect(parsePlan({ kind: 'scenes', perDay: 3 })).toEqual({ kind: 'scenes', perDay: 3 })
  })
})
