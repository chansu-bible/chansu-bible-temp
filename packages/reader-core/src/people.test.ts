import { describe, expect, it } from 'vitest'
import { metCharacters, readUpToChapter } from './people.ts'
import type { Chapter, Character } from './types.ts'

const character = (id: string, firstAppearance: string) => ({ id, name: id, firstAppearance }) as Character
const chapter = (number: number, sceneIds: string[]) =>
  ({ chapter: number, verses: [], scenes: sceneIds.map((id) => ({ id })) }) as unknown as Chapter

describe('만난 인물', () => {
  it('읽은 장면이 있는 가장 뒤 장과 지금 장 가운데 큰 쪽까지 읽은 것으로 본다', () => {
    const chapters = [chapter(1, ['a']), chapter(2, ['b']), chapter(3, ['c'])]
    expect(readUpToChapter(chapters, new Set(['b']), 1)).toBe(2)
    expect(readUpToChapter(chapters, new Set(), 3)).toBe(3)
  })

  it('그 장까지 처음 나온 인물을 나온 순서로 준다', () => {
    const people = [character('noah', '5:29'), character('cain', '4:1'), character('adam', '2:7'), character('abel', '4:2')]
    expect(metCharacters(people, 4).map((item) => item.id)).toEqual(['adam', 'cain', 'abel'])
  })

  it('앞 책에서 나온 인물(0장으로 읽힘)은 1장부터 이미 만난 인물이고, 받은 순서대로 맨 앞에 둔다', () => {
    // 출애굽기 묶음: 아담과 하와는 창세기에서 나왔다(책 이름이 붙은 인용). 모세는 2:10, 아론은 4:14에 처음 나온다.
    const exodus = [
      character('moses', '2:10'),
      character('eve', '창세기 2:22'),
      character('aaron', '4:14'),
      character('adam', '창세기 2:7'),
    ]
    // 책 이름이 붙은 인용은 장·절을 읽지 않으므로 앞 책 인물끼리는 받은 순서(설정집 파일 순서)다.
    expect(metCharacters(exodus, 1).map((item) => item.id)).toEqual(['eve', 'adam'])
    expect(metCharacters(exodus, 4).map((item) => item.id)).toEqual(['eve', 'adam', 'moses', 'aaron'])
  })
})
