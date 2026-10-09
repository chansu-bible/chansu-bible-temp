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

// 요한계시록처럼 한 절이 여러 줄이면 앞 절에 이어지는 줄이 <br>로 시작한다.
const revelation = [
  '== 1장 ==',
  '{{절|1|}} 예수 그리스도의 계시라 이는 하나님이 그에게 주사 반드시 속히 될 일을 그 종들에게 보이시려고',
  '<br> &nbsp;&nbsp;그 천사를 그 종 요한에게 보내어 지시하신 것이라',
  '',
  '{{절||2}} 요한은 하나님의 말씀과 예수 그리스도의 증거 곧 자기의 본 것을 다 증거하였느니라',
  '',
  '== 2장 ==',
  '{{절|2|}} 에베소 교회의 사자에게 편지하라',
  '<br> &nbsp;&nbsp;오른손에 일곱 별을 붙잡고',
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

  it('<br>로 시작하는 줄은 앞 절 끝에 빈칸 하나로 붙인다', () => {
    expect(parseWikisource(revelation, 1, 2)).toEqual([
      {
        chapter: 1,
        verses: [
          {
            verse: 1,
            text: '예수 그리스도의 계시라 이는 하나님이 그에게 주사 반드시 속히 될 일을 그 종들에게 보이시려고 그 천사를 그 종 요한에게 보내어 지시하신 것이라',
          },
          { verse: 2, text: '요한은 하나님의 말씀과 예수 그리스도의 증거 곧 자기의 본 것을 다 증거하였느니라' },
        ],
      },
      { chapter: 2, verses: [{ verse: 1, text: '에베소 교회의 사자에게 편지하라 오른손에 일곱 별을 붙잡고' }] },
    ])
  })

  it.each(['<br>', '<br/>', '<br />'])('%s로 시작하는 줄도 앞 절에 붙인다', (tag) => {
    const text = ['== 1장 ==', '{{절|1|1}} 가', `${tag} &nbsp;&nbsp;나`].join('\n')
    expect(parseWikisource(text, 1, 1)[0]!.verses).toEqual([{ verse: 1, text: '가 나' }])
  })

  it('이어지는 줄이 여럿이면 차례로 붙인다', () => {
    const text = ['== 3장 ==', '{{절|3|}} 가', '{{절||2}} 나', '<br> &nbsp;&nbsp;다', '<br> &nbsp;&nbsp;라', '{{절||3}} 마'].join('\n')
    expect(parseWikisource(text, 3, 3)[0]!.verses).toEqual([
      { verse: 1, text: '가' },
      { verse: 2, text: '나 다 라' },
      { verse: 3, text: '마' },
    ])
  })

  it('붙일 글이 없는 <br> 줄은 건너뛴다', () => {
    const text = ['== 1장 ==', '{{절|1|1}} 가', '<br>', '<br> &nbsp;&nbsp;', '<br />', '{{절||2}} 나'].join('\n')
    expect(parseWikisource(text, 1, 1)[0]!.verses).toEqual([
      { verse: 1, text: '가' },
      { verse: 2, text: '나' },
    ])
  })

  it('장에서 절보다 먼저 나오는 <br> 줄은 오류를 낸다', () => {
    const first = ['== 1장 ==', '<br> &nbsp;&nbsp;이어지는 줄', '{{절|1|1}} 가'].join('\n')
    expect(() => parseWikisource(first, 1, 1)).toThrow('1장에서 알아볼 수 없는 줄이 있습니다: <br> &nbsp;&nbsp;이어지는 줄')

    // 앞 장의 마지막 절에는 붙이지 않는다.
    const nextChapter = ['== 1장 ==', '{{절|1|1}} 가', '== 2장 ==', '<br> &nbsp;&nbsp;이어지는 줄', '{{절|2|}} 나'].join('\n')
    expect(() => parseWikisource(nextChapter, 1, 2)).toThrow('2장에서 알아볼 수 없는 줄이 있습니다: <br> &nbsp;&nbsp;이어지는 줄')

    // 붙일 글이 없어도 앞 절이 없으면 오류다.
    const empty = ['== 1장 ==', '<br>', '{{절|1|1}} 가'].join('\n')
    expect(() => parseWikisource(empty, 1, 1)).toThrow('1장에서 알아볼 수 없는 줄이 있습니다: <br>')
  })

  it('범위 밖 장의 <br> 줄은 읽지 않는다', () => {
    const chapters = parseWikisource(revelation, 1, 1)
    expect(chapters.map((c) => c.chapter)).toEqual([1])
    expect(parseWikisource(['== 2장 ==', '<br> &nbsp;&nbsp;이어지는 줄'].join('\n'), 1, 1)).toEqual([])
  })

  it('[없음]과 괄호는 본문이므로 그대로 둔다', () => {
    const text = ['== 15장 ==', '{{절|15|}} 바울이 (실라를) 택하고', '{{절||34}} [없음]', '{{절||35}} [25절과 같음]'].join('\n')
    expect(parseWikisource(text, 15, 15)[0]!.verses).toEqual([
      { verse: 1, text: '바울이 (실라를) 택하고' },
      { verse: 34, text: '[없음]' },
      { verse: 35, text: '[25절과 같음]' },
    ])
  })
})

