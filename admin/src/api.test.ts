import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  // 설정집 목록 화면은 종류(탭)마다 이것 하나만 부른다. 항목마다 요청하지 않는다.
  it('설정집 항목마다 쓰는 장면 수는 종류마다 요청 하나로 받는다', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      requested.push(String(input))
      return new Response(JSON.stringify({ adam: 3, eve: 1 }))
    })
    expect(await api.canonUsageCounts('characters')).toEqual({ adam: 3, eve: 1 })
    expect(requested).toEqual(['/api/canon/characters/usage'])
  })

  it('책을 가리는 요청은 책 주소 아래로 간다', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      requested.push(String(input))
      return new Response('[]')
    })
    await api.quizSummary('1-samuel')
    await api.getBooks()
    expect(requested).toEqual(['/api/books/1-samuel/quiz', '/api/books'])
  })
})
