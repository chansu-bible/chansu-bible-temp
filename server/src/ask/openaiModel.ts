import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { AskOutputSchema, type AskModel } from './answer.ts'

// 실제 질문하기 LLM. OpenAI Responses API에 구조화 출력(AskOutputSchema)으로 묻는다. 키는 서버의 .env에만 둔다.
export function createOpenAiAskModel(apiKey: string, model: string): AskModel {
  const client = new OpenAI({ apiKey, maxRetries: 2, timeout: 45_000 })
  return async ({ system, user }) => {
    const response = await client.responses.parse({
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: { format: zodTextFormat(AskOutputSchema, 'answer') },
    })
    return response.output_parsed
  }
}
