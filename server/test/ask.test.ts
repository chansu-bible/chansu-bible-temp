import type { BookId } from 'reader-core'
import { describe, expect, it } from 'vitest'
import { createVerifier } from '../src/auth.ts'
import { createApp } from '../src/app.ts'
import { answerQuestion, NONE_TEXT, type AskModel, type AskRequest } from '../src/ask/answer.ts'
import { buildPassages, type AskBundle } from '../src/ask/passages.ts'
import { buildIndex, retrieve, type PassageIndex } from '../src/ask/retrieve.ts'
import { ISSUER, memorySql, newUser, testKeys, token } from './helpers.ts'

const bundle: AskBundle = {
  bookId: 'genesis',
  book: '창세기',
  chapters: [
    {
      chapter: 4,
      verses: [
        { verse: 2, text: '아벨은 양 치는 자이었고 가인은 농사하는 자이었더라' },
        { verse: 15, text: '여호와께서 그에게 이르시되 그렇지 아니하다 가인을 죽이는 자는 벌을 칠 배나 받으리라 하시고 가인에게 표를 주사 만나는 누구에게든지 죽임을 면케 하시니라' },
        { verse: 16, text: '가인이 여호와의 앞을 떠나 나가 에덴 동편 놋 땅에 거하였더니' },
      ],
      scenes: [
        {
          id: 'genesis-04-03',
          verseStart: 13,
          verseEnd: 16,
          title: '가인의 표와 떠남',
          commentary: null,
          explanation: ['하나님은 가인이 죽임을 당하지 않도록 표를 주셨어요. 본문은 표의 모양을 말하지 않아요.'],
          history: [],
          reviewStatus: 'reviewed',
        },
        {
          id: 'genesis-04-09',
          verseStart: 1,
          verseEnd: 2,
          title: '검수 전 장면',
          commentary: '가인의 표는 붉은 점이었다',
          explanation: [],
          history: [],
          reviewStatus: 'draft',
        },
      ],
    },
  ],
  characters: [{ id: 'cain', name: '가인', aliases: [], firstAppearance: '4:1', notes: '아담과 하와의 첫아들. 농사하는 자.' }],
  places: [{ id: 'nod', name: '놋', description: '에덴 동편의 땅. 가인이 떠나 살았다.' }],
  things: [],
}

const index = buildIndex(buildPassages([bundle]))

describe('대목 만들기와 찾기', () => {
  it('본문 절, 검수된 장면, 설정집으로 대목을 만들고 검수 전 장면은 뺀다', () => {
    expect(index.passages.map((passage) => passage.id)).toEqual([
      'v:genesis:4:2',
      'v:genesis:4:15',
      'v:genesis:4:16',
      's:genesis-04-03',
      'c:character:cain',
      'c:place:nod',
    ])
    expect(index.passages.every((passage) => passage.book === 'genesis')).toBe(true)
    expect(index.books).toEqual(['genesis'])
  })

  it('질문과 겹치는 대목을 먼저 준다', () => {
    const found = retrieve(index, '가인의 표가 뭐예요?', { chapter: 4 }).map((item) => item.passage.id)
    // 이름이 그대로 나온 설정집 항목(가인)과 표를 말하는 대목이 위에 온다.
    expect(found.slice(0, 3).sort()).toEqual(['c:character:cain', 's:genesis-04-03', 'v:genesis:4:15'])
    expect(found).not.toContain('s:genesis-04-09')
    expect(retrieve(index, '놋은 어디예요?')[0]?.passage.id).toBe('c:place:nod')
    expect(retrieve(index, 'ㅋㅋ')).toEqual([])
  })
})

