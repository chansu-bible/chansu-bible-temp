import type { Canon, CanonKind } from '../schema.ts'

// 창세기 1~10장의 절 수. 설정집의 절 인용은 이 범위 안이어야 한다.
export const GENESIS_VERSE_COUNTS: readonly number[] = [31, 25, 24, 26, 32, 22, 24, 22, 29, 32]

type Ref = { chapter: number; verse: number; end: number }

function parseCitation(citation: string): Ref | null {
  const match = citation.match(/^(\d+):(\d+)(?:-(\d+))?$/)
  if (!match) return null
  const verse = Number(match[2])
  return { chapter: Number(match[1]), verse, end: match[3] ? Number(match[3]) : verse }
}

function inRange(ref: Ref | null, verseCounts: readonly number[]): boolean {
  if (!ref) return false
  const count = verseCounts[ref.chapter - 1]
  return count !== undefined && ref.verse >= 1 && ref.verse <= ref.end && ref.end <= count
}

// 두 인용의 시작 위치를 비교한다. a가 앞이면 음수다.
function compareStart(a: Ref, b: Ref): number {
  return a.chapter - b.chapter || a.verse - b.verse
}

// 설정집 전체를 교차 검증해 문제를 사람이 읽을 문장 목록으로 돌려준다. 문제가 없으면 [].
// 스키마 검증은 따로 한다. 여기서는 스키마만으로 알 수 없는 것을 본다.
export function validateCanon(canon: Canon, verseCounts: readonly number[] = GENESIS_VERSE_COUNTS): string[] {
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
      if (!inRange(parseCitation(citation), verseCounts)) problems.push(`${label}: 절 인용 ${citation}이 범위를 벗어납니다`)
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
    checkCitations(label, [
      character.facts.firstAppearance,
      ...character.facts.attire.map((attire) => attire.from),
      ...character.facts.sources,
    ])
  }

  for (const place of canon.places) {
    checkCitations(`places/${place.id}`, [place.facts.firstAppearance, ...place.facts.sources])
  }

  for (const era of canon.eras) {
    const label = `eras/${era.id}`
    checkCitations(label, [era.range.from, era.range.to, ...era.facts.sources])
    const from = parseCitation(era.range.from)
    const to = parseCitation(era.range.to)
    if (from && to && compareStart(from, to) > 0) {
      problems.push(`${label}: 시작(${era.range.from})이 끝(${era.range.to})보다 뒤입니다`)
    }
  }

  for (const thing of canon.things) checkCitations(`things/${thing.id}`, thing.facts.sources)
  for (const proposal of canon.proposals) checkCitations(`proposals/${proposal.id}`, proposal.sources)

  return problems
}
