import { quizQuestionId, type BookId } from 'reader-core'
import { createLlm, type Llm } from '../llm/client.ts'
import { reviewerModel, writerModel } from '../llm/models.ts'
import { quizDir as defaultQuizDir, scenesDir as defaultScenesDir, sourceDir as defaultSourceDir } from '../paths.ts'
import { readSceneFile } from '../scenes/files.ts'
import type { QuizQuestion, SourceChapter } from '../schema.ts'
import { readSourceChapter } from '../source/files.ts'
import { readQuizFile, writeQuizFile } from './files.ts'
import { QuizReviewSchema, QuizWriteSchema } from './output.ts'
import { buildQuizPrompt, buildQuizReviewPrompt, type QuizDraft } from './prompt.ts'

export type QuizRunOptions = {
  // 파일이 있어도 다시 쓴다. 승인된 문제는 남긴다.
  force?: boolean
  dryRun?: boolean
  // 시험용. 비우면 작성 모델·검수 모델로 부른다.
  writer?: Llm
  reviewer?: Llm
  quizDir?: string
  scenesDir?: string
  sourceDir?: string
}

export type QuizRunResult = {
  chapter: number
  skipped: boolean
  dryRun: boolean
  written: number
  reviewed: number
  flagged: number
}

// 코드로 볼 수 있는 문제: 보기 넷, 보기가 서로 다름, 정답 번호, 근거 절이 장에 있음
export function quizCodeIssues(question: QuizDraft, chapter: SourceChapter): string[] {
  const issues: string[] = []
  if (question.options.length !== 4) issues.push(`보기가 ${question.options.length}개예요(넷이어야 해요).`)
  const distinct = new Set(question.options.map((option) => option.trim()))
  if (distinct.size !== question.options.length) issues.push('같은 보기가 있어요.')
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) {
    issues.push(`정답 번호 ${question.answer}가 보기 범위를 벗어나요.`)
  }
  if (!chapter.verses.some((verse) => verse.verse === question.verse)) issues.push(`근거 절 ${chapter.chapter}:${question.verse}이 이 장에 없어요.`)
  return issues
}

function nextNumber(questions: QuizQuestion[]): number {
  return questions.reduce((max, question) => Math.max(max, Number(/q(\d+)$/.exec(question.id)?.[1] ?? 0)), 0) + 1
}

// 장마다 4지선다 다섯 문제를 쓰고 검수 모델이 근거 절을 확인한다. 사람이 관리 도구에서 승인한 문제만 앱에 나간다.
export async function runQuiz(
  book: BookId,
  chapter: number,
  options: QuizRunOptions = {},
  log: (line: string) => void = () => {},
): Promise<QuizRunResult> {
  const quizDir = options.quizDir ?? defaultQuizDir
  const dryRun = options.dryRun === true
  const existing = await readQuizFile(book, chapter, quizDir)
  if (existing && !options.force) {
    log(`${chapter}장 퀴즈 파일이 이미 있어요. 다시 쓰려면 --force를 붙이세요.`)
    return { chapter, skipped: true, dryRun, written: 0, reviewed: 0, flagged: 0 }
  }

  const sourceChapter = await readSourceChapter(book, chapter, options.sourceDir ?? defaultSourceDir)
  const sceneFile = await readSceneFile(book, chapter, options.scenesDir ?? defaultScenesDir)
  const scenes = (sceneFile?.scenes ?? []).filter((scene) => scene.review.status === 'reviewed' || scene.review.status === 'approved')
  const prompt = buildQuizPrompt(book, sourceChapter, scenes)
  if (dryRun) {
    log(prompt.user)
    return { chapter, skipped: false, dryRun, written: 0, reviewed: 0, flagged: 0 }
  }

  const writer = options.writer ?? createLlm({ stage: 'quiz', book, chapter, log })
  const reviewer = options.reviewer ?? createLlm({ stage: 'quiz-review', book, chapter, log })
  const written = await writer.parse(QuizWriteSchema, { ...prompt, name: 'quiz', model: writerModel() })
  const drafts: QuizDraft[] = written.questions.map((question) => ({
    question: question.question.trim(),
    options: question.options.map((option) => option.trim()),
    answer: question.answer,
    explanation: question.explanation.trim(),
    verse: question.verse,
  }))
  const review = await reviewer.parse(QuizReviewSchema, {
    ...buildQuizReviewPrompt(book, sourceChapter, drafts),
    name: 'quiz_review',
    model: reviewerModel(),
  })

  const kept = (existing?.questions ?? []).filter((question) => question.status === 'approved')
  let number = nextNumber(kept)
  const fresh: QuizQuestion[] = drafts.map((draft, index) => {
    const verdict = review.results.find((result) => result.index === index)
    const issues = [...quizCodeIssues(draft, sourceChapter), ...(verdict?.verdict === 'fail' ? verdict.issues : [])]
    if (!verdict) issues.push('검수 모델이 이 문제를 판정하지 않았어요.')
    return {
      id: quizQuestionId(book, chapter, number++),
      ...draft,
      // 보기 수나 정답 번호가 어긋나면 파일 형식에 맞게만 고쳐 두고 flagged로 남긴다(관리 도구에서 고친다).
      options: [...draft.options, '', '', '', ''].slice(0, 4).map((option, at) => option || `(보기 ${at + 1} 없음)`),
      answer: Math.min(Math.max(Number.isInteger(draft.answer) ? draft.answer : 0, 0), 3),
      verse: Math.max(1, draft.verse),
      status: issues.length === 0 ? 'reviewed' : 'flagged',
      issues,
    }
  })

  await writeQuizFile(book, { chapter, questions: [...kept, ...fresh] }, quizDir)
  const reviewed = fresh.filter((question) => question.status === 'reviewed').length
  return { chapter, skipped: false, dryRun, written: fresh.length, reviewed, flagged: fresh.length - reviewed }
}
