import type { SourceChapter } from '../schema.ts'

// 받을 장의 범위. from과 to는 둘 다 포함한다.
export type ChapterRange = { from: number; to: number }

const chapterHeading = /^==\s*(\d+)장\s*==$/
const verseLine = /^\{\{절\|(\d*)\|(\d*)\}\}\s*(.+)$/
// 요한계시록은 한 절이 여러 줄이다. 앞 절에 이어지는 줄은 <br>로 시작한다: <br> &nbsp;&nbsp;그 천사를 …
const continuationTag = /^<br\s*\/?>/
// 위키 글에 남은 표지: 태그(< >), 틀({{ }}), 링크([[ ]]), 굵은 글·기울임(''), 표(|), 매직워드(__NOTOC__), &amp; 같은 HTML 개체
const leftoverMarkup = /[<>|]|\{\{|\}\}|\[\[|\]\]|''|__[a-z]+__|&[a-z#0-9]+;/i

// 절 글의 &nbsp;를 빈칸으로 바꾸고, 이어진 빈칸은 하나로 줄이고, 앞뒤를 자른다.
function cleanText(text: string): string {
  return text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
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
    if (line === '') continue
    const continuation = line.match(continuationTag)
    if (continuation) {
      const previous = current.verses.at(-1)
      if (!previous) throw new Error(`${current.chapter}장에서 알아볼 수 없는 줄이 있습니다: ${line}`)
      const rest = cleanText(line.slice(continuation[0].length))
      if (rest !== '') previous.text = `${previous.text} ${rest}`.trim()
      continue
    }
    const verse = line.match(verseLine)
    if (!verse) throw new Error(`${current.chapter}장에서 알아볼 수 없는 줄이 있습니다: ${line}`)
    // 2장부터는 첫 절의 번호가 비어 있다: {{절|2|}}
    current.verses.push({ verse: verse[2] ? Number(verse[2]) : 1, text: cleanText(verse[3]) })
  }

  return chapters
}

// 받은 장이 from..to로 빠짐없이 이어지는지, 겹치거나 순서가 틀리지 않았는지, 장마다 절이 1부터 빠짐없이 이어지는지,
// 절 글이 비었거나 위키 문법이 남지 않았는지 본다. 절 번호는 처음 끊긴 곳만 알려주고, 범위 밖의 장은 보지 않는다.
export function findSourceProblems(chapters: SourceChapter[], range: ChapterRange): string[] {
  const problems: string[] = []
  const received = chapters.filter((chapter) => chapter.chapter >= range.from && chapter.chapter <= range.to)

  for (let number = range.from; number <= range.to; number++) {
    const copies = received.filter((chapter) => chapter.chapter === number)
    if (copies.length === 0) {
      problems.push(`${number}장이 없습니다`)
      continue
    }
    if (copies.length > 1) problems.push(`${number}장이 두 번 있습니다`)
    const found = copies[0]
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
      else if (leftoverMarkup.test(verse.text)) problems.push(`${number}장 ${verse.verse}절에 위키 문법이 남아 있습니다`)
    }
  }

  const numbers = received.map((chapter) => chapter.chapter)
  if (numbers.some((number, index) => index > 0 && number < numbers[index - 1])) {
    problems.push(`장 순서가 맞지 않습니다: ${numbers.join(', ')}`)
  }

  return problems
}
