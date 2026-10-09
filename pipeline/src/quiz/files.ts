import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { quizDir as defaultQuizDir, quizFilePath } from '../paths.ts'
import { QuizFileSchema, type QuizFile } from '../schema.ts'

export async function readQuizFile(chapter: number, dir: string = defaultQuizDir): Promise<QuizFile | null> {
  const file = quizFilePath(chapter, dir)
  if (!existsSync(file)) return null
  return QuizFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
}

export async function writeQuizFile(quizFile: QuizFile, dir: string = defaultQuizDir): Promise<void> {
  const parsed = QuizFileSchema.parse(quizFile)
  await mkdir(dir, { recursive: true })
  await writeFile(quizFilePath(parsed.chapter, dir), JSON.stringify(parsed, null, 2) + '\n', 'utf8')
}
