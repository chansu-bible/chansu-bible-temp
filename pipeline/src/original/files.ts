import { readFile } from 'node:fs/promises'
import type { BookId } from 'reader-core'
import { displayPath, lexiconFile as defaultLexiconFile, originalDir as defaultOriginalDir, originalFilePath } from '../paths.ts'
import { LexiconFileSchema, OriginalFileSchema, type LexiconFile, type OriginalFile } from '../schema.ts'

// JSON 파일을 읽어 parse로 형식을 확인한다. 읽거나 확인하다 실패하면 어느 파일인지 앞에 붙여 오류를 낸다.
async function readJsonFile<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 책의 원어 파일을 읽는다.
export async function readOriginal(book: BookId, dir: string = defaultOriginalDir): Promise<OriginalFile> {
  return readJsonFile(originalFilePath(book, dir), (value) => OriginalFileSchema.parse(value))
}

// 모든 책이 함께 쓰는 사전(lexicon.json)을 읽는다.
export async function readLexicon(file: string = defaultLexiconFile): Promise<LexiconFile> {
  return readJsonFile(file, (value) => LexiconFileSchema.parse(value))
}
