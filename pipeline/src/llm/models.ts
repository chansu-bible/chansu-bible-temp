// LLM 모델 이름과 가격표. 모델 이름은 .env로 바꿀 수 있다.
export const DEFAULT_WRITER_MODEL = 'gpt-6.1-sol'
export const DEFAULT_REVIEWER_MODEL = 'gpt-6-astra'

// 백만 토큰당 달러 (입력, 출력)
export const MODEL_PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  'gpt-6-astra': { input: 10, output: 50 },
  'gpt-6.1-sol': { input: 2, output: 10 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
}

// 작성 모델 (설정집 추출, 시나리오 작성)
export function writerModel(): string {
  return process.env.OPENAI_WRITER_MODEL || DEFAULT_WRITER_MODEL
}

// 검수 모델. 작성과 다른 모델로 독립성을 둔다.
export function reviewerModel(): string {
  return process.env.OPENAI_REVIEWER_MODEL || DEFAULT_REVIEWER_MODEL
}

// 추정 비용(달러). 가격표에 없는 모델은 null.
export function estimateUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = MODEL_PRICES[model]
  if (!price) return null
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}
