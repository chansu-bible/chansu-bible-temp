import { describe, expect, it } from 'vitest'
import type { OriginalChapter } from '../src/original/oshb.ts'
import { OSHB_BASE } from '../src/original/urls.ts'
import { OSHB_VERSE_MAP_URL, parseVerseMap, toKjvVerses } from '../src/original/verseMap.ts'

// OSHB wlc/VerseMap.xml과 같은 모양의 작은 대응표. 룻기 대응은 시험용으로 지어낸 것이다.
const verseMap = `<?xml version="1.0" encoding="UTF-8"?>
<verseMap xmlns="http://www.APTBibleTools.com/namespace">
	<book osisID="Num">
		<verse wlc="Num.25.19" kjv="Num.26.1" type="full"/>
	</book>
	<book osisID="Josh"/>
	<book osisID="Ruth">
		<verse wlc="Ruth.1.2!a" kjv="Ruth.1.1!b" type="partial"/>
		<verse wlc="Ruth.1.3" kjv="Ruth.1.2" type="full"/>
	</book>
	<book osisID="1Kgs">
		<verse wlc="1Kgs.18.34!a" kjv="1Kgs.18.33!b" type="partial"/>
		<verse wlc="1Kgs.22.44" kjv="1Kgs.22.43!b" type="partial"/>
		<verse wlc="1Kgs.22.45" kjv="1Kgs.22.44" type="full"/>
	</book>
	<book osisID="Isa">
		<verse wlc="Isa.63.19!b" kjv="Isa.64.1" type="partial"/>
		<verse wlc="Isa.64.1" kjv="Isa.64.2" type="full"/>
	</book>
	<book osisID="Joel">
		<verse wlc="Joel.3.1" kjv="Joel.2.28" type="full"/>
		<verse wlc="Joel.3.2" kjv="Joel.2.29" type="full"/>
		<verse wlc="Joel.4.1" kjv="Joel.3.1" type="full"/>
	</book>
	<book osisID="Mal">
		<verse wlc="Mal.3.19" kjv="Mal.4.1" type="full"/>
		<verse wlc="Mal.3.20" kjv="Mal.4.2" type="full"/>
	</book>
	<book osisID="Ps">
		<verse wlc="Ps.3.2" kjv="Ps.3.1" type="full"/>
		<verse wlc="Ps.3.3" kjv="Ps.3.2" type="full"/>
		<verse wlc="Ps.51.2" kjv="Ps.51.1" type="full"/>
		<verse wlc="Ps.51.3" kjv="Ps.51.1" type="full"/>
		<verse wlc="Ps.51.4" kjv="Ps.51.2" type="full"/>
	</book>
</verseMap>`

// 장마다 WLC 절 번호를 받아, 절마다 낱말 하나("3:1")인 원어 장을 만든다.
function wlcOf(spec: Record<number, number[]>): OriginalChapter[] {
  return Object.entries(spec).map(([chapter, verses]) => ({
    chapter: Number(chapter),
    verses: verses.map((verse) => ({ verse, words: [{ text: `${chapter}:${verse}`, strong: null, morph: '' }] })),
  }))
}

// 옮긴 결과를 [KJV 절, 그 절에 든 WLC 낱말]의 차례로 줄인다.
function summary(chapters: OriginalChapter[]): [string, string[]][] {
  return chapters.flatMap((chapter) =>
    chapter.verses.map((verse): [string, string[]] => [`${chapter.chapter}:${verse.verse}`, verse.words.map((word) => word.text)]),
  )
}

const kjvOf = (osis: string, spec: Record<number, number[]>) => summary(toKjvVerses(wlcOf(spec), parseVerseMap(verseMap, osis)))

describe('parseVerseMap', () => {
  it('그 책의 대응만 읽고 조각 표시(!a, !b)를 따로 둔다', () => {
    expect(parseVerseMap(verseMap, '1Kgs')).toEqual([
      { wlc: { chapter: 18, verse: 34, piece: 'a' }, kjv: { chapter: 18, verse: 33, piece: 'b' } },
      { wlc: { chapter: 22, verse: 44, piece: null }, kjv: { chapter: 22, verse: 43, piece: 'b' } },
      { wlc: { chapter: 22, verse: 45, piece: null }, kjv: { chapter: 22, verse: 44, piece: null } },
    ])
  })

  it('대응이 없는 책(<book osisID="Josh"/>)과 대응표에 없는 책은 빈 목록', () => {
    expect(parseVerseMap(verseMap, 'Josh')).toEqual([])
    expect(parseVerseMap(verseMap, 'Gen')).toEqual([])
  })

  it('읽을 수 없거나 다른 책을 가리키는 절이 있으면 오류', () => {
    const other = '<book osisID="Gen"><verse wlc="Gen.32.1" kjv="Exod.31.55" type="full"/></book>'
    expect(() => parseVerseMap(other, 'Gen')).toThrow('절 대응표에서 Gen의 절을 읽지 못했습니다: Exod.31.55')
    expect(() => parseVerseMap('<book osisID="Gen"><verse wlc="Gen.32" kjv="Gen.31.55"/></book>', 'Gen')).toThrow('Gen.32')
  })

  it('대응표는 OSHB와 같은 커밋에서 받는다', () => {
    expect(OSHB_VERSE_MAP_URL).toBe(`${OSHB_BASE}/VerseMap.xml`)
  })
})

