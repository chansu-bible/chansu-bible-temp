import { describe, expect, it } from 'vitest'
import { quizReady } from './quiz.ts'
import type { Chapter, QuizQuestion } from './types.ts'

const question = (id: string): QuizQuestion => ({ id, question: '?', options: ['a', 'b', 'c', 'd'], answer: 0, explanation: '', verse: 1 })
const chapter = (count: number): Chapter => ({
  chapter: 4,
  verses: [],
  scenes: [],
  original: null,
  quiz: Array.from({ length: count }, (_, index) => question(`q${index}`)),
})

describe('quizReady', () => {
  it('승인된 문제가 셋 이상이어야 연다', () => {
    expect(quizReady(chapter(0))).toBe(false)
    expect(quizReady(chapter(2))).toBe(false)
    expect(quizReady(chapter(3))).toBe(true)
  })
})