describe('findSourceProblems', () => {
  const chapter = (number: number, verses: number[]) => ({ chapter: number, verses: verses.map((verse) => ({ verse, text: '본문' })) })

  it('장과 절이 빠짐없이 이어지는지 본다', () => {
    expect(findSourceProblems([chapter(1, [1, 2]), chapter(2, [1])], { from: 1, to: 2 })).toEqual([])
    expect(findSourceProblems([chapter(1, [1, 3])], { from: 1, to: 1 })).toEqual(['1장: 2절이 없습니다'])
    expect(findSourceProblems([chapter(1, [1])], { from: 1, to: 2 })).toEqual(['2장이 없습니다'])
  })

  it('받은 범위가 1장에서 시작하지 않아도 된다', () => {
    expect(findSourceProblems([chapter(3, [1, 2]), chapter(4, [1])], { from: 3, to: 4 })).toEqual([])
    expect(findSourceProblems([chapter(4, [1])], { from: 3, to: 4 })).toEqual(['3장이 없습니다'])
  })

  it('빠진 장을 모두 알려준다', () => {
    expect(findSourceProblems([chapter(2, [1])], { from: 1, to: 4 })).toEqual(['1장이 없습니다', '3장이 없습니다', '4장이 없습니다'])
    expect(findSourceProblems([], { from: 1, to: 1 })).toEqual(['1장이 없습니다'])
  })

  it('받은 장이 범위를 벗어나도 범위 안만 본다', () => {
    expect(findSourceProblems([chapter(1, [1]), chapter(5, [2])], { from: 1, to: 1 })).toEqual([])
  })

  it('절이 없는 장을 알려준다', () => {
    expect(findSourceProblems([chapter(1, [1]), chapter(2, [])], { from: 1, to: 2 })).toEqual(['2장에 절이 없습니다'])
  })

  it('절 번호가 1부터 이어지지 않으면 처음 끊긴 곳만 알려준다', () => {
    expect(findSourceProblems([chapter(1, [2, 3])], { from: 1, to: 1 })).toEqual(['1장: 1절이 없습니다'])
    expect(findSourceProblems([chapter(1, [1, 3, 4, 6])], { from: 1, to: 1 })).toEqual(['1장: 2절이 없습니다'])
    expect(findSourceProblems([chapter(1, [1, 1, 2])], { from: 1, to: 1 })).toEqual(['1장: 2절이 없습니다'])
    expect(findSourceProblems([chapter(1, [1, 3]), chapter(2, [1, 2, 4])], { from: 1, to: 2 })).toEqual([
      '1장: 2절이 없습니다',
      '2장: 3절이 없습니다',
    ])
  })

  it('비어 있는 절을 알려준다', () => {
    const blank = { chapter: 1, verses: [{ verse: 1, text: '본문' }, { verse: 2, text: ' \n ' }, { verse: 3, text: '' }] }
    expect(findSourceProblems([blank], { from: 1, to: 1 })).toEqual(['1장 2절이 비어 있습니다', '1장 3절이 비어 있습니다'])
  })

  it('절 번호가 끊기면 그 뒤 절은 더 보지 않는다', () => {
    const broken = { chapter: 1, verses: [{ verse: 1, text: '' }, { verse: 3, text: '' }, { verse: 4, text: '' }] }
    expect(findSourceProblems([broken], { from: 1, to: 1 })).toEqual(['1장 1절이 비어 있습니다', '1장: 2절이 없습니다'])
  })
})
