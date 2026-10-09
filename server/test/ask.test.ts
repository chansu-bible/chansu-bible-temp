import { describe, expect, it } from 'vitest'
import { createVerifier } from '../src/auth.ts'
import { createApp } from '../src/app.ts'
import { answerQuestion, NONE_TEXT, type AskModel } from '../src/ask/answer.ts'
import { buildPassages, type AskBundle } from '../src/ask/passages.ts'
import { buildIndex, retrieve } from '../src/ask/retrieve.ts'
import { ISSUER, memorySql, newUser, testKeys, token } from './helpers.ts'

const bundle: AskBundle = {
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

const index = buildIndex(buildPassages(bundle))

describe('대목 만들기와 찾기', () => {
  it('본문 절, 검수된 장면, 설정집으로 대목을 만들고 검수 전 장면은 뺀다', () => {
    expect(index.passages.map((passage) => passage.id)).toEqual([
      'v:4:2',
      'v:4:15',
      'v:4:16',
      's:genesis-04-03',
      'c:character:cain',
      'c:place:nod',
    ])
  })

  it('질문과 겹치는 대목을 먼저 준다', () => {
    const found = retrieve(index, '가인의 표가 뭐예요?', { chapter: 4 }).map((item) => item.passage.id)
    // 이름이 그대로 나온 설정집 항목(가인)과 표를 말하는 대목이 위에 온다.
    expect(found.slice(0, 3).sort()).toEqual(['c:character:cain', 's:genesis-04-03', 'v:4:15'])
    expect(found).not.toContain('s:genesis-04-09')
    expect(retrieve(index, '놋은 어디예요?')[0]?.passage.id).toBe('c:place:nod')
    expect(retrieve(index, 'ㅋㅋ')).toEqual([])
  })
})

// 받은 자료 번호를 그대로 근거로 다는 가짜 모델
const answering =
  (output: unknown): AskModel =>
  async () =>
    output

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
})

async function askApp(model: AskModel, dailyLimit = 20) {
  const sql = await memorySql()
  const { privateKey, jwks } = await testKeys()
  const verify = createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app'], jwks })
  const app = createApp({ sql, verify, corsOrigins: [], ask: { index, model, book: '창세기', dailyLimit } })
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
})
