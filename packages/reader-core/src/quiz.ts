import type { Chapter } from './types.ts'

// 승인된 문제가 이만큼 있어야 그 장의 퀴즈를 연다(한두 문제는 퀴즈라 하기에 적다).
export const QUIZ_MIN_QUESTIONS = 3

export function quizReady(chapter: Chapter): boolean {
  return chapter.quiz.length >= QUIZ_MIN_QUESTIONS
}
