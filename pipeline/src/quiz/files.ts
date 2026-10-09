import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { hasChapter, type BookId } from 'reader-core'
import { quizDir as defaultQuizDir, listChapterFiles, quizFilePath } from '../paths.ts'
import { QuizFileSchema, type QuizFile } from '../schema.ts'

// 퀴즈 파일 하나. 없으면 null(책에 없는 장도)
export async function readQuizFile(book: BookId, chapter: number, dir: string = defaultQuizDir): Promise<QuizFile | null> {
  if (!hasChapter(book, chapter)) return null
  const file = quizFilePath(book, chapter, dir)
  if (!existsSync(file)) return null
  return QuizFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
}

export async function writeQuizFile(book: BookId, quizFile: QuizFile, dir: string = defaultQuizDir): Promise<void> {
  const parsed = QuizFileSchema.parse(quizFile)
  const file = quizFilePath(book, parsed.chapter, dir)
  await mkdir(dir, { recursive: true })
  await writeFile(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
}

// 그 책의 퀴즈 파일이 있는 장 번호(오름차순)
export async function listQuizChapters(book: BookId, dir: string = defaultQuizDir): Promise<number[]> {
  return listChapterFiles(book, dir)
}
