import { z } from 'zod'
import { CanonIdSchema, CitationSchema, type Canon, type CanonKind, type Proposal } from '../schema.ts'
import { canonItemSchemas } from './files.ts'
import { validateCanon } from './validate.ts'

// canon 단계의 LLM 출력. 각 설정집 스키마에서 status와 refs를 뺀 모양이다.
// 구조화 출력 제약 때문에 모든 필드가 필수이고, 형식 제약(id, 절 인용)은 여기서 걸지 않고 합칠 때 실제 스키마로 검사한다.
const OutText = z.string()
const OutCitations = z.array(z.string())

const CharacterOutSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  facts: z.object({
    firstAppearance: z.string(),
    gender: z.enum(['남', '여', '불명']),
    years: z.object({ born: z.number().nullable(), died: z.number().nullable() }),
    relations: z.array(z.object({ type: z.string(), to: z.string() })),
    attire: z.array(z.object({ from: z.string(), description: z.string() })),
    notes: OutText,
    sources: OutCitations,
  }),
  design: z.object({ build: OutText, face: OutText, hair: OutText, skin: OutText, ageNotes: OutText, notes: OutText }),
})

const PlaceOutSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  facts: z.object({ firstAppearance: z.string(), description: OutText, sources: OutCitations }),
  location: z.object({
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    certainty: z.enum(['확실', '추정', '불명']),
  }),
  design: z.object({ landscape: OutText, notes: OutText }),
})

const EraOutSchema = z.object({
  id: z.string(),
  name: z.string(),
  range: z.object({ from: z.string(), to: z.string() }),
  years: z.object({ from: z.number().nullable(), to: z.number().nullable() }),
  facts: z.object({
    description: OutText,
    present: z.array(z.string()),
    absent: z.array(z.string()),
    sources: OutCitations,
  }),
  design: z.object({ visualNotes: OutText }),
})

const ThingOutSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  facts: z.object({ description: OutText, details: z.array(z.string()), sources: OutCitations }),
  design: z.object({ visualNotes: OutText }),
})

export const CanonOutputSchema = z.object({
  characters: z.array(CharacterOutSchema),
  places: z.array(PlaceOutSchema),
  eras: z.array(EraOutSchema),
  things: z.array(ThingOutSchema),
})

export type CanonOutput = z.infer<typeof CanonOutputSchema>
export type CanonRef = { kind: CanonKind; id: string }
export type MergeResult = {
  canon: Canon
  added: CanonRef[] // 새로 넣은 draft
  updated: CanonRef[] // 덮어쓴 기존 draft
  proposals: Proposal[] // 이번에 새로 만든 제안
  warnings: string[]
}

type Item = Record<string, unknown> & { id: string; name: string; status?: string }