// 뒤 책(출애굽기) 묶음. 앞 책의 가인과 놋이 인용만 책 이름으로 바뀐 채 다시 든다.
const exodus: AskBundle = {
  bookId: 'exodus',
  book: '출애굽기',
  chapters: [
    {
      chapter: 3,
      verses: [
        { verse: 2, text: '여호와의 사자가 떨기나무 가운데서 타는 불꽃으로 그에게 나타나시니라 그가 보니 떨기나무에 불이 붙었으나 사라지지 아니하는지라' },
        { verse: 15, text: '하나님이 또 모세에게 이르시되 너는 이스라엘 자손에게 이같이 이르기를 너희 조상의 하나님 여호와가 나를 너희에게 보내셨다 하라' },
      ],
      scenes: [
        {
          id: 'exodus-03-01',
          verseStart: 1,
          verseEnd: 6,
          title: '떨기나무 불꽃',
          commentary: null,
          explanation: ['여호와의 사자가 불꽃 가운데 나타났어요. 모세는 사라지지 않는 불을 보려고 가까이 갔어요.'],
          history: [],
          reviewStatus: 'reviewed',
        },
      ],
    },
  ],
  characters: [
    { id: 'cain', name: '가인', aliases: [], firstAppearance: '창세기 4:1', notes: '아담과 하와의 첫아들. 농사하는 자.' },
    { id: 'moses', name: '모세', aliases: [], firstAppearance: '2:10', notes: '이스라엘 자손으로 태어나 바로의 딸의 아들이 된 사람.' },
  ],
  places: [
    { id: 'nod', name: '놋', description: '에덴 동편의 땅. 가인이 떠나 살았다.' },
    { id: 'horeb', name: '호렙', description: '떨기나무 불꽃이 나타난 하나님의 산.' },
  ],
  things: [],
}

// 창세기 3장을 더한 창세기 묶음. 출애굽기 3장과 장 번호가 같아서, 장 가중이 책까지 보는지 가린다.
const genesisWithFall: AskBundle = {
  ...bundle,
  chapters: [
    { chapter: 3, verses: [{ verse: 8, text: '아담과 그 아내가 여호와 하나님의 낯을 피하여 동산 나무 사이에 숨은지라' }], scenes: [] },
    ...bundle.chapters,
  ],
}

const books = [genesisWithFall, exodus]
const multi = buildIndex(buildPassages(books))

