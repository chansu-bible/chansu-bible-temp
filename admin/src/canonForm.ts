// 설정집 항목 ↔ 편집 폼 변환. 화면은 필드 설명(SECTIONS)만 보고 폼을 그린다.
import type { CanonEntryMap, CanonKind } from './types.ts'

export type Row = Record<string, string>
export type FormValue = string | Row[]
export type FormState = Record<string, FormValue>

export type TableColumn = { key: string; label: string; citation?: boolean; canonId?: boolean }

export type FieldDesc =
  | {
      type: 'text' | 'textarea'
      path: string
      label: string
      required?: boolean
      citation?: boolean
      canonId?: boolean
      hint?: string
    }
  | { type: 'lines'; path: string; label: string; citation?: boolean; min?: number; hint?: string }
  | { type: 'number'; path: string; label: string; integer?: boolean; min?: number; max?: number; hint?: string }
  | { type: 'select'; path: string; label: string; options: string[] }
  | { type: 'table'; path: string; label: string; columns: TableColumn[] }

// basic: 이름과 id, facts: 본문 근거가 있는 사실, design: 본문 근거 없는 제작 결정
export type SectionTone = 'basic' | 'facts' | 'design'
export type Section = { title: string; tone: SectionTone; fields: FieldDesc[] }

const CITATION_HINT = '예: 1:26 또는 2:7-8'
const LINES_HINT = '한 줄에 하나'
const YEAR_HINT = '창조 원년 기준. 비우면 모름'

const idField: FieldDesc = {
  type: 'text',
  path: 'id',
  label: 'id',
  required: true,
  canonId: true,
  hint: '영문 소문자, 숫자, -',
}
const nameField: FieldDesc = { type: 'text', path: 'name', label: '이름', required: true }
const aliasesField: FieldDesc = { type: 'lines', path: 'aliases', label: '다른 이름', hint: LINES_HINT }
const sourcesField: FieldDesc = {
  type: 'lines',
  path: 'facts.sources',
  label: '근거 절',
  citation: true,
  min: 1,
  hint: `${LINES_HINT}. ${CITATION_HINT}`,
}
const firstAppearanceField: FieldDesc = {
  type: 'text',
  path: 'facts.firstAppearance',
  label: '첫 등장',
  required: true,
  citation: true,
  hint: CITATION_HINT,
}

