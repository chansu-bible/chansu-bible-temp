import { describe, expect, it } from 'vitest'
import { findSourceProblems, parseWikisource } from '../src/source/parseWikisource.ts'

const wikitext = [
  '{{머리말',
  '|제목 = [[../]]',
  '}}',
  '',
  '== 1장 ==',
  '{{절|1|1}} 태초에 하나님이 천지를 창조하시니라',
  '',
  '{{절||2}} 땅이 혼돈하고 공허하며',
  '',
  '== 2장 ==',
  '{{절|2|}} 천지와 만물이 다 이루니라',
  '',
  '{{절||2}} 하나님의 지으시던 일이',
  '',
  '== 3장 ==',
  '{{절|3|}} 여호와 하나님의 지으신 들짐승 중에',
].join('\n')

describe('parseWikisource', () => {
  it('장과 절을 순서대로 읽는다', () => {
    const chapters = parseWikisource(wikitext, 1, 2)
    expect(chapters).toEqual([
      {
        chapter: 1,
        verses: [
          { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
          { verse: 2, text: '땅이 혼돈하고 공허하며' },
        ],
      },
      {
        chapter: 2,
        verses: [
          { verse: 1, text: '천지와 만물이 다 이루니라' },
          { verse: 2, text: '하나님의 지으시던 일이' },
        ],
      },
    ])
  })

  it('범위 밖의 장은 읽지 않는다', () => {
    const chapters = parseWikisource(wikitext, 2, 2)
    expect(chapters.map((c) => c.chapter)).toEqual([2])
  })

  it('절도 장 제목도 아닌 줄이 있으면 오류를 낸다', () => {
    const broken = ['== 1장 ==', '{{절|1|1}} 태초에', '{{절||2}} 땅이 혼돈하고', '이어지는 줄'].join('\n')
    expect(() => parseWikisource(broken, 1, 1)).toThrow('1장에서 알아볼 수 없는 줄이 있습니다: 이어지는 줄')
  })
})

describe('findSourceProblems', () => {
  const chapters = parseWikisource(wikitext, 1, 2)

  it('절 수가 맞으면 문제가 없다', () => {
    expect(findSourceProblems(chapters, { 1: 2, 2: 2 })).toEqual([])
  })

  it('절 수가 다르면 알려준다', () => {
    expect(findSourceProblems(chapters, { 1: 3, 2: 2 })).toEqual(['1장은 3절이어야 하는데 2절입니다'])
  })

  it('장이 없으면 알려준다', () => {
    expect(findSourceProblems(chapters, { 1: 2, 2: 2, 3: 1 })).toEqual(['3장이 없습니다'])
  })

  it('절 번호가 순서대로가 아니면 알려준다', () => {
    const broken = [{ chapter: 1, verses: [{ verse: 1, text: '가' }, { verse: 3, text: '나' }] }]
    expect(findSourceProblems(broken, { 1: 2 })).toEqual(['1장 2번째 절의 번호가 3입니다'])
  })
})
