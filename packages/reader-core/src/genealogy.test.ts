import { describe, expect, it } from 'vitest'
import { buildFamilyTree, type FamilyNode } from './genealogy.ts'
import type { Character } from './types.ts'

function person(id: string, firstAppearance: string, relations: [string, string][] = [], gender: Character['gender'] = '남'): Character {
  return {
    id,
    name: id,
    aliases: [],
    gender,
    firstAppearance,
    years: { born: null, died: null },
    relations: relations.map(([type, to]) => ({ type, to })),
    attire: [],
    notes: '',
    sources: [],
  }
}

const people = [
  person('adam', '2:7', [['아내', 'eve']]),
  person('eve', '2:22', [['남편', 'adam']], '여'),
  person('seth', '4:25', [['아버지', 'adam']]),
  person('cain', '4:1', [['아버지', 'adam'], ['어머니', 'eve']]),
  person('abel', '4:2', [['아버지', 'adam']]),
  person('enoch', '4:17', [['아버지', 'cain']]),
  person('enosh', '4:26', [['아버지', 'seth']]),
  // 부모 쪽에서만 적힌 관계
  person('noah', '5:29', [['아들', 'shem']]),
  person('shem', '5:32'),
]

const shape = (node: FamilyNode): unknown => ({ id: node.id, spouses: node.spouses, children: node.children.map(shape) })
const all = new Set(people.map((item) => item.id))

describe('buildFamilyTree', () => {
  it('부모·자식 관계로 나무를 만들고, 자식은 처음 나온 순서로 둔다', () => {
    const roots = buildFamilyTree(people, all)
    expect(roots.map(shape)[0]).toEqual({
      id: 'adam',
      spouses: ['eve'],
      children: [
        { id: 'cain', spouses: [], children: [{ id: 'enoch', spouses: [], children: [] }] },
        { id: 'abel', spouses: [], children: [] },
        { id: 'seth', spouses: [], children: [{ id: 'enosh', spouses: [], children: [] }] },
      ],
    })
  })

  it('아내는 따로 뿌리가 되지 않고, 부모 쪽에서만 적힌 관계도 잇는다', () => {
    const roots = buildFamilyTree(people, all)
    expect(roots.map((root) => root.id)).toEqual(['adam', 'noah'])
    expect(roots[1]!.children.map((child) => child.id)).toEqual(['shem'])
  })

  it('보이지 않는 인물은 빼고, 부모가 가려진 인물은 뿌리가 된다', () => {
    const visible = new Set(['adam', 'eve', 'cain', 'enosh'])
    const roots = buildFamilyTree(people, visible)
    expect(roots.map((root) => root.id)).toEqual(['adam', 'enosh'])
    expect(roots[0]!.children.map((child) => child.id)).toEqual(['cain'])
  })
})
