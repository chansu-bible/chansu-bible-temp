import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
    expect(() => parseChapterRange(text)).toThrow(new Error(`장 범위는 3-7이나 3처럼 씁니다: ${text}`))
  })
})

// 위키문헌 글의 장 하나: 장 제목과 "N장 M절" 본문의 절들
function block(chapter: number, verseCount: number): string[] {
  const marker = (verse: number) => (verse > 1 ? `{{절||${verse}}}` : chapter === 1 ? '{{절|1|1}}' : `{{절|${chapter}|}}`)
  return ['', `== ${chapter}장 ==`, ...Array.from({ length: verseCount }, (_, i) => `${marker(i + 1)} ${chapter}장 ${i + 1}절`)]
}

// 장 덩어리를 주어진 차례대로 이은 위키문헌 글
function page(...blocks: string[][]): string {
  return ['{{머리말', '|제목 = [[../]]', '}}', ...blocks.flat()].join('\n')
}

// 1장부터 차례로 장마다 절 수만큼
const wikitextOf = (verseCounts: number[]) => page(...verseCounts.map((count, index) => block(index + 1, count)))

const pageUrl = (title: string) => `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`

function stubFetch(text: string, status = 200) {
  const mock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(text, { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

// 정확히 이 글의 오류로 거절되는지 본다(toThrow는 글의 일부만 맞아도 지나가고, 오류 값으로 견주면 cause까지 맞춰야 한다).
async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ message })
}

