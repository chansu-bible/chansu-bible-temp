import type { Chapter, LexiconEntry } from './types.ts'

// 원어 낱말(스트롱 번호)이 나오는 절. 한 절에 여러 번 나와도 한 번만 센다.
export function wordOccurrences(chapters: Chapter[], strong: string): { chapter: number; verse: number }[] {
  const found: { chapter: number; verse: number }[] = []
  for (const chapter of chapters) {
    for (const verse of chapter.original ?? []) {
      if (verse.words.some((word) => word.strong === strong)) found.push({ chapter: chapter.chapter, verse: verse.verse })
    }
  }
  return found
}

// 히브리어 낱말 아래에 적는 짧은 뜻. 승인된 한국어 뜻은 짧으면 그대로, 길면 첫 갈래만 쓴다.
// 한국어 뜻이 아직 없으면 영어 정의의 첫 갈래("father, in a literal …" → "father")를 쓴다.
export function shortGloss(entry: LexiconEntry | undefined): string | null {
  if (!entry) return null
  const full = (entry.korean ?? entry.english).trim()
  const text = entry.korean !== null && full.length <= 12 ? full : full.split(/[,;(]/)[0]!.trim()
  if (text === '') return null
  return text.length > 16 ? `${text.slice(0, 15)}…` : text
}
