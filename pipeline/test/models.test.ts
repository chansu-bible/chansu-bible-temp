import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createLlm, type ResponsesCall } from '../src/llm/client.ts'
import { estimateUsd, reviewerModel, writerModel } from '../src/llm/models.ts'
import { appendRun, formatRun, parseRun, readRuns, summarizeRuns, type Run } from '../src/llm/runs.ts'

function run(overrides: Partial<Run> = {}): Run {
  return {
    at: '2026-10-06T12:00:00.000Z',
    stage: 'canon',
    model: 'gpt-6.1-sol',
    chapter: 1,
    inputTokens: 1000,
    outputTokens: 500,
    ms: 1234,
    ok: true,
    note: '',
    ...overrides,
  }
}

describe('estimateUsd', () => {
  it('가격표로 비용을 계산한다', () => {
    expect(estimateUsd('gpt-6-astra', 1_000_000, 1_000_000)).toBeCloseTo(60)
    expect(estimateUsd('gpt-6.1-sol', 500_000, 100_000)).toBeCloseTo(2)
    expect(estimateUsd('gpt-6-luna', 2_000_000, 2_000_000)).toBeCloseTo(1.2)
  })

  it('모르는 모델은 null이다', () => {
    expect(estimateUsd('gpt-unknown', 100, 100)).toBeNull()
  })
})

describe('모델 이름', () => {
  const saved = { writer: process.env.OPENAI_WRITER_MODEL, reviewer: process.env.OPENAI_REVIEWER_MODEL }
  afterEach(() => {
    process.env.OPENAI_WRITER_MODEL = saved.writer ?? ''
    process.env.OPENAI_REVIEWER_MODEL = saved.reviewer ?? ''
  })

  it('환경 변수가 비어 있으면 기본값이다', () => {
    process.env.OPENAI_WRITER_MODEL = ''
    process.env.OPENAI_REVIEWER_MODEL = ''
    expect(writerModel()).toBe('gpt-6.1-sol')
    expect(reviewerModel()).toBe('gpt-6-astra')
  })

  it('환경 변수가 있으면 그것을 쓴다', () => {
    process.env.OPENAI_WRITER_MODEL = 'gpt-6-luna'
    process.env.OPENAI_REVIEWER_MODEL = 'gpt-6.1-sol'
    expect(writerModel()).toBe('gpt-6-luna')
    expect(reviewerModel()).toBe('gpt-6.1-sol')
  })
})

describe('실행 기록', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'runs-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('한 줄 JSON으로 직렬화하고 되읽는다', () => {
    const line = formatRun(run())
    expect(line).not.toContain('\n')
    expect(parseRun(line)).toEqual(run())
  })

  it('날짜별 파일에 덧붙이고 최근 며칠 것만 읽는다', async () => {
    await appendRun(run({ at: '2026-10-01T09:00:00.000Z', note: 'old' }), dir)
    await appendRun(run({ at: '2026-10-05T09:00:00.000Z', note: 'a' }), dir)
    await appendRun(run({ at: '2026-10-06T09:00:00.000Z', note: 'b' }), dir)
    await appendRun(run({ at: '2026-10-06T10:00:00.000Z', note: 'c' }), dir)

    const text = await readFile(path.join(dir, '2026-10-06.jsonl'), 'utf8')
    expect(text.trim().split('\n')).toHaveLength(2)

    const runs = await readRuns(3, dir, new Date('2026-10-06T12:00:00.000Z'))
    expect(runs.map((item) => item.note)).toEqual(['a', 'b', 'c'])
  })

  it('폴더가 없으면 빈 목록, 깨진 줄은 건너뛴다', async () => {
    expect(await readRuns(7, path.join(dir, 'none'))).toEqual([])
    await writeFile(path.join(dir, '2026-10-06.jsonl'), `not json\n${formatRun(run())}\n`, 'utf8')
    expect(await readRuns(7, dir, new Date('2026-10-06T12:00:00.000Z'))).toHaveLength(1)
  })

  it('토큰과 추정 비용을 합친다(모르는 모델은 비용에서 뺀다)', () => {
    const totals = summarizeRuns([
      run({ model: 'gpt-6.1-sol', inputTokens: 1_000_000, outputTokens: 0 }),
      run({ model: 'gpt-6-astra', inputTokens: 0, outputTokens: 100_000 }),
      run({ model: 'mystery', inputTokens: 10, outputTokens: 10 }),
    ])
    expect(totals.calls).toBe(3)
    expect(totals.inputTokens).toBe(1_000_010)
    expect(totals.outputTokens).toBe(100_010)
    expect(totals.estimatedUsd).toBeCloseTo(7)
  })
})

describe('createLlm', () => {
  const Answer = z.object({ word: z.string() })

  function fakeCall(response: Awaited<ReturnType<ResponsesCall>>, seen: unknown[] = []): ResponsesCall {
    return async (body) => {
      seen.push(body)
      return response
    }
  }

  it('구조화 출력을 돌려주고 호출을 기록한다', async () => {
    const records: Run[] = []
    const seen: unknown[] = []
    const llm = createLlm({
      stage: 'canon',
      chapter: 2,
      call: fakeCall({ output_parsed: { word: '빛' }, output: [], usage: { input_tokens: 10, output_tokens: 3 } }, seen),
      record: async (item) => {
        records.push(item)
      },
    })

    const result = await llm.parse(Answer, { system: '규칙', user: '본문', model: 'gpt-6-luna' })
    expect(result).toEqual({ word: '빛' })

    const body = seen[0] as { model: string; input: { role: string; content: string }[] }
    expect(body.model).toBe('gpt-6-luna')
    expect(body.input).toEqual([
      { role: 'system', content: '규칙' },
      { role: 'user', content: '본문' },
    ])

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ stage: 'canon', chapter: 2, model: 'gpt-6-luna', inputTokens: 10, outputTokens: 3, ok: true })
  })

  it('거부하면 오류를 던지고 실패로 기록한다', async () => {
    const records: Run[] = []
    const llm = createLlm({
      stage: 'canon',
      chapter: null,
      call: fakeCall({
        output_parsed: null,
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: '할 수 없습니다' }] }],
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
      record: async (item) => {
        records.push(item)
      },
    })

    await expect(llm.parse(Answer, { system: 's', user: 'u' })).rejects.toThrow('할 수 없습니다')
    expect(records[0]).toMatchObject({ ok: false, inputTokens: 5, outputTokens: 1 })
    expect(records[0]?.note).toContain('할 수 없습니다')
  })

  it('파싱된 값이 없으면 오류를 던진다', async () => {
    const llm = createLlm({
      stage: 'canon',
      chapter: null,
      call: fakeCall({ output_parsed: null, output: [], usage: null }),
      record: async () => {},
    })
    await expect(llm.parse(Answer, { system: 's', user: 'u' })).rejects.toThrow()
  })
})
