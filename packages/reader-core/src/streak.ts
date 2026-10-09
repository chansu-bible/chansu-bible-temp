import { addDays } from './dates.ts'

// 연속으로 읽은 날 수. 오늘 아직 안 읽었으면 어제까지 이어진 날을 센다(아침에 앱을 열어도 끊기지 않게).
export function readingStreak(days: ReadonlySet<string>, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1)
  let count = 0
  while (days.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}
