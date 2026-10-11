import { cleanHebrew, strongOf } from './hebrew.ts'
import { attribute } from './xml.ts'

export type OriginalWord = { text: string; strong: string | null; morph: string }
export type OriginalVerse = { verse: number; words: OriginalWord[] }
export type OriginalChapter = { chapter: number; verses: OriginalVerse[] }

// <w> 하나를 낱말로 읽는다. 낱말 안의 seg(큰 글자, 작은 글자, 매단 글자)는 태그만 지우고 글자는 둔다.
function wordOf(attributes: string, body: string): OriginalWord {
  return {
    text: cleanHebrew(body.replace(/<[^>]*>/g, '')),
    strong: strongOf(attribute(attributes, 'lemma') ?? ''),
    morph: attribute(attributes, 'morph') ?? '',
  }
}

// note의 <rdg type="x-qere">에서 크레 낱말을 읽는다. 크레가 아닌 note면 null, 크레가 비었으면(<rdg type="x-qere"/>) 빈 목록이다.
function qereOf(noteAttributes: string, noteBody: string): OriginalWord[] | null {
  if (attribute(noteAttributes, 'type') !== 'variant') return null
  const reading = [...noteBody.matchAll(/<rdg\b([^>]*?)(?:\/>|>([\s\S]*?)<\/rdg>)/g)].find((rdg) => attribute(rdg[1]!, 'type') === 'x-qere')
  if (!reading) return null
  return [...(reading[2] ?? '').matchAll(/<w ([^>]*)>([\s\S]*?)<\/w>/g)].map((word) => wordOf(word[1]!, word[2]!))
}

// OSHB(OSIS XML) 한 책에서 장(고르지 않으면 모든 장)의 절마다 낱말을 차례로 읽는다. 절 번호는 WLC 번호다. 낱말 사이의 seg(마켑, 소프 파숙)는 뺀다.
// 쓰인 대로(크티브, <w type="x-ketiv">)와 읽는 대로(크레, 뒤따르는 <note type="variant">의 <rdg type="x-qere">)가 다르면 크레를 쓴다.
// - 크티브 낱말(하나나 둘, 사이에 다른 note가 끼기도 한다)은 그 자리에서 크레 낱말(하나나 둘)로 바뀐다. 크레가 비었으면 크티브를 뺀다.
// - 크티브 없이 온 크레(쓰이지 않았지만 읽는 낱말)는 그 자리에 넣는다.
// - note의 catchWord(크티브를 다시 적은 것)는 읽지 않고, 크레 낱말을 따로 한 번 더 읽지도 않는다.
// - 크레가 뒤따르지 않는 크티브는 쓰인 대로 둔다(고정 커밋의 OSHB에는 없다).
export function parseOshb(xml: string, chapters?: ReadonlySet<number>): OriginalChapter[] {
  const result = new Map<number, OriginalVerse[]>()
  for (const verseMatch of xml.matchAll(/<verse osisID="[A-Za-z0-9]+\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g)) {
    const chapter = Number(verseMatch[1])
    if (chapters && !chapters.has(chapter)) continue
    const words: OriginalWord[] = []
    // 크레를 기다리는 크티브 낱말
    let ketiv: OriginalWord[] = []
    // note는 통째로 읽어 그 안의 <w>(크레)가 본문 낱말로 따로 잡히지 않게 한다.
    for (const token of verseMatch[3]!.matchAll(/<note\b([^>]*?)(?:\/>|>([\s\S]*?)<\/note>)|<w ([^>]*)>([\s\S]*?)<\/w>/g)) {
      if (token[3] !== undefined) {
        const word = wordOf(token[3], token[4]!)
        if (attribute(token[3], 'type') === 'x-ketiv') ketiv.push(word)
        else {
          words.push(...ketiv, word)
          ketiv = []
        }
        continue
      }
      const qere = qereOf(token[1]!, token[2] ?? '')
      if (qere === null) continue
      words.push(...qere)
      ketiv = []
    }
    words.push(...ketiv)
    const verses = result.get(chapter) ?? []
    verses.push({ verse: Number(verseMatch[2]), words })
    result.set(chapter, verses)
  }
  return [...result.entries()].sort(([a], [b]) => a - b).map(([chapter, verses]) => ({ chapter, verses }))
}
