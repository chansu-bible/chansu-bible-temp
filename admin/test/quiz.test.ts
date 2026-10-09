import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.ts'
import { JobQueue } from '../server/jobs.ts'
import { makeTempContent, pretty, quizFile, source, type TempContent } from './fixtures.ts'

let dirs: TempContent
let queue: JobQueue
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  dirs = await makeTempContent()
  queue = new JobQueue()
  app = createApp({ ...dirs, queue })
})

afterEach(async () => {
  await rm(dirs.root, { recursive: true, force: true })
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const read = (res: Response): Promise<any> => res.json()
const fileText = () => readFile(path.join(dirs.quizDir, 'genesis-01.json'), 'utf8')
const put = (chapter: number | string, id: string, body: unknown) =>
  app.request(`/api/quiz/${chapter}/${id}`, { method: 'PUT', ...json(body) })
const [q1, q2, q3] = quizFile.questions as [
  (typeof quizFile.questions)[number],
  (typeof quizFile.questions)[number],
  (typeof quizFile.questions)[number],
]
// PUT 본문: 문제에서 id와 issues를 뺀 것
const edit = ({ id: _id, issues: _issues, ...fields }: typeof q1) => fields

describe('퀴즈 읽기', () => {
  it('장 본문과 문제를 돌려준다', async () => {
    const res = await app.request('/api/quiz/1')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({ chapter: 1, verses: source.chapters[0]!.verses, questions: quizFile.questions })
  })

  it('퀴즈 파일이 없으면 questions는 []', async () => {
    const body = await read(await app.request('/api/quiz/2'))
    expect(body.verses.length).toBe(2)
    expect(body.questions).toEqual([])
  })

  it('본문에 없는 장은 404, 잘못된 장 번호는 400', async () => {
    expect((await app.request('/api/quiz/9')).status).toBe(404)
    expect((await app.request('/api/quiz/abc')).status).toBe(400)
  })

  it('장마다 상태별 문제 수를 센다', async () => {
    const res = await app.request('/api/quiz')
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual([
      { chapter: 1, hasFile: true, total: 3, counts: { draft: 0, reviewed: 1, flagged: 1, approved: 1, rejected: 0 } },
      { chapter: 2, hasFile: false, total: 0, counts: { draft: 0, reviewed: 0, flagged: 0, approved: 0, rejected: 0 } },
    ])
  })
})

describe('문제 저장', () => {
  it('승인하면 그 문제만 바꾸고 같은 모양으로 쓴다', async () => {
    const res = await put(1, 'genesis-01-q1', { ...edit(q1), status: 'approved' })
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({ ...q1, status: 'approved' })
    expect(await fileText()).toBe(pretty({ chapter: 1, questions: [{ ...q1, status: 'approved' }, q2, q3] }))
  })

  it('고친 문제를 저장하고, 검수 지적은 그대로 남긴다', async () => {
    const fixed = {
      ...edit(q2),
      question: '고친 질문인가요?',
      options: ['하나', '둘', '셋', '넷'],
      answer: 3,
      explanation: '고친 해설이에요.',
      verse: 2,
    }
    const res = await put(1, 'genesis-01-q2', fixed)
    expect(res.status).toBe(200)
    const saved = JSON.parse(await fileText()).questions[1]
    expect(saved).toEqual({ id: 'genesis-01-q2', ...fixed, issues: q2.issues })

    // 승인해도 지적은 기록으로 남는다.
    await put(1, 'genesis-01-q2', { ...fixed, status: 'approved' })
    expect(JSON.parse(await fileText()).questions[1]).toEqual({ id: 'genesis-01-q2', ...fixed, status: 'approved', issues: q2.issues })
  })

  it('본문의 id와 issues는 쓰지 않는다', async () => {
    const res = await put(1, 'genesis-01-q2', { ...q2, id: 'genesis-01-q7', verse: 2, issues: [] })
    expect(res.status).toBe(200)
    const saved = JSON.parse(await fileText()).questions
    expect(saved.map((question: { id: string }) => question.id)).toEqual(['genesis-01-q1', 'genesis-01-q2', 'genesis-01-q3'])
    expect(saved[1].issues).toEqual(q2.issues)
  })

  it('형식이 틀리면 400과 한국어 오류, 파일은 그대로', async () => {
    const before = await fileText()
    for (const body of [
      { ...edit(q1), answer: 4 },
      { ...edit(q1), options: ['가', '나', '다'] },
      { ...edit(q1), question: '' },
      { ...edit(q1), status: 'done' },
      { ...edit(q1), verse: 0 },
      { question: '질문만 있나요?' },
      null,
    ]) {
      const res = await put(1, 'genesis-01-q1', body)
      expect(res.status).toBe(400)
      expect((await read(res)).error).toContain('문제가 형식에 맞지 않습니다')
    }
    expect(await fileText()).toBe(before)
  })

  it('근거 절이 장에 없거나 보기가 겹치면 400, 파일은 그대로', async () => {
    const before = await fileText()
    const outside = await put(1, 'genesis-01-q1', { ...edit(q1), verse: 4, status: 'approved' })
    expect(outside.status).toBe(400)
    expect((await read(outside)).error).toContain('1:4')
    const same = await put(1, 'genesis-01-q1', { ...edit(q1), options: ['가', '가', '다', '라'] })
    expect(same.status).toBe(400)
    expect((await read(same)).error).toContain('같은 보기')
    // 지적된 문제(근거 절 1:9)를 그대로 승인할 수도 없다.
    expect((await put(1, 'genesis-01-q2', { ...edit(q2), status: 'approved' })).status).toBe(400)
    expect(await fileText()).toBe(before)
  })

  it('버리는 문제는 근거 절이 장 밖이어도 저장한다', async () => {
    const res = await put(1, 'genesis-01-q2', { ...edit(q2), status: 'rejected' })
    expect(res.status).toBe(200)
    expect(JSON.parse(await fileText()).questions[1]).toEqual({ ...q2, status: 'rejected' })
  })

  it('없는 문제·퀴즈 파일·장은 404', async () => {
    expect((await put(1, 'genesis-01-q9', edit(q1))).status).toBe(404)
    expect((await put(2, 'genesis-02-q1', edit(q1))).status).toBe(404)
    expect((await put(9, 'genesis-09-q1', edit(q1))).status).toBe(404)
    expect((await put('abc', 'genesis-01-q1', edit(q1))).status).toBe(400)
  })

  it('그 장의 quiz 작업이 도는 동안에는 409, 다른 장 작업이면 저장된다', async () => {
    let finish!: () => void
    const job = queue.enqueue('quiz', { chapter: 1 }, () => new Promise<void>((resolve) => (finish = resolve)))
    const before = await fileText()
    const busy = await put(1, 'genesis-01-q1', { ...edit(q1), status: 'approved' })
    expect(busy.status).toBe(409)
    expect((await read(busy)).error).toContain('quiz')
    expect(await fileText()).toBe(before)
    await new Promise((resolve) => setTimeout(resolve, 0))
    finish()
    await queue.wait(job.id)

    const other = queue.enqueue('quiz', { chapter: 2 }, () => new Promise<void>((resolve) => (finish = resolve)))
    expect((await put(1, 'genesis-01-q1', { ...edit(q1), status: 'approved' })).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 0))
    finish()
    await queue.wait(other.id)
  })
})
