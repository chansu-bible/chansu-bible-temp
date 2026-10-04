import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { sourceFile } from '../paths.ts'
import { SourceSchema, type Source } from '../schema.ts'
import { expectedVerseCounts, findSourceProblems, parseWikisource } from './parseWikisource.ts'

const pageTitle = '개역한글판/창세기'
const url = `https://ko.wikisource.org/w/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`

export async function fetchSource(): Promise<Source> {
  const response = await fetch(url, { headers: { 'User-Agent': 'chansu-bible-pipeline/0.1' } })
  if (!response.ok) throw new Error(`본문을 가져오지 못했습니다 (HTTP ${response.status})`)

  const text = await response.text()
  const chapters = parseWikisource(text, 1, 10)
  if (chapters.length === 0) {
    throw new Error(`본문 형식을 알아보지 못했습니다. 응답의 첫 줄: ${text.split(/\r?\n/)[0]}`)
  }
  const problems = findSourceProblems(chapters, expectedVerseCounts)
  if (problems.length > 0) throw new Error(`본문 검증에 실패했습니다:\n${problems.join('\n')}`)

  const source = SourceSchema.parse({ book: '창세기', translation: '개역한글', chapters })
  await mkdir(path.dirname(sourceFile), { recursive: true })
  await writeFile(sourceFile, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  return source
}
