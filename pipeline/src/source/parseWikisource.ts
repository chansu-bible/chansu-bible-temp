import type { SourceChapter } from '../schema.ts'

const chapterHeading = /^==\s*(\d+)장\s*==$/
const verseLine = /^\{\{절\|(\d*)\|(\d*)\}\}\s*(.+)$/
// 요한계시록은 한 절이 여러 줄이다. 앞 절에 이어지는 줄은 <br>로 시작한다: <br> &nbsp;&nbsp;그 천사를 …
const continuationTag = /^<br\s*\/?>/
const continuationIndent = /^(?:\s|&nbsp;)+/

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
    if (line === '') continue
    const continuation = line.match(continuationTag)
    if (continuation) {
      const previous = current.verses.at(-1)
      if (!previous) throw new Error(`${current.chapter}장에서 알아볼 수 없는 줄이 있습니다: ${line}`)
      const rest = line.slice(continuation[0].length).replace(continuationIndent, '')
      if (rest !== '') previous.text = `${previous.text} ${rest}`
      continue
    }
    const verse = line.match(verseLine)
    if (!verse) throw new Error(`${current.chapter}장에서 알아볼 수 없는 줄이 있습니다: ${line}`)
    // 2장부터는 첫 절의 번호가 비어 있다: {{절|2|}}
    current.verses.push({ verse: verse[2] ? Number(verse[2]) : 1, text: verse[3].trim() })
  }

  return chapters
}

// 받은 장이 from..to로 빠짐없이 이어지고, 장마다 절이 1부터 빠짐없이 이어지는지 본다. 절 번호가 처음 끊긴 곳만 알려준다.
export function findSourceProblems(chapters: SourceChapter[], range: { from: number; to: number }): string[] {
  const problems: string[] = []

  for (let number = range.from; number <= range.to; number++) {
    const found = chapters.find((chapter) => chapter.chapter === number)
    if (!found) {
      problems.push(`${number}장이 없습니다`)
      continue
    }
    if (found.verses.length === 0) {
      problems.push(`${number}장에 절이 없습니다`)
      continue
    }
    for (const [index, verse] of found.verses.entries()) {
      if (verse.verse !== index + 1) {
        problems.push(`${number}장: ${index + 1}절이 없습니다`)
        break
      }
      if (verse.text.trim() === '') problems.push(`${number}장 ${verse.verse}절이 비어 있습니다`)
    }
  }

  return problems
}
