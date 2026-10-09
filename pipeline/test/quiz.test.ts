import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { listQuizChapters, readQuizFile, writeQuizFile } from '../src/quiz/files.ts'
import { buildQuizPrompt, buildQuizReviewPrompt } from '../src/quiz/prompt.ts'
import { runQuiz } from '../src/quiz/runQuiz.ts'
import { assembleScenes } from '../src/scenario/assemble.ts'
import { QuizQuestionSchema, type QuizFile, type QuizQuestion } from '../src/schema.ts'
import { canon, chapter3, outScene } from './scenarioFixtures.ts'

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

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'quiz-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function setup() {
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

const storedQuestion = (id: string): QuizQuestion => ({ id, ...question(), status: 'reviewed', issues: [] })

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
    // 쓰기와 검수 프롬프트 모두 그 책의 이름으로 시작한다.
    expect(writer.requests[0]!.user.split('\n')[0]).toBe('출애굽기 4장')
    expect(reviewer.requests[0]!.user.split('\n')[0]).toBe('출애굽기 4장')
  })

  it('dry-run이면 쓰기 프롬프트의 user만 출력하고 아무것도 쓰지 않는다', async () => {
    const files = await setup()
    await writeFile(path.join(files.sourceDir, 'exodus.json'), JSON.stringify({ ...source, book: '출애굽기' }))
    const lines: string[] = []
    const result = await runQuiz('exodus', 4, { ...files, dryRun: true }, (line) => lines.push(line))
    expect(result).toMatchObject({ dryRun: true, skipped: false, written: 0 })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.startsWith('출애굽기 4장\n\n## 본문\n4:1 아담이 그 아내 하와와 동침하매')).toBe(true)
    expect(await readQuizFile('exodus', 4, files.quizDir)).toBeNull()
  })
})

describe('퀴즈 프롬프트', () => {
  const verses = [
    '3:1 여호와 하나님의 지으신 들짐승 중에 뱀이 가장 간교하더라',
    '3:2 여자가 뱀에게 말하되 동산 나무의 실과를 우리가 먹을 수 있으나',
    '3:3 동산 중앙에 있는 나무의 실과는 하나님의 말씀에 너희는 먹지도 말고',
    '3:4 뱀이 여자에게 이르되 너희가 결코 죽지 아니하리라',
  ]
  const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene()] }, approvedCanon(canon)).scenes
  const drafts = [{ question: '뱀은 어떤 짐승이었나요?', options: ['간교한 짐승', '순한 짐승', '큰 짐승', '작은 짐승'], answer: 0, explanation: '간교하다고 해요.', verse: 1 }]

  it('쓰기: 창세기로 부르면 책 이름을 붙이기 전과 같은 글이다', () => {
    const empty = buildQuizPrompt('genesis', chapter3, [])
    expect(empty.user).toBe(
      ['창세기 3장', '', '## 본문', ...verses, '', '## 검수된 장면 해설', '(이 장에는 아직 검수된 해설이 없다. 본문에서만 낸다.)'].join('\n'),
    )
    const withScene = buildQuizPrompt('genesis', chapter3, [scene!])
    expect(withScene.user).toBe(
      ['창세기 3장', '', '## 본문', ...verses, '', '## 검수된 장면 해설', '### 장면 "간교한 뱀" (3:1~4)', '뱀이 여자에게 말을 걸어요.', ''].join('\n'),
    )
    expect(empty.system).toContain('성경 한 장을 다 읽은 독자에게 내는 4지선다 문제 다섯을 쓴다')
    expect(empty.system).not.toContain('창세기')
  })

  it('쓰기: 다른 책이면 머리에 그 책 이름을 쓴다', () => {
    const { system, user } = buildQuizPrompt('exodus', chapter3, [])
    expect(user.split('\n').slice(0, 3)).toEqual(['출애굽기 3장', '', '## 본문'])
    expect(user).not.toContain('창세기')
    expect(system).toBe(buildQuizPrompt('genesis', chapter3, []).system)
  })

  it('검수: 창세기로 부르면 책 이름을 붙이기 전과 같은 글이다', () => {
    const { system, user } = buildQuizReviewPrompt('genesis', chapter3, drafts)
    expect(user).toBe(
      ['창세기 3장', '', '## 본문', ...verses, '', '## 검수할 문제', '```json', JSON.stringify([{ index: 0, ...drafts[0] }], null, 2), '```'].join('\n'),
    )
    expect(system).toContain('성경 한 장의 본문과, 작성 모델이 쓴 4지선다 문제들을 본다')
    expect(system).not.toContain('창세기')
  })

  it('검수: 다른 책이면 머리에 그 책 이름을 쓴다', () => {
    const { system, user } = buildQuizReviewPrompt('exodus', chapter3, drafts)
    expect(user.split('\n').slice(0, 3)).toEqual(['출애굽기 3장', '', '## 본문'])
    expect(user).not.toContain('창세기')
    expect(system).toBe(buildQuizReviewPrompt('genesis', chapter3, drafts).system)
  })
})

