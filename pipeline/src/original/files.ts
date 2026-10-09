import { readFile } from 'node:fs/promises'
import type { BookId } from 'reader-core'
import { displayPath, originalDir as defaultOriginalDir, originalFilePath } from '../paths.ts'
import { OriginalFileSchema, type OriginalFile } from '../schema.ts'

// 책의 원어 파일을 읽는다. 읽거나 형식을 확인하다 실패하면 어느 파일인지 앞에 붙여 오류를 낸다.
export async function readOriginal(book: BookId, dir: string = defaultOriginalDir): Promise<OriginalFile> {
  const file = originalFilePath(book, dir)
  try {
    return OriginalFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}