describe('fetchSource', () => {
  let dir: string
  let fetchMock: ReturnType<typeof stubFetch>

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pipeline-source-'))
    // 시험이 위키문헌에 닿지 않게 기본으로 막아 둔다.
    fetchMock = stubFetch('')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await rm(dir, { recursive: true, force: true })
  })

  describe('장 범위', () => {
    it('책에 없는 장이 들어 있으면 받기 전에 오류를 낸다', async () => {
      await expectRejection(fetchSource('ruth', { from: 3, to: 5 }, dir), '룻기의 장 범위가 틀렸습니다: 3~5 (1~4장)')
      await expectRejection(fetchSource('ruth', { to: 5 }, dir), '룻기의 장 범위가 틀렸습니다: 1~5 (1~4장)')
      await expectRejection(fetchSource('ruth', { from: 0 }, dir), '룻기의 장 범위가 틀렸습니다: 0~4 (1~4장)')
      await expectRejection(fetchSource('ruth', { from: 5, to: 5 }, dir), '룻기의 장 범위가 틀렸습니다: 5~5 (1~4장)')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(existsSync(sourceFilePath('ruth', dir))).toBe(false)
    })

    it('시작이 끝보다 크면 받기 전에 오류를 낸다', async () => {
      await expectRejection(fetchSource('ruth', { from: 3, to: 2 }, dir), '룻기의 장 범위가 틀렸습니다: 3~2 (1~4장)')
      await expectRejection(fetchSource('ruth', { from: 5 }, dir), '룻기의 장 범위가 틀렸습니다: 5~4 (1~4장)')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('정수가 아닌 장도 받기 전에 오류를 낸다', async () => {
      await expectRejection(fetchSource('ruth', { from: 1.5, to: 3 }, dir), '룻기의 장 범위가 틀렸습니다: 1.5~3 (1~4장)')
      await expectRejection(fetchSource('ruth', { from: Number.NaN }, dir), '룻기의 장 범위가 틀렸습니다: NaN~4 (1~4장)')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('받아서 쓰기', () => {
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

    it('임시 파일을 거쳐 쓰고 임시 파일은 남기지 않는다', async () => {
      fetchMock = stubFetch(wikitextOf([2, 3, 1, 2]))
      await fetchSource('ruth', {}, dir)
      expect(await readdir(dir)).toEqual(['ruth.json'])
    })

    it('쓰다가 실패해도 있던 파일은 그대로다', async () => {
      const old = JSON.stringify({ book: '룻기', translation: '개역한글', chapters: [{ chapter: 1, verses: [{ verse: 1, text: '옛 본문' }] }] })
      await writeFile(sourceFilePath('ruth', dir), old)
      // 임시 파일 자리가 폴더이면 임시 파일을 쓸 수 없다.
      await mkdir(`${sourceFilePath('ruth', dir)}.tmp`)
      fetchMock = stubFetch(wikitextOf([2, 3, 1, 2]))
      await expect(fetchSource('ruth', {}, dir)).rejects.toThrow()
      expect(await readFile(sourceFilePath('ruth', dir), 'utf8')).toBe(old)
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

    it('절 글의 겹빈칸은 하나로 줄여 쓴다', async () => {
      fetchMock = stubFetch(['== 128장 ==', '{{절|128|}} [성전에 올라가는 노래]  여호와를 경외하며'].join('\n'))
      const source = await fetchSource('psalms', { from: 128, to: 128 }, dir)
      expect(source.chapters[0]!.verses).toEqual([{ verse: 1, text: '[성전에 올라가는 노래] 여호와를 경외하며' }])
    })
  })

  describe('받지 못할 때', () => {
    it('HTTP 오류에는 책과 위키문헌 쪽 이름을 적고, 아무것도 쓰지 않는다', async () => {
      fetchMock = stubFetch('', 404)
      await expectRejection(fetchSource('ruth', {}, dir), '룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (HTTP 404)')
      // 쪽 이름이 책 이름과 다른 책은 어느 쪽을 찾았는지 보여야 한다.
      await expectRejection(fetchSource('1-john', {}, dir), '요한일서 본문을 가져오지 못했습니다: 개역한글판/요한1서 (HTTP 404)')
      expect(await readdir(dir)).toEqual([])
    })

    it('연결이 끊기면 책과 쪽 이름, 원래 오류를 적고 cause에 원래 오류를 남긴다', async () => {
      const cause = new TypeError('fetch failed')
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(cause)))
      const error = await fetchSource('ruth', {}, dir).then(
        () => undefined,
        (reason: unknown) => reason,
      )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (fetch failed)')
      expect((error as Error).cause).toBe(cause)
      expect(await readdir(dir)).toEqual([])
    })

    it('오류에 원인이 들어 있으면 그것도 적고, cause에는 원래 오류를 남긴다(undici는 진짜 이유를 cause에 담는다)', async () => {
      const error = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND ko.wikisource.org') })
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(error)))
      const thrown = await fetchSource('ruth', {}, dir).then(
        () => undefined,
        (reason: unknown) => reason,
      )
      expect((thrown as Error).message).toBe('룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (fetch failed: getaddrinfo ENOTFOUND ko.wikisource.org)')
      expect((thrown as Error).cause).toBe(error)
    })

    it('원인에 글이 없으면 오류 부호를 적는다', async () => {
      // 주소가 여럿인 곳(localhost)에 연결하지 못하면 원인이 글 없는 AggregateError이고 부호만 있다.
      const cause = Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' })
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed', { cause }))))
      await expectRejection(fetchSource('ruth', {}, dir), '룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (fetch failed: ECONNREFUSED)')
    })

    it('본문을 읽다가 끊겨도 같다', async () => {
      const cause = new Error('연결이 끊겼습니다')
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => Promise.reject(cause) })))
      await expectRejection(fetchSource('ruth', {}, dir), '룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (연결이 끊겼습니다)')
    })

    it('60초 안에 끝나지 않으면 끊고 그렇게 알린다', async () => {
      // 60초를 기다리지 않게, 시간 제한 신호를 시험이 직접 당길 수 있는 신호로 바꾼다.
      const controller = new AbortController()
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
            }),
        ),
      )
      const pending = fetchSource('ruth', {}, dir)
      controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      await expectRejection(pending, '룻기 본문을 가져오지 못했습니다: 개역한글판/룻기 (The operation was aborted due to timeout)')
      expect(timeout).toHaveBeenCalledWith(60_000)
    })

    it('받은 글이 비어 있으면 비어 있다고 알린다', async () => {
      for (const body of ['', '\n  \n']) {
        fetchMock = stubFetch(body)
        await expectRejection(fetchSource('ruth', {}, dir), '룻기 본문이 비어 있습니다: 개역한글판/룻기')
      }
      expect(await readdir(dir)).toEqual([])
    })

    it('본문 형식을 알아보지 못하면 응답의 첫 줄과 함께 오류를 낸다', async () => {
      fetchMock = stubFetch('\n  개역한글판은 이 쪽에 없습니다  \n다음 줄')
      await expectRejection(fetchSource('ruth', {}, dir), '본문 형식을 알아보지 못했습니다. 응답의 첫 줄: 개역한글판은 이 쪽에 없습니다')
      expect(await readdir(dir)).toEqual([])
    })

    it('받은 본문이 빠짐없이 이어지지 않으면 오류를 내고 있던 파일은 그대로 둔다', async () => {
      const old = JSON.stringify({ book: '룻기', translation: '개역한글', chapters: [{ chapter: 1, verses: [{ verse: 1, text: '옛 본문' }] }] })
      await writeFile(sourceFilePath('ruth', dir), old)

      // 3장이 통째로 없고 2장은 2절이 없다.
      fetchMock = stubFetch(['== 1장 ==', '{{절|1|1}} 가', '== 2장 ==', '{{절|2|}} 나', '{{절||3}} 다', '== 4장 ==', '{{절|4|}} 라'].join('\n'))
      await expectRejection(fetchSource('ruth', {}, dir), '본문 검증에 실패했습니다:\n2장: 2절이 없습니다\n3장이 없습니다')
      expect(await readFile(sourceFilePath('ruth', dir), 'utf8')).toBe(old)
    })

    it('같은 장이 겹친 글은 쓰지 않는다', async () => {
      fetchMock = stubFetch(page(block(1, 2), block(2, 3), block(2, 3), block(3, 1), block(4, 2)))
      await expectRejection(fetchSource('ruth', {}, dir), '본문 검증에 실패했습니다:\n2장이 두 번 있습니다')
      expect(await readdir(dir)).toEqual([])
    })

    it('장 순서가 바뀐 글은 쓰지 않는다', async () => {
      fetchMock = stubFetch(page(block(1, 2), block(3, 1), block(2, 3), block(4, 2)))
      await expectRejection(fetchSource('ruth', {}, dir), '본문 검증에 실패했습니다:\n장 순서가 맞지 않습니다: 1, 3, 2, 4')
      expect(await readdir(dir)).toEqual([])
    })

    it('위키 문법이 남은 절이 있으면 쓰지 않는다', async () => {
      fetchMock = stubFetch(['== 1장 ==', '{{절|1|1}} 가', '{{절||2}} 나 <ref>각주</ref>'].join('\n'))
      await expectRejection(fetchSource('ruth', { from: 1, to: 1 }, dir), '본문 검증에 실패했습니다:\n1장 2절에 위키 문법이 남아 있습니다')
      expect(await readdir(dir)).toEqual([])
    })
  })
})
