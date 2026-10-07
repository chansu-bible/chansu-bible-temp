import { describe, expect, it } from 'vitest'
import type { Character, Gloss, Place } from '../content/types.ts'
import { linkNames, splitVerse, type VersePart } from './names.ts'

function person(id: string, name: string, firstAppearance: string): Character {
  return {
    id,
    name,
    aliases: [],
    gender: '남',
    firstAppearance,
    years: { born: null, died: null },
    relations: [],
    attire: [],
    notes: '',
    sources: [],
  }
}

function place(id: string, name: string): Place {
  return { id, name, description: '', estimated: true, lat: null, lng: null }
}

const adam = { ...person('adam', '아담', '2:7'), aliases: ['사람'] }
const cain = person('cain', '가인', '4:1')
const abel = person('abel', '아벨', '4:2')
const cherubim = person('cherubim', '그룹', '3:24')
const enoch = person('enoch', '에녹', '4:17')
const enochSonOfJared = person('enoch-son-of-jared', '에녹', '5:18')
const lamech = person('lamech', '라멕', '4:18')
const lamechSonOfMethuselah = person('lamech-son-of-methuselah', '라멕', '5:25')
const tubalCain = person('tubal-cain', '두발가인', '4:22')
const adah = person('adah', '아다', '4:19')
const seth = person('seth', '셋', '4:25')
const shem = person('shem', '셈', '5:32')
const ham = person('ham', '함', '5:32')
const japheth = person('japheth', '야벳', '5:32')
const characters = [
  adam,
  cherubim,
  cain,
  abel,
  enoch,
  lamech,
  adah,
  tubalCain,
  seth,
  enochSonOfJared,
  lamechSonOfMethuselah,
  shem,
  ham,
  japheth,
]
const eden = place('eden', '에덴')
const nod = place('nod', '놋')
const places = [eden, nod]

// 이은 이름만 [텍스트, id]로 뽑는다.
function links(parts: VersePart[]): [string, string][] {
  return parts.filter((part) => part.entity).map((part) => [part.text, part.entity!.id])
}

function joined(parts: VersePart[]): string {
  return parts.map((part) => part.text).join('')
}

