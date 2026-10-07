import type { Character, Gloss, Place } from '../content/types.ts'
import { splitByGlosses } from './glossary.ts'

export type Entity = { kind: 'character' | 'place'; id: string }

export type VersePart = { text: string; gloss?: Gloss; entity?: Entity }

// 이름 바로 뒤에 와도 되는 조사. 긴 것부터 본다.
// "께"는 넣지 않는다. 넣으면 "함께"가 함(노아의 아들)으로 이어진다.
const particles = ['에게', '에서', '으로', '이', '가', '은', '는', '을', '를', '의', '과', '와', '도', '만', '아', '야', '라', '들', '에', '로']

function isHangulSyllable(char: string | undefined): boolean {
  if (!char) return false
  const code = char.charCodeAt(0)
  return code >= 0xac00 && code <= 0xd7a3
}

// 이름 앞뒤가 낱말의 경계인지 본다. 앞은 한글 음절이 아니어야 하고,
// 뒤는 끝이거나 한글이 아니거나 조사여야 한다. "째"가 오면 수(셋째)라서 잇지 않는다.
function atBoundary(text: string, start: number, end: number): boolean {
  if (isHangulSyllable(text[start - 1])) return false
  const after = text[end]
  if (!isHangulSyllable(after)) return true
  if (after === '째') return false
  return particles.some((particle) => text.startsWith(particle, end))
}

function chapterOf(reference: string): number {
  const chapter = Number.parseInt(reference.split(':')[0] ?? '', 10)
  return Number.isNaN(chapter) ? 0 : chapter
}

function verseOf(reference: string): number {
  const verse = Number.parseInt(reference.split(':')[1] ?? '', 10)
  return Number.isNaN(verse) ? 0 : verse
}

type Candidate = { name: string; entity: Entity }

// 그 장에서 찾을 이름들. 인물은 이 장까지 처음 나온 인물만 넣고, 같은 이름이면 가장 늦게 처음 나온 인물을 고른다.
// 그래서 4장의 "에녹"은 가인의 아들, 5장부터는 야렛의 아들이다. 긴 이름부터 본다(두발가인 > 가인).
function candidatesFor(chapter: number, characters: Character[], places: Place[]): Candidate[] {
  const byName = new Map<string, Character>()
  for (const character of characters) {
    if (!character.name || chapterOf(character.firstAppearance) > chapter) continue
    const chosen = byName.get(character.name)
    if (!chosen || compareAppearance(character, chosen) > 0) byName.set(character.name, character)
  }
  const people: Candidate[] = [...byName.values()].map((character) => ({
    name: character.name,
    entity: { kind: 'character', id: character.id },
  }))
  const spots: Candidate[] = places
    .filter((place) => place.name)
    .map((place) => ({ name: place.name, entity: { kind: 'place', id: place.id } }))
  return [...people, ...spots].sort((a, b) => b.name.length - a.name.length)
}

function compareAppearance(a: Character, b: Character): number {
  return (
    chapterOf(a.firstAppearance) - chapterOf(b.firstAppearance) ||
    verseOf(a.firstAppearance) - verseOf(b.firstAppearance)
  )
}

// text[start, end) 안에서 이름을 찾아 조각으로 나눈다. 경계는 text 전체에서 본다.
function linkRange(text: string, start: number, end: number, candidates: Candidate[]): VersePart[] {
  const parts: VersePart[] = []
  let plain = start
  let index = start
  while (index < end) {
    const hit = candidates.find(
      (candidate) =>
        index + candidate.name.length <= end &&
        text.startsWith(candidate.name, index) &&
        atBoundary(text, index, index + candidate.name.length),
    )
    if (!hit) {
      index++
      continue
    }
    if (index > plain) parts.push({ text: text.slice(plain, index) })
    parts.push({ text: hit.name, entity: hit.entity })
    index += hit.name.length
    plain = index
  }
  if (plain < end) parts.push({ text: text.slice(plain, end) })
  return parts
}

// 절 본문에서 인물·장소 이름을 찾아 조각으로 나눈다. 이름 조각에는 entity를 붙인다.
export function linkNames(text: string, chapter: number, characters: Character[], places: Place[]): VersePart[] {
  const parts = linkRange(text, 0, text.length, candidatesFor(chapter, characters, places))
  return parts.length > 0 ? parts : [{ text }]
}

// 낱말 풀이(splitByGlosses)가 먼저 자리를 잡고, 남은 글 조각 안에서 인물·장소 이름을 찾는다.
export function splitVerse(
  text: string,
  glosses: Gloss[],
  chapter: number,
  characters: Character[],
  places: Place[],
): VersePart[] {
  const candidates = candidatesFor(chapter, characters, places)
  const parts: VersePart[] = []
  let offset = 0
  for (const part of splitByGlosses(text, glosses)) {
    if (part.gloss) parts.push(part)
    else parts.push(...linkRange(text, offset, offset + part.text.length, candidates))
    offset += part.text.length
  }
  return parts.length > 0 ? parts : [{ text }]
}