describe('책 묶음이 여럿일 때의 대목', () => {
  const labelsOf = (bundles: AskBundle[]) => Object.fromEntries(buildPassages(bundles).map((passage) => [passage.id, passage.label]))
  const textOf = (bundles: AskBundle[], id: string) => buildPassages(bundles).find((passage) => passage.id === id)?.text

  it('이름표에 책 이름이 붙는다(묶음이 하나면 붙지 않는다)', () => {
    expect(labelsOf([bundle])).toMatchObject({
      'v:genesis:4:15': '본문 4:15',
      's:genesis-04-03': '해설 · 가인의 표와 떠남',
      'c:character:cain': '설정집 · 가인',
    })
    expect(labelsOf(books)).toMatchObject({
      'v:genesis:4:15': '본문 창세기 4:15',
      's:genesis-04-03': '해설 · 창세기 4장 · 가인의 표와 떠남',
      'c:character:cain': '설정집 · 가인',
      'v:exodus:3:2': '본문 출애굽기 3:2',
      's:exodus-03-01': '해설 · 출애굽기 3장 · 떨기나무 불꽃',
      'c:character:moses': '설정집 · 모세',
      'c:place:horeb': '설정집 · 호렙',
    })
  })

  it('장면 글은 절 범위를 그대로 두고, 설정집 글의 처음 나오는 곳은 책이 여럿일 때만 책 이름을 붙인다', () => {
    for (const bundles of [[bundle], books]) {
      expect(textOf(bundles, 's:genesis-04-03')).toMatch(/^가인의 표와 떠남\(4:13~16\)\. /)
    }
    expect(textOf([bundle], 'c:character:cain')).toContain('처음 나오는 곳 4:1 ')
    expect(textOf(books, 'c:character:cain')).toContain('처음 나오는 곳 창세기 4:1 ')
    expect(textOf(books, 'c:character:moses')).toContain('처음 나오는 곳 출애굽기 2:10 ')
  })

  it('두 묶음에 든 설정집 항목은 처음 나오는 책의 것 하나만 둔다', () => {
    const passages = buildPassages(books)
    expect(new Set(passages.map((passage) => passage.id)).size).toBe(passages.length)
    // 가인은 창세기 묶음에서는 "4:1", 출애굽기 묶음에서는 "창세기 4:1"이다. 창세기 4장의 것이 남는다.
    expect(passages.filter((passage) => passage.id === 'c:character:cain')).toMatchObject([{ book: 'genesis', chapter: 4 }])
    // 묶음 순서가 바뀌어도 처음 나오는 곳이 그 책 안인 묶음의 것이 남는다.
    const reversed = buildPassages([exodus, genesisWithFall])
    expect(reversed.filter((passage) => passage.id === 'c:character:cain')).toMatchObject([{ book: 'genesis', chapter: 4 }])
    // 뒤 책에서 처음 나오는 인물은 그 책의 것이다.
    expect(passages.find((passage) => passage.id === 'c:character:moses')).toMatchObject({ book: 'exodus', chapter: 2 })
    // 장소와 물건은 처음 나오는 곳을 몰라 먼저 나온 묶음의 것이다. 장은 모른다.
    expect(passages.filter((passage) => passage.id === 'c:place:nod')).toMatchObject([{ book: 'genesis', chapter: null }])
    expect(passages.find((passage) => passage.id === 'c:place:horeb')).toMatchObject({ book: 'exodus', chapter: null })
  })

  it('처음 나오는 곳을 읽지 못하는 항목은 먼저 나온 묶음의 것을 둔다', () => {
    const unreadable = (text: string) => ({ id: 'unnamed', name: '이름 없는 이', aliases: [], firstAppearance: text, notes: '출처가 불분명하다.' })
    const first = { ...bundle, characters: [unreadable('미상')] }
    const second = { ...exodus, characters: [unreadable('미상')] }
    expect(buildPassages([first, second]).filter((passage) => passage.id === 'c:character:unnamed')).toMatchObject([
      { book: 'genesis', chapter: null },
    ])
  })

  it('대목을 만들다 실패하면 어느 묶음 파일인지 밝힌다', () => {
    // 둘째 묶음(출애굽기)의 장에 본문 절 목록이 없다. 첫째 묶음(창세기)은 멀쩡하다.
    const noVerses = { ...exodus, chapters: [{ chapter: 3 }] } as unknown as AskBundle
    expect(() => buildPassages([bundle, noVerses])).toThrow('exodus.json으로 대목을 만들지 못했습니다')
  })

  it('설정집을 만들다 나는 오류도, 오류가 아닌 값을 던져도 파일을 밝히고 원래 값을 cause에 남긴다', () => {
    const failureOf = (patch: object) => {
      try {
        buildPassages([bundle, { ...exodus, ...patch } as unknown as AskBundle])
      } catch (error) {
        return error as Error
      }
      throw new Error('대목을 만들다 실패해야 한다')
    }
    const prefix = 'exodus.json으로 대목을 만들지 못했습니다: '
    // 설정집을 만들 때 난다: 인물에 aliases가 없다.
    const noAliases = failureOf({ characters: [{ id: 'moses', name: '모세', firstAppearance: '2:10', notes: '' }] })
    expect(noAliases.message.startsWith(prefix)).toBe(true)
    expect(noAliases.cause).toBeInstanceOf(TypeError)
    // 오류가 아닌 값을 던지면(장 목록을 도는 중에) 글로 바꿔 담고, 그 값이 cause다.
    const thrown = failureOf({
      chapters: {
        [Symbol.iterator]: () => {
          throw '글을 던졌다'
        },
      },
    })
    expect(thrown.message).toBe(`${prefix}글을 던졌다`)
    expect(thrown.cause).toBe('글을 던졌다')
  })

  it('색인은 든 책을 안다', () => {
    expect(multi.books).toEqual(['genesis', 'exodus'])
  })
})

