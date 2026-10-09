import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { chapterStem, parseChapterStem, type BookId } from 'reader-core'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const contentDir = path.join(repoRoot, 'content')
// 본문. 책마다 <책 id>.json(genesis.json)
export const sourceDir = path.join(contentDir, 'source')
export function sourceFilePath(book: BookId, dir: string = sourceDir): string {
  return path.join(dir, `${book}.json`)
}
// 설정집. characters.json, places.json, eras.json, things.json, proposals.json이 있다.
export const storyBibleDir = path.join(contentDir, 'story-bible')
export const styleFile = path.join(storyBibleDir, 'style.json')
export const refsDir = path.join(storyBibleDir, 'refs')
export const envFile = path.join(repoRoot, '.env')

// 폴더에서 그 책의 장 파일(genesis-04.json)이 있는 장 번호, 오름차순. 장면·퀴즈 폴더에 쓴다.
// 이름 규칙(reader-core의 chapterStem)에 맞지 않거나 다른 책인 파일은 건너뛴다.
export async function listChapterFiles(book: BookId, dir: string): Promise<number[]> {
  if (!existsSync(dir)) return []
  const chapters = (await readdir(dir)).flatMap((name) => {
    const stem = name.endsWith('.json') ? parseChapterStem(name.slice(0, -'.json'.length)) : null
    return stem?.book === book ? [stem.chapter] : []
  })
  return chapters.sort((a, b) => a - b)
}

// 장면. 장마다 genesis-04.json처럼 reader-core의 chapterStem 이름
export const scenesDir = path.join(contentDir, 'scenes')
export function sceneFilePath(book: BookId, chapter: number, dir: string = scenesDir): string {
  return path.join(dir, `${chapterStem(book, chapter)}.json`)
}
export const imagesDir = path.join(contentDir, 'images')
export const imageVersionsFile = path.join(imagesDir, 'versions.json')
export const audioDir = path.join(contentDir, 'audio')
// LLM 실행 기록. 날짜별 YYYY-MM-DD.jsonl, 한 줄이 한 호출이다. 커밋하지 않는다.
export const runsDir = path.join(contentDir, 'runs')
export const appContentDir = path.join(repoRoot, 'app', 'public', 'content')
// 원어: 책마다 OSHB 낱말(genesis.json)과 모든 책이 함께 쓰는 스트롱 사전 항목·한국어 뜻(lexicon.json)
export const originalDir = path.join(contentDir, 'original')
export function originalFilePath(book: BookId, dir: string = originalDir): string {
  return path.join(dir, `${book}.json`)
}
export const lexiconFile = path.join(originalDir, 'lexicon.json')
// 이해 확인 퀴즈. 장마다 genesis-04.json처럼 장면 파일과 같은 이름
export const quizDir = path.join(contentDir, 'quiz')
export function quizFilePath(book: BookId, chapter: number, dir: string = quizDir): string {
  return path.join(dir, `${chapterStem(book, chapter)}.json`)
}
