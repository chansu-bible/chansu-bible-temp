import { Hono } from 'hono'
import { paths, QuizQuestionSchema, quizCodeIssues, readQuizFile, writeQuizFile, type QuizQuestion } from 'pipeline'
import { getBook, type BookId } from 'reader-core'
import type { AppContext } from '../context.ts'
import { readSource } from '../content.ts'
import { errorMessage, HttpError, readJsonBody } from '../errors.ts'
import { createSerial } from '../files.ts'
import { parseBook } from './books.ts'
import { parseChapter, sourceChapterOf } from './scenes.ts'

export type QuizStatus = QuizQuestion['status']

export type QuizChapterSummary = {
  chapter: number
  hasFile: boolean
  total: number
  counts: Record<QuizStatus, number>
}

// PUT 본문: 문제에서 id와 issues를 뺀 것. id는 주소에서 오고, issues(검수 지적)는 기록이라 파일에 있던 것을 그대로 둔다.
const QuizEditSchema = QuizQuestionSchema.omit({ id: true, issues: true })

// quiz 작업은 그 책·그 장의 퀴즈 파일을 읽어 두었다가 다시 쓴다.
// 작업이 도는 동안 저장하면 작업이 덮어써서 사람이 고친 것이 사라지므로 받지 않는다(409). 다른 책이나 다른 장의 작업이면 받는다.
function refuseDuringQuizJob(ctx: AppContext, book: BookId, chapter: number): void {
  const job = ctx.queue.active()
  if (job?.stage === 'quiz' && job.options.book === book && job.options.chapter === chapter) {
    throw new HttpError(
      409,
      `${getBook(book).name} ${chapter}장 quiz 작업이 실행 중이라 저장할 수 없습니다. 작업이 끝난 뒤 다시 저장하세요`,
    )
  }
}

// /api/books/:book/quiz
export function quizRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const quizDir = ctx.quizDir ?? paths.quizDir
  const serial = createSerial()

  // 본문에 있는 장마다 문제 수와 상태별 수. 퀴즈 파일이 없는 장은 hasFile이 false이고 수는 모두 0이다.
  app.get('/', async (c) => {
    const book = parseBook(c.req.param('book'))
    const source = await readSource(book, ctx.sourceDir)
    const summary = await Promise.all(
      source.chapters.map(async ({ chapter }): Promise<QuizChapterSummary> => {
        const quizFile = await readQuizFile(book, chapter, quizDir)
        const counts: Record<QuizStatus, number> = { draft: 0, reviewed: 0, flagged: 0, approved: 0, rejected: 0 }
        for (const question of quizFile?.questions ?? []) counts[question.status] += 1
        return { chapter, hasFile: quizFile !== null, total: quizFile?.questions.length ?? 0, counts }
      }),
    )
    return c.json(summary)
  })

  // 장 본문과 문제. 퀴즈 파일이 없으면 questions는 []이다.
  app.get('/:chapter', async (c) => {
    const book = parseBook(c.req.param('book'))
    const chapter = parseChapter(c.req.param('chapter'))
    const sourceChapter = await sourceChapterOf(book, chapter, ctx.sourceDir)
    const quizFile = await readQuizFile(book, chapter, quizDir)
    return c.json({ chapter, verses: sourceChapter.verses, questions: quizFile?.questions ?? [] })
  })

  // 문제 하나를 검증한 뒤 그 문제만 바꿔 파일을 다시 쓴다. 근거 절이 장에 없거나 보기가 겹치면 400이다.
  // 버리는(rejected) 문제는 이 검사를 하지 않는다(망가진 문제도 버릴 수 있게).
  // 파일을 쓸 때 검사(문제 id가 그 책·그 장의 id인지)에 걸려도 400이다.
  app.put('/:chapter/:id', async (c) => {
    const book = parseBook(c.req.param('book'))
    const chapter = parseChapter(c.req.param('chapter'))
    const id = c.req.param('id')
    const parsed = QuizEditSchema.safeParse(await readJsonBody(c.req.raw))
    if (!parsed.success) throw new HttpError(400, errorMessage(parsed.error, '문제가 형식에 맞지 않습니다'))
    const sourceChapter = await sourceChapterOf(book, chapter, ctx.sourceDir)
    return serial(async () => {
      refuseDuringQuizJob(ctx, book, chapter)
      const quizFile = await readQuizFile(book, chapter, quizDir)
      if (!quizFile) throw new HttpError(404, `${getBook(book).name} ${chapter}장의 퀴즈 파일이 없습니다`)
      const index = quizFile.questions.findIndex((question) => question.id === id)
      if (index < 0) throw new HttpError(404, `${id} 문제가 ${chapter}장에 없습니다`)
      const question: QuizQuestion = { id, ...parsed.data, issues: quizFile.questions[index]!.issues }
      if (question.status !== 'rejected') {
        const problems = quizCodeIssues(question, sourceChapter)
        if (problems.length > 0) throw new HttpError(400, `문제를 저장하지 않았습니다:\n${problems.join('\n')}`)
      }
      const questions = [...quizFile.questions]
      questions[index] = question
      try {
        await writeQuizFile(book, { ...quizFile, questions }, quizDir)
      } catch (error) {
        throw new HttpError(400, errorMessage(error, '퀴즈 파일 검증에 실패했습니다'))
      }
      return c.json(question)
    })
  })

  return app
}