// 질문에서 대목마다 점수
const scoresOf = (target: PassageIndex, question: string, options: { book?: BookId; chapter?: number } = {}) =>
  new Map(retrieve(target, question, { limit: 100, ...options }).map((item) => [item.passage.id, item.score]))

// 장 가중을 받아 점수가 오른 대목
const boostedBy = (before: Map<string, number>, after: Map<string, number>) =>
  [...after].filter(([id, score]) => score > (before.get(id) ?? 0)).map(([id]) => id).sort()

describe('장 가중', () => {
  // 창세기 3장과 4장, 출애굽기 3장에 이 낱말이 든 대목이 있다.
  const question = '여호와가 누구예요?'
  const base = scoresOf(multi, question)

  it('책과 장이 둘 다 맞는 대목에만 준다', () => {
    expect(base.has('v:genesis:3:8') && base.has('v:genesis:4:15') && base.has('v:exodus:3:2')).toBe(true)
    expect(boostedBy(base, scoresOf(multi, question, { book: 'exodus', chapter: 3 }))).toEqual(['s:exodus-03-01', 'v:exodus:3:15', 'v:exodus:3:2'])
    expect(boostedBy(base, scoresOf(multi, question, { book: 'genesis', chapter: 3 }))).toEqual(['v:genesis:3:8'])
    expect(boostedBy(base, scoresOf(multi, question, { book: 'genesis', chapter: 4 }))).toEqual(['v:genesis:4:15', 'v:genesis:4:16'])
    // 책에 없는 장이면 주지 않는다.
    expect(boostedBy(base, scoresOf(multi, question, { book: 'exodus', chapter: 4 }))).toEqual([])
  })

  it('책이 없고 묶음이 여럿이면 주지 않는다', () => {
    expect(scoresOf(multi, question, { chapter: 3 })).toEqual(base)
    expect(scoresOf(multi, question, { chapter: 4 })).toEqual(base)
  })

  it('책이 없어도 묶음이 하나면 그 책으로 본다', () => {
    const single = scoresOf(index, question)
    expect(boostedBy(single, scoresOf(index, question, { chapter: 4 }))).toEqual(['v:genesis:4:15', 'v:genesis:4:16'])
    expect(boostedBy(single, scoresOf(index, question, { book: 'genesis', chapter: 4 }))).toEqual(['v:genesis:4:15', 'v:genesis:4:16'])
    // 묶음이 하나여도 요청이 다른 책을 말하면 그 책의 대목이 없어 주지 않는다.
    expect(boostedBy(single, scoresOf(index, question, { book: 'exodus', chapter: 4 }))).toEqual([])
  })
})

// 받은 자료 번호를 그대로 근거로 다는 가짜 모델
const answering =
  (output: unknown): AskModel =>
  async () =>
    output

// 받은 글을 남기고 "자료에 없어요"로 답하는 가짜 모델
function recording() {
  const prompts: { system: string; user: string }[] = []
  const model: AskModel = async (request) => {
    prompts.push(request)
    return { found: false, sentences: [] }
  }
  return { model, prompts }
}

