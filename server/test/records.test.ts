import { describe, expect, it } from 'vitest'
import { applyChanges, pullChanges, type Change } from '../src/records.ts'
import { newUser, testApp } from './helpers.ts'

const mark = (id: string, updatedAt: number): Change => ({ collection: 'marks', id, data: { id }, updatedAt, deletedAt: null })

describe('pullChanges', () => {
  it('순번 순서로 나눠 주고, 더 있으면 more로 알린다', async () => {
    const { sql } = await testApp()
    const user = newUser()
    await applyChanges(sql.query, user, [mark('a', 1), mark('b', 1), mark('c', 1)])
    const first = await pullChanges(sql.query, user, 0, 2)
    expect(first.changes.map((change) => change.id)).toEqual(['a', 'b'])
    expect(first.more).toBe(true)
    const second = await pullChanges(sql.query, user, first.now, 2)
    expect(second.changes.map((change) => change.id)).toEqual(['c'])
    expect(second.more).toBe(false)
    expect(second.now).toBeGreaterThan(first.now)
  })

  it('고친 줄은 새 순번을 받아, 받아 간 뒤에 다시 내려간다', async () => {
    const { sql } = await testApp()
    const user = newUser()
    await applyChanges(sql.query, user, [mark('a', 1), mark('b', 1)])
    const { now } = await pullChanges(sql.query, user, 0)
    await applyChanges(sql.query, user, [mark('a', 2)])
    expect((await pullChanges(sql.query, user, now)).changes).toEqual([mark('a', 2)])
  })
})
