import type { Character } from '../content/types.ts'

// 인물 카드의 한 줄 요약: notes의 첫 문장
export function firstSentence(notes: string): string {
  const firstParagraph = notes.split('\n').find((line) => line.trim()) ?? ''
  const match = /^.*?[.!?](?=\s|$)/.exec(firstParagraph.trim())
  return match ? match[0] : firstParagraph.trim()
}

// notes의 문단들
export function paragraphs(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

// 생몰년 칩. 둘 다 있으면 나이까지, 태어난 해만 있으면 태어난 해, 아니면 null이다.
export function yearsLabel(years: Character['years']): string | null {
  const { born, died } = years
  if (born === null) return null
  if (died === null) return `창조 원년 기준 ${born}년에 태어남`
  return `창조 원년 기준 ${born}년 ~ ${died}년, ${died - born}세`
}

export type RelationGroup = { type: string; ids: string[] }

// 관계를 종류별로 묶는다. 종류는 처음 나온 순서, 같은 인물은 한 번만 넣는다.
export function groupRelations(relations: Character['relations']): RelationGroup[] {
  const groups: RelationGroup[] = []
  for (const { type, to } of relations) {
    let group = groups.find((item) => item.type === type)
    if (!group) {
      group = { type, ids: [] }
      groups.push(group)
    }
    if (!group.ids.includes(to)) group.ids.push(to)
  }
  return groups
}
