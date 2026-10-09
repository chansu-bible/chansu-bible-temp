import { cleanHebrew, strongOf } from './hebrew.ts'

export type OriginalWord = { text: string; strong: string | null; morph: string }
export type OriginalVerse = { verse: number; words: OriginalWord[] }
export type OriginalChapter = { chapter: number; verses: OriginalVerse[] }

const attribute = (attributes: string, name: string): string | null =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? null

// OSHB(OSIS XML) 한 책에서 장(고르지 않으면 모든 장)의 절마다 낱말을 차례로 읽는다. 절 번호는 WLC 번호다.
// 마켑·소프 파숙 같은 seg는 뺀다.
export function parseOshb(xml: string, chapters?: ReadonlySet<number>): OriginalChapter[] {
  const result = new Map<number, OriginalVerse[]>()
  for (const verseMatch of xml.matchAll(/<verse osisID="[A-Za-z0-9]+\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g)) {
    const chapter = Number(verseMatch[1])
    if (chapters && !chapters.has(chapter)) continue
    const words: OriginalWord[] = []
    for (const word of verseMatch[3]!.matchAll(/<w ([^>]*)>([^<]*)<\/w>/g)) {
      const lemma = attribute(word[1]!, 'lemma') ?? ''
      words.push({ text: cleanHebrew(word[2]!), strong: strongOf(lemma), morph: attribute(word[1]!, 'morph') ?? '' })
    }
    const verses = result.get(chapter) ?? []
    verses.push({ verse: Number(verseMatch[2]), words })
    result.set(chapter, verses)
  }
  return [...result.entries()].sort(([a], [b]) => a - b).map(([chapter, verses]) => ({ chapter, verses }))
}