export const SECTIONS: { [K in CanonKind]: Section[] } = {
  characters: [
    { title: '기본', tone: 'basic', fields: [idField, nameField, aliasesField] },
    {
      title: '사실',
      tone: 'facts',
      fields: [
        firstAppearanceField,
        { type: 'select', path: 'facts.gender', label: '성별', options: ['남', '여', '불명'] },
        { type: 'number', path: 'facts.years.born', label: '태어난 해', integer: true, hint: YEAR_HINT },
        { type: 'number', path: 'facts.years.died', label: '죽은 해', integer: true, hint: YEAR_HINT },
        {
          type: 'table',
          path: 'facts.relations',
          label: '관계',
          columns: [
            { key: 'type', label: '관계' },
            { key: 'to', label: '대상 id', canonId: true },
          ],
        },
        {
          type: 'table',
          path: 'facts.attire',
          label: '옷차림',
          columns: [
            { key: 'from', label: '절', citation: true },
            { key: 'description', label: '설명' },
          ],
        },
        { type: 'textarea', path: 'facts.notes', label: '메모' },
        sourcesField,
      ],
    },
    {
      title: '설계',
      tone: 'design',
      fields: [
        { type: 'textarea', path: 'design.build', label: '체격' },
        { type: 'textarea', path: 'design.face', label: '얼굴' },
        { type: 'textarea', path: 'design.hair', label: '머리' },
        { type: 'textarea', path: 'design.skin', label: '피부' },
        { type: 'textarea', path: 'design.ageNotes', label: '나이 표현' },
        { type: 'textarea', path: 'design.notes', label: '메모' },
      ],
    },
    {
      title: '기준 이미지',
      tone: 'basic',
      fields: [{ type: 'lines', path: 'refs', label: '파일 이름', hint: `${LINES_HINT}. story-bible/refs/characters/ 아래` }],
    },
  ],
  places: [
    { title: '기본', tone: 'basic', fields: [idField, nameField, aliasesField] },
    {
      title: '사실',
      tone: 'facts',
      fields: [firstAppearanceField, { type: 'textarea', path: 'facts.description', label: '설명' }, sourcesField],
    },
    {
      title: '위치',
      tone: 'facts',
      fields: [
        { type: 'number', path: 'location.lat', label: '위도', min: -90, max: 90, hint: '비우면 모름' },
        { type: 'number', path: 'location.lng', label: '경도', min: -180, max: 180, hint: '비우면 모름' },
        { type: 'select', path: 'location.certainty', label: '확실성', options: ['확실', '추정', '불명'] },
      ],
    },
    {
      title: '설계',
      tone: 'design',
      fields: [
        { type: 'textarea', path: 'design.landscape', label: '풍경' },
        { type: 'textarea', path: 'design.notes', label: '메모' },
      ],
    },
  ],
  eras: [
    { title: '기본', tone: 'basic', fields: [idField, nameField] },
    {
      title: '사실',
      tone: 'facts',
      fields: [
        { type: 'text', path: 'range.from', label: '시작 절', required: true, citation: true, hint: CITATION_HINT },
        { type: 'text', path: 'range.to', label: '끝 절', required: true, citation: true, hint: CITATION_HINT },
        { type: 'number', path: 'years.from', label: '시작 해', integer: true, hint: YEAR_HINT },
        { type: 'number', path: 'years.to', label: '끝 해', integer: true, hint: YEAR_HINT },
        { type: 'textarea', path: 'facts.description', label: '설명' },
        { type: 'lines', path: 'facts.present', label: '있는 것', hint: LINES_HINT },
        { type: 'lines', path: 'facts.absent', label: '없는 것', hint: LINES_HINT },
        sourcesField,
      ],
    },
    { title: '설계', tone: 'design', fields: [{ type: 'textarea', path: 'design.visualNotes', label: '시각 메모' }] },
  ],
  things: [
    { title: '기본', tone: 'basic', fields: [idField, nameField, aliasesField] },
    {
      title: '사실',
      tone: 'facts',
      fields: [
        { type: 'textarea', path: 'facts.description', label: '설명' },
        { type: 'lines', path: 'facts.details', label: '세부', hint: LINES_HINT },
        sourcesField,
      ],
    },
    { title: '설계', tone: 'design', fields: [{ type: 'textarea', path: 'design.visualNotes', label: '시각 메모' }] },
  ],
}

export function fieldsOf(kind: CanonKind): FieldDesc[] {
  return SECTIONS[kind].flatMap((s) => s.fields)
}

// 점 경로 읽기·쓰기
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur = obj
  for (const key of keys.slice(0, -1)) {
    const next = cur[key]
    if (next === null || typeof next !== 'object') cur[key] = {}
    cur = cur[key] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

// 새 항목의 초기값. 상태는 초안, 배열은 비우고 모르는 값은 null.
export function emptyEntry<K extends CanonKind>(kind: K): CanonEntryMap[K] {
  const entries: CanonEntryMap = {
    characters: {
      id: '',
      name: '',
      aliases: [],
      status: 'draft',
      facts: {
        firstAppearance: '',
        gender: '불명',
        years: { born: null, died: null },
        relations: [],
        attire: [],
        notes: '',
        sources: [],
      },
      design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
      refs: [],
    },
    places: {
      id: '',
      name: '',
      aliases: [],
      status: 'draft',
      facts: { firstAppearance: '', description: '', sources: [] },
      location: { lat: null, lng: null, certainty: '불명' },
      design: { landscape: '', notes: '' },
    },
    eras: {
      id: '',
      name: '',
      status: 'draft',
      range: { from: '', to: '' },
      years: { from: null, to: null },
      facts: { description: '', present: [], absent: [], sources: [] },
      design: { visualNotes: '' },
    },
    things: {
      id: '',
      name: '',
      aliases: [],
      status: 'draft',
      facts: { description: '', details: [], sources: [] },
      design: { visualNotes: '' },
    },
  }
  return entries[kind]
}

export function entryToForm(kind: CanonKind, entry: object): FormState {
  const form: FormState = {}
  for (const f of fieldsOf(kind)) {
    const v = getPath(entry, f.path)
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'select':
        form[f.path] = typeof v === 'string' ? v : ''
        break
      case 'number':
        form[f.path] = typeof v === 'number' ? String(v) : ''
        break
      case 'lines':
        form[f.path] = Array.isArray(v) ? v.map(String).join('\n') : ''
        break
      case 'table':
        form[f.path] = Array.isArray(v)
          ? v.map((item) => Object.fromEntries(f.columns.map((c) => [c.key, String(getPath(item, c.key) ?? '')])))
          : []
        break
    }
  }
  return form
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function str(v: FormValue | undefined): string {
  return typeof v === 'string' ? v.trim() : ''
}

function nonEmptyRows(v: FormValue | undefined): Row[] {
  return (Array.isArray(v) ? v : []).filter((r) => Object.values(r).some((s) => s.trim()))
}

// 폼에 없는 필드(status 등)는 base에서 그대로 가져온다.
export function formToEntry<K extends CanonKind>(kind: K, form: FormState, base: CanonEntryMap[K]): CanonEntryMap[K] {
  const out = structuredClone(base) as unknown as Record<string, unknown>
  for (const f of fieldsOf(kind)) {
    const v = form[f.path]
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'select':
        setPath(out, f.path, str(v))
        break
      case 'number': {
        const s = str(v)
        setPath(out, f.path, s === '' ? null : Number(s))
        break
      }
      case 'lines':
        setPath(out, f.path, typeof v === 'string' ? splitLines(v) : [])
        break
      case 'table':
        setPath(
          out,
          f.path,
          nonEmptyRows(v).map((r) => Object.fromEntries(f.columns.map((c) => [c.key, (r[c.key] ?? '').trim()]))),
        )
        break
    }
  }
  return out as unknown as CanonEntryMap[K]
}

