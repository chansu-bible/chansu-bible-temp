// 질문하기가 근거로 쓰는 대목. 책 묶음(app/public/content/<책 id>.json)에서 만든다.
// 본문 절, 검수된(reviewed·approved) 장면의 해설과 역사 배경, 설정집(묶음에는 승인된 항목만 있다)이다.
import { formatRef, parseRef, type BookId } from 'reader-core'

// 묶음에서 질문하기가 쓰는 부분만
export type AskBundle = {
  bookId: BookId
  // 책 이름(창세기)
  book: string
  chapters: {
    chapter: number
    verses: { verse: number; text: string }[]
    scenes: {
      id: string
      verseStart: number
      verseEnd: number
      title: string
      commentary: string | null
      explanation: string[]
      history: { text: string }[]
      reviewStatus: string
    }[]
  }[]
  characters: { id: string; name: string; aliases: string[]; firstAppearance: string; notes: string }[]
  places: { id: string; name: string; description: string }[]
  things: { id: string; name: string; aliases: string[]; description: string; details: string[] }[]
}

export type EntityKind = 'character' | 'place' | 'thing'

export type Passage = {
  // v:genesis:4:15, s:genesis-04-03, c:character:cain
  id: string
  kind: 'verse' | 'scene' | 'canon'
  // 그 대목의 책. 설정집은 읽어 둔 묶음 가운데 그 항목이 처음 나오는 책이고, 처음 나오는 곳을 모르면 그 항목이 든 첫 묶음의 책이다.
  book: BookId
  // 앱의 근거 표식에 보이는 이름: "본문 4:15", "해설 · 가인의 표와 떠남", "설정집 · 가인"
  // 책 묶음이 둘 이상이면 본문과 해설에 책이 붙는다: "본문 창세기 4:15", "해설 · 창세기 4장 · 가인의 표와 떠남"
  label: string
  text: string
  // 그 책 안의 장(설정집은 그 책에서 처음 나오는 장, 모르면 null)
  chapter: number | null
  verse?: number
  sceneId?: string
  entity?: { kind: EntityKind; id: string }
}

// named는 책 묶음이 둘 이상이라 이름표에 책 이름을 붙이는지
function textPassages(bundle: AskBundle, named: boolean): Passage[] {
  const book = bundle.bookId
  const passages: Passage[] = []
  for (const chapter of bundle.chapters) {
    for (const verse of chapter.verses) {
      const ref = `${chapter.chapter}:${verse.verse}`
      passages.push({
        id: `v:${book}:${ref}`,
        kind: 'verse',
        book,
        label: named ? `본문 ${bundle.book} ${ref}` : `본문 ${ref}`,
        text: verse.text,
        chapter: chapter.chapter,
        verse: verse.verse,
      })
    }
    for (const scene of chapter.scenes) {
      if (scene.reviewStatus !== 'reviewed' && scene.reviewStatus !== 'approved') continue
      const text = [scene.commentary ?? '', ...scene.explanation, ...scene.history.map((note) => note.text)].filter(Boolean).join(' ')
      if (text === '') continue
      passages.push({
        id: `s:${scene.id}`,
        kind: 'scene',
        book,
        label: named ? `해설 · ${bundle.book} ${chapter.chapter}장 · ${scene.title}` : `해설 · ${scene.title}`,
        text: `${scene.title}(${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}). ${text}`,
        chapter: chapter.chapter,
        verse: scene.verseStart,
        sceneId: scene.id,
      })
    }
  }
  return passages
}

// firstHere는 처음 나오는 곳이 이 묶음의 책 안이라고 아는지(인물만 안다)
type CanonEntry = { passage: Passage; firstHere: boolean }

function canonEntries(bundle: AskBundle, named: boolean): CanonEntry[] {
  const book = bundle.bookId
  const entries: CanonEntry[] = []
  for (const character of bundle.characters) {
    const ref = parseRef(character.firstAppearance)
    // 이 책 안의 인용("4:1")이면 그 장이다. 앞 책의 인용("창세기 2:7")은 읽지 못해 null이다.
    const chapter = ref !== null && (ref.book ?? book) === book ? ref.chapter : null
    // 책이 여럿이면 처음 나오는 곳에 책 이름을 붙인다("2:7" → "창세기 2:7"). 읽지 못하는 글은 그대로 둔다.
    const appearance = named && ref ? formatRef({ ...ref, book: ref.book ?? book }, 'name') : character.firstAppearance
    entries.push({
      firstHere: chapter !== null,
      passage: {
        id: `c:character:${character.id}`,
        kind: 'canon',
        book,
        label: `설정집 · ${character.name}`,
        text: [character.name, ...character.aliases, `처음 나오는 곳 ${appearance}`, character.notes].join(' '),
        chapter,
        entity: { kind: 'character', id: character.id },
      },
    })
  }
  for (const place of bundle.places) {
    entries.push({
      firstHere: false,
      passage: {
        id: `c:place:${place.id}`,
        kind: 'canon',
        book,
        label: `설정집 · ${place.name}`,
        text: `${place.name} ${place.description}`,
        chapter: null,
        entity: { kind: 'place', id: place.id },
      },
    })
  }
  for (const thing of bundle.things) {
    entries.push({
      firstHere: false,
      passage: {
        id: `c:thing:${thing.id}`,
        kind: 'canon',
        book,
        label: `설정집 · ${thing.name}`,
        text: [thing.name, ...thing.aliases, thing.description, ...thing.details].join(' '),
        chapter: null,
        entity: { kind: 'thing', id: thing.id },
      },
    })
  }
  return entries
}

// bundles는 성경 순서의 책 묶음들이다. 책 묶음이 하나면 이름표에 책 이름이 없다.
export function buildPassages(bundles: AskBundle[]): Passage[] {
  const named = bundles.length > 1
  const passages = bundles.flatMap((bundle) => textPassages(bundle, named))
  // 뒤 책 묶음에는 앞 책의 설정집 항목이 인용만 책 이름으로 바뀌어 다시 든다. 종류와 id가 같으면 하나만 둔다:
  // 처음 나오는 곳이 그 책 안인 묶음의 것, 그런 묶음이 없으면(장소, 물건, 읽지 못하는 인용) 먼저 나온 묶음의 것.
  const canon = new Map<string, CanonEntry>()
  for (const bundle of bundles) {
    for (const entry of canonEntries(bundle, named)) {
      const kept = canon.get(entry.passage.id)
      if (!kept || (!kept.firstHere && entry.firstHere)) canon.set(entry.passage.id, entry)
    }
  }
  return [...passages, ...[...canon.values()].map((entry) => entry.passage)]
}