describe('linkNames', () => {
  it('이름이 없으면 한 조각이다', () => {
    expect(linkNames('태초에 하나님이 천지를 창조하시니라', 1, characters, places)).toEqual([
      { text: '태초에 하나님이 천지를 창조하시니라' },
    ])
  })

  it('인물과 장소를 찾아 조각으로 나누고 본문은 그대로 둔다', () => {
    const text = '가인이 여호와의 앞을 떠나 나가 에덴 동편 놋 땅에 거하였더니'
    const parts = linkNames(text, 4, characters, places)
    expect(joined(parts)).toBe(text)
    expect(parts).toEqual([
      { text: '가인', entity: { kind: 'character', id: 'cain' } },
      { text: '이 여호와의 앞을 떠나 나가 ' },
      { text: '에덴', entity: { kind: 'place', id: 'eden' } },
      { text: ' 동편 ' },
      { text: '놋', entity: { kind: 'place', id: 'nod' } },
      { text: ' 땅에 거하였더니' },
    ])
  })

  it('별칭은 찾지 않는다', () => {
    expect(links(linkNames('이같이 하나님이 그 사람을 쫓아 내시고', 3, characters, places))).toEqual([])
  })

  it('그 장보다 뒤에 처음 나오는 인물은 잇지 않는다', () => {
    // 가인은 4:1에 처음 나온다.
    expect(links(linkNames('가인이 성을 쌓고', 3, characters, places))).toEqual([])
    expect(links(linkNames('가인이 성을 쌓고', 4, characters, places))).toEqual([['가인', 'cain']])
  })

  it('장소는 장과 상관없이 모두 잇는다', () => {
    expect(links(linkNames('에덴에서 강이 발원하여', 2, characters, places))).toEqual([['에덴', 'eden']])
  })

  it('"셋째"는 잇지 않고 "셋이라"는 잇는다', () => {
    const verse214 = '셋째 강의 이름은 힛데겔이라 앗수르 동편으로 흐르며 넷째 강은 유브라데더라'
    expect(links(linkNames(verse214, 4, characters, places))).toEqual([])
    expect(links(linkNames('그 이름을 셋이라 하였으니', 4, characters, places))).toEqual([['셋', 'seth']])
  })

  it('"함께"는 잇지 않고 "함과"는 잇는다', () => {
    expect(links(linkNames('노아가 아들들과 아내와 자부들과 함께 홍수를 피하여', 7, characters, places))).toEqual([])
    expect(links(linkNames('그가 세 아들을 낳았으니 셈과 함과 야벳이라', 6, characters, places))).toEqual([
      ['셈', 'shem'],
      ['함', 'ham'],
      ['야벳', 'japheth'],
    ])
  })

  it('앞 글자가 한글이면 잇지 않는다("취함을", "두발가인"의 가인)', () => {
    expect(links(linkNames('그 속에서 네가 취함을 입었음이라', 7, characters, places))).toEqual([])
    expect(links(linkNames('씰라는 두발가인을 낳았으니', 4, characters, places))).toEqual([['두발가인', 'tubal-cain']])
  })

  it('뒷 글자가 조사가 아닌 한글이면 잇지 않는다("아담"의 "아다")', () => {
    expect(links(linkNames('아담이 그 아내를', 4, characters, places))).toEqual([['아담', 'adam']])
  })

  it('조사로 "들", 두 글자 조사, 문장부호, 끝을 받는다', () => {
    expect(links(linkNames('그룹들과 두루 도는 화염검을', 3, characters, places))).toEqual([['그룹', 'cherubim']])
    expect(links(linkNames('가인이 그 아우 아벨에게 고하니라', 4, characters, places))).toEqual([
      ['가인', 'cain'],
      ['아벨', 'abel'],
    ])
    expect(links(linkNames('놋으로 가니 에덴, 그리고 가인', 4, characters, places))).toEqual([
      ['놋', 'nod'],
      ['에덴', 'eden'],
      ['가인', 'cain'],
    ])
  })

  it('같은 이름이 한 절에 여러 번 나오면 모두 잇는다', () => {
    const text = '그가 잉태하여 에녹을 낳은지라 가인이 성을 쌓고 그 아들의 이름으로 성을 이름하여 에녹이라 하였더라'
    expect(links(linkNames(text, 4, characters, places))).toEqual([
      ['에녹', 'enoch'],
      ['가인', 'cain'],
      ['에녹', 'enoch'],
    ])
  })

  it('같은 이름이 둘이면 그 장에 처음 나온 인물, 없으면 그 장 이전에 가장 늦게 나온 인물이다', () => {
    expect(links(linkNames('에녹이 이랏을 낳았고 므드사엘은 라멕을 낳았더라', 4, characters, places))).toEqual([
      ['에녹', 'enoch'],
      ['라멕', 'lamech'],
    ])
    expect(links(linkNames('야렛은 일백육십이 세에 에녹을 낳았고', 5, characters, places))).toEqual([
      ['에녹', 'enoch-son-of-jared'],
    ])
    expect(links(linkNames('므두셀라는 일백팔십칠 세에 라멕을 낳았고', 5, characters, places))).toEqual([
      ['라멕', 'lamech-son-of-methuselah'],
    ])
    expect(links(linkNames('에녹과 라멕', 9, characters, places))).toEqual([
      ['에녹', 'enoch-son-of-jared'],
      ['라멕', 'lamech-son-of-methuselah'],
    ])
  })
})

describe('splitVerse', () => {
  const gloss = (word: string): Gloss => ({ verse: 1, word, meaning: `${word}의 뜻` })

  it('낱말 풀이를 먼저 나누고 남은 조각에서 이름을 잇는다', () => {
    const text = '아담이 그 아내 하와와 동침하매 하와가 잉태하여 가인을 낳고'
    const parts = splitVerse(text, [gloss('동침하매')], 4, characters, places)
    expect(joined(parts)).toBe(text)
    expect(parts.filter((part) => part.gloss).map((part) => part.text)).toEqual(['동침하매'])
    expect(links(parts)).toEqual([
      ['아담', 'adam'],
      ['가인', 'cain'],
    ])
  })

  it('낱말 풀이와 이름이 겹치면 낱말 풀이가 이긴다', () => {
    const parts = splitVerse('에덴 동산 동편에', [gloss('에덴 동산')], 3, characters, places)
    expect(parts).toEqual([{ text: '에덴 동산', gloss: gloss('에덴 동산') }, { text: ' 동편에' }])
  })

  it('낱말 풀이 바로 뒤의 이름도 앞 글자를 본문 전체에서 본다', () => {
    // "두발" 풀이 뒤에 붙은 "가인"은 앞 글자가 한글이라 잇지 않는다.
    const parts = splitVerse('씰라는 두발가인을 낳았으니', [gloss('두발')], 4, characters, places)
    expect(links(parts)).toEqual([])
    expect(joined(parts)).toBe('씰라는 두발가인을 낳았으니')
  })

  it('풀이도 이름도 없으면 한 조각이다', () => {
    expect(splitVerse('태초에', [], 1, characters, places)).toEqual([{ text: '태초에' }])
  })
})
