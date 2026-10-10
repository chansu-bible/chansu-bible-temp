import { compareRefs, getBook, parseRef, type BookId, type VerseRef } from 'reader-core'
import type { Canon, CanonKind } from '../schema.ts'
import type { UnreadableSource } from '../source/files.ts'
import { itemCitations } from './citations.ts'

// 책마다 장별 절 수. 장 n의 절 수는 counts[n - 1]이고, 본문에 없는 장은 0이다(source/files.ts의 readVerseCounts).
// 본문 파일을 읽지 못한 책은 절 수 대신 { unreadable: 까닭 }이다. 본문 파일이 없는 책은 맵에 없다.
export type VerseCounts = ReadonlyMap<BookId, readonly number[] | UnreadableSource>

function inRange(ref: VerseRef, counts: readonly number[]): boolean {
  const count = counts[ref.chapter - 1] ?? 0
  return count >= 1 && ref.verse >= 1 && ref.verse <= ref.verseEnd && ref.verseEnd <= count
}

// 설정집 전체를 교차 검증해 문제를 사람이 읽을 문장 목록으로 돌려준다. 문제가 없으면 [].
// 스키마 검증은 따로 한다. 여기서는 스키마만으로 알 수 없는 것을 본다.
// 절 인용은 "책 장:절"이어야 하고, verseCounts에 본문이 있는 책의 절이어야 한다.
// 본문을 읽지 못한 책을 가리키는 인용만 확인할 수 없다고 알리고, 다른 책의 인용은 그대로 본다.
export function validateCanon(canon: Canon, verseCounts: VerseCounts): string[] {
  const problems: string[] = []

  const checkIds = (kind: CanonKind, items: { id: string }[]) => {
    const seen = new Set<string>()
    const reported = new Set<string>()
    for (const { id } of items) {
      if (seen.has(id) && !reported.has(id)) {
        problems.push(`${kind}/${id}: id가 겹칩니다`)
        reported.add(id)
      }
      seen.add(id)
    }
  }
  const checkCitations = (label: string, citations: string[]) => {
    for (const citation of citations) {
      const ref = parseRef(citation)
      if (!ref || ref.book === null) {
        problems.push(`${label}: 절 인용의 모양이 틀렸습니다(${citation})`)
        continue
      }
      const counts = verseCounts.get(ref.book)
      if (!counts) {
        problems.push(`${label}: ${getBook(ref.book).name} 본문이 없어 절 인용을 확인할 수 없습니다(${citation})`)
        continue
      }
      // 읽지 못한 까닭은 관리 도구의 책 목록에 보이므로 적지 않는다. readonly 배열은 Array.isArray로 잘 좁혀지지 않아 in으로 가른다.
      if ('unreadable' in counts) {
        problems.push(`${label}: ${getBook(ref.book).name} 본문을 읽지 못해 절 인용을 확인할 수 없습니다(${citation})`)
        continue
      }
      if (!inRange(ref, counts)) problems.push(`${label}: 절 인용 ${citation}이 범위를 벗어납니다`)
    }
  }

  checkIds('characters', canon.characters)
  checkIds('places', canon.places)
  checkIds('eras', canon.eras)
  checkIds('things', canon.things)

  const characterIds = new Set(canon.characters.map((character) => character.id))
  for (const character of canon.characters) {
    const label = `characters/${character.id}`
    for (const relation of character.facts.relations) {
      if (!characterIds.has(relation.to)) problems.push(`${label}: 관계가 가리키는 인물 ${relation.to}가 없습니다`)
    }
    checkCitations(label, itemCitations('characters', character))
  }

  for (const place of canon.places) checkCitations(`places/${place.id}`, itemCitations('places', place))

  for (const era of canon.eras) {
    const label = `eras/${era.id}`
    checkCitations(label, itemCitations('eras', era))
    // 책이 없는 인용은 위에서 모양이 틀렸다고 적었으므로 둘 다 책이 있을 때만 앞뒤를 본다.
    const from = parseRef(era.range.from)
    const to = parseRef(era.range.to)
    if (from?.book && to?.book && compareRefs(from, to) > 0) {
      problems.push(`${label}: 시작(${era.range.from})이 끝(${era.range.to})보다 뒤입니다`)
    }
  }

  for (const thing of canon.things) checkCitations(`things/${thing.id}`, itemCitations('things', thing))
  for (const proposal of canon.proposals) checkCitations(`proposals/${proposal.id}`, proposal.sources)

  return problems
}
