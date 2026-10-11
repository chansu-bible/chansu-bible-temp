import { compareRefs, parseRef, type BookId, type VerseRef } from 'reader-core'
import type { CanonKind } from '../schema.ts'

// 인용 필드 값의 모양: one은 인용 하나, list는 인용 목록, from은 from에 인용이 든 항목 목록(옷차림)이다.
type FieldShape = 'one' | 'list' | 'from'
type ShapeValue = { one: string; list: string[]; from: { from: string }[] }

// 절 인용이 든 필드(점 표기 경로)와 그 값의 모양. mapItemCitations는 이 모양을 보고 갈래를 고른다.
const FIELD_SHAPES = {
  'facts.firstAppearance': 'one',
  'facts.attire': 'from',
  'facts.sources': 'list',
  'range.from': 'one',
  'range.to': 'one',
} as const satisfies Record<string, FieldShape>

export type CitationField = keyof typeof FIELD_SHAPES

// 종류마다 절 인용이 든 필드. 인용 필드를 더하면 여기와 FIELD_SHAPES에 더한다.
// 설정집 검증(validateCanon), 모델 출력 합치기(merge의 qualifyOutput), 옛 인용 옮기기(migrateCanonRefs의 항목), 책 묶음(canonForBook)이 이 목록을 따른다.
// 따로 목록을 가진 곳도 있다. migrateCanonRefs의 제안 값(field마다 모양을 본다), 관리 도구의 admin/src/canonForm.ts(폼 필드의 citation 표시),
// 장면 프롬프트의 canonSummary(옷차림 절과 시대 범위를 글로 보인다). 필드를 더하면 이곳들도 함께 본다.
export const CITATION_FIELDS = {
  characters: ['facts.firstAppearance', 'facts.attire', 'facts.sources'],
  places: ['facts.firstAppearance', 'facts.sources'],
  eras: ['range.from', 'range.to', 'facts.sources'],
  things: ['facts.sources'],
} as const satisfies Record<CanonKind, readonly CitationField[]>

type FieldsOf<K extends CanonKind> = (typeof CITATION_FIELDS)[K][number]
// "facts.sources"와 값 V → { facts: { sources: V } }
type AtPath<P extends string, V> = P extends `${infer Head}.${infer Rest}` ? { [Key in Head]: AtPath<Rest, V> } : { [Key in P]: V }
// A | B → A & B
type Intersect<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never

// 종류마다 인용이 든 부분의 모양. CITATION_FIELDS와 FIELD_SHAPES로 만들므로, 목록 필드의 모양을 one으로 잘못 적으면
// 항목을 넘기는 곳에서 형 검사가 걸린다. 설정집 항목도 canon 단계의 모델 출력도 이 모양을 품는다.
export type CitationShape = {
  [K in CanonKind]: Intersect<{ [F in FieldsOf<K>]: AtPath<F, ShapeValue[(typeof FIELD_SHAPES)[F]]> }[FieldsOf<K>]>
}
// 오류에 어느 항목인지 적으려고 id도 받는다.
export type CitationItem<K extends CanonKind> = CitationShape[K] & { id: string }

// 인용 하나를 어떻게 할지 정한다. 돌려준 글로 바꾸고(받은 글을 그대로 돌려주면 그대로 둔다), null이면 뺀다.
export type CitationMapper = (citation: string, field: CitationField) => string | null

// 항목의 절 인용을 필드 차례(CITATION_FIELDS)대로, 목록 안에서는 앞에서부터 하나씩 fn에 넘겨 바꾼 새 항목을 돌려준다.
// 받은 항목은 바꾸지 않고, 키 차례도 그대로 둔다.
// 빼기(null)는 목록 항목(facts.sources의 글, facts.attire의 항목)에만 된다. 한 칸짜리 필드(firstAppearance, range)를 빼려 하면 오류다.
// fn이 던진 오류와 빼기 오류에는 "eras/flood range.to: …"처럼 어느 항목의 어느 필드인지 앞에 붙인다.
export function mapItemCitations<K extends CanonKind, T extends CitationItem<K>>(kind: K, item: T, fn: CitationMapper): T {
  const fields: readonly CitationField[] = CITATION_FIELDS[kind]
  let result = item as Record<string, unknown>
  for (const field of fields) {
    const fail = (message: string, cause?: unknown) => new Error(`${kind}/${item.id} ${field}: ${message}`, { cause })
    const map = (citation: string): string | null => {
      try {
        return fn(citation, field)
      } catch (error) {
        throw fail(error instanceof Error ? error.message : String(error), error)
      }
    }
    const [outer, inner] = field.split('.') as [string, string]
    const parent = result[outer] as Record<string, unknown>
    result = { ...result, [outer]: { ...parent, [inner]: mapValue(parent[inner], FIELD_SHAPES[field], map, fail) } }
  }
  return result as T
}

function mapValue(value: unknown, shape: FieldShape, map: (citation: string) => string | null, fail: (message: string) => Error): unknown {
  switch (shape) {
    case 'one': {
      const next = map(value as string)
      if (next === null) throw fail('한 칸짜리 인용이라 뺄 수 없습니다')
      return next
    }
    case 'list':
      return (value as string[]).flatMap((citation) => {
        const next = map(citation)
        return next === null ? [] : [next]
      })
    case 'from':
      return (value as { from: string }[]).flatMap((entry) => {
        const from = map(entry.from)
        return from === null ? [] : [{ ...entry, from }]
      })
    default: {
      const unknownShape: never = shape
      throw new Error(`알 수 없는 인용 필드 모양입니다: ${String(unknownShape)}`)
    }
  }
}

// 항목의 절 인용을 필드 차례대로 모은다. field를 주면 그 필드의 인용만 모은다.
export function itemCitations<K extends CanonKind>(kind: K, item: CitationItem<K>, field?: CitationField): string[] {
  const citations: string[] = []
  mapItemCitations(kind, item, (citation, at) => {
    if (field === undefined || at === field) citations.push(citation)
    return citation
  })
  return citations
}

// 종류마다 항목이 처음 나오는 곳이 든 필드. 인물·장소는 처음 나온 절, 시대는 시작 절, 물건은 근거 절(그 가운데 가장 앞선 절)이다.
export const FIRST_APPEARANCE_FIELD = {
  characters: 'facts.firstAppearance',
  places: 'facts.firstAppearance',
  eras: 'range.from',
  things: 'facts.sources',
} as const satisfies { [K in CanonKind]: FieldsOf<K> }

// 항목이 처음 나오는 곳: FIRST_APPEARANCE_FIELD의 인용 가운데 읽을 수 있는 가장 앞선 절이다(compareRefs로 견준다).
// 책 없는 인용은 book의 절로 본다. 읽을 수 있는 인용이 없으면 null이다.
export function firstAppearanceOf<K extends CanonKind>(kind: K, item: CitationItem<K>, book: BookId): VerseRef | null {
  let earliest: VerseRef | null = null
  for (const citation of itemCitations(kind, item, FIRST_APPEARANCE_FIELD[kind])) {
    const ref = parseRef(citation)
    if (ref && (earliest === null || compareRefs(ref, earliest, book) < 0)) earliest = ref
  }
  return earliest
}
