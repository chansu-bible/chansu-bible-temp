import { describe, expect, it } from 'vitest'
import { chapterOfReference, metCharacters, readUpToChapter } from './people.ts'
import type { Chapter, Character } from './types.ts'

const character = (id: string, firstAppearance: string) => ({ id, name: id, firstAppearance }) as Character
const chapter = (number: number, sceneIds: string[]) =>
  ({ chapter: number, verses: [], scenes: sceneIds.map((id) => ({ id })) }) as unknown as Chapter

describe('만난 인물', () => {
  it('장절 표기에서 장을 꺼낸다', () => {
    expect(chapterOfReference('4:17')).toBe(4)
    expect(chapterOfReference('')).toBe(0)
  })

  it('읽은 장면이 있는 가장 뒤 장과 지금 장 가운데 큰 쪽까지 읽은 것으로 본다', () => {
    const chapters = [chapter(1, ['a']), chapter(2, ['b']), chapter(3, ['c'])]
    expect(readUpToChapter(chapters, new Set(['b']), 1)).toBe(2)
    expect(readUpToChapter(chapters, new Set(), 3)).toBe(3)
  })

  it('그 장까지 처음 나온 인물을 나온 순서로 준다', () => {
    const people = [character('noah', '5:29'), character('cain', '4:1'), character('adam', '2:7'), character('abel', '4:2')]
    expect(metCharacters(people, 4).map((item) => item.id)).toEqual(['adam', 'cain', 'abel'])
  })
})
