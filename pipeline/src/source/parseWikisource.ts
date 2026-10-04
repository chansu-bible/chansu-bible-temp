import type { SourceChapter } from '../schema.ts'

const chapterHeading = /^==\s*(\d+)장\s*==$/
const verseLine = /^\{\{절\|(\d*)\|(\d*)\}\}\s*(.+)$/

export const expectedVerseCounts: Record<number, number> = {
  1: 31,
  2: 25,
  3: 24,
  4: 26,
  5: 32,
  6: 22,
  7: 24,
  8: 22,
  9: 29,
  10: 32,
}

export function parseWikisource(wikitext: string, chapterFrom: number, chapterTo: number): SourceChapter[] {
  const chapters: SourceChapter[] = []
  let current: SourceChapter | null = null

  for (const rawLine of wikitext.split(/\r?\n/)) {
    const line = rawLine.trim()
    const heading = line.match(chapterHeading)
    if (heading) {
      const chapter = Number(heading[1])
      current = chapter >= chapterFrom && chapter <= chapterTo ? { chapter, verses: [] } : null
      if (current) chapters.push(current)
      continue
    }
    if (!current) continue
    const verse = line.match(verseLine)
    if (!verse) continue
    // 2장부터는 첫 절의 번호가 비어 있다: {{절|2|}}
    current.verses.push({ verse: verse[2] ? Number(verse[2]) : 1, text: verse[3].trim() })
  }

  return chapters
}

export function findSourceProblems(chapters: SourceChapter[], expected: Record<number, number>): string[] {
  const problems: string[] = []

  for (const [key, count] of Object.entries(expected)) {
    const chapter = Number(key)
    const found = chapters.find((c) => c.chapter === chapter)
    if (!found) {
      problems.push(`${chapter}장이 없습니다`)
      continue
    }
    if (found.verses.length !== count) {
      problems.push(`${chapter}장은 ${count}절이어야 하는데 ${found.verses.length}절입니다`)
    }
    found.verses.forEach((verse, index) => {
      if (verse.verse !== index + 1) {
        problems.push(`${chapter}장 ${index + 1}번째 절의 번호가 ${verse.verse}입니다`)
      }
    })
  }

  return problems
}
