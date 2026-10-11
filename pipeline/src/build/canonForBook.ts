import { bookOrder, formatRef, getBook, localRef, parseRef, type BookId, type VerseRef } from 'reader-core'
import { firstAppearanceOf, mapItemCitations, type CitationMapper } from '../canon/citations.ts'
import type { Character, Era, Place, Thing } from '../schema.ts'

// 설정집 항목들. 종류마다 설정집 파일 순서다.
export type BookCanon = { places: Place[]; characters: Character[]; eras: Era[]; things: Thing[] }

// 책 하나의 묶음에 넣을 설정집을 만든다(순수 함수, 받은 설정집은 바꾸지 않는다).
// canon에는 사람이 승인한 항목만 넘긴다. 인용은 설정집 모양(책이 붙은 "genesis 2:7")이다.
// - 이 책을 다 읽은 독자가 아는 항목만 넣는다. 처음 나오는 곳(citations.ts의 firstAppearanceOf)이 이 책이거나 앞 책인 항목이다.
// - 넣은 항목의 인용은 bundleCitation의 규칙으로 바꾼다.
//   lastVerse는 이 책 본문의 마지막 절("50:26")이고 뒤 책에서 끝나는 시대의 끝으로 쓴다. 본문에 절이 없으면 null이다.
// - 인물의 관계는 넣은 인물만 가리키게 거른다.
export function canonForBook(canon: BookCanon, book: BookId, lastVerse: string | null): BookCanon {
  const cite = bundleCitation(book, lastVerse)
  const characters = canon.characters.filter((item) => knownBy(firstAppearanceOf('characters', item, book), book))
  const characterIds = new Set(characters.map((item) => item.id))
  return {
    places: canon.places
      .filter((item) => knownBy(firstAppearanceOf('places', item, book), book))
      .map((item) => mapItemCitations('places', item, cite)),
    characters: characters.map((item) => mapItemCitations('characters', withRelationsTo(item, characterIds), cite)),
    eras: canon.eras
      .filter((item) => knownBy(firstAppearanceOf('eras', item, book), book))
      .map((item) => mapItemCitations('eras', item, cite)),
    things: canon.things
      .filter((item) => knownBy(firstAppearanceOf('things', item, book), book))
      .map((item) => mapItemCitations('things', item, cite)),
  }
}

// 처음 나오는 곳이 이 책이거나 앞 책이면 이 책을 다 읽은 독자가 아는 항목이다. 책 없는 인용은 이 책의 절로 본다.
// 읽을 수 없는 인용(null)은 어느 책인지 몰라 넣는다. 인용의 모양은 설정집 검증이 따로 본다.
function knownBy(first: VerseRef | null, book: BookId): boolean {
  return first === null || bookOrder(first.book ?? book) <= bookOrder(book)
}

// 묶음에 넣는 항목의 인용을 쓰는 규칙. 묶음의 인용은 앱이 읽는 데이터라 화면용 모양(displayRef)이 아니다.
// - 같은 책: 책 없이("2:7")
// - 앞 책: 책 이름을 붙여("창세기 2:7"). 앱은 책 이름이 붙은 인용을 0장, 곧 이 책을 읽기 전에 이미 만난 것으로 읽는다.
// - 뒤 책: 목록(sources, attire)에서 빼고, 시대의 끝(range.to)이면 이 책 본문의 마지막 절로 둔다.
// - 읽을 수 없는 글: 그대로 둔다.
function bundleCitation(book: BookId, lastVerse: string | null): CitationMapper {
  return (citation, field) => {
    const local = localRef(citation, book)
    if (local !== null) return local
    const ref = parseRef(citation)
    if (ref?.book == null) return citation
    if (bookOrder(ref.book) < bookOrder(book)) return formatRef(ref, 'name')
    if (field !== 'range.to') return null
    if (lastVerse === null) throw new Error(`본문에 절이 없어 시대의 끝(${citation})을 ${getBook(book).name}의 마지막 절로 둘 수 없습니다`)
    return lastVerse
  }
}

function withRelationsTo(character: Character, ids: ReadonlySet<string>): Character {
  return { ...character, facts: { ...character.facts, relations: character.facts.relations.filter((relation) => ids.has(relation.to)) } }
}
