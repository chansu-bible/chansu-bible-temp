import type { Character } from './types.ts'

export type FamilyNode = { id: string; spouses: string[]; children: FamilyNode[] }

const CHILD_TYPES = new Set(['아들', '딸'])
const SPOUSE_TYPES = new Set(['아내', '남편'])

function appearance(character: Character): number {
  const [chapter, verse] = character.firstAppearance.split(':').map((part) => Number.parseInt(part, 10))
  return (Number.isNaN(chapter) || chapter === undefined ? 999 : chapter) * 1000 + (Number.isNaN(verse) || verse === undefined ? 0 : verse)
}

// 부모·자식 관계로 가계 나무를 만든다. visible에 든 인물만 넣는다(아직 읽지 않은 장의 인물은 가린다).
// 아버지가 보이면 아버지 밑에, 아니면 어머니 밑에 둔다. 부모 쪽에서만 적힌 관계(아들·딸)도 잇는다.
// 부모가 보이지 않는 인물이 뿌리이고, 그 가운데 먼저 나온 인물의 아내·남편(하와)은 뿌리로 세우지 않고 짝으로 보인다.
export function buildFamilyTree(characters: Character[], visible: ReadonlySet<string>): FamilyNode[] {
  const people = characters.filter((character) => visible.has(character.id))
  const byId = new Map(people.map((character) => [character.id, character]))
  const order = (a: string, b: string) => appearance(byId.get(a)!) - appearance(byId.get(b)!)
  const father = new Map<string, string>()
  const mother = new Map<string, string>()
  const spouses = new Map<string, Set<string>>()
  const addSpouse = (a: string, b: string) => {
    if (!spouses.has(a)) spouses.set(a, new Set())
    spouses.get(a)!.add(b)
  }

  for (const person of people) {
    for (const relation of person.relations) {
      const other = byId.get(relation.to)
      if (!other || other.id === person.id) continue
      if (relation.type === '아버지') father.set(person.id, other.id)
      else if (relation.type === '어머니') mother.set(person.id, other.id)
      else if (CHILD_TYPES.has(relation.type)) {
        const parents = person.gender === '여' ? mother : father
        if (!parents.has(other.id)) parents.set(other.id, person.id)
      } else if (SPOUSE_TYPES.has(relation.type)) {
        addSpouse(person.id, other.id)
        addSpouse(other.id, person.id)
      }
    }
  }

  const parentOf = (id: string) => father.get(id) ?? mother.get(id)
  const children = new Map<string, string[]>()
  for (const person of people) {
    const parent = parentOf(person.id)
    if (!parent) continue
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(person.id)
  }

  const placed = new Set<string>()
  const build = (id: string): FamilyNode => {
    placed.add(id)
    const mates = [...(spouses.get(id) ?? [])].sort(order)
    for (const mate of mates) if (parentOf(mate) === undefined) placed.add(mate)
    const kids = (children.get(id) ?? []).filter((child) => !placed.has(child)).sort(order)
    return { id, spouses: mates, children: kids.map(build) }
  }

  const roots: FamilyNode[] = []
  for (const person of [...people].sort((a, b) => appearance(a) - appearance(b))) {
    if (placed.has(person.id) || parentOf(person.id) !== undefined) continue
    roots.push(build(person.id))
  }
  return roots
}
