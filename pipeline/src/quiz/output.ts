import { z } from 'zod'

// 작성 모델이 돌려주는 문제. 보기 수와 정답 번호의 범위는 코드가 다시 본다(구조화 출력 스키마는 단순하게 둔다).
export const QuizWriteSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      answer: z.number().int(),
      explanation: z.string(),
      verse: z.number().int(),
    }),
  ),
})

// 검수 모델의 판정. index는 문제 번호(0부터)
export const QuizReviewSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      verdict: z.enum(['pass', 'fail']),
      issues: z.array(z.string()),
    }),
  ),
})

export type QuizWrite = z.infer<typeof QuizWriteSchema>
export type QuizReview = z.infer<typeof QuizReviewSchema>
