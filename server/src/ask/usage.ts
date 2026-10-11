import type { Query } from '../db.ts'

// 질문하기는 한 사람당 하루 20번. 날짜는 한국 시각으로 센다.
export const DEFAULT_DAILY_LIMIT = 20

export function koreaDay(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 한 번 쓴다. 한도를 넘으면 되돌리고 allowed가 false다. count는 오늘 쓴 횟수(이번 것 포함)
export async function takeAsk(query: Query, userId: string, day: string, limit: number): Promise<{ allowed: boolean; count: number }> {
  const rows = await query<{ count: number | string }>(
    `INSERT INTO ask_usage (user_id, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = ask_usage.count + 1
     RETURNING count`,
    [userId, day],
  )
  const count = Number(rows[0]?.count ?? 0)
  if (count <= limit) return { allowed: true, count }
  await giveBack(query, userId, day)
  return { allowed: false, count: limit }
}

// 답을 만들지 못했을 때 한 번을 되돌린다.
export async function giveBack(query: Query, userId: string, day: string): Promise<void> {
  await query('UPDATE ask_usage SET count = GREATEST(count - 1, 0) WHERE user_id = $1 AND day = $2', [userId, day])
}

export async function usedToday(query: Query, userId: string, day: string): Promise<number> {
  const rows = await query<{ count: number | string }>('SELECT count FROM ask_usage WHERE user_id = $1 AND day = $2', [userId, day])
  return Number(rows[0]?.count ?? 0)
}

// 서버 전체의 하루 질문 수. 누구나 가입할 수 있으므로 계정을 많이 만들어도 하루 비용이 이 안에 머물게 한다.
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200

// 서버 전체에서 한 번 쓴다. 한도를 넘으면 되돌리고 false다.
export async function takeGlobalAsk(query: Query, day: string, limit: number): Promise<boolean> {
  const rows = await query<{ count: number | string }>(
    `INSERT INTO ask_daily (day, count) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET count = ask_daily.count + 1
     RETURNING count`,
    [day],
  )
  if (Number(rows[0]?.count ?? 0) <= limit) return true
  await giveBackGlobal(query, day)
  return false
}

// 답을 만들지 못했을 때 서버 전체의 한 번을 되돌린다.
export async function giveBackGlobal(query: Query, day: string): Promise<void> {
  await query('UPDATE ask_daily SET count = GREATEST(count - 1, 0) WHERE day = $1', [day])
}
