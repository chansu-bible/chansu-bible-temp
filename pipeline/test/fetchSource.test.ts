import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BOOKS } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sourceFilePath } from '../src/paths.ts'
import { fetchSource, parseChapterRange, wikisourcePageTitle } from '../src/source/fetchSource.ts'
import { readSource } from '../src/source/files.ts'

describe('wikisourcePageTitle', () => {
  it('개역한글판/<책 이름>이다', () => {
    expect(wikisourcePageTitle('genesis')).toBe('개역한글판/창세기')
    expect(wikisourcePageTitle('psalms')).toBe('개역한글판/시편')
    expect(wikisourcePageTitle('revelation')).toBe('개역한글판/요한계시록')
  })

  it('요한일서·요한이서·요한삼서는 위키문헌에 요한1서·요한2서·요한3서로 있다', () => {
    expect(wikisourcePageTitle('1-john')).toBe('개역한글판/요한1서')
    expect(wikisourcePageTitle('2-john')).toBe('개역한글판/요한2서')
    expect(wikisourcePageTitle('3-john')).toBe('개역한글판/요한3서')
  })

  it('나머지 63권은 reader-core의 책 이름 그대로다', () => {
    const renamed = ['1-john', '2-john', '3-john']
    const others = BOOKS.filter((book) => !renamed.includes(book.id))
    expect(others).toHaveLength(63)
    for (const book of others) expect(wikisourcePageTitle(book.id)).toBe(`개역한글판/${book.name}`)
  })
})

describe('parseChapterRange', () => {
  it('3-7은 3~7장, 3은 3장 하나다', () => {
    expect(parseChapterRange('3-7')).toEqual({ from: 3, to: 7 })
    expect(parseChapterRange('1-10')).toEqual({ from: 1, to: 10 })
    expect(parseChapterRange('3')).toEqual({ from: 3, to: 3 })
    expect(parseChapterRange('119')).toEqual({ from: 119, to: 119 })
  })

  it('책의 장 수는 보지 않는다(fetchSource가 본다)', () => {
    expect(parseChapterRange('0')).toEqual({ from: 0, to: 0 })
    expect(parseChapterRange('7-3')).toEqual({ from: 7, to: 3 })
  })

  it.each(['', 'a', '3-', '-7', '3-7-9', '3~7', '3,5', ' 3', '3 ', '3 -7', '3-a', '-3', '3.5', '١٢'])('%j은 오류다', (text) => {
    expect(() => parseChapterRange(text)).toThrow(`--chapters는 3-7이나 3처럼 씁니다: ${text}`)
  })
})

// 장마다 절 수만큼 "N장 M절" 본문을 가진 위키문헌 글을 만든다.
function wikitextOf(verseCounts: number[]): string {
  return [
    '{{머리말',
    '|제목 = [[../]]',
    '}}',
    ...verseCounts.flatMap((count, index) => {
      const chapter = index + 1
      const marker = (verse: number) => (verse > 1 ? `{{절||${verse}}}` : chapter === 1 ? '{{절|1|1}}' : `{{절|${chapter}|}}`)
      return ['', `== ${chapter}장 ==`, ...Array.from({ length: count }, (_, i) => `${marker(i + 1)} ${chapter}장 ${i + 1}절`)]
    }),
  ].join('\n')
}

const pageUrl = (title: string) => `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`

let dir: string
let fetchMock: ReturnType<typeof stubFetch>

