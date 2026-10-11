import { fetchSource, listSourceBooks, runOriginal, type OriginalResult } from 'pipeline'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRunner } from '../server/stages.ts'

// 작업 본체가 파이프라인 함수에 무엇을 넘기는지 본다. 받기와 원어 만들기는 가짜로 바꾸고, 나머지(originalBooks, memoizeFetch 등)는 그대로 쓴다.
vi.mock('pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pipeline')>()),
  fetchSource: vi.fn(),
  listSourceBooks: vi.fn(),
  runOriginal: vi.fn(),
}))

const result = (skipped: number[] = []): OriginalResult => ({ chapters: 2, words: 30, entries: 10, withKorean: 4, skipped })

beforeEach(() => {
  vi.mocked(fetchSource).mockReset().mockResolvedValue({
    book: '출애굽기',
    translation: '개역한글',
    chapters: [{ chapter: 3, verses: [{ verse: 1, text: '3장 1절' }] }],
  })
  vi.mocked(listSourceBooks).mockReset().mockResolvedValue(['genesis', 'matthew', 'exodus'])
  vi.mocked(runOriginal).mockReset().mockResolvedValue(result())
})

const run = async (...args: Parameters<typeof createRunner>) => {
  const lines: string[] = []
  await createRunner(...args)((line) => lines.push(line))
  return lines
}

describe('source 작업', () => {
  it('장 범위를 읽어 fetchSource에 넘긴다', async () => {
    const lines = await run('source', { book: 'exodus', chapters: '3-7' })
    expect(fetchSource).toHaveBeenCalledWith('exodus', { from: 3, to: 7 })
    expect(lines).toEqual(['출애굽기 본문을 가져오는 중', '본문 저장 완료: 1장 1절'])
  })

  it('장 하나도, 장 범위가 없으면 책 전체를 받는다', async () => {
    await run('source', { book: 'ruth', chapters: '3' })
    expect(fetchSource).toHaveBeenLastCalledWith('ruth', { from: 3, to: 3 })
    await run('source', { book: 'genesis' })
    expect(fetchSource).toHaveBeenLastCalledWith('genesis', {})
  })
})

describe('original 작업', () => {
  it('책을 고르지 않으면 본문이 있는 구약 책을 모두 돌리고, 같은 받기 함수를 함께 쓴다', async () => {
    vi.mocked(runOriginal).mockResolvedValueOnce(result([4, 7]))
    const lines = await run('original', {})
    const calls = vi.mocked(runOriginal).mock.calls
    expect(calls.map(([book]) => book)).toEqual(['genesis', 'exodus'])
    expect(calls[0]![1]!.fetchText).toBeTypeOf('function')
    expect(calls[1]![1]!.fetchText).toBe(calls[0]![1]!.fetchText)
    expect(lines).toEqual([
      '마태복음은 신약이라 원어를 건너뜁니다',
      '원어 저장 완료: 2장, 낱말 30개, 사전 항목 10개(한국어 뜻 있음 4개)',
      '원어 없이 둔 장: 창세기 4장, 7장',
      '원어 저장 완료: 2장, 낱말 30개, 사전 항목 10개(한국어 뜻 있음 4개)',
    ])
  })

  it('책을 고르면 그 책만 돌린다', async () => {
    await run('original', { book: 'exodus' })
    expect(vi.mocked(runOriginal).mock.calls.map(([book]) => book)).toEqual(['exodus'])
    expect(listSourceBooks).not.toHaveBeenCalled()
  })

  it('본문이 있는 책이 없으면 실패한다', async () => {
    vi.mocked(listSourceBooks).mockResolvedValue([])
    await expect(run('original', {})).rejects.toThrow('본문이 있는 책이 없습니다')
    expect(runOriginal).not.toHaveBeenCalled()
  })
})
