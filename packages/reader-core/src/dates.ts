// 날짜는 기기 시간대의 달력 날짜('YYYY-MM-DD' 문자열)로 다룬다. 읽은 날과 연속 읽기, 계획에 쓴다.
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1)
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day)
  date.setDate(date.getDate() + days)
  return localDay(date)
}

// from에서 to까지 며칠인지(같은 날이면 0)
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

// 예: 10월 9일 금요일
export function koreanDateLabel(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`
}

// 예: 10월 13일
export function koreanDayLabel(day: string): string {
  const date = parseDay(day)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}