describe('answerQuestion', () => {
  it('문장마다 근거가 맞으면 답과 근거 표식을 돌려준다', async () => {
    const result = await answerQuestion(
      index,
      answering({ found: true, sentences: [{ text: '가인이 죽임을 당하지 않게 주신 표예요. [S1]', sources: ['S1'] }, { text: '모양은 적혀 있지 않아요.', sources: ['S2'] }] }),
      { question: '가인의 표가 뭐예요?', chapter: 4 },
    )
    expect(result.status).toBe('answer')
    expect(result.text).toBe('가인이 죽임을 당하지 않게 주신 표예요. 모양은 적혀 있지 않아요.')
    // S1, S2는 찾은 대목의 첫째와 둘째다.
    const top = retrieve(index, '가인의 표가 뭐예요?', { chapter: 4 }).slice(0, 2).map((item) => item.passage.id)
    expect(result.citations.map((citation) => citation.id)).toEqual(top)
  })

  it('근거가 없는 문장이나 모르는 번호가 있으면 버리고 자료에 없어요와 가까운 대목 둘을 준다', async () => {
    const noSource = await answerQuestion(
      index,
      answering({ found: true, sentences: [{ text: '표는 붉은 점이에요.', sources: [] }] }),
      { question: '가인의 표가 뭐예요?' },
    )
    expect(noSource).toMatchObject({ status: 'none', text: NONE_TEXT })
    expect(noSource.citations).toHaveLength(2)
    const unknown = await answerQuestion(index, answering({ found: true, sentences: [{ text: '표예요.', sources: ['S99'] }] }), {
      question: '가인의 표가 뭐예요?',
    })
    expect(unknown.status).toBe('none')
    const notFound = await answerQuestion(index, answering({ found: false, sentences: [] }), { question: '가인의 아내는 누구예요?' })
    expect(notFound.status).toBe('none')
  })

  it('근거 표식에 대목의 책이 든다', async () => {
    // 이 질문은 두 책의 대목 여섯을 찾는다. 모두 근거로 단다.
    const question = '여호와가 누구예요?'
    const found = retrieve(multi, question, { limit: 10 }).map((item) => item.passage)
    expect(found).toHaveLength(6)
    const result = await answerQuestion(
      multi,
      answering({ found: true, sentences: [{ text: '답이에요.', sources: found.map((_, at) => `S${at + 1}`) }] }),
      { question },
    )
    expect(result.status).toBe('answer')
    expect(result.citations).toHaveLength(6)
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'v:genesis:4:15', book: 'genesis', chapter: 4, verse: 15 }),
        expect.objectContaining({ id: 'v:genesis:3:8', book: 'genesis', chapter: 3, verse: 8 }),
        expect.objectContaining({ id: 'v:exodus:3:2', book: 'exodus', chapter: 3, verse: 2 }),
        expect.objectContaining({ id: 's:exodus-03-01', book: 'exodus', chapter: 3, sceneId: 'exodus-03-01' }),
      ]),
    )
    // 답을 버릴 때 주는 가까운 대목에도 책이 든다. 장을 모르는 설정집(장소)도 책은 안다.
    const none = await answerQuestion(multi, answering({ found: false, sentences: [] }), { question: '떨기나무 불꽃이 뭐예요?' })
    expect(none.citations.map((citation) => [citation.id, citation.book, citation.chapter])).toEqual([
      ['c:place:horeb', 'exodus', null],
      ['s:exodus-03-01', 'exodus', 3],
    ])
  })

  it('시스템 글은 책을 가리지 않고, 읽고 있는 곳은 책과 장을 둘 다 알 때만 적는다', async () => {
    const ask = async (target: PassageIndex, request: AskRequest) => {
      const { model, prompts } = recording()
      await answerQuestion(target, model, request)
      return prompts[0]!
    }
    const question = '여호와가 누구예요?'
    const line = (prompt: { user: string }) => prompt.user.split('\n').find((item) => item.startsWith('(독자가 읽고 있는 곳'))

    const exodusPrompt = await ask(multi, { question, book: 'exodus', chapter: 3 })
    expect(line(exodusPrompt)).toBe('(독자가 읽고 있는 곳: 출애굽기 3장)')
    expect(exodusPrompt.system).toContain('독자가 성경에 대해 물으면, 번호를 붙여 준 자료')
    expect(exodusPrompt.system).not.toContain('창세기')
    // 책을 모르면(묶음이 여럿인데 요청에 없다) 장이 있어도 적지 않는다. 장이 없어도 적지 않는다.
    expect(line(await ask(multi, { question, chapter: 3 }))).toBeUndefined()
    expect(line(await ask(multi, { question, book: 'exodus' }))).toBeUndefined()
    expect(line(await ask(multi, { question }))).toBeUndefined()
    // 묶음이 하나면 요청에 책이 없어도 그 책이다.
    expect(line(await ask(index, { question, chapter: 4 }))).toBe('(독자가 읽고 있는 곳: 창세기 4장)')
  })
})

