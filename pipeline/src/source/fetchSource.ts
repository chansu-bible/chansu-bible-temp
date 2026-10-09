import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, type BookId } from 'reader-core'
import { sourceFilePath } from '../paths.ts'
import { SourceSchema, type Source } from '../schema.ts'
import { expectedVerseCounts, findSourceProblems, parseWikisource } from './parseWikisource.ts'

// 위키문헌의 개역한글판 본문을 받아 content/source/<책 id>.json에 쓴다.
// 받는 장(1~10장)과 절 수 검증은 아직 창세기 것이다.
export async function fetchSource(book: BookId): Promise<Source> {
  const { name } = getBook(book)
  const pageTitle = `개역한글판/${name}`
  const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`
  const response = await fetch(url, { headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' } })
  if (!response.ok) throw new Error(`본문을 가져오지 못했습니다 (HTTP ${response.status})`)

  const text = await response.text()
  const chapters = parseWikisource(text, 1, 10)
  if (chapters.length === 0) {
    throw new Error(`본문 형식을 알아보지 못했습니다. 응답의 첫 줄: ${text.split(/\r?\n/)[0]}`)
  }
  const problems = findSourceProblems(chapters, expectedVerseCounts)
  if (problems.length > 0) throw new Error(`본문 검증에 실패했습니다:\n${problems.join('\n')}`)

  const source = SourceSchema.parse({ book: name, translation: '개역한글', chapters })
  const file = sourceFilePath(book)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  return source
}