describe('퀴즈 파일', () => {
  it('그 책의 퀴즈 파일이 있는 장만 오름차순으로 돌려준다', async () => {
    for (const name of ['genesis-10.json', 'genesis-04.json', 'exodus-03.json', 'notes.json']) {
      await writeFile(path.join(dir, name), '{}')
    }
    expect(await listQuizChapters('genesis', dir)).toEqual([4, 10])
    expect(await listQuizChapters('exodus', dir)).toEqual([3])
    expect(await listQuizChapters('genesis', path.join(dir, 'none'))).toEqual([])
  })

  it('책에 없는 장의 퀴즈 파일은 없다', async () => {
    expect(await readQuizFile('genesis', 51, dir)).toBeNull()
  })

  it('형식에 맞지 않으면 파일 이름과 함께 오류를 낸다', async () => {
    await writeFile(path.join(dir, 'genesis-04.json'), JSON.stringify({ chapter: 4, questions: [{ id: 'genesis-04-q1' }] }))
    await expect(readQuizFile('genesis', 4, dir)).rejects.toThrow('genesis-04.json: ')
    await writeFile(path.join(dir, 'genesis-04.json'), '{ 깨진 JSON')
    await expect(readQuizFile('genesis', 4, dir)).rejects.toThrow('genesis-04.json: ')
  })

  it('파일의 장 번호가 요청한 장과 다르면 오류', async () => {
    await writeFile(path.join(dir, 'genesis-04.json'), JSON.stringify({ chapter: 5, questions: [] }))
    await expect(readQuizFile('genesis', 4, dir)).rejects.toThrow('genesis-04.json: 장 번호(5)가 4장이 아닙니다')
  })

  it('문제 id가 그 책·그 장의 id가 아니면 쓰지 않는다', async () => {
    for (const id of ['exodus-04-q1', 'genesis-05-q1', 'genesis-04-q0', 'genesis-04-q01', 'genesis-4-q1']) {
      await expect(writeQuizFile('genesis', { chapter: 4, questions: [storedQuestion('genesis-04-q1'), storedQuestion(id)] }, dir)).rejects.toThrow(
        `창세기 4장의 문제 id가 아닙니다(genesis-04-q1 모양이어야 합니다): ${id}`,
      )
    }
    expect(await readQuizFile('genesis', 4, dir)).toBeNull()
    await writeQuizFile('genesis', { chapter: 4, questions: [storedQuestion('genesis-04-q1'), storedQuestion('genesis-04-q12')] }, dir)
    expect((await readQuizFile('genesis', 4, dir))!.questions.map((item) => item.id)).toEqual(['genesis-04-q1', 'genesis-04-q12'])
  })

  it('문제 id는 책-장-q번호 모양이다', () => {
    const ok = (id: string) => QuizQuestionSchema.safeParse({ id, ...question(), status: 'draft', issues: [] }).success
    expect(['genesis-04-q1', 'psalms-119-q12', '1-samuel-01-q2', 'obadiah-1-q3'].every(ok)).toBe(true)
    expect(['genesis-q1', 'genesis-04', 'Genesis-04-q1', 'genesis-0004-q1'].some(ok)).toBe(false)
  })
})
