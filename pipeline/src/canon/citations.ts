import type { CanonKind } from '../schema.ts'

// 설정집 항목에서 절 인용이 든 필드(점 표기 경로). facts.attire는 옷차림 항목마다의 from, facts.sources는 목록의 글마다다.
export type CitationField = 'facts.firstAppearance' | 'facts.attire' | 'facts.sources' | 'range.from' | 'range.to'

// 종류마다 절 인용이 든 필드. 인용 필드를 더하면 여기에 더한다.
// 설정집 검증, 모델 출력 합치기, 옛 인용 옮기기, 책 묶음이 모두 이 목록을 따르므로 한 곳만 고치면 된다.
export const CITATION_FIELDS: Readonly<Record<CanonKind, readonly CitationField[]>> = {
  characters: ['facts.firstAppearance', 'facts.attire', 'facts.sources'],
  places: ['facts.firstAppearance', 'facts.sources'],
  eras: ['range.from', 'range.to', 'facts.sources'],
  things: ['facts.sources'],
}

// 종류마다 인용이 든 부분의 모양. 설정집 항목도 canon 단계의 모델 출력도 이 모양을 품는다.
export type CitationShape = {
  characters: { facts: { firstAppearance: string; attire: { from: string }[]; sources: string[] } }
  places: { facts: { firstAppearance: string; sources: string[] } }
  eras: { range: { from: string; to: string }; facts: { sources: string[] } }
  things: { facts: { sources: string[] } }
}

// 인용 하나를 어떻게 할지 정한다. 돌려준 글로 바꾸고(받은 글을 그대로 돌려주면 그대로 둔다), null이면 뺀다.
export type CitationMapper = (citation: string, field: CitationField) => string | null

// 항목의 절 인용을 필드 차례(CITATION_FIELDS)대로, 목록 안에서는 앞에서부터 하나씩 fn에 넘겨 바꾼 새 항목을 돌려준다.
// 받은 항목은 바꾸지 않고, 키 차례도 그대로 둔다.
// 빼기(null)는 목록 항목(facts.sources의 글, facts.attire의 항목)에만 된다. 한 칸짜리 필드(firstAppearance, range)를 빼려 하면 오류다.
export function mapItemCitations<K extends CanonKind, T extends CitationShape[K]>(kind: K, item: T, fn: CitationMapper): T {
  let result = item as Record<string, unknown>
  for (const field of CITATION_FIELDS[kind]) result = mapField(result, field, fn)
  return result as T
}

// 항목의 절 인용을 필드 차례대로 모은다.
export function itemCitations<K extends CanonKind>(kind: K, item: CitationShape[K]): string[] {
  const citations: string[] = []
  mapItemCitations(kind, item, (citation) => {
    citations.push(citation)
    return citation
  })
  return citations
}

function mapField(item: Record<string, unknown>, field: CitationField, fn: CitationMapper): Record<string, unknown> {
  const [outer, inner] = field.split('.') as [string, string]
  const parent = item[outer] as Record<string, unknown>
  const value = parent[inner]
  let mapped: unknown
  if (field === 'facts.attire') {
    mapped = (value as { from: string }[]).flatMap((attire) => {
      const from = fn(attire.from, field)
      return from === null ? [] : [{ ...attire, from }]
    })
  } else if (field === 'facts.sources') {
    mapped = (value as string[]).flatMap((citation) => {
      const next = fn(citation, field)
      return next === null ? [] : [next]
    })
  } else {
    mapped = fn(value as string, field)
    if (mapped === null) throw new Error(`${field}는 한 칸짜리 인용이라 뺄 수 없습니다`)
  }
  return { ...item, [outer]: { ...parent, [inner]: mapped } }
}