const KINDS: readonly CanonKind[] = ['characters', 'places', 'eras', 'things']
// 항목 비교에서 빼는 필드
const SKIP_FIELDS = new Set(['id', 'status', 'refs'])
// 한 단계 안쪽까지 나눠서 비교하는 필드
const NESTED_FIELDS = new Set(['facts', 'design'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// LLM이 "모름"으로 낸 값. 기존 값을 지우지 않는다.
const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  value === '불명' ||
  (Array.isArray(value) && value.length === 0)

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function citationStart(citation: string): [number, number] | null {
  const match = citation.match(/^(\d+):(\d+)/)
  return match ? [Number(match[1]), Number(match[2])] : null
}

function earlierCitation(a: string, b: string): string {
  const x = citationStart(a)
  const y = citationStart(b)
  if (!x || !y) return a
  return y[0] < x[0] || (y[0] === x[0] && y[1] < x[1]) ? b : a
}

// 기존 값에 출력 값을 합친다. 배열은 합집합, 객체는 키마다, 빈 값은 기존 값 유지, 첫 등장은 앞선 절.
function combine(existing: unknown, incoming: unknown, key: string): unknown {
  if (isEmpty(incoming)) return existing
  if (existing === undefined) return incoming
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const result = [...existing]
    for (const value of incoming) if (!result.some((item) => same(item, value))) result.push(value)
    return result
  }
  if (isRecord(existing) && isRecord(incoming)) {
    const result: Record<string, unknown> = {}
    for (const field of new Set([...Object.keys(existing), ...Object.keys(incoming)])) {
      result[field] = combine(existing[field], incoming[field], field)
    }
    return result
  }
  if (key === 'firstAppearance' && typeof existing === 'string' && typeof incoming === 'string') {
    return earlierCitation(existing, incoming)
  }
  return incoming
}

function namesOf(item: Item): Set<string> {
  const aliases = Array.isArray(item.aliases) ? (item.aliases as string[]) : []
  return new Set([item.name, ...aliases].map((name) => name.trim()).filter(Boolean))
}

// id가 같거나 이름·별칭이 겹치는 기존 항목
function findMatch(list: Item[], incoming: Item): Item | undefined {
  const byId = list.find((item) => item.id === incoming.id)
  if (byId) return byId
  const names = namesOf(incoming)
  return list.find((item) => [...namesOf(item)].some((name) => names.has(name)))
}

function combineItem(existing: Item, incoming: Item): Item {
  // 기존 이름이나 별칭으로 나온 것이면 이름은 그대로 둔다
  const name = namesOf(existing).has(incoming.name.trim()) ? existing.name : incoming.name
  const combined = combine(existing, { ...incoming, id: existing.id, name }, '') as Item
  combined.status = existing.status
  return combined
}

// 비교할 필드 경로. facts와 design은 한 단계 안쪽까지 나눈다.
function fieldPaths(item: Item): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(item)) {
    if (SKIP_FIELDS.has(key)) continue
    if (NESTED_FIELDS.has(key) && isRecord(value)) for (const sub of Object.keys(value)) paths.push(`${key}.${sub}`)
    else paths.push(key)
  }
  return paths
}

function getPath(item: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), item)
}

function sourcesOf(item: Item): string[] {
  const sources = isRecord(item.facts) ? item.facts.sources : undefined
  return Array.isArray(sources) ? (sources as string[]).filter((source) => CitationSchema.safeParse(source).success) : []
}

function withoutRelations(kind: CanonKind, item: Item): Item {
  if (kind !== 'characters' || !isRecord(item.facts)) return item
  return { ...item, facts: { ...item.facts, relations: [] } }
}

