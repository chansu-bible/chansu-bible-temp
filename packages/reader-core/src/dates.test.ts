import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isDay, koreanDateLabel, koreanDayLabel, localDay } from './dates.ts'

describe('날짜', () => {
  it('localDay는 기기 시간대의 날짜를 0을 채워 쓴다', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('addDays는 달과 해를 넘긴다', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween은 두 날 사이의 날 수다', () => {
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8)
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0)
  })

  it('isDay는 YYYY-MM-DD 문자열만 받는다', () => {
    expect(isDay('2026-10-09')).toBe(true)
    expect(isDay('2026-1-9')).toBe(false)
    expect(isDay(20261009)).toBe(false)
  })

  it('한국어 날짜', () => {
    expect(koreanDateLabel(new Date(2026, 9, 9))).toBe('10월 9일 금요일')
    expect(koreanDayLabel('2026-10-13')).toBe('10월 13일')
  })
})
