import { parseRef, qualifyRef, type BookId } from 'reader-core'
import type { Canon, Proposal } from '../schema.ts'
import { mapItemCitations } from './citations.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// 책 없는 설정집 인용("2:7")에 책을 붙인다. 이미 책이 있는 인용은 그대로 둔다. 바뀐 인용 수를 돌려준다.
// 제안(proposals)의 sources와, field에 따라 value 안의 인용(facts.firstAppearance, facts.sources, facts.attire, range)도 붙인다.
// 읽을 수 없는 인용은 어디인지 적은 오류를 낸다.
export function migrateCanonRefs(canon: Canon, book: BookId): { canon: Canon; changed: number } {
  let changed = 0

  // 책을 붙인 인용. 읽을 수 없으면 오류다.
  // 항목의 인용은 mapItemCitations가 오류 앞에 자리(예: "characters/adam facts.sources")를 붙인다.
  const qualify = (text: unknown): string => {
    if (typeof text === 'string' && parseRef(text)?.book != null) return text
    const qualified = typeof text === 'string' ? qualifyRef(text, book) : null
    if (qualified === null) {
      // 빈 글이나 문자열이 아닌 값은 보이게 JSON으로 적는다
      throw new Error(`${typeof text === 'string' && text !== '' ? text : JSON.stringify(text)}을 읽을 수 없습니다`)
    }
    if (qualified !== text) changed++
    return qualified
  }
  // 제안의 인용. where는 오류 앞에 붙일 자리다(예: "proposals/p value.to").
  const qualifyAt = (where: string, text: unknown): string => {
    try {
      return qualify(text)
    } catch (error) {
      throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }

  // 제안의 value는 형식이 정해져 있지 않아 모양부터 본다. 인용이 들어 있는 필드는 넷뿐이다.
  const proposalValue = ({ id, field, value }: Proposal): unknown => {
    const where = `proposals/${id} value`
    const list = (): unknown[] => {
      if (!Array.isArray(value)) throw new Error(`${where}: ${field} 값이 목록이 아닙니다`)
      return value
    }
    const record = (item: unknown): Record<string, unknown> => {
      if (!isRecord(item)) throw new Error(`${where}: ${field} 값의 모양이 틀렸습니다`)
      return item
    }
    switch (field) {
      case 'facts.firstAppearance':
        return qualifyAt(where, value)
      case 'facts.sources':
        return list().map((text) => qualifyAt(where, text))
      case 'facts.attire':
        return list().map((item) => {
          const attire = record(item)
          return { ...attire, from: qualifyAt(`${where}.from`, attire.from) }
        })
      case 'range': {
        const range = record(value)
        return { ...range, from: qualifyAt(`${where}.from`, range.from), to: qualifyAt(`${where}.to`, range.to) }
      }
      default:
        return value
    }
  }

  // 항목의 인용(citations.ts의 필드)마다 책을 붙인다.
  const migrated: Canon = {
    characters: canon.characters.map((item) => mapItemCitations('characters', item, qualify)),
    places: canon.places.map((item) => mapItemCitations('places', item, qualify)),
    eras: canon.eras.map((item) => mapItemCitations('eras', item, qualify)),
    things: canon.things.map((item) => mapItemCitations('things', item, qualify)),
    proposals: canon.proposals.map((proposal) => ({
      ...proposal,
      value: proposalValue(proposal),
      sources: proposal.sources.map((source) => qualifyAt(`proposals/${proposal.id} sources`, source)),
    })),
  }
  return { canon: migrated, changed }
}
