import type { Chapter } from './types.ts'

// 서재의 책 카드: 묶음에 든 장과 장면 수, 장면을 모두 읽은 장
export type BookProgress = {
  firstChapter: number
  lastChapter: number
  chapterCount: number
  sceneCount: number
  readChapters: number[]
}

export function bookProgress(chapters: Chapter[], readIds: ReadonlySet<string>): BookProgress {
  return {
    firstChapter: chapters[0]?.chapter ?? 0,
    lastChapter: chapters[chapters.length - 1]?.chapter ?? 0,
    chapterCount: chapters.length,
    sceneCount: chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0),
    readChapters: chapters
      .filter((chapter) => chapter.scenes.length > 0 && chapter.scenes.every((scene) => readIds.has(scene.id)))
      .map((chapter) => chapter.chapter),
  }
}

// 장 번호를 이어진 구간으로 줄여 쓴다: [1, 2, 3, 5] → "1~3, 5장"
export function chapterRangeLabel(chapters: number[]): string {
  if (chapters.length === 0) return ''
  const sorted = [...chapters].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]!
  let previous = start
  for (const number of [...sorted.slice(1), Number.NaN]) {
    if (number === previous + 1) {
      previous = number
      continue
    }
    parts.push(start === previous ? `${start}` : `${start}~${previous}`)
    start = number
    previous = number
  }
  return `${parts.join(', ')}장`
}