async function askApp(model: AskModel, dailyLimit = 20, askIndex: PassageIndex = index) {
  const sql = await memorySql()
  const { privateKey, jwks } = await testKeys()
  const verify = createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app'], jwks })
  const app = createApp({ sql, verify, corsOrigins: [], ask: { index: askIndex, model, dailyLimit } })
  return { app, bearer: await token(privateKey, { sub: newUser() }) }
}

const post = (app: Awaited<ReturnType<typeof askApp>>['app'], bearer: string | null, body: unknown) =>
  app.request('/ask', {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /ask', () => {
  const good = answering({ found: true, sentences: [{ text: '보호하려고 주신 표예요.', sources: ['S1'] }] })

  it('로그인해야 쓰고, 남은 횟수를 알려 준다', async () => {
    const { app, bearer } = await askApp(good, 2)
    expect((await post(app, null, { question: '가인의 표?' })).status).toBe(401)
    const first = await post(app, bearer, { question: '가인의 표가 뭐예요?', chapter: 4 })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ status: 'answer', remaining: 1 })
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(await usage.json()).toEqual({ available: true, limit: 2, remaining: 1 })
  })

  it('하루 한도를 넘으면 429이고, 답을 못 만들면 502로 한 번을 되돌린다', async () => {
    const { app, bearer } = await askApp(good, 1)
    expect((await post(app, bearer, { question: '가인의 표가 뭐예요?' })).status).toBe(200)
    expect((await post(app, bearer, { question: '가인의 표가 뭐예요?' })).status).toBe(429)

    const failing = await askApp(async () => {
      throw new Error('모델 오류')
    }, 1)
    expect((await post(failing.app, failing.bearer, { question: '가인의 표가 뭐예요?' })).status).toBe(502)
    const usage = await failing.app.request('/ask/usage', { headers: { Authorization: `Bearer ${failing.bearer}` } })
    expect(await usage.json()).toMatchObject({ remaining: 1 })
  })

  it('빈 질문이나 너무 긴 질문은 400이다', async () => {
    const { app, bearer } = await askApp(good)
    expect((await post(app, bearer, { question: '  ' })).status).toBe(400)
    expect((await post(app, bearer, { question: '가'.repeat(301) })).status).toBe(400)
  })

  it('모르는 책이면 400이고 하루 횟수를 쓰지 않는다', async () => {
    const { app, bearer } = await askApp(good, 1, multi)
    const unknown = await post(app, bearer, { question: '가인의 표가 뭐예요?', chapter: 3, book: 'atlantis' })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ error: '알 수 없는 책입니다: atlantis' })
    // 책 이름(한국어)은 책 id가 아니다.
    const byName = await post(app, bearer, { question: '가인의 표가 뭐예요?', book: '창세기' })
    expect(byName.status).toBe(400)
    expect(await byName.json()).toEqual({ error: '알 수 없는 책입니다: 창세기' })
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(await usage.json()).toMatchObject({ remaining: 1 })
  })

  it('책이 문자열이 아니거나 너무 길어도 책 오류이고, 그 입력은 되돌려 주지 않는다', async () => {
    const { app, bearer } = await askApp(good, 1, multi)
    const question = '가인의 표가 뭐예요?'
    for (const book of [null, 3, true, ['genesis'], { id: 'genesis' }, 'x'.repeat(41)]) {
      const reply = await post(app, bearer, { question, book })
      expect(reply.status).toBe(400)
      expect(await reply.json()).toEqual({ error: '알 수 없는 책입니다' })
    }
    // 40자까지는 모르는 책으로 되돌려 준다.
    const forty = 'y'.repeat(40)
    expect(await (await post(app, bearer, { question, book: forty })).json()).toEqual({ error: `알 수 없는 책입니다: ${forty}` })
    // 질문이 틀렸으면 질문 오류다.
    expect(await (await post(app, bearer, { question: '  ', book: 3 })).json()).toEqual({ error: '질문은 1자에서 300자 사이로 써 주세요' })
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(await usage.json()).toMatchObject({ remaining: 1 })
  })

  it('장 번호가 문자열이거나 1보다 작거나 정수가 아니면 장 오류이고, 하루 횟수를 쓰지 않는다', async () => {
    const { app, bearer } = await askApp(good, 1, multi)
    const question = '가인의 표가 뭐예요?'
    for (const chapter of ['3', 0, 1.5]) {
      const reply = await post(app, bearer, { question, chapter })
      expect(reply.status).toBe(400)
      // 질문이 맞는데도 질문 오류로 알리지 않고, 그 입력은 되돌려 주지 않는다.
      expect(await reply.json()).toEqual({ error: '장 번호가 맞지 않습니다' })
    }
    // 질문이 틀렸으면 질문 오류다.
    expect(await (await post(app, bearer, { question: '  ', chapter: 0 })).json()).toEqual({ error: '질문은 1자에서 300자 사이로 써 주세요' })
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(await usage.json()).toMatchObject({ remaining: 1 })
  })

  it('읽어 두지 않은 책이어도 성경의 책이면 받고, 횟수를 한 번 쓰고, 장 가중은 주지 않는다', async () => {
    const { model, prompts } = recording()
    const { app, bearer } = await askApp(model, 5, multi)
    const question = '여호와가 누구예요?'
    const reply = await post(app, bearer, { question, chapter: 3, book: 'leviticus' })
    expect(reply.status).toBe(200)
    const body = (await reply.json()) as { remaining: number; citations: { id: string }[] }
    expect(body.remaining).toBe(4)
    expect(prompts[0]!.user).toContain('(독자가 읽고 있는 곳: 레위기 3장)')
    // 레위기 대목이 없어 가중이 없다. 책과 장 없이 물은 것과 같은 가까운 대목 둘이고, 출애굽기 3장으로 물었을 때와는 다르다.
    const plain = retrieve(multi, question, { limit: 2 }).map((item) => item.passage.id)
    expect(body.citations.map((citation) => citation.id)).toEqual(plain)
    expect(retrieve(multi, question, { book: 'exodus', chapter: 3, limit: 2 }).map((item) => item.passage.id)).not.toEqual(plain)
    const usage = await app.request('/ask/usage', { headers: { Authorization: `Bearer ${bearer}` } })
    expect(await usage.json()).toMatchObject({ remaining: 4 })
  })

  it('책을 받으면 그 책의 장으로 묻고, 근거 표식에 책을 담아 돌려준다', async () => {
    // 모델이 답을 못 해서 가까운 대목 둘이 돌아온다.
    const { model, prompts } = recording()
    const { app, bearer } = await askApp(model, 5, multi)
    const nearest = async (body: object) => {
      const reply = await post(app, bearer, body)
      expect(reply.status).toBe(200)
      const { citations } = (await reply.json()) as { citations: { book: string; chapter: number | null }[] }
      return citations.map((citation) => [citation.book, citation.chapter])
    }
    const question = '여호와가 누구예요?'
    // 출애굽기 3장을 읽고 있으면 그 장의 대목 둘이 가까운 대목이다.
    expect(await nearest({ question, chapter: 3, book: 'exodus' })).toEqual([['exodus', 3], ['exodus', 3]])
    expect(prompts[0]!.user).toContain('(독자가 읽고 있는 곳: 출애굽기 3장)')
    // 책이 없으면(묶음이 둘이다) 장 가중이 없어 창세기 4장 대목이 둘째로 온다. 읽고 있는 곳도 적지 않는다.
    expect(await nearest({ question, chapter: 3 })).toEqual([['exodus', 3], ['genesis', 4]])
    expect(prompts[1]!.user).not.toContain('독자가 읽고 있는 곳')
  })
})
