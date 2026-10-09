import type { OriginalChapter, OriginalVerse } from './oshb.ts'
import { OSHB_BASE } from './urls.ts'

// WLC와 KJV(개역한글과 같은 절 나눔)의 절 번호 대응표다. OSHB가 WLC 주석으로 만들었고, OSHB와 같은 커밋에서 받는다.
export const OSHB_VERSE_MAP_URL = `${OSHB_BASE}/VerseMap.xml`

// 한 절이 다른 절 가운데에서 시작하면 대응표는 앞 조각을 !a, 뒤 조각을 !b로 적는다. 조각이 아니면 null
export type VersePiece = 'a' | 'b' | null
export type VerseMapVerse = { chapter: number; verse: number; piece: VersePiece }
// WLC 절(또는 조각)이 가는 KJV 절(또는 조각)
export type VerseMapEntry = { wlc: VerseMapVerse; kjv: VerseMapVerse }

const attribute = (attributes: string, name: string): string =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? ''

// 대응표의 절("1Kgs.18.34!a")을 읽는다. 모양이 다르거나 다른 책의 절이면 오류다.
function parseVerse(ref: string, osis: string): VerseMapVerse {
  const match = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:!([ab]))?$/.exec(ref)
  if (!match || match[1] !== osis) throw new Error(`절 대응표에서 ${osis}의 절을 읽지 못했습니다: ${ref}`)
  const piece = match[4] === 'a' || match[4] === 'b' ? match[4] : null
  return { chapter: Number(match[2]), verse: Number(match[3]), piece }
}

// 대응표(VerseMap.xml)에서 한 책(OSIS 코드)의 대응만 읽는다. 대응이 없는 책(<book osisID="Josh"/>)과 대응표에 없는 책은 빈 목록이다.
export function parseVerseMap(xml: string, osis: string): VerseMapEntry[] {
  const block = new RegExp(`<book osisID="${osis}"\\s*(?:/>|>([\\s\\S]*?)</book>)`).exec(xml)
  return [...(block?.[1] ?? '').matchAll(/<verse\s([^>]*)\/>/g)].map((match) => ({
    wlc: parseVerse(attribute(match[1]!, 'wlc'), osis),
    kjv: parseVerse(attribute(match[1]!, 'kjv'), osis),
  }))
}

// 장과 절을 한 수로 나타낸다(절은 1000보다 작다). 수의 크기 차례가 장, 절 차례다.
const keyOf = (chapter: number, verse: number): number => chapter * 1000 + verse
const pieceOrder = (piece: VersePiece): number => (piece === 'a' ? 1 : piece === 'b' ? 2 : 0)

// 대응표에 있는 WLC 절마다 가는 KJV 절을 조각 차례(앞 조각, 뒤 조각)로 모은다.
// 조각 하나만 적혀 있으면 짝이 적히지 않은 다른 조각은 같은 번호로 간다(1Kgs.18.34!a → 18.33!b면 18:34의 뒤 조각은 18:34).
function targetsOf(entries: VerseMapEntry[]): Map<number, number[]> {
  const pieces = new Map<number, { piece: VersePiece; target: number }[]>()
  for (const { wlc, kjv } of entries) {
    const key = keyOf(wlc.chapter, wlc.verse)
    pieces.set(key, [...(pieces.get(key) ?? []), { piece: wlc.piece, target: keyOf(kjv.chapter, kjv.verse) }])
  }
  const targets = new Map<number, number[]>()
  for (const [key, list] of pieces) {
    const listed = new Set(list.map((item) => item.piece))
    if (listed.has('a') && !listed.has('b')) list.push({ piece: 'b', target: key })
    if (listed.has('b') && !listed.has('a')) list.push({ piece: 'a', target: key })
    list.sort((x, y) => pieceOrder(x.piece) - pieceOrder(y.piece))
    targets.set(key, [...new Set(list.map((item) => item.target))])
  }
  return targets
}

// WLC 절 번호의 원어를 KJV 절 번호로 옮긴다. 입력은 바꾸지 않고, 장과 절 차례로 돌려준다.
// - 대응표에 있는 WLC 절은 그 KJV 절로 간다(조각 표시는 뗀다).
// - 대응표에 없는 WLC 절은 언제나 같은 번호의 KJV 절로 간다. 대응표에서 다른 WLC 절도 그 절로 오면 WLC 차례로 잇는다
//   (KJV 시편 3:1은 표제인 WLC 3:1과 WLC 3:2, KJV 민수기 26:1은 WLC 25:19와 26:1이다).
// - 목적지가 여럿인 절(조각 대응)은 낱말을 나눌 경계가 대응표에 없으므로, 나머지 절을 다 둔 뒤 낱말을 받지 못한 목적지에 준다.
//   그런 곳이 없으면 첫 목적지에, 여럿이면 모두에 준다(구약에서는 이사야 63:19, 시편 13:6의 낱말이 두 절에 겹친다).
// - 같은 KJV 절로 가는 낱말은 WLC 차례로 잇는다.
export function toKjvVerses(chapters: OriginalChapter[], entries: VerseMapEntry[]): OriginalChapter[] {
  const targets = targetsOf(entries)
  const verses = chapters.flatMap((chapter) =>
    chapter.verses.map((verse) => ({ key: keyOf(chapter.chapter, verse.verse), words: verse.words })),
  )
  // KJV 절마다 받은 WLC 절(verses의 차례 번호)
  const placed = new Map<number, number[]>()
  const place = (target: number, index: number) => placed.set(target, [...(placed.get(target) ?? []), index])

  // 목적지가 하나인 절(대응표에 없는 절은 같은 번호)을 먼저 다 두고, 목적지가 여럿인 절은 그 뒤에 정한다.
  const several: number[] = []
  verses.forEach((verse, index) => {
    const list = targets.get(verse.key) ?? [verse.key]
    if (list.length > 1) several.push(index)
    else place(list[0]!, index)
  })
  for (const index of several) {
    const list = targets.get(verses[index]!.key)!
    const empty = list.filter((target) => !placed.has(target))
    for (const target of empty.length > 0 ? empty : [list[0]!]) place(target, index)
  }

  const result = new Map<number, OriginalVerse[]>()
  for (const key of [...placed.keys()].sort((a, b) => a - b)) {
    const chapter = Math.floor(key / 1000)
    const words = placed
      .get(key)!
      .sort((a, b) => a - b)
      .flatMap((index) => verses[index]!.words)
    result.set(chapter, [...(result.get(chapter) ?? []), { verse: key % 1000, words }])
  }
  return [...result.entries()].map(([chapter, list]) => ({ chapter, verses: list }))
}