describe('toKjvVerses', () => {
  it('대응표에 없는 시편 표제는 KJV 1절 앞에 붙는다(두 절 표제도)', () => {
    // 시편 3편: WLC 1절이 표제, 2절이 KJV 1절. 시편 51편: WLC 1~2절이 표제, 3절도 KJV 1절
    expect(kjvOf('Ps', { 3: [1, 2, 3], 51: [1, 2, 3, 4] })).toEqual([
      ['3:1', ['3:1', '3:2']],
      ['3:2', ['3:3']],
      ['51:1', ['51:1', '51:2', '51:3']],
      ['51:2', ['51:4']],
    ])
  })

  it('대응표에 없는 절은 그 번호가 앞 절의 목적지여도 다음 WLC 절이 가는 KJV 절 앞에 붙는다', () => {
    // Num.25.19 → 26.1: WLC 26:1은 대응표에 없고 26:1이 목적지이므로, 다음 WLC 26:2가 가는 KJV 26:2 앞에 붙는다.
    expect(kjvOf('Num', { 25: [18, 19], 26: [1, 2] })).toEqual([
      ['25:18', ['25:18']],
      ['26:1', ['25:19']],
      ['26:2', ['26:1', '26:2']],
    ])
  })

  it('말라기 3:19 이후는 KJV 4장으로 간다', () => {
    expect(kjvOf('Mal', { 3: [18, 19, 20] })).toEqual([
      ['3:18', ['3:18']],
      ['4:1', ['3:19']],
      ['4:2', ['3:20']],
    ])
  })

  it('요엘 3:1은 KJV 2:28로, 4:1은 KJV 3:1로 가고 장과 절 차례로 돌려준다', () => {
    expect(kjvOf('Joel', { 2: [27], 3: [1, 2], 4: [1] })).toEqual([
      ['2:27', ['2:27']],
      ['2:28', ['3:1']],
      ['2:29', ['3:2']],
      ['3:1', ['4:1']],
    ])
  })

  it('조각 하나만 적혀 있으면 다른 조각은 같은 번호로 간다', () => {
    // 1Kgs.18.34!a → 18.33!b: WLC 18:34의 낱말은 KJV 18:34로 가고, KJV 18:33은 WLC 18:33 그대로다.
    expect(kjvOf('1Kgs', { 18: [33, 34, 35] })).toEqual([
      ['18:33', ['18:33']],
      ['18:34', ['18:34']],
      ['18:35', ['18:35']],
    ])
  })

  it('같은 KJV 절로 가는 두 WLC 절은 WLC 차례로 잇는다', () => {
    // 1Kgs.22.44 → 22.43!b: WLC 22:43과 22:44가 KJV 22:43이 된다.
    expect(kjvOf('1Kgs', { 22: [43, 44, 45] })).toEqual([
      ['22:43', ['22:43', '22:44']],
      ['22:44', ['22:45']],
    ])
  })

  it('목적지가 여럿이고 모두 비게 되면 낱말을 모두에 준다', () => {
    // Isa.63.19!b → 64.1: 앞 조각은 63:19로, 뒤 조각은 64:1로 가는데 낱말을 나눌 수 없다.
    expect(kjvOf('Isa', { 63: [18, 19], 64: [1] })).toEqual([
      ['63:18', ['63:18']],
      ['63:19', ['63:19']],
      ['64:1', ['63:19']],
      ['64:2', ['64:1']],
    ])
  })

  it('목적지가 여럿이고 다른 절이 모두 채우면 첫 목적지에 준다', () => {
    // Ruth.1.2!a → 1.1!b: WLC 1:2의 목적지는 1:1(앞 조각)과 1:2(뒤 조각)인데 WLC 1:1과 1:3이 이미 채운다.
    expect(kjvOf('Ruth', { 1: [1, 2, 3] })).toEqual([
      ['1:1', ['1:1', '1:2']],
      ['1:2', ['1:3']],
    ])
  })

  it('대응이 없는 책은 그대로이고, 입력은 바꾸지 않는다', () => {
    expect(toKjvVerses(wlcOf({ 1: [1, 2], 2: [1] }), parseVerseMap(verseMap, 'Josh'))).toEqual(wlcOf({ 1: [1, 2], 2: [1] }))
    const wlc = wlcOf({ 22: [43, 44, 45] })
    toKjvVerses(wlc, parseVerseMap(verseMap, '1Kgs'))
    expect(wlc).toEqual(wlcOf({ 22: [43, 44, 45] }))
  })
})