const CITATION = /^\d{1,2}:\d{1,3}(-\d{1,3})?$/
const CANON_ID = /^[a-z][a-z0-9-]*$/

// 저장 전에 화면에서 먼저 잡는 문제. 최종 검증은 서버가 한다.
export function checkForm(kind: CanonKind, form: FormState): string[] {
  const problems: string[] = []
  for (const f of fieldsOf(kind)) {
    const v = form[f.path]
    switch (f.type) {
      case 'text':
      case 'textarea': {
        const s = str(v)
        if (f.required && !s) problems.push(`${f.label}: 비어 있어요`)
        else if (s && f.citation && !CITATION.test(s)) problems.push(`${f.label}: 절 인용 형식이 아니에요 (${s})`)
        else if (s && f.canonId && !CANON_ID.test(s))
          problems.push(`${f.label}: 영문 소문자로 시작하고 소문자·숫자·-만 써요`)
        break
      }
      case 'number': {
        const s = str(v)
        if (!s) break
        const n = Number(s)
        if (!Number.isFinite(n)) problems.push(`${f.label}: 숫자가 아니에요`)
        else if (f.integer && !Number.isInteger(n)) problems.push(`${f.label}: 정수여야 해요`)
        else if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
          problems.push(`${f.label}: ${f.min}~${f.max} 사이여야 해요`)
        break
      }
      case 'lines': {
        const items = typeof v === 'string' ? splitLines(v) : []
        if (f.min && items.length < f.min) problems.push(`${f.label}: ${f.min}개 이상 있어야 해요`)
        if (f.citation) {
          const bad = items.filter((s) => !CITATION.test(s))
          if (bad.length) problems.push(`${f.label}: 절 인용 형식이 아니에요 (${bad.join(', ')})`)
        }
        break
      }
      case 'table':
        nonEmptyRows(v).forEach((r, i) => {
          for (const c of f.columns) {
            const s = (r[c.key] ?? '').trim()
            if (!s) problems.push(`${f.label} ${i + 1}행: ${c.label} 칸이 비어 있어요`)
            else if (c.citation && !CITATION.test(s)) problems.push(`${f.label} ${i + 1}행: 절 인용 형식이 아니에요 (${s})`)
            else if (c.canonId && !CANON_ID.test(s)) problems.push(`${f.label} ${i + 1}행: id 형식이 아니에요 (${s})`)
          }
        })
        break
      case 'select':
        if (typeof v !== 'string' || !f.options.includes(v)) problems.push(`${f.label}: 하나를 고르세요`)
        break
    }
  }
  return problems
}

// 목록의 "첫 등장" 칸
export function firstCitation(kind: CanonKind, entry: object): string {
  switch (kind) {
    case 'characters':
    case 'places':
      return String(getPath(entry, 'facts.firstAppearance') ?? '')
    case 'eras':
      return String(getPath(entry, 'range.from') ?? '')
    case 'things': {
      const s = getPath(entry, 'facts.sources')
      return Array.isArray(s) && s.length ? String(s[0]) : ''
    }
  }
}
