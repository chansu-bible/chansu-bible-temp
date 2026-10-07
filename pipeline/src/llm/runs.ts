import { existsSync } from 'node:fs'
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { runsDir } from '../paths.ts'
import { estimateUsd } from './models.ts'

// LLM 호출 한 번의 기록
export const RunSchema = z.object({
  at: z.string(), // 호출 시작 시각, ISO 8601
  stage: z.string(),
  model: z.string(),
  chapter: z.number().int().nullable(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  ms: z.number().min(0),
  ok: z.boolean(),
  note: z.string(),
})

export type Run = z.infer<typeof RunSchema>

export type RunTotals = { calls: number; inputTokens: number; outputTokens: number; estimatedUsd: number }

const DAY_MS = 24 * 60 * 60 * 1000
const FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

export function formatRun(run: Run): string {
  return JSON.stringify(RunSchema.parse(run))
}

export function parseRun(line: string): Run {
  return RunSchema.parse(JSON.parse(line))
}

// 기록 시각(UTC)의 날짜 파일에 한 줄 덧붙인다.
export async function appendRun(run: Run, dir: string = runsDir): Promise<void> {
  await mkdir(dir, { recursive: true })
  await appendFile(path.join(dir, `${run.at.slice(0, 10)}.jsonl`), `${formatRun(run)}\n`, 'utf8')
}

// 최근 days일(now 기준)의 기록을 시간순으로 읽는다. 깨진 줄은 건너뛴다.
export async function readRuns(days = 7, dir: string = runsDir, now: Date = new Date()): Promise<Run[]> {
  if (!existsSync(dir)) return []
  const since = new Date(now.getTime() - days * DAY_MS).toISOString()
  const sinceDate = since.slice(0, 10)

  const files = (await readdir(dir))
    .filter((name) => {
      const match = name.match(FILE_PATTERN)
      return match !== null && match[1]! >= sinceDate
    })
    .sort()

  const runs: Run[] = []
  for (const name of files) {
    for (const line of (await readFile(path.join(dir, name), 'utf8')).split('\n')) {
      if (!line.trim()) continue
      try {
        const run = parseRun(line)
        if (run.at >= since) runs.push(run)
      } catch {
        // 손으로 고친 줄이나 쓰다 끊긴 줄은 무시한다
      }
    }
  }
  return runs.sort((a, b) => a.at.localeCompare(b.at))
}

// 호출 수, 토큰 합계, 추정 비용 합계. 가격표에 없는 모델은 비용에서 뺀다.
export function summarizeRuns(runs: Run[]): RunTotals {
  const totals: RunTotals = { calls: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
  for (const run of runs) {
    totals.calls += 1
    totals.inputTokens += run.inputTokens
    totals.outputTokens += run.outputTokens
    totals.estimatedUsd += estimateUsd(run.model, run.inputTokens, run.outputTokens) ?? 0
  }
  return totals
}
