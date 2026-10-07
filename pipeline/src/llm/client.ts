import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { Tool } from 'openai/resources/responses/responses'
import type { ZodType } from 'zod'
import { writerModel } from './models.ts'
import { appendRun, type Run } from './runs.ts'

// Responses API로 보내는 본문. 모든 LLM 호출은 이 모양이다.
export type ResponsesBody = {
  model: string
  input: { role: 'system' | 'user'; content: string }[]
  text: { format: ReturnType<typeof zodTextFormat> }
  tools?: Tool[]
}

// 응답에서 쓰는 부분만
export type ResponsesResult = {
  output_parsed: unknown
  output: { type: string; content?: { type: string; refusal?: string }[] | unknown }[]
  usage?: { input_tokens: number; output_tokens: number } | null
}

export type ResponsesCall = (body: ResponsesBody) => Promise<ResponsesResult>

export type ParseRequest = {
  system: string
  user: string
  model?: string // 비우면 작성 모델
  tools?: Tool[]
  name?: string // 구조화 출력 스키마 이름. 영문, 숫자, _, -
}

export type Llm = {
  parse<T>(schema: ZodType<T>, request: ParseRequest): Promise<T>
}

export type LlmOptions = {
  stage: string
  chapter: number | null
  log?: (line: string) => void
  // 시험용. 비우면 OpenAI 클라이언트로 부르고 content/runs/에 기록한다.
  call?: ResponsesCall
  record?: (run: Run) => Promise<void>
}

function openAiCall(): ResponsesCall {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다. 리포 루트의 .env 파일에 넣어 주세요.')
  const client = new OpenAI({ apiKey, maxRetries: 3 })
  return (body) => client.responses.parse(body) as Promise<ResponsesResult>
}

// 응답의 거부 문구. 없으면 null.
function findRefusal(response: ResponsesResult): string | null {
  for (const item of response.output) {
    if (!Array.isArray(item.content)) continue
    for (const part of item.content as { type: string; refusal?: string }[]) {
      if (part.type === 'refusal') return part.refusal || '이유 없음'
    }
  }
  return null
}

// 단계 하나가 쓰는 LLM. 호출마다 모델, 토큰, 소요 시간을 기록한다.
export function createLlm({ stage, chapter, log = () => {}, call, record = (run) => appendRun(run) }: LlmOptions): Llm {
  let send = call

  return {
    async parse<T>(schema: ZodType<T>, request: ParseRequest): Promise<T> {
      send ??= openAiCall()
      const model = request.model || writerModel()
      const at = new Date().toISOString()
      const started = Date.now()
      let usage: ResponsesResult['usage'] = null

      const save = async (ok: boolean, note: string) => {
        const run: Run = {
          at,
          stage,
          model,
          chapter,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          ms: Date.now() - started,
          ok,
          note,
        }
        try {
          await record(run)
        } catch (error) {
          // 기록 실패가 호출 결과를 가리지 않게 한다
          log(`실행 기록 실패: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      try {
        const response = await send({
          model,
          input: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          text: { format: zodTextFormat(schema, request.name ?? 'output') },
          ...(request.tools ? { tools: request.tools } : {}),
        })
        usage = response.usage ?? null

        const refusal = findRefusal(response)
        if (refusal !== null) throw new Error(`모델이 응답을 거부했습니다: ${refusal}`)
        if (response.output_parsed === null || response.output_parsed === undefined) {
          throw new Error('응답에 구조화 출력이 없습니다')
        }
        const parsed = schema.parse(response.output_parsed)
        log(`${model}: 입력 ${usage?.input_tokens ?? 0} 토큰, 출력 ${usage?.output_tokens ?? 0} 토큰, ${Date.now() - started}ms`)
        await save(true, '')
        return parsed
      } catch (error) {
        await save(false, error instanceof Error ? error.message : String(error))
        throw error
      }
    },
  }
}