function stubFetch(text: string, status = 200) {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(text, { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pipeline-source-'))
  // 시험이 위키문헌에 닿지 않게 기본으로 막아 둔다.
  fetchMock = stubFetch('')
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await rm(dir, { recursive: true, force: true })
})

describe('fetchSource 장 범위', () => {
  it('책에 없는 장이 들어 있으면 받기 전에 오류를 낸다', async () => {
    await expect(fetchSource('ruth', { from: 3, to: 5 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 3~5 (1~4장)')
    await expect(fetchSource('ruth', { to: 5 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 1~5 (1~4장)')
    await expect(fetchSource('ruth', { from: 0 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 0~4 (1~4장)')
    await expect(fetchSource('ruth', { from: 5, to: 5 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 5~5 (1~4장)')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(sourceFilePath('ruth', dir))).toBe(false)
  })

  it('시작이 끝보다 크면 받기 전에 오류를 낸다', async () => {
    await expect(fetchSource('ruth', { from: 3, to: 2 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 3~2 (1~4장)')
    await expect(fetchSource('ruth', { from: 5 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 5~4 (1~4장)')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('정수가 아닌 장도 받기 전에 오류를 낸다', async () => {
    await expect(fetchSource('ruth', { from: 1.5, to: 3 }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: 1.5~3 (1~4장)')
    await expect(fetchSource('ruth', { from: Number.NaN }, dir)).rejects.toThrow('룻기의 장 범위가 틀렸습니다: NaN~4 (1~4장)')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('fetchSource', () => {
  it('범위를 주지 않으면 책 전체를 받아 <책 id>.json에 쓴다', async () => {
    fetchMock = stubFetch(wikitextOf([2, 3, 1, 2]))
    const source = await fetchSource('ruth', {}, dir)
    expect(source.book).toBe('룻기')
    expect(source.translation).toBe('개역한글')
    expect(source.chapters.map((chapter) => chapter.chapter)).toEqual([1, 2, 3, 4])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(pageUrl('개역한글판/룻기'))
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' } })
    expect(await readFile(sourceFilePath('ruth', dir), 'utf8')).toBe(`${JSON.stringify(source, null, 2)}\n`)
  })

  it('고른 장만 쓰고, 있던 파일은 합치지 않고 바꾼다', async () => {
    await writeFile(
      sourceFilePath('ruth', dir),
      JSON.stringify({ book: '룻기', translation: '개역한글', chapters: [{ chapter: 1, verses: [{ verse: 1, text: '옛 본문' }] }] }),
    )
    fetchMock = stubFetch(wikitextOf([2, 3, 1, 2]))
    const source = await fetchSource('ruth', { from: 2, to: 3 }, dir)
    expect(source.chapters.map((chapter) => chapter.chapter)).toEqual([2, 3])
    expect(source.chapters[0]!.verses).toEqual([
      { verse: 1, text: '2장 1절' },
      { verse: 2, text: '2장 2절' },
      { verse: 3, text: '2장 3절' },
    ])
    expect((await readSource('ruth', dir)).chapters.map((chapter) => chapter.chapter)).toEqual([2, 3])
  })

  it('한 장만 받을 수도 있다', async () => {
    fetchMock = stubFetch(wikitextOf([2, 3, 1, 2]))
    const source = await fetchSource('ruth', { from: 4, to: 4 }, dir)
    expect(source.chapters).toEqual([
      {
        chapter: 4,
        verses: [
          { verse: 1, text: '4장 1절' },
          { verse: 2, text: '4장 2절' },
        ],
      },
    ])
  })

  it('요한일서는 위키문헌의 요한1서 쪽에서 받고, 본문 파일에는 책 이름을 요한일서로 쓴다', async () => {
    fetchMock = stubFetch(wikitextOf([2, 3]))
    const source = await fetchSource('1-john', { from: 1, to: 2 }, dir)
    expect(fetchMock.mock.calls[0]![0]).toBe(pageUrl('개역한글판/요한1서'))
    expect(source.book).toBe('요한일서')
    expect((await readSource('1-john', dir)).book).toBe('요한일서')
  })

  it('요한계시록의 이어지는 줄을 앞 절에 붙인다', async () => {
    fetchMock = stubFetch(
      ['== 1장 ==', '{{절|1|}} 계시라', '<br> &nbsp;&nbsp;지시하신 것이라', '{{절||2}} 요한은', '== 2장 ==', '<br> &nbsp;&nbsp;장 밖'].join('\n'),
    )
    const source = await fetchSource('revelation', { from: 1, to: 1 }, dir)
    expect(source.chapters).toEqual([
      {
        chapter: 1,
        verses: [
          { verse: 1, text: '계시라 지시하신 것이라' },
          { verse: 2, text: '요한은' },
        ],
      },
    ])
  })

  it('받지 못하면 오류를 내고 아무것도 쓰지 않는다', async () => {
    fetchMock = stubFetch('', 404)
    await expect(fetchSource('ruth', {}, dir)).rejects.toThrow('본문을 가져오지 못했습니다 (HTTP 404)')
    expect(existsSync(sourceFilePath('ruth', dir))).toBe(false)
  })

  it('본문 형식을 알아보지 못하면 응답의 첫 줄과 함께 오류를 낸다', async () => {
    fetchMock = stubFetch('개역한글판은 이 쪽에 없습니다\n다음 줄')
    await expect(fetchSource('ruth', {}, dir)).rejects.toThrow('본문 형식을 알아보지 못했습니다. 응답의 첫 줄: 개역한글판은 이 쪽에 없습니다')
    expect(existsSync(sourceFilePath('ruth', dir))).toBe(false)
  })

  it('받은 본문이 빠짐없이 이어지지 않으면 오류를 내고 있던 파일은 그대로 둔다', async () => {
    const old = JSON.stringify({ book: '룻기', translation: '개역한글', chapters: [{ chapter: 1, verses: [{ verse: 1, text: '옛 본문' }] }] })
    await writeFile(sourceFilePath('ruth', dir), old)

    // 3장이 통째로 없고 2장은 2절이 없다.
    fetchMock = stubFetch(['== 1장 ==', '{{절|1|1}} 가', '== 2장 ==', '{{절|2|}} 나', '{{절||3}} 다', '== 4장 ==', '{{절|4|}} 라'].join('\n'))
    await expect(fetchSource('ruth', {}, dir)).rejects.toThrow('본문 검증에 실패했습니다:\n2장: 2절이 없습니다\n3장이 없습니다')
    expect(await readFile(sourceFilePath('ruth', dir), 'utf8')).toBe(old)
  })
})
