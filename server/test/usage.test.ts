import { describe, expect, it } from 'vitest'
import { giveBack, giveBackGlobal, takeAsk, takeGlobalAsk } from '../src/ask/usage.ts'
import { memorySql } from './helpers.ts'

// 한도를 넘은 시도는 센 것을 되돌린다. 되돌리지 않으면 실패한 답이 돌려준 자리를 다음 사람이 쓰지 못한다.
describe('하루 질문 수 세기', () => {
  const day = '2026-10-10'

  it('서버 전체 한도를 넘은 시도는 되돌린다', async () => {
    const sql = await memorySql()
    expect(await takeGlobalAsk(sql.query, day, 1)).toBe(true)
    expect(await takeGlobalAsk(sql.query, day, 1)).toBe(false)
    await giveBackGlobal(sql.query, day)
    expect(await takeGlobalAsk(sql.query, day, 1)).toBe(true)
  })

  it('사람마다의 한도를 넘은 시도도 되돌린다', async () => {
    const sql = await memorySql()
    expect((await takeAsk(sql.query, 'user-a', day, 1)).allowed).toBe(true)
    expect((await takeAsk(sql.query, 'user-a', day, 1)).allowed).toBe(false)
    await giveBack(sql.query, 'user-a', day)
    expect((await takeAsk(sql.query, 'user-a', day, 1)).allowed).toBe(true)
  })
})
