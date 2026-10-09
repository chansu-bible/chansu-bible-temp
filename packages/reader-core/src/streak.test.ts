import { describe, expect, it } from 'vitest'
import { readingStreak } from './streak.ts'

describe('readingStreak', () => {
  it('읽은 날이 없으면 0이다', () => {
    expect(readingStreak(new Set(), '2026-10-09')).toBe(0)
  })

  it('오늘까지 이어진 날을 센다', () => {
    expect(readingStreak(new Set(['2026-10-07', '2026-10-08', '2026-10-09']), '2026-10-09')).toBe(3)
  })

  it('오늘 아직 안 읽었으면 어제까지 이어진 날을 센다', () => {
    expect(readingStreak(new Set(['2026-10-07', '2026-10-08']), '2026-10-09')).toBe(2)
  })

  it('하루라도 비면 거기서 끊긴다', () => {
    expect(readingStreak(new Set(['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09']), '2026-10-09')).toBe(3)
    expect(readingStreak(new Set(['2026-10-07']), '2026-10-09')).toBe(0)
  })
})
