// 퀴즈 화면: 문제 고치기 폼, 상태만 바꾸는 저장, 상태별 수
import type { QuizEdit, QuizQuestion, QuizStatus } from './types.ts'

// 장마다 승인할 문제 수. quiz 단계가 장마다 다섯 문제를 쓴다.
export const QUIZ_TARGET = 5

// 문제를 그대로 두고 상태만 바꾼 저장 본문
export function toEdit(question: QuizQuestion, status: QuizStatus = question.status): QuizEdit {
  const { question: text, options, answer, explanation, verse } = question
  return { question: text, options, answer, explanation, verse, status }
}

// 승인·버림을 되돌린 상태. 검수 지적이 있던 문제는 flagged로, 없던 문제는 reviewed로 돌아간다.
export function revertStatus(question: QuizQuestion): QuizStatus {
  return question.issues.length > 0 ? 'flagged' : 'reviewed'
}

export function countStatuses(questions: QuizQuestion[]): Record<QuizStatus, number> {
  const counts: Record<QuizStatus, number> = { draft: 0, reviewed: 0, flagged: 0, approved: 0, rejected: 0 }
  for (const question of questions) counts[question.status] += 1
  return counts
}

export type QuizForm = {
  question: string
  options: string[]
  answer: number
  explanation: string
  verse: string
}

export function questionToForm(question: QuizQuestion): QuizForm {
  return {
    question: question.question,
    options: [...question.options],
    answer: question.answer,
    explanation: question.explanation,
    verse: String(question.verse),
  }
}

export type QuizFormResult = { ok: true; edit: QuizEdit } | { ok: false; error: string }

// 폼 → 저장 본문. 앞뒤 공백은 떼고 빈 칸, 겹치는 보기, 잘못된 절 번호를 잡는다. 근거 절이 장에 있는지는 서버가 본다.
export function formToEdit(form: QuizForm, status: QuizStatus): QuizFormResult {
  const question = form.question.trim()
  const options = form.options.map((option) => option.trim())
  const explanation = form.explanation.trim()
  const verse = Number(form.verse.trim())

  if (!question) return { ok: false, error: '질문을 넣으세요' }
  const blank = options.findIndex((option) => !option)
  if (blank >= 0) return { ok: false, error: `${blank + 1}번 보기를 넣으세요` }
  if (new Set(options).size !== options.length) return { ok: false, error: '같은 보기가 있어요' }
  if (!Number.isInteger(form.answer) || form.answer < 0 || form.answer >= options.length) {
    return { ok: false, error: '정답 보기를 고르세요' }
  }
  if (!explanation) return { ok: false, error: '해설을 넣으세요' }
  if (!form.verse.trim() || !Number.isInteger(verse) || verse < 1) {
    return { ok: false, error: '근거 절은 1 이상의 정수여야 해요' }
  }
  return { ok: true, edit: { question, options, answer: form.answer, explanation, verse, status } }
}
