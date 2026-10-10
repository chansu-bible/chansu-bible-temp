import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bookOrder, isBookId } from 'reader-core'
import type { AskBundle } from './passages.ts'

// 묶음 폴더의 책 묶음(<책 id>.json)을 성경 순서로 읽는다. 책 id가 아닌 이름의 파일(notes.json)과 폴더(audio, images)는 읽지 않는다.
// 폴더가 없으면 빈 목록이다.
export function readBundles(dir: string): AskBundle[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter(isBookId)
    .sort((a, b) => bookOrder(a) - bookOrder(b))
    .map((id) => {
      const file = path.join(dir, `${id}.json`)
      const bundle = JSON.parse(readFileSync(file, 'utf8')) as AskBundle
      // 책은 파일 이름이 정한다. 묶음 안의 bookId가 다르면 잘못 복사한 파일이라, 대목 id가 겹치지 않게 멈춘다.
      if (bundle.bookId !== undefined && bundle.bookId !== id) {
        throw new Error(`${file}의 bookId(${String(bundle.bookId)})가 파일 이름과 다릅니다`)
      }
      return { ...bundle, bookId: id }
    })
}
