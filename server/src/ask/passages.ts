// 질문하기가 근거로 쓰는 대목. 앱 묶음(app/public/content/genesis.json)에서 만든다.
// 본문 절, 검수된(reviewed·approved) 장면의 해설과 역사 배경, 설정집(묶음에는 승인된 항목만 있다)이다.

// 묶음에서 질문하기가 쓰는 부분만
export type AskBundle = {
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
  // v:4:15, s:genesis-04-03, c:character:cain
  id: string
  kind: 'verse' | 'scene' | 'canon'
  // 앱의 근거 표식에 보이는 이름: "본문 4:15", "해설 · 가인의 표와 떠남", "설정집 · 가인"
  label: string
  text: string
  // 그 대목의 장(설정집은 처음 나오는 장, 모르면 null)
  chapter: number | null
  verse?: number
  sceneId?: string
  entity?: { kind: EntityKind; id: string }
}

const chapterOf = (reference: string): number | null => {
  const match = /^(\d+):/.exec(reference)
  return match ? Number(match[1]) : null
}

export function buildPassages(bundle: AskBundle): Passage[] {
  const passages: Passage[] = []
  for (const chapter of bundle.chapters) {
    for (const verse of chapter.verses) {
      passages.push({
        id: `v:${chapter.chapter}:${verse.verse}`,
        kind: 'verse',
        label: `본문 ${chapter.chapter}:${verse.verse}`,
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
        label: `해설 · ${scene.title}`,
        text: `${scene.title}(${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}). ${text}`,
        chapter: chapter.chapter,
        verse: scene.verseStart,
        sceneId: scene.id,
      })
    }
  }
  for (const character of bundle.characters) {
    passages.push({
      id: `c:character:${character.id}`,
      kind: 'canon',
      label: `설정집 · ${character.name}`,
      text: [character.name, ...character.aliases, `처음 나오는 곳 ${character.firstAppearance}`, character.notes].join(' '),
      chapter: chapterOf(character.firstAppearance),
      entity: { kind: 'character', id: character.id },
    })
  }
  for (const place of bundle.places) {
    passages.push({
      id: `c:place:${place.id}`,
      kind: 'canon',
      label: `설정집 · ${place.name}`,
      text: `${place.name} ${place.description}`,
      chapter: null,
      entity: { kind: 'place', id: place.id },
    })
  }
  for (const thing of bundle.things) {
    passages.push({
      id: `c:thing:${thing.id}`,
      kind: 'canon',
      label: `설정집 · ${thing.name}`,
      text: [thing.name, ...thing.aliases, thing.description, ...thing.details].join(' '),
      chapter: null,
      entity: { kind: 'thing', id: thing.id },
    })
  }
  return passages
}