// 항목 하나를 스키마와 교차 검증(절 인용 범위 등)으로 검사한다. 관계는 따로 거른다.
// 통과하면 스키마 순서로 키를 정리한 항목을 돌려준다.
function checkItem(kind: CanonKind, item: Item): { item: Item } | { problem: string } {
  const parsed = canonItemSchemas[kind].safeParse(item)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '항목'}: ${issue.message}`)
    return { problem: issues.join('; ') }
  }
  const alone: Canon = { characters: [], places: [], eras: [], things: [], proposals: [] }
  const problems = validateCanon({ ...alone, [kind]: [withoutRelations(kind, parsed.data as Item)] })
  if (problems.length > 0) return { problem: problems.join('; ') }
  return { item: parsed.data as Item }
}

// 새 항목. 출력에 status가 있어도 draft로 둔다.
function draftOf(kind: CanonKind, incoming: Item): Item {
  return { ...incoming, status: 'draft', ...(kind === 'characters' ? { refs: [] } : {}) }
}

const hasRef = (refs: CanonRef[], kind: CanonKind, id: string) => refs.some((ref) => ref.kind === kind && ref.id === id)

// canon 단계 출력을 기존 설정집에 합친다(순수 함수).
// - 새 항목은 draft로 추가한다. 출력의 status는 무시한다.
// - id나 이름·별칭이 같은 기존 항목이 있으면 추가하지 않는다. 그 항목이 draft면 덮어쓰고(배열은 합치고,
//   빈 값은 기존 값을 지우지 않는다), draft가 아니면(사람이 본 항목) 바꾸지 않고 달라진 필드마다 열린 proposal을 만든다.
// - 없는 인물을 가리키는 관계, 스키마나 절 범위를 어긴 항목은 버리고 경고에 적는다.
export function mergeCanon(existing: Canon, output: CanonOutput, now: string): MergeResult {
  const warnings: string[] = []
  const added: CanonRef[] = []
  const updated: CanonRef[] = []
  const proposals: Proposal[] = []
  const allProposals = [...existing.proposals]
  const proposalIds = new Set(allProposals.map((proposal) => proposal.id))
  const stamp = now.replace(/\D/g, '').slice(0, 14)

  const lists = {} as Record<CanonKind, Item[]>
  const outputs = {} as Record<CanonKind, Item[]>
  for (const kind of KINDS) {
    lists[kind] = [...(existing[kind] as Item[])]
    outputs[kind] = (output[kind] as Item[]).map((raw) => {
      const { status: _status, refs: _refs, ...rest } = structuredClone(raw) as Item & { refs?: unknown }
      return rest as Item
    })
  }

  // 1) 관계를 거를 인물 id 목록. 기존 인물과 같은 것으로 나온 출력 id는 기존 id로 바꿔 읽는다.
  const knownCharacters = new Set(existing.characters.map((character) => character.id))
  const remap = new Map<string, string>()
  for (const incoming of outputs.characters) {
    const match = findMatch(lists.characters, incoming)
    if (match) remap.set(incoming.id, match.id)
    else if ('item' in checkItem('characters', withoutRelations('characters', draftOf('characters', incoming)))) {
      knownCharacters.add(incoming.id)
    }
  }

  // 2) 관계 거르기
  for (const incoming of outputs.characters) {
    const facts = incoming.facts
    if (!isRecord(facts) || !Array.isArray(facts.relations)) continue
    facts.relations = (facts.relations as { type: string; to: string }[]).flatMap((relation) => {
      const to = remap.get(relation.to) ?? relation.to
      if (relation.type.trim() && CanonIdSchema.safeParse(to).success && knownCharacters.has(to)) {
        return [{ type: relation.type, to }]
      }
      warnings.push(
        `characters/${incoming.id}: 관계 "${relation.type}"가 가리키는 인물 ${relation.to}가 설정집에 없어 버렸습니다`,
      )
      return []
    })
  }

  // 사람이 본 항목은 바꾸지 않고 달라진 필드마다 제안을 남긴다
  const propose = (kind: CanonKind, before: Item, after: Item, sources: string[]) => {
    const target = `${kind}/${before.id}`
    for (const field of fieldPaths(before)) {
      const value = getPath(after, field)
      if (same(getPath(before, field), value)) continue
      const duplicate = allProposals.some(
        (proposal) =>
          proposal.status === 'open' && proposal.target === target && proposal.field === field && same(proposal.value, value),
      )
      if (duplicate) continue
      // 관리 도구 URL에 그대로 쓸 수 있게 영문, 숫자, 하이픈만 쓴다
      const base = `${kind}-${before.id}-${field.replaceAll('.', '-')}-${stamp}`
      let id = base
      for (let n = 2; proposalIds.has(id); n++) id = `${base}-${n}`
      proposalIds.add(id)
      const proposal: Proposal = {
        id,
        createdAt: now,
        target,
        field,
        value,
        reason: '본문에서 뽑은 설정이 기존 값과 다릅니다',
        sources,
        status: 'open',
      }
      proposals.push(proposal)
      allProposals.push(proposal)
    }
  }

  // 3) 합치기
  for (const kind of KINDS) {
    const list = lists[kind]
    for (const incoming of outputs[kind]) {
      const label = `${kind}/${incoming.id}`
      const match = findMatch(list, incoming)

      if (!match) {
        const checked = checkItem(kind, draftOf(kind, incoming))
        if ('problem' in checked) {
          warnings.push(`${label}: 넣지 않았습니다 (${checked.problem})`)
          continue
        }
        list.push(checked.item)
        added.push({ kind, id: checked.item.id })
        continue
      }

      const checked = checkItem(kind, combineItem(match, incoming))
      if ('problem' in checked) {
        warnings.push(`${label}: ${kind}/${match.id}에 합치지 않았습니다 (${checked.problem})`)
        continue
      }
      if (match.status !== 'draft') {
        propose(kind, match, checked.item, sourcesOf(incoming))
        continue
      }
      if (same(match, checked.item)) continue
      list[list.indexOf(match)] = checked.item
      if (!hasRef(added, kind, match.id) && !hasRef(updated, kind, match.id)) updated.push({ kind, id: match.id })
    }
  }

  return {
    canon: {
      characters: lists.characters,
      places: lists.places,
      eras: lists.eras,
      things: lists.things,
      proposals: allProposals,
    } as Canon,
    added,
    updated,
    proposals,
    warnings,
  }
}
