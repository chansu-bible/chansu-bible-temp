import { firstSentence } from './entity.ts'
import type { Bundle } from './types.ts'

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
// 찾을 때 무시하는 글자: 띄어쓰기와 문장 부호
const IGNORED = /[\s.,!?·'"“”‘’()[\]{}:;~\-…]/

// 한글 음절의 초성. 한글 음절이 아니면 그대로 둔다.
export function choseongOf(char: string): string {
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return char
  return CHOSEONG[Math.floor((code - 0xac00) / 588)]!
}

export function isChoseongQuery(query: string): boolean {
  const letters = [...query].filter((char) => !IGNORED.test(char))
  return letters.length > 0 && letters.every((char) => CHOSEONG.includes(char))
}

type Folded = { text: string; positions: number[] }

// 무시할 글자를 빼고(초성 검색이면 초성으로 바꾸고), 남은 글자가 원문 몇 번째였는지 함께 든다.
function fold(text: string, choseong: boolean): Folded {
  let folded = ''
  const positions: number[] = []
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (IGNORED.test(char)) continue
    folded += choseong ? choseongOf(char) : char.toLowerCase()
    positions.push(index)
  }
  return { text: folded, positions }
}

export type TextRange = { start: number; end: number }

// text에서 query를 찾는다. 띄어쓰기·문장 부호는 무시하고, query가 초성만이면 초성끼리 견준다.
// 찾은 자리는 원문 기준 [start, end)라서 원문에서 바로 칠할 수 있다.
export function findMatch(text: string, query: string): TextRange | null {
  const needle = fold(query, false).text
  if (!needle) return null
  const haystack = fold(text, isChoseongQuery(query))
  const at = haystack.text.indexOf(needle)
  if (at < 0) return null
  return { start: haystack.positions[at]!, end: haystack.positions[at + needle.length - 1]! + 1 }
}

export type CanonKind = 'character' | 'place' | 'era' | 'thing'

export type VerseHit = { chapter: number; verse: number; text: string; sceneTitle: string; match: TextRange }
export type GlossHit = {
  chapter: number
  verse: number
  word: string
  meaning: string
  wordMatch: TextRange | null
  meaningMatch: TextRange | null
}
export type CanonHit = {
  kind: CanonKind
  id: string
  name: string
  summary: string
  nameMatch: TextRange | null
  summaryMatch: TextRange | null
}
export type SceneHit = {
  chapter: number
  sceneId: string
  title: string
  summary: string
  verseStart: number
  verseEnd: number
  titleMatch: TextRange | null
  summaryMatch: TextRange | null
}
export type SearchResults = { verses: VerseHit[]; glosses: GlossHit[]; canon: CanonHit[]; scenes: SceneHit[]; total: number }

// 장면의 한 줄 요약: 해설 첫 문장
export function sceneSummary(scene: { commentary: string | null; explanation: string[] }): string {
  return scene.commentary ?? firstSentence(scene.explanation[0] ?? '')
}

// 묶음 전체에서 찾는다. 갈래마다 묶음 순서대로 limit개까지 돌려주고, total은 자르기 전 개수의 합이다.
export function searchBundle(bundle: Bundle, query: string, limit = 50): SearchResults {
  const verses: VerseHit[] = []
  const glosses: GlossHit[] = []
  const scenes: SceneHit[] = []
  const canon: CanonHit[] = []
  if (!fold(query, false).text) return { verses, glosses, canon, scenes, total: 0 }

  for (const chapter of bundle.chapters) {
    for (const scene of chapter.scenes) {
      for (const verse of chapter.verses) {
        if (verse.verse < scene.verseStart || verse.verse > scene.verseEnd) continue
        const match = findMatch(verse.text, query)
        if (match) verses.push({ chapter: chapter.chapter, verse: verse.verse, text: verse.text, sceneTitle: scene.title, match })
      }
      for (const gloss of scene.glossary) {
        const wordMatch = findMatch(gloss.word, query)
        const meaningMatch = wordMatch ? null : findMatch(gloss.meaning, query)
        if (wordMatch || meaningMatch) {
          glosses.push({ chapter: chapter.chapter, verse: gloss.verse, word: gloss.word, meaning: gloss.meaning, wordMatch, meaningMatch })
        }
      }
      const summary = sceneSummary(scene)
      const titleMatch = findMatch(scene.title, query)
      const summaryMatch = titleMatch ? null : findMatch(summary, query)
      if (titleMatch || summaryMatch) {
        scenes.push({
          chapter: chapter.chapter,
          sceneId: scene.id,
          title: scene.title,
          summary,
          verseStart: scene.verseStart,
          verseEnd: scene.verseEnd,
          titleMatch,
          summaryMatch,
        })
      }
    }
  }

  const entries: { kind: CanonKind; id: string; name: string; aliases: string[]; summary: string }[] = [
    ...bundle.characters.map((item) => ({ kind: 'character' as const, id: item.id, name: item.name, aliases: item.aliases, summary: firstSentence(item.notes) })),
    ...bundle.places.map((item) => ({ kind: 'place' as const, id: item.id, name: item.name, aliases: [], summary: item.description })),
    ...bundle.eras.map((item) => ({ kind: 'era' as const, id: item.id, name: item.name, aliases: [], summary: item.description })),
    ...bundle.things.map((item) => ({ kind: 'thing' as const, id: item.id, name: item.name, aliases: item.aliases, summary: firstSentence(item.description) })),
  ]
  for (const entry of entries) {
    const nameMatch = findMatch(entry.name, query)
    const aliasMatch = nameMatch ? null : entry.aliases.find((alias) => findMatch(alias, query))
    const summaryMatch = nameMatch || aliasMatch ? null : findMatch(entry.summary, query)
    if (nameMatch || aliasMatch || summaryMatch) {
      canon.push({ kind: entry.kind, id: entry.id, name: entry.name, summary: entry.summary, nameMatch, summaryMatch })
    }
  }
  // 이름이 맞은 항목을 설명만 맞은 항목보다 앞에 둔다(안정 정렬이라 같은 무리 안의 순서는 그대로).
  canon.sort((a, b) => Number(b.summaryMatch === null) - Number(a.summaryMatch === null))

  const total = verses.length + glosses.length + canon.length + scenes.length
  return {
    verses: verses.slice(0, limit),
    glosses: glosses.slice(0, limit),
    canon: canon.slice(0, limit),
    scenes: scenes.slice(0, limit),
    total,
  }
}
