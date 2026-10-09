import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { listQuizChapters, readQuizFile, writeQuizFile } from '../src/quiz/files.ts'
import { runQuiz } from '../src/quiz/runQuiz.ts'
import { QuizQuestionSchema, type QuizFile } from '../src/schema.ts'

const source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    {
      chapter: 4,
      verses: [
        { verse: 1, text: '아담이 그 아내 하와와 동침하매' },
        { verse: 2, text: '아벨은 양 치는 자이었고 가인은 농사하는 자이었더라' },
        { verse: 3, text: '세월이 지난 후에 가인은 땅의 소산으로 제물을 삼아 여호와께 드렸고' },
      ],
    },
  ],
}

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'quiz-'))
  const files = { sourceDir: dir, quizDir: path.join(dir, 'quiz'), scenesDir: path.join(dir, 'scenes') }
  await writeFile(path.join(dir, 'genesis.json'), JSON.stringify(source))
  return files
}

const question = (overrides: Partial<{ question: string; options: string[]; answer: number; verse: number }> = {}) => ({
  question: '가인은 무엇을 제물로 드렸나요?',
  options: ['땅의 소산', '양의 첫 새끼', '정금', '수금'],
  answer: 0,
  explanation: '가인은 땅의 소산으로 제물을 드렸어요.',
  verse: 3,
  ...overrides,
})

function fake(output: unknown): Llm & { requests: ParseRequest[] } {
  const requests: ParseRequest[] = []
  return {
    requests,
    async parse(schema, request) {
      requests.push(request)
      return schema.parse(output)
    },
  }
}

describe('runQuiz', () => {
  it('문제를 쓰고 검수 판정과 코드 검사로 reviewed/flagged를 나눈다', async () => {
    const files = await setup()
    const writer = fake({
      questions: [
        question(),
        question({ verse: 9 }),
        question({ options: ['가', '가', '나', '다'] }),
        question(),
      ],
    })
    const reviewer = fake({
      results: [
        { index: 0, verdict: 'pass', issues: [] },
        { index: 1, verdict: 'pass', issues: [] },
        { index: 2, verdict: 'pass', issues: [] },
        { index: 3, verdict: 'fail', issues: ['정답이 둘이에요.'] },
      ],
    })
    const result = await runQuiz('genesis', 4, { ...files, writer, reviewer })
    expect(result).toMatchObject({ written: 4, reviewed: 1, flagged: 3 })
    expect(reviewer.requests[0]!.user).toContain('"index": 0')
    const saved = JSON.parse(await readFile(path.join(files.quizDir, 'genesis-04.json'), 'utf8')) as QuizFile
    expect(saved.questions.map((item) => [item.id, item.status, item.issues])).toEqual([
      ['genesis-04-q1', 'reviewed', []],
      ['genesis-04-q2', 'flagged', ['근거 절 4:9이 이 장에 없어요.']],
      ['genesis-04-q3', 'flagged', ['같은 보기가 있어요.']],
      ['genesis-04-q4', 'flagged', ['정답이 둘이에요.']],
    ])
  })

  it('파일이 있으면 건너뛰고, --force면 승인된 문제는 남기고 새 번호로 다시 쓴다', async () => {
    const files = await setup()
    await writeQuizFile(
      'genesis',
      {
        chapter: 4,
        questions: [
          { id: 'genesis-04-q2', ...question(), status: 'approved', issues: [] },
          { id: 'genesis-04-q3', ...question(), status: 'flagged', issues: ['x'] },
        ],
      },
      files.quizDir,
    )
    expect(await runQuiz('genesis', 4, { ...files, writer: fake({ questions: [] }), reviewer: fake({ results: [] }) })).toMatchObject({
      skipped: true,
    })
    const writer = fake({ questions: [question()] })
    const reviewer = fake({ results: [{ index: 0, verdict: 'pass', issues: [] }] })
    await runQuiz('genesis', 4, { ...files, writer, reviewer, force: true })
    const saved = JSON.parse(await readFile(path.join(files.quizDir, 'genesis-04.json'), 'utf8')) as QuizFile
    expect(saved.questions.map((item) => [item.id, item.status])).toEqual([
      ['genesis-04-q2', 'approved'],
      ['genesis-04-q3', 'reviewed'],
    ])
  })

  it('다른 책이면 그 책의 파일 이름과 문제 id로 쓴다', async () => {
    const files = await setup()
    await writeFile(path.join(files.sourceDir, 'exodus.json'), JSON.stringify({ ...source, book: '출애굽기' }))
    const writer = fake({ questions: [question()] })
    const reviewer = fake({ results: [{ index: 0, verdict: 'pass', issues: [] }] })
    await runQuiz('exodus', 4, { ...files, writer, reviewer })
    const saved = JSON.parse(await readFile(path.join(files.quizDir, 'exodus-04.json'), 'utf8')) as QuizFile
    expect(saved.questions.map((item) => item.id)).toEqual(['exodus-04-q1'])
    expect(await readQuizFile('genesis', 4, files.quizDir)).toBeNull()
  })
})

describe('퀴즈 파일', () => {
  it('그 책의 퀴즈 파일이 있는 장만 오름차순으로 돌려준다', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quiz-list-'))
    for (const name of ['genesis-10.json', 'genesis-04.json', 'exodus-03.json', 'notes.json']) {
      await writeFile(path.join(dir, name), '{}')
    }
    expect(await listQuizChapters('genesis', dir)).toEqual([4, 10])
    expect(await listQuizChapters('exodus', dir)).toEqual([3])
    expect(await listQuizChapters('genesis', path.join(dir, 'none'))).toEqual([])
  })

  it('책에 없는 장의 퀴즈 파일은 없다', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quiz-none-'))
    expect(await readQuizFile('genesis', 51, dir)).toBeNull()
  })

  it('문제 id는 책-장-q번호 모양이다', () => {
    const ok = (id: string) => QuizQuestionSchema.safeParse({ id, ...question(), status: 'draft', issues: [] }).success
    expect(['genesis-04-q1', 'psalms-119-q12', '1-samuel-01-q2', 'obadiah-1-q3'].every(ok)).toBe(true)
    expect(['genesis-q1', 'genesis-04', 'Genesis-04-q1', 'genesis-0004-q1'].some(ok)).toBe(false)
  })
})
