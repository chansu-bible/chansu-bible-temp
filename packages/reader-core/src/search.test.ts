import { describe, expect, it } from 'vitest'
import { choseongOf, findMatch, isChoseongQuery, searchBundle } from './search.ts'
import type { Bundle } from './types.ts'

const bundle = {
  schemaVersion: 1,
  book: '창세기',
  bookId: 'genesis',
  translation: '개역한글',
  places: [{ id: 'eden', name: '에덴', description: '동방의 동산', estimated: true, lat: 31, lng: 47 }],
  characters: [
    {
      id: 'cain',
      name: '가인',
      aliases: [],
      gender: '남',
      firstAppearance: '4:1',
      years: { born: null, died: null },
      relations: [],
      attire: [],
      notes: '농사하는 자다. 아벨을 죽였다.',
      sources: ['4:1'],
    },
  ],
  eras: [],
  things: [{ id: 'skin-garments', name: '가죽옷', aliases: [], description: '여호와 하나님이 지어 입히신 옷', details: [], sources: ['3:21'] }],
  imageVersions: [],
  defaultImageVersion: null,
  chapters: [
    {
      chapter: 3,
      verses: [
        { verse: 20, text: '아담이 그 아내를 하와라 이름하였으니', audio: null },
        { verse: 21, text: '여호와 하나님이 아담과 그 아내를 위하여 가죽옷을 지어 입히시니라', audio: null },
      ],
      scenes: [
        {
          id: 'genesis-03-06',
          verseStart: 20,
          verseEnd: 21,
          title: '하와의 이름과 옷',
          commentary: null,
          explanation: ['하나님이 두 사람에게 가죽옷을 입히셨다. 동산을 떠나기 전이다.'],
          history: [],
          glossary: [{ verse: 21, word: '가죽옷을', meaning: '동물의 가죽으로 만든 옷을.' }],
          placeId: 'eden',
          characters: [],
          images: {},
          reviewStatus: 'reviewed',
        },
      ],
    },
  ],
} as unknown as Bundle

describe('초성과 찾기', () => {
  it('한글 음절의 초성을 꺼낸다', () => {
    expect(choseongOf('가')).toBe('ㄱ')
    expect(choseongOf('힣')).toBe('ㅎ')
    expect(choseongOf('A')).toBe('A')
  })

  it('초성만으로 된 검색어를 알아본다', () => {
    expect(isChoseongQuery('ㄱㅈㅇ')).toBe(true)
    expect(isChoseongQuery('가죽')).toBe(false)
    expect(isChoseongQuery('  ')).toBe(false)
  })

  it('띄어쓰기를 무시하고 원문 자리를 돌려준다', () => {
    expect(findMatch('가죽 옷을 지어', '가죽옷')).toEqual({ start: 0, end: 4 })
    expect(findMatch('가죽옷을 지어', '가 죽 옷')).toEqual({ start: 0, end: 3 })
    expect(findMatch('가죽옷', '방주')).toBeNull()
  })

  it('초성으로도 찾는다', () => {
    expect(findMatch('아담과 가죽옷을', 'ㄱㅈㅇ')).toEqual({ start: 4, end: 7 })
  })
})

describe('searchBundle', () => {
  it('본문, 낱말 풀이, 설정집, 장면에서 찾는다', () => {
    const results = searchBundle(bundle, '가죽옷')
    expect(results.verses.map((hit) => `${hit.chapter}:${hit.verse}`)).toEqual(['3:21'])
    expect(results.verses[0]!.sceneTitle).toBe('하와의 이름과 옷')
    expect(results.glosses.map((hit) => hit.word)).toEqual(['가죽옷을'])
    expect(results.canon.map((hit) => hit.id)).toEqual(['skin-garments'])
    expect(results.scenes.map((hit) => hit.sceneId)).toEqual(['genesis-03-06'])
    expect(results.total).toBe(4)
  })

  it('이름이 맞은 설정집 항목을 설명만 맞은 항목보다 앞에 둔다', () => {
    const results = searchBundle(bundle, '동산')
    expect(results.canon.map((hit) => hit.id)).toEqual(['eden'])
    expect(results.canon[0]!.nameMatch).toBeNull()
    expect(searchBundle(bundle, '가인').canon[0]).toMatchObject({ id: 'cain', kind: 'character', nameMatch: { start: 0, end: 2 } })
  })

  it('빈 검색어는 아무것도 찾지 않는다', () => {
    expect(searchBundle(bundle, '  ').total).toBe(0)
  })
})
