import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chapterStem, getBook, hasChapter, quizQuestionId, type BookId } from 'reader-core'
import { quizDir as defaultQuizDir, displayPath, listChapterFiles, quizFilePath } from '../paths.ts'
import { QuizFileSchema, type QuizFile } from '../schema.ts'

// 퀴즈 파일 하나를 읽는다. 없으면(책에 없는 장도) null이고, 검증에 걸리면 파일 이름과 함께 오류를 낸다.
export async function readQuizFile(book: BookId, chapter: number, dir: string = defaultQuizDir): Promise<QuizFile | null> {
  if (!hasChapter(book, chapter)) return null
  const file = quizFilePath(book, chapter, dir)
  if (!existsSync(file)) return null
  try {
    const quizFile = QuizFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    if (quizFile.chapter !== chapter) throw new Error(`장 번호(${quizFile.chapter})가 ${chapter}장이 아닙니다`)
    return quizFile
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 문제 id가 그 책·그 장의 id(genesis-04-q1)인지 본다. 번호는 1부터이고 앞에 0을 붙이지 않는다.
function isQuestionIdOf(id: string, book: BookId, chapter: number): boolean {
  const prefix = `${chapterStem(book, chapter)}-q`
  if (!id.startsWith(prefix)) return false
  const number = Number(id.slice(prefix.length))
  return Number.isInteger(number) && number >= 1 && quizQuestionId(book, chapter, number) === id
}

// 검증한 뒤 쓴다. 문제 id는 모두 그 책·그 장의 id여야 한다.
export async function writeQuizFile(book: BookId, quizFile: QuizFile, dir: string = defaultQuizDir): Promise<void> {
  const parsed = QuizFileSchema.parse(quizFile)
  const file = quizFilePath(book, parsed.chapter, dir)
  for (const question of parsed.questions) {
    if (!isQuestionIdOf(question.id, book, parsed.chapter)) {
      const example = quizQuestionId(book, parsed.chapter, 1)
      throw new Error(`${getBook(book).name} ${parsed.chapter}장의 문제 id가 아닙니다(${example} 모양이어야 합니다): ${question.id}`)
    }
  }
  await mkdir(dir, { recursive: true })
  await writeFile(file, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
}

// 그 책의 퀴즈 파일이 있는 장 번호를 오름차순으로 돌려준다.
export async function listQuizChapters(book: BookId, dir: string = defaultQuizDir): Promise<number[]> {
  return listChapterFiles(book, dir)
}

// 그 책의 퀴즈 파일(genesis-NN.json)을 모두 읽는다. 장 번호 오름차순이다. 책 묶음(build)과 공개 콘텐츠 읽기가 함께 쓴다.
// 틀린 파일이 있으면 readQuizFile처럼 파일 이름을 밝혀 던진다.
export async function readQuizFiles(book: BookId, dir: string = defaultQuizDir): Promise<QuizFile[]> {
  const files = await Promise.all((await listQuizChapters(book, dir)).map((chapter) => readQuizFile(book, chapter, dir)))
  return files.filter((file): file is QuizFile => file !== null)
}
