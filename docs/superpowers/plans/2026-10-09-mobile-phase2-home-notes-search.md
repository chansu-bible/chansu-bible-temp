# 네이티브 앱 2단계: 기기 기록, 홈(읽기 계획), 밑줄·메모, 검색, 가계도, 공유 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목업 5~9번(읽기 계획과 진도, 가계도, 장면 카드 공유, 검색, 밑줄과 메모)과 인물 사전을 앱에 넣고, 읽기 기록을 동기화할 수 있는 형태로 기기에 저장한다.

**Architecture:** 계산은 모두 `reader-core`의 순수 함수(날짜, 연속 읽기, 계획, 밑줄, 검색, 가계 나무, 만난 인물, 기록 저장소)로 두고 vitest로 시험한다. 앱은 `RecordStore`(줄마다 수정 시각·지움 표시·미동기화 표시)를 expo-sqlite(웹은 localStorage)에 저장하고, 화면은 이 저장소를 구독한다. 파이프라인은 묶음에 승인된 물건(`things`)과 절 낭독 길이(`audioMs`)를 더한다.

**Tech Stack:** TypeScript 6, vitest 5, zod 4(파이프라인), Expo SDK 57, expo-router, expo-sqlite, react-native-view-shot, expo-sharing.

**설계:** `docs/superpowers/specs/2026-10-09-native-app-design.md` 6·7·10절

**코드 블록 표기:** 정보 문자열에 `path=`가 붙은 코드 블록은 그 파일의 전체 내용이다.

**설계에서 바꾼 것(이 계획에서 정함):**
- 검색 색인은 묶음에 넣지 않고 앱이 묶음을 그대로 훑는다. 창세기 1~10장은 절 267개, 낱말 풀이 백여 개라 기기에서 바로 찾아도 충분히 빠르고, 묶음 형식을 늘리지 않아도 된다.
- 밑줄 색은 목업대로 노랑·초록·파랑 셋과 지우기다.
- 읽기 설정(글자 크기, 화면 밝기)은 기기마다 다를 수 있어 동기화하지 않고 기기에만 둔다.
- "N일째"는 목업의 불꽃 표시대로 연속으로 읽은 날 수다. 읽은 장면의 날짜로 센다.
- 밑줄·메모는 본문의 절을 길게 눌러 연다. 장면 카드 공유는 그 시트에서 연다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `pipeline/src/tts/mp3.ts` | MP3 재생 길이 |
| `pipeline/src/build/{buildBundle,writeBundle}.ts`, `pipeline/src/schema.ts` | 묶음에 `things`, `audioMs` |
| `packages/reader-core/src/dates.ts` | 날짜 문자열 계산과 한국어 날짜 |
| `packages/reader-core/src/streak.ts` | 연속으로 읽은 날 |
| `packages/reader-core/src/plan.ts` | 읽기 계획과 오늘 읽을 곳 |
| `packages/reader-core/src/marks.ts` | 밑줄·메모·즐겨찾기 |
| `packages/reader-core/src/search.ts` | 띄어쓰기 무시·초성 검색 |
| `packages/reader-core/src/genealogy.ts` | 가계 나무 |
| `packages/reader-core/src/people.ts` | 읽은 장까지 만난 인물 |
| `packages/reader-core/src/records.ts` | 기록 저장소(동기화용 메타데이터) |
| `mobile/src/data/*` | 저장소 인스턴스, 영속화(SQLite·localStorage), 1단계 기록 옮기기, 읽기 기록 훅 |
| `mobile/src/navigation.ts` | 다른 화면에서 읽기 화면으로 위치·덮개 요청 |
| `mobile/src/content/BundleGate.tsx` | 묶음을 읽지 못했을 때의 화면 |
| `mobile/src/home/{HomeScreen,PlanSheet}.tsx` | 홈 |
| `mobile/src/reader/{MarkSheet}.tsx`, 고친 `ReaderScreen`·`VersePane` | 밑줄·메모 |
| `mobile/src/share/*` | 장면 카드 공유 |
| `mobile/src/notes/NotesScreen.tsx` | 내 밑줄·메모 |
| `mobile/src/search/{SearchScreen,CanonCard,Highlighted}.tsx` | 검색 |
| `mobile/src/people/{PeopleScreen,GenealogyScreen}.tsx` | 인물 사전, 가계도 |
| `mobile/src/app/{index,read,notes,search,people,genealogy}.tsx` | 경로 |

---

### Task 1: 묶음에 물건과 낭독 길이를 더한다

**Files:**
- Create: `pipeline/src/tts/mp3.ts`, `pipeline/test/mp3.test.ts`
- Modify: `pipeline/src/schema.ts`, `pipeline/src/build/buildBundle.ts`, `pipeline/src/build/writeBundle.ts`, `pipeline/test/buildBundle.test.ts`, `packages/reader-core/src/types.ts`, `packages/reader-core/src/bundle.ts`, `packages/reader-core/src/bundle.test.ts`, `docs/content-bundle.md`

- [ ] **Step 1: MP3 길이 시험**

```ts path=pipeline/test/mp3.test.ts
import { describe, expect, it } from 'vitest'
import { mp3DurationMs } from '../src/tts/mp3.ts'

// MPEG-1 Layer III, 128kbps, 44.1kHz 프레임 하나: 머리 4바이트 + 나머지 0. 길이 417바이트, 1152샘플(약 26.1ms)
function frame(): number[] {
  const bytes = new Array<number>(417).fill(0)
  bytes[0] = 0xff
  bytes[1] = 0xfb
  bytes[2] = 0x90
  bytes[3] = 0x00
  return bytes
}

function frames(count: number): number[] {
  return Array.from({ length: count }, frame).flat()
}

describe('mp3DurationMs', () => {
  it('프레임마다 샘플 수를 더해 길이를 잰다', () => {
    expect(mp3DurationMs(Uint8Array.from(frames(10)))).toBe(261)
  })

  it('앞의 ID3v2 태그를 건너뛴다', () => {
    const tag = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array<number>(20).fill(0x55)]
    expect(mp3DurationMs(Uint8Array.from([...tag, ...frames(10)]))).toBe(261)
  })

  it('MP3가 아니면 null이다', () => {
    expect(mp3DurationMs(Uint8Array.from([1, 2, 3, 4, 5, 6]))).toBeNull()
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `npx vitest run --root pipeline test/mp3.test.ts`
Expected: FAIL — `../src/tts/mp3.ts`가 없다.

- [ ] **Step 3: 구현한다**

```ts path=pipeline/src/tts/mp3.ts
// MP3 파일의 재생 길이(ms). 프레임 머리를 하나씩 읽어 샘플 수를 더하므로 고정·가변 비트레이트 모두 맞다.
// MPEG 1·2·2.5 Layer III만 다룬다(OpenAI 음성은 MPEG-1 Layer III). 프레임을 하나도 못 찾으면 null이다.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
// 머리의 버전 비트(3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5) → 표본률 표
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

function skipId3(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f)
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

export function mp3DurationMs(bytes: Uint8Array): number | null {
  let offset = skipId3(bytes)
  let seconds = 0
  let frames = 0
  while (offset + 4 <= bytes.length) {
    const b1 = bytes[offset]!
    const b2 = bytes[offset + 1]!
    const b3 = bytes[offset + 2]!
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) {
      offset++
      continue
    }
    const version = (b2 >> 3) & 0x03
    const layer = (b2 >> 1) & 0x03
    const bitrateIndex = (b3 >> 4) & 0x0f
    const rateIndex = (b3 >> 2) & 0x03
    const padding = (b3 >> 1) & 0x01
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset++
      continue
    }
    const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]!
    const sampleRate = SAMPLE_RATES[version]![rateIndex]!
    const samples = version === 3 ? 1152 : 576
    const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding
    seconds += samples / sampleRate
    frames++
    offset += length
  }
  return frames > 0 ? Math.round(seconds * 1000) : null
}
```

Run: `npx vitest run --root pipeline test/mp3.test.ts` → PASS

- [ ] **Step 4: 묶음 시험을 더한다**

`pipeline/test/buildBundle.test.ts`의 `canonOf`를 물건도 받게 바꾸고(`function canonOf(placeList: Place[], characters: Character[] = [], eras: Era[] = [], things: Thing[] = []) { return { characters, places: placeList, eras, things } }`, import에 `Thing` 추가), `describe('buildBundle')` 안에 다음을 더한다.

```ts
  it('음성 길이를 알면 절에 audioMs를 넣고, 모르거나 음성이 없으면 null이다', () => {
    const audio = new Map<string, number | null>([
      ['genesis-01-001.mp3', 4210],
      ['genesis-01-002.mp3', null],
    ])
    const bundle = buildBundle(source, [], canonOf(places), audio)
    expect(bundle.chapters[0].verses.map((verse) => verse.audioMs)).toEqual([4210, null, null])
    expect(bundle.chapters[0].verses.map((verse) => verse.audio)).toEqual([
      'content/audio/genesis-01-001.mp3',
      'content/audio/genesis-01-002.mp3',
      null,
    ])
  })

  it('승인된 물건만 앱 형식으로 넣는다', () => {
    const thing: Thing = {
      id: 'tree-of-life',
      name: '생명나무',
      aliases: [],
      status: 'approved',
      facts: { description: '동산 가운데 있는 나무', details: ['길이 지켜졌다'], sources: ['2:9', '3:24'] },
      design: { visualNotes: '' },
    }
    const draft: Thing = { ...thing, id: 'fig-leaves', name: '무화과나무 잎', status: 'draft' }
    expect(buildBundle(source, [], canonOf(places, [], [], [thing, draft])).things).toEqual([
      { id: 'tree-of-life', name: '생명나무', aliases: [], description: '동산 가운데 있는 나무', details: ['길이 지켜졌다'], sources: ['2:9', '3:24'] },
    ])
  })
```

Run: `npx vitest run --root pipeline test/buildBundle.test.ts`
Expected: FAIL — `audioMs`, `things`가 없다.

- [ ] **Step 5: 스키마와 묶음 만들기를 고친다**

`pipeline/src/schema.ts`:

```ts
// 앱용 묶음. audioMs는 절 낭독 길이(ms)이고, 음성이 없거나 길이를 모르면 null이다.
export const BundleVerseSchema = VerseSchema.extend({
  audio: z.string().nullable(),
  audioMs: z.number().int().nonnegative().nullable(),
})
```

`BundleEraSchema` 아래에 더한다.

```ts
// 앱의 검색과 설정집 카드가 쓰는 물건. 승인된 물건의 facts만 옮긴다.
export const BundleThingSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  details: z.array(z.string()),
  sources: z.array(z.string()),
})
```

`BundleSchema`의 `eras` 다음 줄에 `things: z.array(BundleThingSchema),`를, 타입 목록에 `export type BundleThing = z.infer<typeof BundleThingSchema>`를 더한다.

`pipeline/src/build/buildBundle.ts`:
- import 목록에 `type BundleThing`, `type Thing`을 더한다.
- `export type BundleCanon = { characters: Character[]; places: Place[]; eras: Era[]; things?: Thing[] }`
- 음성 인자를 이름 → 길이 표로 받는다(예전처럼 이름 Set도 받는다).

```ts
// 음성 파일 이름 → 재생 길이(ms, 모르면 null). 이름만 아는 Set도 받는다.
export type AudioCatalog = ReadonlyMap<string, number | null> | ReadonlySet<string>

function audioDurations(audio: AudioCatalog): ReadonlyMap<string, number | null> {
  return audio instanceof Map ? audio : new Map([...(audio as ReadonlySet<string>)].map((name) => [name, null] as const))
}
```

- 시그니처의 `audioNames: ReadonlySet<string> = new Set()`를 `audio: AudioCatalog = new Map()`으로 바꾸고, 함수 첫 줄에 `const durations = audioDurations(audio)`를 둔다.
- 절을 만드는 부분을 다음으로 바꾼다.

```ts
    const verses = sourceChapter.verses.map((verse) => {
      const name = audioName(chapter, verse.verse)
      const has = durations.has(name)
      return { ...verse, audio: has ? `content/audio/${name}` : null, audioMs: has ? (durations.get(name) ?? null) : null }
    })
```

- 반환 객체의 `eras` 다음에 `things: (canon.things ?? []).filter((thing) => thing.status === 'approved').map(toBundleThing),`를 넣고, `toBundleEra` 아래에 더한다.

```ts
function toBundleThing(thing: Thing): BundleThing {
  return {
    id: thing.id,
    name: thing.name,
    aliases: thing.aliases,
    description: thing.facts.description,
    details: thing.facts.details,
    sources: thing.facts.sources,
  }
}
```

`pipeline/src/build/writeBundle.ts`:
- `import { mp3DurationMs } from '../tts/mp3.ts'`
- `readCanon()`에서 `things`도 꺼내 `buildBundle(..., { characters, places, eras, things }, audio, catalog)`로 넘긴다.
- `audioNames` 대신 다음 함수로 만든 표를 넘긴다.

```ts
// 낭독 파일마다 재생 길이를 잰다. 홈 화면의 "낭독으로 들으면 N분" 안내에 쓴다.
async function readAudioCatalog(): Promise<Map<string, number | null>> {
  if (!existsSync(audioDir)) return new Map()
  const names = (await readdir(audioDir)).filter((name) => name.endsWith('.mp3'))
  const entries = await Promise.all(
    names.map(async (name) => [name, mp3DurationMs(await readFile(path.join(audioDir, name)))] as const),
  )
  return new Map(entries)
}
```

Run: `npm test -w pipeline && npm run pipeline -- build`
Expected: 시험 PASS, `묶음 생성 완료` 출력. `node -e "const b=require('./app/public/content/genesis.json');console.log(b.things.length, b.chapters[0].verses[0].audioMs)"`가 `11 <양수>`를 보인다.

- [ ] **Step 6: reader-core 타입을 맞춘다**

`packages/reader-core/src/types.ts`:

```ts
// audio: 사이트 루트 기준 절 낭독 파일 경로(예: content/audio/genesis-01-001.mp3). 없으면 null이다.
// audioMs: 낭독 길이(ms). 옛 묶음에는 없어서 불러올 때 null로 채운다.
export type Verse = { verse: number; text: string; audio: string | null; audioMs?: number | null }
```

`Era` 타입 아래에 더한다.

```ts
// 설정집에서 검수된 물건(생명나무, 방주 등). sources는 본문 근거 절이다.
export type Thing = {
  id: string
  name: string
  aliases: string[]
  description: string
  details: string[]
  sources: string[]
}
```

`Bundle`의 `eras` 아래에 `// 옛 묶음에는 없어서 불러올 때 []로 채운다.` 주석과 `things: Thing[]`을 더한다.

`packages/reader-core/src/bundle.ts`의 `fillMissing`을 다음으로 바꾼다.

```ts
// 인물·시대·물건·낭독 길이는 나중에 더한 키라 옛 묶음에는 없다. 없으면 빈 값으로 채워 화면이 그대로 그려지게 한다.
export function fillMissing(bundle: Bundle): Bundle {
  return {
    ...bundle,
    characters: Array.isArray(bundle.characters) ? bundle.characters : [],
    eras: Array.isArray(bundle.eras) ? bundle.eras : [],
    things: Array.isArray(bundle.things) ? bundle.things : [],
    chapters: bundle.chapters.map((chapter) => ({
      ...chapter,
      verses: chapter.verses.map((verse) => ({ ...verse, audioMs: verse.audioMs ?? null })),
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        characters: Array.isArray(scene.characters) ? scene.characters : [],
      })),
    })),
  }
}
```

`packages/reader-core/src/bundle.test.ts`의 첫 시험에 `expect(filled.things).toEqual([])`를 더한다. 두 번째 시험의 묶음에 `things: [{ id: 'ark' }]`와 절 `{ verse: 1, text: '', audio: null, audioMs: 1200 }`을 넣고 `expect(filled.things).toEqual([{ id: 'ark' }])`, `expect(filled.chapters[0].verses[0].audioMs).toBe(1200)`을 더한다.

- [ ] **Step 7: 묶음 문서**

`docs/content-bundle.md`의 최상위 표 `eras` 아래에 `| \`things\` | Thing[] | 검색과 설정집 카드에 쓰는 물건. 설정집에서 승인한 물건만, 설정집 파일 순서 |`를, Verse 표에 `| \`audioMs\` | number \| null | 절 낭독 길이(ms). 음성이 없거나 길이를 모르면 null |`을, 그리고 "### Thing" 절(필드: `id`, `name`, `aliases`, `description`, `details`(본문이 말하는 세부 사실), `sources`(본문 근거 절))을 더한다. 형식 버전 문단의 "나중에 더한 키" 목록에 `things`, `audioMs`를 더한다.

- [ ] **Step 8: 시험과 커밋**

Run: `npm test`
Expected: 모든 워크스페이스 PASS

```bash
git add pipeline packages/reader-core docs/content-bundle.md
git commit -m "feat(bundle): 묶음에 승인된 물건과 절 낭독 길이(audioMs)를 넣는다"
```

---

### Task 2: reader-core — 날짜, 연속 읽기, 계획

**Files:**
- Create: `packages/reader-core/src/{dates,streak,plan}.ts`와 각 `.test.ts`
- Modify: `packages/reader-core/src/index.ts`

- [ ] **Step 1: 시험**

```ts path=packages/reader-core/src/dates.test.ts
import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isDay, koreanDateLabel, koreanDayLabel, localDay } from './dates.ts'

describe('날짜', () => {
  it('localDay는 기기 시간대의 날짜를 0을 채워 쓴다', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('addDays는 달과 해를 넘긴다', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween은 두 날 사이의 날 수다', () => {
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8)
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0)
  })

  it('isDay는 YYYY-MM-DD 문자열만 받는다', () => {
    expect(isDay('2026-10-09')).toBe(true)
    expect(isDay('2026-1-9')).toBe(false)
    expect(isDay(20261009)).toBe(false)
  })

  it('한국어 날짜', () => {
    expect(koreanDateLabel(new Date(2026, 9, 9))).toBe('10월 9일 금요일')
    expect(koreanDayLabel('2026-10-13')).toBe('10월 13일')
  })
})
```

```ts path=packages/reader-core/src/streak.test.ts
import { describe, expect, it } from 'vitest'
import { readingStreak } from './streak.ts'

describe('readingStreak', () => {
  it('읽은 날이 없으면 0이다', () => {
    expect(readingStreak(new Set(), '2026-10-09')).toBe(0)
  })

  it('오늘까지 이어진 날을 센다', () => {
    expect(readingStreak(new Set(['2026-10-07', '2026-10-08', '2026-10-09']), '2026-10-09')).toBe(3)
  })

  it('오늘 아직 안 읽었으면 어제까지 이어진 날을 센다', () => {
    expect(readingStreak(new Set(['2026-10-07', '2026-10-08']), '2026-10-09')).toBe(2)
  })

  it('하루라도 비면 거기서 끊긴다', () => {
    expect(readingStreak(new Set(['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09']), '2026-10-09')).toBe(3)
    expect(readingStreak(new Set(['2026-10-07']), '2026-10-09')).toBe(0)
  })
})
```

```ts path=packages/reader-core/src/plan.test.ts
import { describe, expect, it } from 'vitest'
import { parsePlan, planSummary, type ReadingPlan } from './plan.ts'
import type { Chapter, Scene } from './types.ts'

function scene(id: string, verseStart: number, verseEnd: number): Scene {
  return {
    id,
    verseStart,
    verseEnd,
    title: id,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    placeId: null,
    characters: [],
    images: {},
    reviewStatus: 'none',
  }
}

function chapter(number: number, scenes: Scene[], audioMs = 1000): Chapter {
  const last = scenes.at(-1)?.verseEnd ?? 0
  return {
    chapter: number,
    verses: Array.from({ length: last }, (_, index) => ({ verse: index + 1, text: '', audio: null, audioMs })),
    scenes,
  }
}

// 1장: a(1-2) b(3-4), 2장: c(1) d(2), 3장: e(1-3)
const chapters = [
  chapter(1, [scene('a', 1, 2), scene('b', 3, 4)]),
  chapter(2, [scene('c', 1, 1), scene('d', 2, 2)]),
  chapter(3, [scene('e', 1, 3)]),
]
const today = '2026-10-09'
const yesterday = '2026-10-08'
const byChapter: ReadingPlan = { kind: 'chapter', perDay: 1 }

const ids = (summary: ReturnType<typeof planSummary>) => summary.today.map((item) => item.scene.id)
const statuses = (summary: ReturnType<typeof planSummary>) => summary.chapters.map((item) => item.status)

describe('하루 한 장', () => {
  it('아무것도 안 읽었으면 오늘은 1장이고 사흘 남는다', () => {
    const summary = planSummary(byChapter, chapters, new Map(), today)
    expect(ids(summary)).toEqual(['a', 'b'])
    expect(statuses(summary)).toEqual(['today', 'todo', 'todo'])
    expect(summary.remainingDays).toBe(3)
    expect(summary.finishDay).toBe('2026-10-11')
    expect(summary.todayDone).toBe(false)
    expect(summary.todayAudioMs).toBe(4000)
  })

  it('어제 1장을 다 읽었으면 오늘은 2장이다. 오늘 일부를 읽어도 오늘 분량은 그대로다', () => {
    const read = new Map([
      ['a', yesterday],
      ['b', yesterday],
      ['c', today],
    ])
    const summary = planSummary(byChapter, chapters, read, today)
    expect(ids(summary)).toEqual(['c', 'd'])
    expect(statuses(summary)).toEqual(['done', 'today', 'todo'])
    expect(summary.remainingDays).toBe(2)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('오늘 분량을 다 읽으면 남은 장은 내일부터 센다', () => {
    const read = new Map([
      ['a', yesterday],
      ['b', null],
      ['c', today],
      ['d', today],
    ])
    const summary = planSummary(byChapter, chapters, read, today)
    expect(summary.todayDone).toBe(true)
    expect(statuses(summary)).toEqual(['done', 'done', 'todo'])
    expect(summary.remainingDays).toBe(1)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('다 읽었으면 남은 날이 0이고 끝나는 날이 없다', () => {
    const read = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, yesterday] as const))
    const summary = planSummary(byChapter, chapters, read, today)
    expect(summary.allDone).toBe(true)
    expect(summary.today).toEqual([])
    expect(summary.remainingDays).toBe(0)
    expect(summary.finishDay).toBeNull()
  })
})

describe('하루 장면 N개와 자유', () => {
  it('하루 장면 3개면 앞에서부터 셋이고, 남은 날은 남은 장면 수를 3으로 나눠 올린다', () => {
    const summary = planSummary({ kind: 'scenes', perDay: 3 }, chapters, new Map(), today)
    expect(ids(summary)).toEqual(['a', 'b', 'c'])
    expect(statuses(summary)).toEqual(['today', 'today', 'todo'])
    expect(summary.remainingDays).toBe(2)
    expect(summary.finishDay).toBe('2026-10-10')
  })

  it('자유 계획은 다음 장면 하나만 보이고 남은 날을 세지 않는다', () => {
    const summary = planSummary({ kind: 'free', perDay: 1 }, chapters, new Map([['a', yesterday]]), today)
    expect(ids(summary)).toEqual(['b'])
    expect(summary.remainingDays).toBeNull()
    expect(summary.finishDay).toBeNull()
  })
})

describe('parsePlan', () => {
  it('저장된 값이 없거나 깨졌으면 하루 한 장이다', () => {
    expect(parsePlan(null)).toEqual({ kind: 'chapter', perDay: 1 })
    expect(parsePlan({ kind: 'weekly', perDay: 9 })).toEqual({ kind: 'chapter', perDay: 1 })
  })

  it('맞는 값은 그대로 읽는다', () => {
    expect(parsePlan({ kind: 'scenes', perDay: 3 })).toEqual({ kind: 'scenes', perDay: 3 })
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `npx vitest run --root packages/reader-core`
Expected: FAIL — `dates.ts`, `streak.ts`, `plan.ts`가 없다.

- [ ] **Step 3: 구현**

```ts path=packages/reader-core/src/dates.ts
// 날짜는 기기 시간대의 달력 날짜('YYYY-MM-DD' 문자열)로 다룬다. 읽은 날과 연속 읽기, 계획에 쓴다.
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1)
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day)
  date.setDate(date.getDate() + days)
  return localDay(date)
}

// from에서 to까지 며칠인지(같은 날이면 0)
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

// 예: 10월 9일 금요일
export function koreanDateLabel(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`
}

// 예: 10월 13일
export function koreanDayLabel(day: string): string {
  const date = parseDay(day)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}
```

```ts path=packages/reader-core/src/streak.ts
import { addDays } from './dates.ts'

// 연속으로 읽은 날 수. 오늘 아직 안 읽었으면 어제까지 이어진 날을 센다(아침에 앱을 열어도 끊기지 않게).
export function readingStreak(days: ReadonlySet<string>, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1)
  let count = 0
  while (days.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}
```

```ts path=packages/reader-core/src/plan.ts
import { addDays } from './dates.ts'
import type { Chapter, Scene } from './types.ts'

// chapter: 하루 한 장, scenes: 하루 장면 perDay개, free: 정하지 않고 읽기
export type PlanKind = 'chapter' | 'scenes' | 'free'
export type ReadingPlan = { kind: PlanKind; perDay: number }

export const PLAN_KINDS: PlanKind[] = ['chapter', 'scenes', 'free']
export const PER_DAY_CHOICES = [1, 2, 3, 4, 5]
export const DEFAULT_PLAN: ReadingPlan = { kind: 'chapter', perDay: 1 }

// 저장된 계획을 읽는다. 깨졌거나 모르는 값이면 하루 한 장이다.
export function parsePlan(value: unknown): ReadingPlan {
  if (typeof value !== 'object' || value === null) return DEFAULT_PLAN
  const saved = value as Record<string, unknown>
  if (!PLAN_KINDS.includes(saved.kind as PlanKind)) return DEFAULT_PLAN
  const perDay = PER_DAY_CHOICES.includes(saved.perDay as number) ? (saved.perDay as number) : 1
  return { kind: saved.kind as PlanKind, perDay }
}

export type PlanChapterStatus = 'done' | 'today' | 'todo'
export type PlanScene = { chapter: number; scene: Scene }

export type PlanSummary = {
  // 장마다 다 읽음 / 오늘 읽을 곳 / 아직
  chapters: { chapter: number; status: PlanChapterStatus }[]
  // 오늘 읽을 장면. 오늘 이미 읽은 장면도 들어 있다(오늘 분량은 하루 동안 바뀌지 않는다).
  today: PlanScene[]
  todayDone: boolean
  // 남은 날(자유 계획이면 null)과 다 읽는 날(남은 날이 없으면 null)
  remainingDays: number | null
  finishDay: string | null
  allDone: boolean
  // 오늘 읽을 장면의 낭독 길이 합(ms)
  todayAudioMs: number
}

// readDays: 읽은 장면 id → 읽은 날. 날을 모르면 null이고 오늘 이전으로 본다.
export function planSummary(
  plan: ReadingPlan,
  chapters: Chapter[],
  readDays: ReadonlyMap<string, string | null>,
  todayDay: string,
): PlanSummary {
  const all: PlanScene[] = chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ chapter: chapter.chapter, scene })))
  const read = (id: string) => readDays.has(id)
  // 오늘 이전에 읽은 장면. 오늘 분량은 이것으로 정해서 오늘 읽어도 바뀌지 않는다.
  const readBefore = (id: string) => {
    if (!readDays.has(id)) return false
    const day = readDays.get(id)
    return day === null || day === undefined || day < todayDay
  }
  const chapterRead = (chapter: Chapter, test: (id: string) => boolean) =>
    chapter.scenes.length > 0 && chapter.scenes.every((scene) => test(scene.id))

  let today: PlanScene[]
  if (plan.kind === 'chapter') {
    const target = chapters.find((chapter) => !chapterRead(chapter, readBefore))
    today = target ? target.scenes.map((scene) => ({ chapter: target.chapter, scene })) : []
  } else {
    today = all.filter((item) => !readBefore(item.scene.id)).slice(0, plan.kind === 'scenes' ? plan.perDay : 1)
  }

  const todayDone = today.length > 0 && today.every((item) => read(item.scene.id))
  const allDone = all.length > 0 && all.every((item) => read(item.scene.id))
  const todayChapters = new Set(today.map((item) => item.chapter))

  let remainingDays: number | null = null
  if (plan.kind === 'chapter') remainingDays = chapters.filter((chapter) => !chapterRead(chapter, read)).length
  else if (plan.kind === 'scenes') remainingDays = Math.ceil(all.filter((item) => !read(item.scene.id)).length / plan.perDay)
  // 오늘 분량을 다 읽었으면 남은 분량은 내일부터 읽는다.
  const finishDay =
    remainingDays === null || remainingDays === 0 ? null : addDays(todayDay, todayDone ? remainingDays : remainingDays - 1)

  const todayAudioMs = today.reduce((sum, item) => {
    const chapter = chapters.find((c) => c.chapter === item.chapter)
    const verses = chapter?.verses.filter((v) => v.verse >= item.scene.verseStart && v.verse <= item.scene.verseEnd) ?? []
    return sum + verses.reduce((total, verse) => total + (verse.audioMs ?? 0), 0)
  }, 0)

  return {
    chapters: chapters.map((chapter) => ({
      chapter: chapter.chapter,
      status: chapterRead(chapter, read) ? 'done' : todayChapters.has(chapter.chapter) && !todayDone ? 'today' : 'todo',
    })),
    today,
    todayDone,
    remainingDays,
    finishDay,
    allDone,
    todayAudioMs,
  }
}
```

`packages/reader-core/src/index.ts`에 `export * from './dates.ts'`, `export * from './plan.ts'`, `export * from './streak.ts'`를 알파벳 순서에 맞춰 더한다.

- [ ] **Step 4: 통과와 커밋**

Run: `npx vitest run --root packages/reader-core && npx tsc --noEmit -p packages/reader-core` → PASS, 형 오류 없음

```bash
git add packages/reader-core
git commit -m "feat(core): 날짜, 연속으로 읽은 날, 읽기 계획(오늘 읽을 곳·남은 날·다 읽는 날)"
```

---

### Task 3: reader-core — 밑줄, 검색, 가계 나무, 만난 인물, 기록 저장소

**Files:**
- Create: `packages/reader-core/src/{marks,search,genealogy,people,records}.ts`와 각 `.test.ts`
- Modify: `packages/reader-core/src/index.ts`

- [ ] **Step 1: 시험**

```ts path=packages/reader-core/src/marks.test.ts
import { describe, expect, it } from 'vitest'
import { countMarks, isEmptyMark, markId, parseMark, sortMarks, type Mark } from './marks.ts'

const mark = (overrides: Partial<Mark>): Mark => ({
  book: 'genesis',
  chapter: 4,
  verse: 9,
  color: null,
  note: '',
  bookmark: false,
  ...overrides,
})

describe('밑줄과 메모', () => {
  it('절마다 하나의 id를 쓴다', () => {
    expect(markId('genesis', 4, 9)).toBe('genesis:4:9')
  })

  it('색도 메모도 즐겨찾기도 없으면 빈 기록이다', () => {
    expect(isEmptyMark(mark({}))).toBe(true)
    expect(isEmptyMark(mark({ note: '   ' }))).toBe(true)
    expect(isEmptyMark(mark({ color: 'green' }))).toBe(false)
    expect(isEmptyMark(mark({ bookmark: true }))).toBe(false)
  })

  it('저장된 값을 읽고, 모르는 색은 버린다', () => {
    expect(parseMark({ book: 'genesis', chapter: 4, verse: 9, color: 'red', note: '메모', bookmark: 1 })).toEqual(
      mark({ note: '메모' }),
    )
    expect(parseMark({ chapter: 'x' })).toBeNull()
  })

  it('밑줄·메모·즐겨찾기를 센다', () => {
    const marks = [mark({ color: 'yellow', note: '가' }), mark({ verse: 10, bookmark: true }), mark({ verse: 11, color: 'blue' })]
    expect(countMarks(marks)).toEqual({ highlights: 2, notes: 1, bookmarks: 1 })
  })

  it('장과 절 순서로 늘어놓는다', () => {
    const sorted = sortMarks([mark({ chapter: 5, verse: 1 }), mark({ chapter: 4, verse: 10 }), mark({ chapter: 4, verse: 2 })])
    expect(sorted.map((item) => `${item.chapter}:${item.verse}`)).toEqual(['4:2', '4:10', '5:1'])
  })
})
```

```ts path=packages/reader-core/src/search.test.ts
import { describe, expect, it } from 'vitest'
import { choseongOf, findMatch, isChoseongQuery, searchBundle } from './search.ts'
import type { Bundle } from './types.ts'

const bundle = {
  schemaVersion: 1,
  book: '창세기',
  translation: '개역한글',
  places: [{ id: 'eden', name: '에덴', description: '동방의 동산', estimated: true, lat: 31, lng: 47 }],
  characters: [
    {
      id: 'cain',
      name: '가인',
      aliases: [],
      gender: '남',
      firstAppearance: '4:1',
      years: { born: null, died: null },
      relations: [],
      attire: [],
      notes: '농사하는 자다. 아벨을 죽였다.',
      sources: ['4:1'],
    },
  ],
  eras: [],
  things: [{ id: 'skin-garments', name: '가죽옷', aliases: [], description: '여호와 하나님이 지어 입히신 옷', details: [], sources: ['3:21'] }],
  imageVersions: [],
  defaultImageVersion: null,
  chapters: [
    {
      chapter: 3,
      verses: [
        { verse: 20, text: '아담이 그 아내를 하와라 이름하였으니', audio: null },
        { verse: 21, text: '여호와 하나님이 아담과 그 아내를 위하여 가죽옷을 지어 입히시니라', audio: null },
      ],
      scenes: [
        {
          id: 'genesis-03-06',
          verseStart: 20,
          verseEnd: 21,
          title: '하와의 이름과 옷',
          commentary: null,
          explanation: ['하나님이 두 사람에게 가죽옷을 입히셨다. 동산을 떠나기 전이다.'],
          history: [],
          glossary: [{ verse: 21, word: '가죽옷을', meaning: '동물의 가죽으로 만든 옷을.' }],
          placeId: 'eden',
          characters: [],
          images: {},
          reviewStatus: 'reviewed',
        },
      ],
    },
  ],
} as unknown as Bundle

describe('초성과 찾기', () => {
  it('한글 음절의 초성을 꺼낸다', () => {
    expect(choseongOf('가')).toBe('ㄱ')
    expect(choseongOf('힣')).toBe('ㅎ')
    expect(choseongOf('A')).toBe('A')
  })

  it('초성만으로 된 검색어를 알아본다', () => {
    expect(isChoseongQuery('ㄱㅈㅇ')).toBe(true)
    expect(isChoseongQuery('가죽')).toBe(false)
    expect(isChoseongQuery('  ')).toBe(false)
  })

  it('띄어쓰기를 무시하고 원문 자리를 돌려준다', () => {
    expect(findMatch('가죽 옷을 지어', '가죽옷')).toEqual({ start: 0, end: 4 })
    expect(findMatch('가죽옷을 지어', '가 죽 옷')).toEqual({ start: 0, end: 3 })
    expect(findMatch('가죽옷', '방주')).toBeNull()
  })

  it('초성으로도 찾는다', () => {
    expect(findMatch('아담과 가죽옷을', 'ㄱㅈㅇ')).toEqual({ start: 4, end: 7 })
  })
})

describe('searchBundle', () => {
  it('본문, 낱말 풀이, 설정집, 장면에서 찾는다', () => {
    const results = searchBundle(bundle, '가죽옷')
    expect(results.verses.map((hit) => `${hit.chapter}:${hit.verse}`)).toEqual(['3:21'])
    expect(results.verses[0]!.sceneTitle).toBe('하와의 이름과 옷')
    expect(results.glosses.map((hit) => hit.word)).toEqual(['가죽옷을'])
    expect(results.canon.map((hit) => hit.id)).toEqual(['skin-garments'])
    expect(results.scenes.map((hit) => hit.sceneId)).toEqual(['genesis-03-06'])
    expect(results.total).toBe(4)
  })

  it('이름이 맞은 설정집 항목을 설명만 맞은 항목보다 앞에 둔다', () => {
    const results = searchBundle(bundle, '동산')
    expect(results.canon.map((hit) => hit.id)).toEqual(['eden'])
    expect(results.canon[0]!.nameMatch).toBeNull()
    expect(searchBundle(bundle, '가인').canon[0]).toMatchObject({ id: 'cain', kind: 'character', nameMatch: { start: 0, end: 2 } })
  })

  it('빈 검색어는 아무것도 찾지 않는다', () => {
    expect(searchBundle(bundle, '  ').total).toBe(0)
  })
})
```

```ts path=packages/reader-core/src/genealogy.test.ts
import { describe, expect, it } from 'vitest'
import { buildFamilyTree, type FamilyNode } from './genealogy.ts'
import type { Character } from './types.ts'

function person(id: string, firstAppearance: string, relations: [string, string][] = [], gender: Character['gender'] = '남'): Character {
  return {
    id,
    name: id,
    aliases: [],
    gender,
    firstAppearance,
    years: { born: null, died: null },
    relations: relations.map(([type, to]) => ({ type, to })),
    attire: [],
    notes: '',
    sources: [],
  }
}

const people = [
  person('adam', '2:7', [['아내', 'eve']]),
  person('eve', '2:22', [['남편', 'adam']], '여'),
  person('seth', '4:25', [['아버지', 'adam']]),
  person('cain', '4:1', [['아버지', 'adam'], ['어머니', 'eve']]),
  person('abel', '4:2', [['아버지', 'adam']]),
  person('enoch', '4:17', [['아버지', 'cain']]),
  person('enosh', '4:26', [['아버지', 'seth']]),
  // 부모 쪽에서만 적힌 관계
  person('noah', '5:29', [['아들', 'shem']]),
  person('shem', '5:32'),
]

const shape = (node: FamilyNode): unknown => ({ id: node.id, spouses: node.spouses, children: node.children.map(shape) })
const all = new Set(people.map((item) => item.id))

describe('buildFamilyTree', () => {
  it('부모·자식 관계로 나무를 만들고, 자식은 처음 나온 순서로 둔다', () => {
    const roots = buildFamilyTree(people, all)
    expect(roots.map(shape)[0]).toEqual({
      id: 'adam',
      spouses: ['eve'],
      children: [
        { id: 'cain', spouses: [], children: [{ id: 'enoch', spouses: [], children: [] }] },
        { id: 'abel', spouses: [], children: [] },
        { id: 'seth', spouses: [], children: [{ id: 'enosh', spouses: [], children: [] }] },
      ],
    })
  })

  it('아내는 따로 뿌리가 되지 않고, 부모 쪽에서만 적힌 관계도 잇는다', () => {
    const roots = buildFamilyTree(people, all)
    expect(roots.map((root) => root.id)).toEqual(['adam', 'noah'])
    expect(roots[1]!.children.map((child) => child.id)).toEqual(['shem'])
  })

  it('보이지 않는 인물은 빼고, 부모가 가려진 인물은 뿌리가 된다', () => {
    const visible = new Set(['adam', 'eve', 'cain', 'enosh'])
    const roots = buildFamilyTree(people, visible)
    expect(roots.map((root) => root.id)).toEqual(['adam', 'enosh'])
    expect(roots[0]!.children.map((child) => child.id)).toEqual(['cain'])
  })
})
```

```ts path=packages/reader-core/src/people.test.ts
import { describe, expect, it } from 'vitest'
import { chapterOfReference, metCharacters, readUpToChapter } from './people.ts'
import type { Chapter, Character } from './types.ts'

const character = (id: string, firstAppearance: string) => ({ id, name: id, firstAppearance }) as Character
const chapter = (number: number, sceneIds: string[]) =>
  ({ chapter: number, verses: [], scenes: sceneIds.map((id) => ({ id })) }) as unknown as Chapter

describe('만난 인물', () => {
  it('장절 표기에서 장을 꺼낸다', () => {
    expect(chapterOfReference('4:17')).toBe(4)
    expect(chapterOfReference('')).toBe(0)
  })

  it('읽은 장면이 있는 가장 뒤 장과 지금 장 가운데 큰 쪽까지 읽은 것으로 본다', () => {
    const chapters = [chapter(1, ['a']), chapter(2, ['b']), chapter(3, ['c'])]
    expect(readUpToChapter(chapters, new Set(['b']), 1)).toBe(2)
    expect(readUpToChapter(chapters, new Set(), 3)).toBe(3)
  })

  it('그 장까지 처음 나온 인물을 나온 순서로 준다', () => {
    const people = [character('noah', '5:29'), character('cain', '4:1'), character('adam', '2:7'), character('abel', '4:2')]
    expect(metCharacters(people, 4).map((item) => item.id)).toEqual(['adam', 'cain', 'abel'])
  })
})
```

```ts path=packages/reader-core/src/records.test.ts
import { describe, expect, it } from 'vitest'
import { RecordStore, type Persistence, type RecordRow } from './records.ts'

function memory(initial: RecordRow[] = []): Persistence & { saved: RecordRow[] } {
  const saved: RecordRow[] = []
  return { saved, load: () => initial, save: (row) => void saved.push(row) }
}

describe('RecordStore', () => {
  it('넣은 기록을 읽고, 줄마다 수정 시각과 미동기화 표시를 남긴다', () => {
    const persistence = memory()
    const store = new RecordStore(persistence)
    store.put('marks', 'genesis:4:9', { note: '가' }, 1000)
    expect(store.get('marks', 'genesis:4:9')).toEqual({ note: '가' })
    expect(persistence.saved).toEqual([
      { collection: 'marks', id: 'genesis:4:9', data: { note: '가' }, updatedAt: 1000, deletedAt: null, dirty: true },
    ])
  })

  it('지우면 줄을 없애지 않고 지운 시각을 적는다', () => {
    const store = new RecordStore(memory())
    store.put('marks', 'a', { note: '가' }, 1000)
    store.remove('marks', 'a', 2000)
    expect(store.get('marks', 'a')).toBeNull()
    expect(store.list('marks')).toEqual([])
    expect(store.rowsSnapshot()[0]).toMatchObject({ deletedAt: 2000, updatedAt: 2000, dirty: true })
  })

  it('저장해 둔 줄을 불러오고, 컬렉션별로 지우지 않은 것만 늘어놓는다', () => {
    const rows: RecordRow[] = [
      { collection: 'readScenes', id: 'a', data: { day: '2026-10-08' }, updatedAt: 1, deletedAt: null, dirty: false },
      { collection: 'readScenes', id: 'b', data: { day: null }, updatedAt: 1, deletedAt: 5, dirty: false },
      { collection: 'marks', id: 'c', data: {}, updatedAt: 1, deletedAt: null, dirty: false },
    ]
    const store = new RecordStore(memory(rows))
    expect(store.list('readScenes').map((item) => item.id)).toEqual(['a'])
  })

  it('바뀔 때마다 구독자에게 알리고 버전을 올린다', () => {
    const store = new RecordStore(memory())
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    const before = store.getVersion()
    store.put('plan', 'current', { kind: 'free', perDay: 1 })
    expect(calls).toBe(1)
    expect(store.getVersion()).toBe(before + 1)
    unsubscribe()
    store.put('plan', 'current', { kind: 'chapter', perDay: 1 })
    expect(calls).toBe(1)
  })
})
```

- [ ] **Step 2: 실패를 본다**

Run: `npx vitest run --root packages/reader-core` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

```ts path=packages/reader-core/src/marks.ts
// 절 단위 밑줄·메모·즐겨찾기. 한 절에 기록 하나다. 글자 단위 범위는 본문이 고쳐지면 어긋나서 쓰지 않는다.
export type MarkColor = 'yellow' | 'green' | 'blue'
export const MARK_COLORS: MarkColor[] = ['yellow', 'green', 'blue']

export type Mark = {
  book: string
  chapter: number
  verse: number
  // 밑줄 색. null이면 밑줄 없음
  color: MarkColor | null
  note: string
  bookmark: boolean
}

export function markId(book: string, chapter: number, verse: number): string {
  return `${book}:${chapter}:${verse}`
}

export function emptyMark(book: string, chapter: number, verse: number): Mark {
  return { book, chapter, verse, color: null, note: '', bookmark: false }
}

export function isEmptyMark(mark: Mark): boolean {
  return mark.color === null && mark.note.trim() === '' && !mark.bookmark
}

// 저장된 값을 읽는다. 장·절이 없으면 null, 모르는 색은 밑줄 없음으로 본다.
export function parseMark(value: unknown): Mark | null {
  if (typeof value !== 'object' || value === null) return null
  const saved = value as Record<string, unknown>
  if (typeof saved.book !== 'string' || typeof saved.chapter !== 'number' || typeof saved.verse !== 'number') return null
  return {
    book: saved.book,
    chapter: saved.chapter,
    verse: saved.verse,
    color: MARK_COLORS.includes(saved.color as MarkColor) ? (saved.color as MarkColor) : null,
    note: typeof saved.note === 'string' ? saved.note : '',
    bookmark: saved.bookmark === true,
  }
}

export type MarkCounts = { highlights: number; notes: number; bookmarks: number }

export function countMarks(marks: Mark[]): MarkCounts {
  return {
    highlights: marks.filter((mark) => mark.color !== null).length,
    notes: marks.filter((mark) => mark.note.trim() !== '').length,
    bookmarks: marks.filter((mark) => mark.bookmark).length,
  }
}

export function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
}
```

```ts path=packages/reader-core/src/search.ts
import { firstSentence } from './entity.ts'
import type { Bundle } from './types.ts'

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
// 찾을 때 무시하는 글자: 띄어쓰기와 문장 부호
const IGNORED = /[\s.,!?·'"“”‘’()[\]{}:;~\-…]/

// 한글 음절의 초성. 한글 음절이 아니면 그대로 둔다.
export function choseongOf(char: string): string {
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return char
  return CHOSEONG[Math.floor((code - 0xac00) / 588)]!
}

export function isChoseongQuery(query: string): boolean {
  const letters = [...query].filter((char) => !IGNORED.test(char))
  return letters.length > 0 && letters.every((char) => CHOSEONG.includes(char))
}

type Folded = { text: string; positions: number[] }

// 무시할 글자를 빼고(초성 검색이면 초성으로 바꾸고), 남은 글자가 원문 몇 번째였는지 함께 든다.
function fold(text: string, choseong: boolean): Folded {
  let folded = ''
  const positions: number[] = []
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (IGNORED.test(char)) continue
    folded += choseong ? choseongOf(char) : char.toLowerCase()
    positions.push(index)
  }
  return { text: folded, positions }
}

export type TextRange = { start: number; end: number }

// text에서 query를 찾는다. 띄어쓰기·문장 부호는 무시하고, query가 초성만이면 초성끼리 견준다.
// 찾은 자리는 원문 기준 [start, end)라서 원문에서 바로 칠할 수 있다.
export function findMatch(text: string, query: string): TextRange | null {
  const needle = fold(query, false).text
  if (!needle) return null
  const haystack = fold(text, isChoseongQuery(query))
  const at = haystack.text.indexOf(needle)
  if (at < 0) return null
  return { start: haystack.positions[at]!, end: haystack.positions[at + needle.length - 1]! + 1 }
}

export type CanonKind = 'character' | 'place' | 'era' | 'thing'

export type VerseHit = { chapter: number; verse: number; text: string; sceneTitle: string; match: TextRange }
export type GlossHit = {
  chapter: number
  verse: number
  word: string
  meaning: string
  wordMatch: TextRange | null
  meaningMatch: TextRange | null
}
export type CanonHit = {
  kind: CanonKind
  id: string
  name: string
  summary: string
  nameMatch: TextRange | null
  summaryMatch: TextRange | null
}
export type SceneHit = {
  chapter: number
  sceneId: string
  title: string
  summary: string
  verseStart: number
  verseEnd: number
  titleMatch: TextRange | null
  summaryMatch: TextRange | null
}
export type SearchResults = { verses: VerseHit[]; glosses: GlossHit[]; canon: CanonHit[]; scenes: SceneHit[]; total: number }

// 장면의 한 줄 요약: 해설 첫 문장
export function sceneSummary(scene: { commentary: string | null; explanation: string[] }): string {
  return scene.commentary ?? firstSentence(scene.explanation[0] ?? '')
}

// 묶음 전체에서 찾는다. 갈래마다 묶음 순서대로 limit개까지 돌려주고, total은 자르기 전 개수의 합이다.
export function searchBundle(bundle: Bundle, query: string, limit = 50): SearchResults {
  const verses: VerseHit[] = []
  const glosses: GlossHit[] = []
  const scenes: SceneHit[] = []
  const canon: CanonHit[] = []
  if (!fold(query, false).text) return { verses, glosses, canon, scenes, total: 0 }

  for (const chapter of bundle.chapters) {
    for (const scene of chapter.scenes) {
      for (const verse of chapter.verses) {
        if (verse.verse < scene.verseStart || verse.verse > scene.verseEnd) continue
        const match = findMatch(verse.text, query)
        if (match) verses.push({ chapter: chapter.chapter, verse: verse.verse, text: verse.text, sceneTitle: scene.title, match })
      }
      for (const gloss of scene.glossary) {
        const wordMatch = findMatch(gloss.word, query)
        const meaningMatch = wordMatch ? null : findMatch(gloss.meaning, query)
        if (wordMatch || meaningMatch) {
          glosses.push({ chapter: chapter.chapter, verse: gloss.verse, word: gloss.word, meaning: gloss.meaning, wordMatch, meaningMatch })
        }
      }
      const summary = sceneSummary(scene)
      const titleMatch = findMatch(scene.title, query)
      const summaryMatch = titleMatch ? null : findMatch(summary, query)
      if (titleMatch || summaryMatch) {
        scenes.push({
          chapter: chapter.chapter,
          sceneId: scene.id,
          title: scene.title,
          summary,
          verseStart: scene.verseStart,
          verseEnd: scene.verseEnd,
          titleMatch,
          summaryMatch,
        })
      }
    }
  }

  const entries: { kind: CanonKind; id: string; name: string; aliases: string[]; summary: string }[] = [
    ...bundle.characters.map((item) => ({ kind: 'character' as const, id: item.id, name: item.name, aliases: item.aliases, summary: firstSentence(item.notes) })),
    ...bundle.places.map((item) => ({ kind: 'place' as const, id: item.id, name: item.name, aliases: [], summary: item.description })),
    ...bundle.eras.map((item) => ({ kind: 'era' as const, id: item.id, name: item.name, aliases: [], summary: item.description })),
    ...bundle.things.map((item) => ({ kind: 'thing' as const, id: item.id, name: item.name, aliases: item.aliases, summary: firstSentence(item.description) })),
  ]
  for (const entry of entries) {
    const nameMatch = findMatch(entry.name, query)
    const aliasMatch = nameMatch ? null : entry.aliases.find((alias) => findMatch(alias, query))
    const summaryMatch = nameMatch || aliasMatch ? null : findMatch(entry.summary, query)
    if (nameMatch || aliasMatch || summaryMatch) {
      canon.push({ kind: entry.kind, id: entry.id, name: entry.name, summary: entry.summary, nameMatch, summaryMatch })
    }
  }
  // 이름이 맞은 항목을 설명만 맞은 항목보다 앞에 둔다(안정 정렬이라 같은 무리 안의 순서는 그대로).
  canon.sort((a, b) => Number(b.summaryMatch === null) - Number(a.summaryMatch === null))

  const total = verses.length + glosses.length + canon.length + scenes.length
  return {
    verses: verses.slice(0, limit),
    glosses: glosses.slice(0, limit),
    canon: canon.slice(0, limit),
    scenes: scenes.slice(0, limit),
    total,
  }
}
```

```ts path=packages/reader-core/src/genealogy.ts
import type { Character } from './types.ts'

export type FamilyNode = { id: string; spouses: string[]; children: FamilyNode[] }

const CHILD_TYPES = new Set(['아들', '딸'])
const SPOUSE_TYPES = new Set(['아내', '남편'])

function appearance(character: Character): number {
  const [chapter, verse] = character.firstAppearance.split(':').map((part) => Number.parseInt(part, 10))
  return (Number.isNaN(chapter) || chapter === undefined ? 999 : chapter) * 1000 + (Number.isNaN(verse) || verse === undefined ? 0 : verse)
}

// 부모·자식 관계로 가계 나무를 만든다. visible에 든 인물만 넣는다(아직 읽지 않은 장의 인물은 가린다).
// 아버지가 보이면 아버지 밑에, 아니면 어머니 밑에 둔다. 부모 쪽에서만 적힌 관계(아들·딸)도 잇는다.
// 부모가 보이지 않는 인물이 뿌리이고, 그 가운데 먼저 나온 인물의 아내·남편(하와)은 뿌리로 세우지 않고 짝으로 보인다.
export function buildFamilyTree(characters: Character[], visible: ReadonlySet<string>): FamilyNode[] {
  const people = characters.filter((character) => visible.has(character.id))
  const byId = new Map(people.map((character) => [character.id, character]))
  const order = (a: string, b: string) => appearance(byId.get(a)!) - appearance(byId.get(b)!)
  const father = new Map<string, string>()
  const mother = new Map<string, string>()
  const spouses = new Map<string, Set<string>>()
  const addSpouse = (a: string, b: string) => {
    if (!spouses.has(a)) spouses.set(a, new Set())
    spouses.get(a)!.add(b)
  }

  for (const person of people) {
    for (const relation of person.relations) {
      const other = byId.get(relation.to)
      if (!other || other.id === person.id) continue
      if (relation.type === '아버지') father.set(person.id, other.id)
      else if (relation.type === '어머니') mother.set(person.id, other.id)
      else if (CHILD_TYPES.has(relation.type)) {
        const parents = person.gender === '여' ? mother : father
        if (!parents.has(other.id)) parents.set(other.id, person.id)
      } else if (SPOUSE_TYPES.has(relation.type)) {
        addSpouse(person.id, other.id)
        addSpouse(other.id, person.id)
      }
    }
  }

  const parentOf = (id: string) => father.get(id) ?? mother.get(id)
  const children = new Map<string, string[]>()
  for (const person of people) {
    const parent = parentOf(person.id)
    if (!parent) continue
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(person.id)
  }

  const placed = new Set<string>()
  const build = (id: string): FamilyNode => {
    placed.add(id)
    const mates = [...(spouses.get(id) ?? [])].sort(order)
    for (const mate of mates) if (parentOf(mate) === undefined) placed.add(mate)
    const kids = (children.get(id) ?? []).filter((child) => !placed.has(child)).sort(order)
    return { id, spouses: mates, children: kids.map(build) }
  }

  const roots: FamilyNode[] = []
  for (const person of [...people].sort((a, b) => appearance(a) - appearance(b))) {
    if (placed.has(person.id) || parentOf(person.id) !== undefined) continue
    roots.push(build(person.id))
  }
  return roots
}
```

```ts path=packages/reader-core/src/people.ts
import type { Chapter, Character } from './types.ts'

// "4:17" → 4. 장이 없으면 0이다.
export function chapterOfReference(reference: string): number {
  const chapter = Number.parseInt(reference.split(':')[0] ?? '', 10)
  return Number.isNaN(chapter) ? 0 : chapter
}

function verseOfReference(reference: string): number {
  const verse = Number.parseInt(reference.split(':')[1] ?? '', 10)
  return Number.isNaN(verse) ? 0 : verse
}

// 어디까지 읽었는지: 읽은 장면이 있는 가장 뒤 장과 지금 읽는 장 가운데 큰 쪽
export function readUpToChapter(chapters: Chapter[], readSceneIds: ReadonlySet<string>, currentChapter: number): number {
  let upTo = currentChapter
  for (const chapter of chapters) {
    if (chapter.scenes.some((scene) => readSceneIds.has(scene.id))) upTo = Math.max(upTo, chapter.chapter)
  }
  return upTo
}

// upTo장까지 처음 나온 인물(인물 사전, 가계도). 처음 나온 순서로 늘어놓는다.
export function metCharacters(characters: Character[], upTo: number): Character[] {
  return characters
    .filter((character) => {
      const chapter = chapterOfReference(character.firstAppearance)
      return chapter > 0 && chapter <= upTo
    })
    .sort(
      (a, b) =>
        chapterOfReference(a.firstAppearance) - chapterOfReference(b.firstAppearance) ||
        verseOfReference(a.firstAppearance) - verseOfReference(b.firstAppearance),
    )
}
```

```ts path=packages/reader-core/src/records.ts
// 기기 기록(읽은 장면, 읽기 위치, 계획, 밑줄·메모)을 담는 저장소.
// 줄마다 수정 시각, 지운 시각, 아직 서버에 올리지 않았는지를 적어 3단계 동기화가 그대로 쓴다.
// 기록은 작아서(수백 줄) 모두 메모리에 두고, 바뀐 줄만 persistence로 내려 쓴다.
export type Collection = 'position' | 'readScenes' | 'plan' | 'marks' | 'quizDone'

export type RecordRow = {
  collection: Collection
  id: string
  data: unknown
  updatedAt: number
  // 지운 시각. 지운 줄도 다른 기기에 알려야 하므로 바로 없애지 않는다.
  deletedAt: number | null
  dirty: boolean
}

export type Persistence = {
  load(): RecordRow[]
  save(row: RecordRow): void
}

const keyOf = (collection: Collection, id: string) => `${collection}/${id}`

export class RecordStore {
  private rows = new Map<string, RecordRow>()
  private listeners = new Set<() => void>()
  private version = 0
  private persistence: Persistence

  constructor(persistence: Persistence) {
    this.persistence = persistence
    for (const row of persistence.load()) this.rows.set(keyOf(row.collection, row.id), row)
  }

  get<T>(collection: Collection, id: string): T | null {
    const row = this.rows.get(keyOf(collection, id))
    return row && row.deletedAt === null ? (row.data as T) : null
  }

  list<T>(collection: Collection): { id: string; data: T; updatedAt: number }[] {
    const items: { id: string; data: T; updatedAt: number }[] = []
    for (const row of this.rows.values()) {
      if (row.collection === collection && row.deletedAt === null) items.push({ id: row.id, data: row.data as T, updatedAt: row.updatedAt })
    }
    return items
  }

  put(collection: Collection, id: string, data: unknown, now = Date.now()): void {
    this.write({ collection, id, data, updatedAt: now, deletedAt: null, dirty: true })
  }

  remove(collection: Collection, id: string, now = Date.now()): void {
    const existing = this.rows.get(keyOf(collection, id))
    if (!existing || existing.deletedAt !== null) return
    this.write({ ...existing, updatedAt: now, deletedAt: now, dirty: true })
  }

  // 동기화가 쓴다: 모든 줄(지운 줄 포함)과, 서버에서 받은 줄을 그대로 쓰기
  rowsSnapshot(): RecordRow[] {
    return [...this.rows.values()]
  }

  writeRow(row: RecordRow): void {
    this.write(row)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  private write(row: RecordRow): void {
    this.rows.set(keyOf(row.collection, row.id), row)
    this.persistence.save(row)
    this.version++
    for (const listener of this.listeners) listener()
  }
}
```

`packages/reader-core/src/index.ts`에 `genealogy`, `marks`, `people`, `records`, `search` 다섯 모듈의 `export *`를 알파벳 순서에 맞춰 더한다.

- [ ] **Step 4: 통과와 커밋**

Run: `npx vitest run --root packages/reader-core && npx tsc --noEmit -p packages/reader-core` → PASS

```bash
git add packages/reader-core
git commit -m "feat(core): 밑줄·메모, 띄어쓰기·초성 검색, 가계 나무, 만난 인물, 기록 저장소"
```

---

### Task 4: 앱의 기록 저장소와 경로 정리

**Files:**
- Create: `mobile/src/data/{store,persistence,persistence.web,migrate,reading}.ts`, `mobile/src/navigation.ts`, `mobile/src/content/BundleGate.tsx`
- Modify: `mobile/src/content/bundle.ts`(책 id), `mobile/src/theme/palette.ts`(밑줄 색), `mobile/src/ui/Icon.tsx`(아이콘), `mobile/src/ui/Sheet.tsx`(키보드)

- [ ] **Step 1: 영속화와 저장소**

```ts path=mobile/src/data/persistence.ts
import { openDatabaseSync } from 'expo-sqlite'
import type { Collection, Persistence, RecordRow } from 'reader-core'

// 기기 기록을 SQLite 파일(reader.db)의 records 표 하나에 둔다. 컬렉션과 id가 키다.
const db = openDatabaseSync('reader.db')
db.execSync(
  'CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, dirty INTEGER NOT NULL, PRIMARY KEY (collection, id))',
)

type Row = { collection: string; id: string; data: string; updated_at: number; deleted_at: number | null; dirty: number }

export const persistence: Persistence = {
  load: () =>
    db.getAllSync<Row>('SELECT collection, id, data, updated_at, deleted_at, dirty FROM records').map(
      (row): RecordRow => ({
        collection: row.collection as Collection,
        id: row.id,
        data: JSON.parse(row.data) as unknown,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        dirty: row.dirty === 1,
      }),
    ),
  save: (row) => {
    db.runSync(
      'INSERT OR REPLACE INTO records (collection, id, data, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, ?, ?)',
      [row.collection, row.id, JSON.stringify(row.data), row.updatedAt, row.deletedAt, row.dirty ? 1 : 0],
    )
  },
}
```

```ts path=mobile/src/data/persistence.web.ts
import type { Persistence, RecordRow } from 'reader-core'

// Expo 웹 미리 보기에서는 localStorage 한 키에 모든 줄을 JSON으로 둔다.
const key = 'reader-records'
let rows: RecordRow[] = []

function read(): RecordRow[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? (value as RecordRow[]) : []
  } catch {
    return []
  }
}

export const persistence: Persistence = {
  load: () => {
    rows = read()
    return rows
  },
  save: (row) => {
    const index = rows.findIndex((item) => item.collection === row.collection && item.id === row.id)
    if (index >= 0) rows[index] = row
    else rows.push(row)
    try {
      localStorage.setItem(key, JSON.stringify(rows))
    } catch {
      // 저장소를 쓸 수 없는 환경에서는 이번 세션 동안만 기억한다.
    }
  },
}
```

```ts path=mobile/src/data/migrate.ts
import { loadPosition, loadReadScenes, type RecordStore } from 'reader-core'
import { kv } from '../storage/kv'

const doneKey = 'records-migrated'

// 1단계는 읽기 위치와 읽은 장면을 kv에 적었다. 처음 한 번만 기록 저장소로 옮긴다(kv 값은 두고 간다).
// 그때 읽은 날은 알 수 없어서 null(오늘 이전)로 둔다.
export function migrateFromKv(store: RecordStore): void {
  try {
    if (kv.getItem(doneKey) === '1') return
  } catch {
    return
  }
  const position = loadPosition(kv)
  if (position && store.get('position', 'current') === null) store.put('position', 'current', position)
  for (const id of loadReadScenes(kv)) {
    if (store.get('readScenes', id) === null) store.put('readScenes', id, { day: null })
  }
  try {
    kv.setItem(doneKey, '1')
  } catch {
    // 다음에 다시 옮겨도 이미 있는 줄은 건너뛴다.
  }
}
```

```ts path=mobile/src/data/store.ts
import { useSyncExternalStore } from 'react'
import { RecordStore } from 'reader-core'
import { migrateFromKv } from './migrate'
import { persistence } from './persistence'

// 앱 전체가 함께 쓰는 기록 저장소
export const store = new RecordStore(persistence)
migrateFromKv(store)

// 기록이 바뀔 때마다 다시 그리게 하는 훅. 돌려준 버전을 useMemo 의존성으로 쓴다.
export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
}
```

```ts path=mobile/src/data/reading.ts
import { useMemo } from 'react'
import {
  DEFAULT_PLAN,
  isEmptyMark,
  markId,
  parseMark,
  parsePlan,
  parsePosition,
  sortMarks,
  type Mark,
  type Position,
  type ReadingPlan,
} from 'reader-core'
import { store, useStoreVersion } from './store'

// 읽은 장면: id → 읽은 날('YYYY-MM-DD', 모르면 null)
export type ReadScenes = { ids: Set<string>; days: Map<string, string | null> }

function readScenes(): ReadScenes {
  const days = new Map<string, string | null>()
  for (const item of store.list<{ day?: unknown }>('readScenes')) {
    days.set(item.id, typeof item.data?.day === 'string' ? item.data.day : null)
  }
  return { ids: new Set(days.keys()), days }
}

export function useReadScenes(): ReadScenes {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(readScenes, [version])
}

export function markSceneRead(sceneId: string, day: string): void {
  if (store.get('readScenes', sceneId) === null) store.put('readScenes', sceneId, { day })
}

export function savedPosition(): Position | null {
  return parsePosition(JSON.stringify(store.get('position', 'current')))
}

export function useSavedPosition(): Position | null {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(savedPosition, [version])
}

export function savePositionRecord(position: Position): void {
  const current = savedPosition()
  if (current && current.chapter === position.chapter && current.verse === position.verse) return
  store.put('position', 'current', position)
}

export function usePlan(): ReadingPlan {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => parsePlan(store.get('plan', 'current') ?? DEFAULT_PLAN), [version])
}

export function savePlan(plan: ReadingPlan): void {
  store.put('plan', 'current', plan)
}

export function useMarks(): Mark[] {
  const version = useStoreVersion()
  return useMemo(
    () => sortMarks(store.list('marks').flatMap((item) => parseMark(item.data) ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
}

export function getMark(book: string, chapter: number, verse: number): Mark | null {
  return parseMark(store.get('marks', markId(book, chapter, verse)))
}

// 빈 기록(색·메모·즐겨찾기 모두 없음)이면 지운다.
export function saveMark(mark: Mark): void {
  const id = markId(mark.book, mark.chapter, mark.verse)
  if (isEmptyMark(mark)) store.remove('marks', id)
  else store.put('marks', id, mark)
}
```

- [ ] **Step 2: 화면 사이 요청, 묶음 관문, 책 id**

```ts path=mobile/src/navigation.ts
import type { useRouter } from 'expo-router'
import type { Position } from 'reader-core'

type Router = ReturnType<typeof useRouter>

// 다른 화면(홈, 검색, 메모)이 읽기 화면에 보내는 요청: 이 절로 옮기기, 이 덮개 열기
export type ReaderRequest = { position?: Position; overlay?: 'map' | 'timeline' | 'contents' }

let pending: ReaderRequest | null = null
const listeners = new Set<() => void>()

export function requestReader(request: ReaderRequest): void {
  pending = request
  for (const listener of listeners) listener()
}

// 읽기 화면이 꺼내 간다. 한 번 꺼내면 비운다.
export function takeReaderRequest(): ReaderRequest | null {
  const request = pending
  pending = null
  return request
}

export function onReaderRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 읽기 화면에서 연 화면(from=read)이면 뒤로 돌아가 요청을 건네고, 아니면 읽기 화면을 새로 연다.
export function goToReader(router: Router, from: string | undefined, request: ReaderRequest): void {
  requestReader(request)
  if (from === 'read' && router.canGoBack()) router.back()
  else router.push('/read')
}

export function goBack(router: Router): void {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}
```

```tsx path=mobile/src/content/BundleGate.tsx
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Bundle } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { content } from './bundle'

// 경로 화면이 묶음을 쓰기 전에 거친다. 묶음을 읽지 못했으면 오류를 보인다.
export function BundleGate({ render }: { render: (bundle: Bundle) => ReactNode }) {
  const { palette } = useSettings()
  if (content.error !== null) {
    return (
      <View style={[styles.status, { backgroundColor: palette.paper }]}>
        <Text style={{ color: palette.inkSoft }}>콘텐츠를 불러오지 못했어요</Text>
        <Text style={{ color: palette.inkFaint, fontSize: 12 }}>{content.error}</Text>
      </View>
    )
  }
  return <>{render(content.bundle)}</>
}

const styles = StyleSheet.create({
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
})
```

`mobile/src/content/bundle.ts` 끝에 더한다.

```ts
// 기록(밑줄·메모)에 쓰는 책 id. 묶음 파일 이름과 같다.
export const bookId = 'genesis'
```

- [ ] **Step 3: 색, 아이콘, 시트**

`mobile/src/theme/palette.ts`의 `Palette` 타입에 `markYellow`, `markGreen`, `markBlue`를 더하고 값을 넣는다(밝게: `#fbefd6`, `#e6f0e4`, `#e3ecf6` — 목업 값, 어둡게: `rgba(224, 162, 74, 0.28)`, `rgba(124, 192, 140, 0.24)`, `rgba(127, 168, 224, 0.26)`). 파일 끝에 더한다.

```ts
import type { MarkColor } from 'reader-core'

export function markColor(color: MarkColor, palette: Palette): string {
  return color === 'yellow' ? palette.markYellow : color === 'green' ? palette.markGreen : palette.markBlue
}
```

(import는 파일 맨 위로 올린다.)

`mobile/src/ui/Icon.tsx`의 `IconName`에 `'home' | 'search' | 'flame' | 'note' | 'bookmark' | 'share' | 'timeline' | 'tree' | 'book' | 'check'`를 더하고 `shapes`에 넣는다.

```tsx
  home: <Path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  flame: <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-10z" />,
  note: (
    <>
      <Path d="M5 4h11l3 3v13H5z" />
      <Path d="M8 10h8M8 14h5" />
    </>
  ),
  bookmark: <Path d="M6 4h12v17l-6-4-6 4z" />,
  share: (
    <>
      <Path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <Path d="M12 3v13M7 8l5-5 5 5" />
    </>
  ),
  timeline: <Path d="M4 12h16M8 6v12M16 6v12" />,
  tree: <Path d="M12 3v6M5 13V9h14v4M5 13v4M19 13v4M12 9v8" />,
  book: (
    <>
      <Path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" />
      <Path d="M20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  check: <Path d="M4 12l5 5L20 6" />,
```

`Icon`에 `filled?: boolean` 인자를 더해, 참이면 `G`의 `fill`을 `color`로 준다(즐겨찾기 표시).

`mobile/src/ui/Sheet.tsx`: 메모를 쓸 때 키보드가 시트를 가리지 않게, 맨 바깥 `View`를 `KeyboardAvoidingView`(`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`)로 바꾼다(`react-native`에서 import).

- [ ] **Step 4: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 기기 기록 저장소(SQLite, 웹은 localStorage)와 1단계 기록 옮기기, 화면 사이 요청"
```

---

### Task 5: 읽기 화면 — 기록 저장소, 요청, 밑줄·메모, 공유

**Files:**
- Create: `mobile/src/reader/MarkSheet.tsx`, `mobile/src/share/{ShareCardSheet.tsx,shareCard.ts,shareCard.web.ts}`
- Modify: `mobile/src/reader/ReaderScreen.tsx`, `mobile/src/reader/VersePane.tsx`, `mobile/src/app/read.tsx`

- [ ] **Step 1: 공유 모듈 설치**

```bash
cd mobile && npx expo install react-native-view-shot expo-sharing && cd ..
```

- [ ] **Step 2: 밑줄·메모 시트**

```tsx path=mobile/src/reader/MarkSheet.tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MARK_COLORS, type MarkColor, type Verse } from 'reader-core'
import { getMark, saveMark } from '../data/reading'
import { useSettings } from '../settings/SettingsContext'
import { fonts, markColor } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const colorLabel: Record<MarkColor, string> = { yellow: '노란', green: '초록', blue: '파란' }

type Props = {
  book: string
  chapter: number
  verse: Verse
  onShare: () => void
  onClose: () => void
}

// 절을 길게 눌러 여는 밑줄·메모·즐겨찾기 시트. 저장을 눌러야 바뀐다.
export default function MarkSheet({ book, chapter, verse, onShare, onClose }: Props) {
  const { palette } = useSettings()
  const existing = getMark(book, chapter, verse.verse)
  const [color, setColor] = useState<MarkColor | null>(existing?.color ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [bookmark, setBookmark] = useState(existing?.bookmark ?? false)

  function save() {
    saveMark({ book, chapter, verse: verse.verse, color, note: note.trim(), bookmark })
    onClose()
  }

  return (
    <Sheet title={`창세기 ${chapter}장 ${verse.verse}절`} closeLabel="밑줄과 메모 닫기" onClose={onClose}>
      <Text style={[styles.verse, { color: palette.ink }]}>
        <Text style={color ? { backgroundColor: markColor(color, palette) } : undefined}>{verse.text}</Text>
      </Text>

      <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="밑줄 색">
        {MARK_COLORS.map((item) => {
          const selected = item === color
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${colorLabel[item]} 밑줄`}
              onPress={() => setColor(item)}
              style={[styles.swatch, { backgroundColor: markColor(item, palette), borderColor: selected ? palette.accent : 'transparent' }]}
            />
          )
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="밑줄 지우기"
          onPress={() => setColor(null)}
          style={[styles.swatch, styles.clear, { borderColor: palette.line, backgroundColor: palette.surface }]}
        >
          <Icon name="close" size={14} color={palette.inkSoft} />
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel="메모"
        placeholder="메모"
        placeholderTextColor={palette.inkFaint}
        value={note}
        onChangeText={setNote}
        multiline
        style={[styles.input, { borderColor: palette.line, backgroundColor: palette.paper, color: palette.ink }]}
      />

      <View style={styles.row}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: bookmark }}
          accessibilityLabel="즐겨찾기"
          onPress={() => setBookmark(!bookmark)}
          style={[styles.chip, { backgroundColor: bookmark ? palette.accentSoft : palette.paper }]}
        >
          <Icon name="bookmark" size={16} color={palette.accent} filled={bookmark} />
          <Text style={[styles.chipText, { color: bookmark ? palette.accent : palette.inkSoft }]}>즐겨찾기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onShare} style={[styles.chip, { backgroundColor: palette.paper }]}>
          <Icon name="share" size={16} color={palette.inkSoft} />
          <Text style={[styles.chipText, { color: palette.inkSoft }]}>카드로 공유</Text>
        </Pressable>
      </View>

      <View style={[styles.row, styles.actions]}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: palette.inkSoft }]}>취소</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={save} style={[styles.save, { backgroundColor: palette.accent }]}>
          <Text style={[styles.saveText, { color: palette.paper }]}>저장</Text>
        </Pressable>
      </View>

      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        이 기기에 저장돼요. 로그인하면 다른 기기에서도 같은 메모를 볼 수 있어요.
      </Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  verse: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 27 },
  colors: { flexDirection: 'row', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  clear: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 84, padding: 12, borderWidth: 1, borderRadius: 12, fontSize: 14, lineHeight: 22, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 10 },
  chipText: { fontSize: 13 },
  actions: { justifyContent: 'flex-end' },
  cancel: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  save: { height: 40, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  saveText: { fontSize: 14, fontWeight: '600' },
})
```

- [ ] **Step 3: 장면 카드 공유**

```ts path=mobile/src/share/shareCard.ts
import * as Sharing from 'expo-sharing'
import type { RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'

// 카드 화면을 1080×1080 PNG로 찍어 시스템 공유창에 넘긴다. 돌려준 글은 화면에 보일 안내다.
export async function shareCard(card: RefObject<View | null>, _text: string): Promise<string | null> {
  if (!(await Sharing.isAvailableAsync())) return '이 기기에서는 공유할 수 없어요'
  const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1080 })
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '장면 카드 공유' })
  return null
}
```

```ts path=mobile/src/share/shareCard.web.ts
import type { RefObject } from 'react'
import type { View } from 'react-native'

// 웹 미리 보기에서는 그림 대신 구절 글을 공유하거나 복사한다.
export async function shareCard(_card: RefObject<View | null>, text: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ text })
    return null
  }
  await navigator.clipboard.writeText(text)
  return '구절을 복사했어요. 웹에서는 그림 대신 글로 공유해요.'
}
```

```tsx path=mobile/src/share/ShareCardSheet.tsx
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Scene, Verse } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'
import { shareCard } from './shareCard'

type Props = {
  scene: Scene
  imageVersionId: string | null
  chapter: number
  verse: Verse
  translation: string
  onClose: () => void
}

// 장면 그림 위에 한 절을 얹은 정사각 카드. 기기에서 그려 공유하고 서버는 거치지 않는다.
export default function ShareCardSheet({ scene, imageVersionId, chapter, verse, translation, onClose }: Props) {
  const { palette } = useSettings()
  const card = useRef<View>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const reference = `창세기 ${chapter}장 ${verse.verse}절 · ${translation}`

  async function share() {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await shareCard(card, `${verse.text}\n— ${reference}`))
    } catch {
      setMessage('공유하지 못했어요. 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="장면 카드 공유" closeLabel="공유 닫기" onClose={onClose}>
      <View ref={card} collapsable={false} style={[styles.card, { backgroundColor: palette.ink }]}>
        {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <LinearGradient colors={['rgba(20, 16, 12, 0)', 'rgba(20, 16, 12, 0.78)']} style={styles.shade} />
        <Text style={styles.title}>{scene.title}</Text>
        <View style={styles.bottom}>
          <Text style={styles.verse}>{verse.text}</Text>
          <View style={styles.footer}>
            <Text style={styles.reference}>{reference}</Text>
            <View style={styles.brand}>
              <View style={[styles.logo, { backgroundColor: palette.accent }]}>
                <Icon name="book" size={12} color="#ffffff" />
              </View>
              <Text style={styles.brandText}>장면으로 읽는 성경</Text>
            </View>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void share()}
        style={[styles.button, { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 }]}
      >
        <Icon name="share" size={18} color={palette.paper} />
        <Text style={[styles.buttonText, { color: palette.paper }]}>{busy ? '만드는 중' : '공유하기'}</Text>
      </Pressable>
      {message ? <Text style={[sheetStyles.note, { color: palette.inkSoft }]}>{message}</Text> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  title: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 16, 12, 0.55)',
    color: '#ffffff',
    fontSize: 11,
  },
  bottom: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 10 },
  verse: {
    color: '#ffffff',
    fontFamily: fonts.serifBold,
    fontSize: 15,
    lineHeight: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  reference: { flexShrink: 1, color: 'rgba(255, 255, 255, 0.9)', fontSize: 11 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 10 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12 },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
```

- [ ] **Step 4: 본문에 밑줄·메모 표시와 길게 누르기, 머리 단추**

`mobile/src/reader/VersePane.tsx`를 다음과 같이 바꾼다.
- Props에 `marks: ReadonlyMap<number, Mark>`(절 → 기록), `onLongPressVerse: (verse: number) => void`, `onGoHome: () => void`, `onOpenSearch: () => void`를 더한다(`Mark`는 reader-core에서).
- 머리 왼쪽에 `<IconButton name="home" label="홈으로" color={palette.ink} onPress={onGoHome} />`를 장 고르기 단추 앞에 두고, 오른쪽 단추 묶음 맨 앞에 `<IconButton name="search" label="검색" color={palette.ink} onPress={onOpenSearch} />`를 더한다. 머리의 `paddingLeft`는 4로 줄인다.
- 절을 감싸는 `View`를 `Pressable`로 바꾸고 `onLongPress={() => onLongPressVerse(v.verse)}`, `delayLongPress={400}`, `accessibilityHint="길게 누르면 밑줄과 메모를 남겨요"`를 준다(`onLayout`과 `style`은 그대로).
- 본문 `Text` 안에서 절 번호 뒤의 조각들을 `const mark = marks.get(v.verse)`의 색이 있으면 `<Text style={{ backgroundColor: markColor(mark.color, palette) }}>…</Text>`로 감싸고, 끝에 메모가 있으면 `<Text accessibilityLabel="메모 있음" onPress={() => onLongPressVerse(v.verse)} style={{ color: palette.accent, fontFamily: fonts.sans, fontSize: 13 * verseScale }}> ✎</Text>`, 즐겨찾기면 ` ★`를 같은 모양으로 붙인다(`markColor`, `fonts`는 palette에서).

- [ ] **Step 5: 읽기 화면을 기록 저장소와 요청에 잇는다**

`mobile/src/reader/ReaderScreen.tsx`를 다음과 같이 바꾼다.
- import에서 `loadPosition`, `loadReadScenes`, `markRead`, `savePosition`, `saveReadScenes`, `kv`를 빼고 `localDay`(reader-core), `useRouter`(expo-router), `bookId`(content/bundle), `markSceneRead`, `savePositionRecord`, `savedPosition`, `useMarks`, `useReadScenes`(data/reading), `onReaderRequest`, `takeReaderRequest`, `goBack`, `type ReaderRequest`(navigation), `MarkSheet`, `ShareCardSheet`(share)를 더한다.
- `Overlay`에 `| { kind: 'mark'; verse: number } | { kind: 'share'; verse: number }`를 더하고, 인물 카드 갈래를 `{ kind: 'entity'; ... }`로 구분해 쓰는 곳(`closeOverlay`, `openEntity`, `EntityCard` 그리는 조건)을 `typeof overlay === 'object' && overlay.kind === 'entity'`로 고친다.
- 상태 초기값을 요청과 기록 저장소에서 가져온다.

```tsx
  const router = useRouter()
  // 홈·검색·메모에서 열 때 보낸 요청(옮길 절, 열 덮개). 처음 한 번만 꺼낸다.
  const [initialRequest] = useState(() => takeReaderRequest())
  const [position, setPosition] = useState(() =>
    initialPosition(bundle.chapters, initialRequest?.position ?? savedPosition()),
  )
  const [overlay, setOverlay] = useState<Overlay>(() =>
    initialRequest?.overlay === 'map' ? 'map' : initialRequest?.overlay ? 'contents' : 'none',
  )
  const [contentsTab, setContentsTab] = useState<ContentsTab>(
    initialRequest?.overlay === 'timeline' ? 'timeline' : 'scenes',
  )
  const { ids: readScenes } = useReadScenes()
  const marks = useMarks()
  const chapterMarks = useMemo(
    () => new Map(marks.filter((mark) => mark.book === bookId && mark.chapter === position.chapter).map((mark) => [mark.verse, mark])),
    [marks, position.chapter],
  )
```

- 위치 저장과 읽음 표시를 바꾼다.

```tsx
  useEffect(() => {
    savePositionRecord(position)
  }, [position])

  // 장면의 마지막 절까지 오면 그 장면을 오늘 읽은 것으로 적는다(연속 읽기와 계획이 쓴다).
  useEffect(() => {
    if (position.verse >= scene.verseEnd && !readScenes.has(scene.id)) markSceneRead(scene.id, localDay(new Date()))
  }, [position, scene.id, scene.verseEnd, readScenes])
```

(`readScenes` 상태와 `saveReadScenes` 효과는 지운다.)

- 다른 화면에서 돌아오며 보낸 요청을 받는다.

```tsx
  // 검색·메모에서 뒤로 돌아오며 보낸 요청. 지금 그려진 읽기 화면에 바로 적용한다.
  const applyRequest = useRef<(request: ReaderRequest) => void>(() => undefined)
  applyRequest.current = (request) => {
    if (request.position) jumpTo(request.position)
    if (request.overlay === 'map') openOverlay('map')
    else if (request.overlay) {
      setContentsTab(request.overlay === 'timeline' ? 'timeline' : 'scenes')
      openOverlay('contents')
    }
  }
  useEffect(
    () =>
      onReaderRequest(() => {
        const request = takeReaderRequest()
        if (request) applyRequest.current(request)
      }),
    [],
  )
```

- `VersePane`에 `marks={chapterMarks}`, `onLongPressVerse={(verse) => openOverlay({ kind: 'mark', verse })}`, `onGoHome={() => goBack(router)}`, `onOpenSearch={() => router.push({ pathname: '/search', params: { from: 'read' } })}`를 넘긴다.
- 덮개를 그리는 곳 끝에 더한다.

```tsx
      {typeof overlay === 'object' && overlay.kind === 'mark' && (
        <MarkSheet
          book={bookId}
          chapter={chapter.chapter}
          verse={chapter.verses.find((v) => v.verse === overlay.verse)!}
          onShare={() => setOverlay({ kind: 'share', verse: overlay.verse })}
          onClose={closeOverlay}
        />
      )}
      {typeof overlay === 'object' && overlay.kind === 'share' && (
        <ShareCardSheet
          scene={chapter.scenes[findSceneIndex(chapter.scenes, overlay.verse)]!}
          imageVersionId={bundle.defaultImageVersion}
          chapter={chapter.chapter}
          verse={chapter.verses.find((v) => v.verse === overlay.verse)!}
          translation={bundle.translation}
          onClose={closeOverlay}
        />
      )}
```

`mobile/src/app/read.tsx`를 `BundleGate`로 바꾼다.

```tsx path=mobile/src/app/read.tsx
import { BundleGate } from '../content/BundleGate'
import ReaderScreen from '../reader/ReaderScreen'

export default function ReadRoute() {
  return <BundleGate render={(bundle) => <ReaderScreen bundle={bundle} />} />
}
```

- [ ] **Step 6: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile package-lock.json
git commit -m "feat(mobile): 절을 길게 눌러 밑줄·메모·즐겨찾기, 장면 카드 공유, 읽기 기록 저장소 연결"
```

---

### Task 6: 홈(읽기 계획과 진도)

**Files:**
- Create: `mobile/src/home/{HomeScreen,PlanSheet}.tsx`
- Modify: `mobile/src/app/index.tsx`

- [ ] **Step 1: 계획 시트**

```tsx path=mobile/src/home/PlanSheet.tsx
import { Text } from 'react-native'
import { PER_DAY_CHOICES, type PlanKind, type ReadingPlan } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const kindOptions: SegmentOption<PlanKind>[] = [
  { value: 'chapter', label: '하루 한 장' },
  { value: 'scenes', label: '하루 장면' },
  { value: 'free', label: '자유' },
]

const perDayOptions: SegmentOption<number>[] = PER_DAY_CHOICES.map((count) => ({ value: count, label: `${count}개` }))

export default function PlanSheet({ plan, onChange, onClose }: { plan: ReadingPlan; onChange: (plan: ReadingPlan) => void; onClose: () => void }) {
  const { palette } = useSettings()
  return (
    <Sheet title="읽기 계획" closeLabel="읽기 계획 닫기" onClose={onClose}>
      <Segments label="계획" options={kindOptions} value={plan.kind} onChange={(kind) => onChange({ ...plan, kind })} />
      {plan.kind === 'scenes' && (
        <Segments label="하루 장면 수" options={perDayOptions} value={plan.perDay} onChange={(perDay) => onChange({ ...plan, perDay })} />
      )}
      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        오늘 읽을 곳과 남은 날은 읽은 장면으로 셉니다. 하루 동안은 오늘 분량이 바뀌지 않아요. 계획은 이 기기에 저장되고, 로그인하면 다른 기기와 같아져요.
      </Text>
    </Sheet>
  )
}
```

- [ ] **Step 2: 홈 화면**

```tsx path=mobile/src/home/HomeScreen.tsx
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildRoute,
  countMarks,
  findSceneIndex,
  hueOf,
  initialPosition,
  koreanDateLabel,
  koreanDayLabel,
  localDay,
  metCharacters,
  planSummary,
  readingStreak,
  readUpToChapter,
  timelineLayout,
  type Bundle,
  type PlanChapterStatus,
  type PlanSummary,
  type ReadingPlan,
} from 'reader-core'
import { imageSource } from '../content/bundle'
import { savePlan, useMarks, usePlan, useReadScenes, useSavedPosition } from '../data/reading'
import { goToReader } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors, type Palette } from '../theme/palette'
import Icon, { type IconName } from '../ui/Icon'
import PlanSheet from './PlanSheet'

// 앱 첫 화면: 오늘의 읽기, 이어 읽기, 계획 진도, 바로 가기
export default function HomeScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const [planOpen, setPlanOpen] = useState(false)
  const now = new Date()
  const today = localDay(now)
  const { ids: readIds, days } = useReadScenes()
  const plan = usePlan()
  const marks = useMarks()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const sceneIndex = findSceneIndex(chapter.scenes, position.verse)
  const scene = chapter.scenes[sceneIndex]!
  const summary = planSummary(plan, bundle.chapters, days, today)
  const streak = readingStreak(new Set([...days.values()].filter((day): day is string => day !== null)), today)
  const met = metCharacters(bundle.characters, readUpToChapter(bundle.chapters, readIds, position.chapter))
  const visited = buildRoute(bundle.chapters, bundle.places, scene.id).visited
  const counts = countMarks(marks)
  const bars = timelineLayout(bundle.characters, bundle.eras, { height: 1 }).bars
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), palette)
  const first = bundle.chapters[0]!.chapter
  const last = bundle.chapters.at(-1)!.chapter

  const shortcuts: { icon: IconName; title: string; detail: string; onPress: () => void }[] = [
    {
      icon: 'timeline',
      title: '연표',
      detail: bars.length > 1 ? `${bars[0]!.name}부터 ${bars.at(-1)!.name}까지` : '인물이 늘면 보여요',
      onPress: () => goToReader(router, undefined, { overlay: 'timeline' }),
    },
    {
      icon: 'map',
      title: '여정 지도',
      detail: visited.length > 0 ? `${visited.slice(-2).map((place) => place.name).join(' → ')} · 지나온 곳 ${visited.length}` : '아직 지나온 곳이 없어요',
      onPress: () => goToReader(router, undefined, { overlay: 'map' }),
    },
    { icon: 'person', title: '인물 사전', detail: `만난 인물 ${met.length}명`, onPress: () => router.push('/people') },
    { icon: 'tree', title: '가계도', detail: met.length > 0 ? `${met[0]!.name}의 후손` : '2장부터 시작돼요', onPress: () => router.push('/genealogy') },
    {
      icon: 'note',
      title: '내 메모',
      detail: `밑줄 ${counts.highlights} · 메모 ${counts.notes}${counts.bookmarks ? ` · 즐겨찾기 ${counts.bookmarks}` : ''}`,
      onPress: () => router.push('/notes'),
    },
    { icon: 'search', title: '검색', detail: '본문·낱말·설정집·장면', onPress: () => router.push('/search') },
  ]

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.date, { color: palette.inkSoft }]}>{koreanDateLabel(now)}</Text>
            <Text style={[styles.heading, { color: palette.ink }]} accessibilityRole="header">
              오늘의 읽기
            </Text>
          </View>
          {streak > 0 && (
            <View style={[styles.streak, { backgroundColor: palette.warnSoft }]} accessibilityLabel={`연속 ${streak}일째 읽는 중`}>
              <Icon name="flame" size={14} color={palette.warn} filled />
              <Text style={[styles.streakText, { color: palette.warn }]}>{streak}일째</Text>
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`이어 읽기. 창세기 ${position.chapter}장 ${position.verse}절, ${scene.title}`}
          onPress={() => router.push('/read')}
          style={[styles.continue, { backgroundColor: placeholder.background }]}
        >
          {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <LinearGradient colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.6)']} style={styles.continueShade}>
            <Text style={styles.continueLabel}>
              이어 읽기 · 창세기 {position.chapter}장 {position.verse}절부터
            </Text>
            <Text style={styles.continueTitle} numberOfLines={1}>
              {scene.title}
            </Text>
          </LinearGradient>
          <Text style={styles.continueBadge}>
            {chapter.chapter}장 · 장면 {sceneIndex + 1}/{chapter.scenes.length}
          </Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <View style={styles.planHead}>
            <Text style={[styles.planTitle, { color: palette.ink }]}>{planTitle(plan)}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPlanOpen(true)} hitSlop={8}>
              <Text style={[styles.planEdit, { color: palette.accent }]}>계획 바꾸기</Text>
            </Pressable>
          </View>
          <Text style={[styles.planDetail, { color: palette.inkSoft }]}>{planDetail(bundle.book, first, last, summary)}</Text>
          <View style={styles.squares} accessibilityLabel="장별 진도">
            {summary.chapters.map((item) => (
              <ChapterSquare key={item.chapter} chapter={item.chapter} status={item.status} palette={palette} />
            ))}
          </View>
          <Text style={[styles.planNote, { color: palette.inkSoft }]}>{todayNote(plan, summary)}</Text>
        </View>

        <View style={styles.grid}>
          {shortcuts.map((item) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.detail}`}
              onPress={item.onPress}
              style={({ pressed }) => [styles.tile, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon name={item.icon} size={22} color={palette.accent} />
              <Text style={[styles.tileTitle, { color: palette.ink }]}>{item.title}</Text>
              <Text style={[styles.tileDetail, { color: palette.inkSoft }]} numberOfLines={1}>
                {item.detail}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {planOpen && <PlanSheet plan={plan} onChange={savePlan} onClose={() => setPlanOpen(false)} />}
    </View>
  )
}

function planTitle(plan: ReadingPlan): string {
  if (plan.kind === 'chapter') return '하루 한 장 계획'
  if (plan.kind === 'scenes') return `하루 장면 ${plan.perDay}개 계획`
  return '자유롭게 읽기'
}

function planDetail(book: string, first: number, last: number, summary: PlanSummary): string {
  const range = `${book} ${first}~${last}장`
  if (summary.allDone) return `${range} · 다 읽었어요`
  if (summary.remainingDays === null) return range
  const finish = summary.finishDay ? ` · ${koreanDayLabel(summary.finishDay)} 완독` : ''
  return `${range} · ${summary.remainingDays}일 남음${finish}`
}

function todayNote(plan: ReadingPlan, summary: PlanSummary): string {
  if (summary.allDone) return '끝까지 다 읽었어요. 목차에서 다시 읽고 싶은 장면을 골라 보세요.'
  if (summary.todayDone) return '오늘 분량을 다 읽었어요. 내일 이어서 읽어요.'
  const minutes = summary.todayAudioMs > 0 ? Math.max(1, Math.round(summary.todayAudioMs / 60000)) : 0
  const listen = minutes > 0 ? ` 낭독으로 들으면 ${minutes}분쯤 걸려요.` : ''
  const first = summary.today[0]
  if (!first) return ''
  if (plan.kind === 'chapter') return `오늘은 ${first.chapter}장이에요. 장면 ${summary.today.length}개.${listen}`
  if (plan.kind === 'scenes') return `오늘은 '${first.scene.title}'부터 장면 ${summary.today.length}개예요.${listen}`
  return `다음 장면은 '${first.scene.title}'이에요.${listen}`
}

function ChapterSquare({ chapter, status, palette }: { chapter: number; status: PlanChapterStatus; palette: Palette }) {
  const style =
    status === 'done'
      ? { backgroundColor: palette.accent, borderColor: palette.accent, color: palette.paper }
      : status === 'today'
        ? { backgroundColor: palette.accentSoft, borderColor: palette.accent, color: palette.accent }
        : { backgroundColor: palette.line, borderColor: palette.line, color: palette.inkFaint }
  const label = status === 'done' ? '다 읽음' : status === 'today' ? '오늘' : '아직'
  return (
    <View style={[styles.square, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]} accessibilityLabel={`${chapter}장 ${label}`}>
      <Text style={[styles.squareText, { color: style.color, fontWeight: status === 'todo' ? '400' : '700' }]}>{chapter}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headerText: { gap: 2 },
  date: { fontSize: 13 },
  heading: { fontFamily: fonts.serifBold, fontSize: 24 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  streakText: { fontSize: 12, fontWeight: '700' },
  continue: { height: 220, borderRadius: 18, overflow: 'hidden' },
  continueShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40, paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  continueLabel: { color: '#ffffff', fontSize: 12, opacity: 0.9 },
  continueTitle: { color: '#ffffff', fontFamily: fonts.serifBold, fontSize: 20 },
  continueBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#ffffff',
    fontSize: 11,
  },
  card: { padding: 16, borderRadius: 16, gap: 10 },
  planHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  planTitle: { fontSize: 14, fontWeight: '700' },
  planEdit: { fontSize: 13 },
  planDetail: { fontSize: 12 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  square: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  squareText: { fontSize: 11 },
  planNote: { fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, padding: 14, borderRadius: 16, gap: 6 },
  tileTitle: { fontSize: 14, fontWeight: '700' },
  tileDetail: { fontSize: 12 },
})
```

```tsx path=mobile/src/app/index.tsx
import { BundleGate } from '../content/BundleGate'
import HomeScreen from '../home/HomeScreen'

export default function IndexRoute() {
  return <BundleGate render={(bundle) => <HomeScreen bundle={bundle} />} />
}
```

- [ ] **Step 3: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 홈 — 오늘의 읽기, 연속 읽기, 이어 읽기, 읽기 계획과 장별 진도, 바로 가기"
```

---

### Task 7: 내 메모와 검색

**Files:**
- Create: `mobile/src/ui/ScreenHeader.tsx`, `mobile/src/notes/NotesScreen.tsx`, `mobile/src/search/{Highlighted,CanonCard,SearchScreen}.tsx`, `mobile/src/app/{notes,search}.tsx`

- [ ] **Step 1: 화면 머리(경로 화면용)**

```tsx path=mobile/src/ui/ScreenHeader.tsx
import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { goBack } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { OverlayHeader } from './OverlayScreen'

// 홈에서 연 화면(메모, 인물 사전, 가계도)의 머리. 뒤로 가기는 앞 화면으로, 없으면 홈으로 간다.
export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top, backgroundColor: palette.paper, borderBottomColor: palette.line }]}>
      <OverlayHeader title={title} backLabel="뒤로" onBack={() => goBack(router)} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
})
```

- [ ] **Step 2: 내 메모**

```tsx path=mobile/src/notes/NotesScreen.tsx
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { countMarks, type Bundle, type Mark } from 'reader-core'
import { useMarks } from '../data/reading'
import { goToReader } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { fonts, markColor } from '../theme/palette'
import Icon from '../ui/Icon'
import { ScreenHeader } from '../ui/ScreenHeader'

type Filter = 'all' | 'highlight' | 'note' | 'bookmark'

const matches: Record<Filter, (mark: Mark) => boolean> = {
  all: () => true,
  highlight: (mark) => mark.color !== null,
  note: (mark) => mark.note.trim() !== '',
  bookmark: (mark) => mark.bookmark,
}

// 내 밑줄·메모·즐겨찾기 목록. 누르면 그 절로 간다.
export default function NotesScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const marks = useMarks()
  const [filter, setFilter] = useState<Filter>('all')
  const counts = countMarks(marks)
  const shown = marks.filter(matches[filter])
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: `전체 ${marks.length}` },
    { id: 'highlight', label: `밑줄 ${counts.highlights}` },
    { id: 'note', label: `메모 ${counts.notes}` },
    { id: 'bookmark', label: `즐겨찾기 ${counts.bookmarks}` },
  ]

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="밑줄과 메모" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.chips}>
          {chips.map((chip) => {
            const selected = chip.id === filter
            return (
              <Pressable
                key={chip.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(chip.id)}
                style={[styles.chip, selected ? { backgroundColor: palette.accent } : { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}
              >
                <Text style={[styles.chipText, { color: selected ? palette.paper : palette.inkSoft, fontWeight: selected ? '700' : '400' }]}>{chip.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: palette.inkFaint }]}>
            {marks.length === 0 ? '본문의 절을 길게 누르면 밑줄과 메모를 남길 수 있어요.' : '이 갈래에는 아직 없어요.'}
          </Text>
        ) : (
          shown.map((mark) => {
            const text = bundle.chapters.find((c) => c.chapter === mark.chapter)?.verses.find((v) => v.verse === mark.verse)?.text ?? ''
            return (
              <Pressable
                key={`${mark.chapter}:${mark.verse}`}
                accessibilityRole="button"
                accessibilityLabel={`창세기 ${mark.chapter}장 ${mark.verse}절로 가기`}
                onPress={() => goToReader(router, from, { position: { chapter: mark.chapter, verse: mark.verse } })}
                style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.rowHead}>
                  <Text style={[styles.reference, { color: palette.inkSoft }]}>
                    창세기 {mark.chapter}장 {mark.verse}절
                  </Text>
                  {mark.bookmark && <Icon name="bookmark" size={14} color={palette.accent} filled />}
                </View>
                <Text style={[styles.verse, { color: palette.ink }]}>
                  <Text style={mark.color ? { backgroundColor: markColor(mark.color, palette) } : undefined}>{text}</Text>
                </Text>
                {mark.note.trim() ? (
                  <View style={[styles.note, { borderLeftColor: palette.accent }]}>
                    <Text style={[styles.noteText, { color: palette.ink }]}>{mark.note}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: 13 },
  empty: { marginTop: 24, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  row: { padding: 14, borderRadius: 14, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reference: { fontSize: 12 },
  verse: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24 },
  note: { paddingLeft: 10, borderLeftWidth: 2 },
  noteText: { fontSize: 14, lineHeight: 21 },
})
```

```tsx path=mobile/src/app/notes.tsx
import { BundleGate } from '../content/BundleGate'
import NotesScreen from '../notes/NotesScreen'

export default function NotesRoute() {
  return <BundleGate render={(bundle) => <NotesScreen bundle={bundle} />} />
}
```

- [ ] **Step 3: 검색 부품**

```tsx path=mobile/src/search/Highlighted.tsx
import { Text, type StyleProp, type TextStyle } from 'react-native'
import type { TextRange } from 'reader-core'

// 찾은 자리를 칠한 글. range가 없으면 그냥 글이다.
export function Highlighted({
  text,
  range,
  style,
  highlight,
  numberOfLines,
}: {
  text: string
  range: TextRange | null
  style?: StyleProp<TextStyle>
  highlight: TextStyle
  numberOfLines?: number
}) {
  if (!range) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    )
  }
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {text.slice(0, range.start)}
      <Text style={highlight}>{text.slice(range.start, range.end)}</Text>
      {text.slice(range.end)}
    </Text>
  )
}
```

```tsx path=mobile/src/search/CanonCard.tsx
import { Text, View } from 'react-native'
import { paragraphs, type Era, type Thing } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

// 검색에서 연 시대·물건 카드(인물·장소는 읽기 화면과 같은 EntityCard를 쓴다)
export default function CanonCard({ item, onClose }: { item: { kind: 'era'; era: Era } | { kind: 'thing'; thing: Thing }; onClose: () => void }) {
  const { palette } = useSettings()
  const title = item.kind === 'era' ? item.era.name : item.thing.name
  const body = paragraphs(item.kind === 'era' ? item.era.description : item.thing.description)
  return (
    <Sheet title={title} closeLabel={`${title} 카드 닫기`} onClose={onClose}>
      <Text style={[sheetStyles.note, { color: palette.accent }]}>{item.kind === 'era' ? '시대' : '물건'} · 설정집 검수됨</Text>
      <View style={sheetStyles.explanation}>
        {body.map((paragraph, index) => (
          <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
            {paragraph}
          </Text>
        ))}
      </View>
      {item.kind === 'thing' && item.thing.details.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            본문이 말하는 것
          </Text>
          {item.thing.details.map((detail, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              {detail}
            </Text>
          ))}
        </>
      )}
      {item.kind === 'era' && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
          본문 범위 {item.era.range.from} ~ {item.era.range.to}
        </Text>
      )}
      {item.kind === 'thing' && item.thing.sources.length > 0 && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>본문 근거: {item.thing.sources.join(', ')}</Text>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 4: 검색 화면**

```tsx path=mobile/src/search/SearchScreen.tsx
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { searchBundle, type Bundle, type CanonHit, type Entity, type Era, type Thing } from 'reader-core'
import { imageSource } from '../content/bundle'
import { goBack, goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { kv } from '../storage/kv'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import CanonCard from './CanonCard'
import { Highlighted } from './Highlighted'

type Kind = 'all' | 'verses' | 'glosses' | 'canon' | 'scenes'
const recentKey = 'recent-searches'
const canonLabel: Record<CanonHit['kind'], string> = { character: '인물', place: '장소', era: '시대', thing: '물건' }

function loadRecent(): string[] {
  try {
    const value: unknown = JSON.parse(kv.getItem(recentKey) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

// 본문·낱말 풀이·설정집·장면 검색. 기기에서 묶음을 바로 훑는다(띄어쓰기 무시, 초성 검색).
export default function SearchScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [recent, setRecent] = useState(loadRecent)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [card, setCard] = useState<{ kind: 'era'; era: Era } | { kind: 'thing'; thing: Thing } | null>(null)
  const results = useMemo(() => searchBundle(bundle, query), [bundle, query])
  const highlight = { backgroundColor: palette.warnSoft, color: palette.accent }

  function remember() {
    const word = query.trim()
    if (!word) return
    const next = [word, ...recent.filter((item) => item !== word)].slice(0, 8)
    setRecent(next)
    try {
      kv.setItem(recentKey, JSON.stringify(next))
    } catch {
      // 최근 검색어는 저장하지 못해도 괜찮다.
    }
  }

  function openVerse(chapter: number, verse: number) {
    remember()
    goToReader(router, from, { position: { chapter, verse } })
  }

  function openCanon(hit: CanonHit) {
    remember()
    if (hit.kind === 'character' || hit.kind === 'place') setEntity({ kind: hit.kind, id: hit.id })
    else if (hit.kind === 'era') {
      const era = bundle.eras.find((item) => item.id === hit.id)
      if (era) setCard({ kind: 'era', era })
    } else {
      const thing = bundle.things.find((item) => item.id === hit.id)
      if (thing) setCard({ kind: 'thing', thing })
    }
  }

  const tabs: { id: Kind; label: string; count: number }[] = [
    { id: 'all', label: '전체', count: results.total },
    { id: 'verses', label: '본문', count: results.verses.length },
    { id: 'glosses', label: '낱말', count: results.glosses.length },
    { id: 'canon', label: '설정집', count: results.canon.length },
    { id: 'scenes', label: '장면', count: results.scenes.length },
  ]
  const show = (section: Kind) => kind === 'all' || kind === section

  return (
    <View style={[styles.root, { backgroundColor: palette.paper, paddingTop: insets.top + 12 }]}>
      <View style={styles.bar}>
        <View style={[styles.field, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Icon name="search" size={18} color={palette.inkFaint} />
          <TextInput
            accessibilityLabel="검색어"
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={remember}
            placeholder="본문, 낱말, 인물, 장면"
            placeholderTextColor={palette.inkFaint}
            returnKeyType="search"
            style={[styles.input, { color: palette.ink }]}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={() => goBack(router)} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: palette.inkSoft }]}>취소</Text>
        </Pressable>
      </View>

      {query.trim() ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsBar}>
            {tabs.map((tab) => {
              const selected = tab.id === kind
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setKind(tab.id)}
                  style={[styles.tab, selected ? { backgroundColor: palette.accent } : { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}
                >
                  <Text style={[styles.tabText, { color: selected ? palette.paper : palette.inkSoft, fontWeight: selected ? '700' : '400' }]}>
                    {tab.label} {tab.count}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 24 }]}>
            {results.total === 0 && <Text style={[styles.empty, { color: palette.inkFaint }]}>찾는 말이 없어요. 띄어쓰기 없이, 또는 초성(ㄱㅇ)으로도 찾아보세요.</Text>}

            {show('verses') && results.verses.length > 0 && (
              <Section title="본문" palette={palette}>
                {results.verses.map((hit) => (
                  <Pressable key={`${hit.chapter}:${hit.verse}`} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verse)} style={[styles.item, { backgroundColor: palette.surface }]}>
                    <Text style={[styles.meta, { color: palette.inkSoft }]}>
                      창세기 {hit.chapter}:{hit.verse} · {hit.sceneTitle}
                    </Text>
                    <Highlighted text={hit.text} range={hit.match} style={[styles.verse, { color: palette.ink }]} highlight={highlight} />
                  </Pressable>
                ))}
              </Section>
            )}

            {show('glosses') && results.glosses.length > 0 && (
              <Section title="낱말 풀이" palette={palette}>
                {results.glosses.map((hit, index) => (
                  <Pressable key={`${hit.chapter}:${hit.verse}:${index}`} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verse)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                    <View style={styles.itemText}>
                      <Highlighted text={hit.word} range={hit.wordMatch} style={[styles.name, { color: palette.ink }]} highlight={highlight} />
                      <Highlighted text={hit.meaning} range={hit.meaningMatch} style={[styles.summary, { color: palette.inkSoft }]} highlight={highlight} />
                    </View>
                    <Text style={[styles.side, { color: palette.inkFaint }]}>
                      {hit.chapter}:{hit.verse}
                    </Text>
                  </Pressable>
                ))}
              </Section>
            )}

            {show('canon') && results.canon.length > 0 && (
              <Section title="설정집" palette={palette}>
                {results.canon.map((hit) => (
                  <Pressable key={`${hit.kind}:${hit.id}`} accessibilityRole="button" onPress={() => openCanon(hit)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                    <View style={styles.itemText}>
                      <Text style={[styles.name, { color: palette.ink }]}>
                        <Highlighted text={hit.name} range={hit.nameMatch} highlight={highlight} />
                        <Text style={[styles.reviewed, { color: palette.ok }]}> 검수됨</Text>
                      </Text>
                      <Highlighted text={hit.summary} range={hit.summaryMatch} style={[styles.summary, { color: palette.inkSoft }]} highlight={highlight} numberOfLines={2} />
                    </View>
                    <Text style={[styles.side, { color: palette.inkFaint }]}>{canonLabel[hit.kind]}</Text>
                  </Pressable>
                ))}
              </Section>
            )}

            {show('scenes') && results.scenes.length > 0 && (
              <Section title="장면" palette={palette}>
                {results.scenes.map((hit) => {
                  const scene = bundle.chapters.find((c) => c.chapter === hit.chapter)?.scenes.find((s) => s.id === hit.sceneId)
                  const image = imageSource(scene && bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
                  return (
                    <Pressable key={hit.sceneId} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verseStart)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                      <View style={[styles.thumb, { backgroundColor: palette.accentSoft }]}>
                        {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
                      </View>
                      <View style={styles.itemText}>
                        <Highlighted text={hit.title} range={hit.titleMatch} style={[styles.sceneTitle, { color: palette.ink }]} highlight={highlight} />
                        <Text style={[styles.summary, { color: palette.inkSoft }]} numberOfLines={2}>
                          {hit.chapter}:{hit.verseStart}~{hit.verseEnd}절 · <Highlighted text={hit.summary} range={hit.summaryMatch} highlight={highlight} />
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </Section>
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.recent}>
          {recent.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: palette.inkFaint }]}>최근 검색</Text>
              <View style={styles.recentList}>
                {recent.map((word) => (
                  <Pressable key={word} accessibilityRole="button" onPress={() => setQuery(word)} style={[styles.tab, { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}>
                    <Text style={[styles.tabText, { color: palette.inkSoft }]}>{word}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={[styles.empty, { color: palette.inkFaint }]}>띄어쓰기는 무시하고 찾아요. 초성만 써도 돼요(예: ㄱㅇ → 가인).</Text>
          )}
        </View>
      )}

      {entity && (
        <EntityCard
          key={`${entity.kind}-${entity.id}`}
          entity={entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={[]}
          onOpenEntity={setEntity}
          onOpenMap={() => {
            setEntity(null)
            goToReader(router, from, { overlay: 'map' })
          }}
          onClose={() => setEntity(null)}
        />
      )}
      {card && <CanonCard item={card} onClose={() => setCard(null)} />}
    </View>
  )
}

function Section({ title, palette, children }: { title: string; palette: { inkFaint: string }; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.inkFaint }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  cancel: { height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  cancelText: { fontSize: 14 },
  tabsBar: { flexGrow: 0, marginTop: 12 },
  tabs: { gap: 6, paddingHorizontal: 16 },
  tab: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  tabText: { fontSize: 13 },
  results: { padding: 16, gap: 16 },
  empty: { marginTop: 16, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '500' },
  item: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  meta: { fontSize: 12 },
  verse: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24 },
  name: { fontSize: 15, fontWeight: '700' },
  reviewed: { fontSize: 11, fontWeight: '500' },
  summary: { fontSize: 13, lineHeight: 19 },
  side: { fontSize: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  sceneTitle: { fontFamily: fonts.serifBold, fontSize: 15 },
  recent: { padding: 16, gap: 8 },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
```

```tsx path=mobile/src/app/search.tsx
import { BundleGate } from '../content/BundleGate'
import SearchScreen from '../search/SearchScreen'

export default function SearchRoute() {
  return <BundleGate render={(bundle) => <SearchScreen bundle={bundle} />} />
}
```

- [ ] **Step 5: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 내 밑줄·메모 목록과 검색(본문·낱말·설정집·장면, 초성, 최근 검색)"
```

---

### Task 8: 인물 사전과 가계도

**Files:**
- Create: `mobile/src/people/{PeopleScreen,GenealogyScreen}.tsx`, `mobile/src/app/{people,genealogy}.tsx`

- [ ] **Step 1: 인물 사전**

```tsx path=mobile/src/people/PeopleScreen.tsx
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { chapterOfReference, initialPosition, metCharacters, readUpToChapter, yearsLabel, type Bundle, type Entity } from 'reader-core'
import { useReadScenes, useSavedPosition } from '../data/reading'
import { goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

// 읽은 장까지 만난 인물. 처음 나온 장으로 묶고, 누르면 인물 카드가 열린다.
export default function PeopleScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { ids } = useReadScenes()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const upTo = readUpToChapter(bundle.chapters, ids, position.chapter)
  const people = metCharacters(bundle.characters, upTo)
  const [entity, setEntity] = useState<Entity | null>(null)
  const groups = new Map<number, typeof people>()
  for (const person of people) {
    const chapter = chapterOfReference(person.firstAppearance)
    groups.set(chapter, [...(groups.get(chapter) ?? []), person])
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="인물 사전" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>
          {upTo}장까지 만난 인물 {people.length}명. 아직 읽지 않은 장의 인물은 그 장을 읽으면 나타나요.
        </Text>
        {[...groups.entries()].map(([chapter, list]) => (
          <View key={chapter} style={styles.group}>
            <Text style={[styles.groupTitle, { color: palette.accent }]} accessibilityRole="header">
              {chapter}장에서 만남
            </Text>
            {list.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`${person.name} 인물 카드 보기`}
                onPress={() => setEntity({ kind: 'character', id: person.id })}
                style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.name, { color: palette.ink }]}>{person.name}</Text>
                <Text style={[styles.detail, { color: palette.inkSoft }]} numberOfLines={1}>
                  {yearsLabel(person.years) ?? `처음 나옴 ${person.firstAppearance}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      {entity && (
        <EntityCard
          key={`${entity.kind}-${entity.id}`}
          entity={entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={[]}
          onOpenEntity={setEntity}
          onOpenMap={() => {
            setEntity(null)
            goToReader(router, undefined, { overlay: 'map' })
          }}
          onClose={() => setEntity(null)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  intro: { fontSize: 13, lineHeight: 20 },
  group: { gap: 6 },
  groupTitle: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  name: { fontFamily: fonts.serifBold, fontSize: 16 },
  detail: { flexShrink: 1, fontSize: 12 },
})
```

- [ ] **Step 2: 가계도**

```tsx path=mobile/src/people/GenealogyScreen.tsx
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildFamilyTree,
  findSceneIndex,
  initialPosition,
  metCharacters,
  readUpToChapter,
  type Bundle,
  type Character,
  type Entity,
  type FamilyNode,
} from 'reader-core'
import { useReadScenes, useSavedPosition } from '../data/reading'
import { goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { fonts, type Palette } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

// 가지 한 줄의 폭과 가지 사이
const COLUMN = 116
const GAP = 10

type Context = {
  byId: Map<string, Character>
  // 지금 장면에 나오는 인물. 진하게 칠한다.
  strong: Set<string>
  palette: Palette
  open: (id: string) => void
}

// 자손이 있는 자식이 둘 이상이면 옆으로 나란히, 하나면 아래로 이어 쓴다.
function branchesOf(node: FamilyNode): FamilyNode[] {
  return node.children.filter((child) => child.children.length > 0)
}

function widthOf(node: FamilyNode): number {
  const branches = branchesOf(node)
  if (branches.length >= 2) return node.children.reduce((sum, child) => sum + widthOf(child), 0) + GAP * (node.children.length - 1)
  if (branches.length === 1) return Math.max(COLUMN, widthOf(branches[0]!))
  return COLUMN
}

function yearsShort(person: Character): string {
  const { born, died } = person.years
  if (born === null) return `처음 ${person.firstAppearance}`
  return died === null ? `${born} ~` : `${born} ~ ${died}`
}

// 읽은 장까지의 인물로 그린 가계도. 이름을 누르면 인물 카드가 열린다.
export default function GenealogyScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { ids } = useReadScenes()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const upTo = readUpToChapter(bundle.chapters, ids, position.chapter)
  const visible = new Set(metCharacters(bundle.characters, upTo).map((person) => person.id))
  const roots = buildFamilyTree(bundle.characters, visible).filter((root) => root.children.length > 0 || root.spouses.length > 0)
  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const scene = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const [entity, setEntity] = useState<Entity | null>(null)
  const context: Context = {
    byId: new Map(bundle.characters.map((person) => [person.id, person])),
    strong: new Set(scene.characters),
    palette,
    open: (id) => setEntity({ kind: 'character', id }),
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="가계도" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>
          {upTo}장까지 · 창조 원년 기준 연도. 이름을 누르면 인물 카드가 열려요. 아직 읽지 않은 장의 인물은 가려 두었어요.
        </Text>
        {roots.length === 0 ? (
          <Text style={[styles.empty, { color: palette.inkFaint }]}>사람의 족보는 2장부터 시작돼요. 읽어 나가면 가계도가 자라요.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tree}>
            <View style={styles.roots}>
              {roots.map((root) => (
                <Branch key={root.id} node={root} context={context} root />
              ))}
            </View>
          </ScrollView>
        )}
        <Text style={[styles.note, { color: palette.inkFaint }]}>
          연도는 5장의 나이를 더해 계산했고, 번역과 사본에 따라 수치가 다를 수 있어요. 같은 이름(에녹, 라멕)은 아버지가 달라 다른 가지에 있어요.
        </Text>
      </ScrollView>
      {entity && (
        <EntityCard
          key={`${entity.kind}-${entity.id}`}
          entity={entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={scene.characters}
          onOpenEntity={setEntity}
          onOpenMap={() => {
            setEntity(null)
            goToReader(router, undefined, { overlay: 'map' })
          }}
          onClose={() => setEntity(null)}
        />
      )}
    </View>
  )
}

function Branch({ node, context, root = false }: { node: FamilyNode; context: Context; root?: boolean }) {
  const branches = branchesOf(node)
  const leaves = node.children.filter((child) => child.children.length === 0)
  return (
    <View style={[styles.branch, { width: widthOf(node) }]}>
      <PersonRow node={node} context={context} root={root} />
      {node.children.length > 0 && <Stem context={context} />}
      {branches.length >= 2 ? (
        <Columns nodes={node.children} context={context} />
      ) : branches.length === 1 ? (
        <>
          {leaves.length > 0 && <Pills ids={leaves.map((leaf) => leaf.id)} context={context} label="다른 자녀" />}
          <Branch node={branches[0]!} context={context} />
        </>
      ) : (
        <Pills ids={leaves.map((leaf) => leaf.id)} context={context} />
      )}
    </View>
  )
}

function Columns({ nodes, context }: { nodes: FamilyNode[]; context: Context }) {
  const first = widthOf(nodes[0]!)
  const last = widthOf(nodes.at(-1)!)
  return (
    <View>
      <View style={[styles.rail, { left: first / 2, right: last / 2, backgroundColor: context.palette.line }]} />
      <View style={styles.columns}>
        {nodes.map((child) => (
          <View key={child.id} style={{ width: widthOf(child), alignItems: 'center' }}>
            <Stem context={context} />
            <Branch node={child} context={context} />
          </View>
        ))}
      </View>
    </View>
  )
}

function PersonRow({ node, context, root }: { node: FamilyNode; context: Context; root: boolean }) {
  const person = context.byId.get(node.id)
  if (!person) return null
  const mates = node.spouses.map((id) => context.byId.get(id)).filter((mate): mate is Character => mate !== undefined)
  // 뿌리 부부(아담과 하와)는 나란히, 나머지 인물의 아내·남편은 이름 아래에 적는다.
  return (
    <View style={styles.couple}>
      <PersonCard person={person} context={context} subtitle={!root && mates.length > 0 ? `${person.gender === '여' ? '남편' : '아내'} ${mates.map((mate) => mate.name).join(' · ')}` : undefined} />
      {root &&
        mates.map((mate) => (
          <View key={mate.id} style={styles.couple}>
            <View style={[styles.marriage, { backgroundColor: context.palette.line }]} />
            <PersonCard person={mate} context={context} />
          </View>
        ))}
    </View>
  )
}

function PersonCard({ person, context, subtitle }: { person: Character; context: Context; subtitle?: string }) {
  const { palette } = context
  const strong = context.strong.has(person.id)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.name}${strong ? ', 이 장면에 나와요' : ''}. 인물 카드 보기`}
      onPress={() => context.open(person.id)}
      style={[styles.card, { borderColor: strong ? palette.accent : palette.line, backgroundColor: strong ? palette.accent : palette.surface }]}
    >
      <Text style={[styles.cardName, { color: strong ? palette.paper : palette.ink }]}>{person.name}</Text>
      <Text style={[styles.cardDetail, { color: strong ? palette.accentSoft : palette.inkSoft }]} numberOfLines={1}>
        {subtitle ?? yearsShort(person)}
      </Text>
    </Pressable>
  )
}

function Pills({ ids, context, label }: { ids: string[]; context: Context; label?: string }) {
  const { palette } = context
  return (
    <View style={styles.pillsBox}>
      {label ? <Text style={[styles.pillsLabel, { color: palette.inkFaint }]}>{label}</Text> : null}
      <View style={styles.pills}>
        {ids.map((id) => {
          const person = context.byId.get(id)
          if (!person) return null
          return (
            <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${person.name} 인물 카드 보기`} onPress={() => context.open(id)} style={[styles.pill, { backgroundColor: palette.accentSoft }]}>
              <Text style={[styles.pillText, { color: palette.accent }]}>{person.name}</Text>
            </Pressable>
          )
        })}
      </View>
      {label ? <Stem context={context} /> : null}
    </View>
  )
}

function Stem({ context }: { context: Context }) {
  return <View style={[styles.stem, { backgroundColor: context.palette.line }]} />
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  intro: { fontSize: 12, lineHeight: 19 },
  empty: { marginTop: 16, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  tree: { paddingVertical: 8 },
  roots: { gap: 28 },
  branch: { alignItems: 'center' },
  couple: { flexDirection: 'row', alignItems: 'center' },
  marriage: { width: 14, height: 2 },
  card: { width: COLUMN - 12, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
  cardName: { fontFamily: fonts.serifBold, fontSize: 14 },
  cardDetail: { fontSize: 10 },
  stem: { width: 2, height: 12 },
  rail: { position: 'absolute', top: 0, height: 2 },
  columns: { flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  pillsBox: { alignItems: 'center', gap: 4 },
  pillsLabel: { fontSize: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, maxWidth: COLUMN * 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11 },
  note: { fontSize: 11, lineHeight: 17 },
})
```

```tsx path=mobile/src/app/people.tsx
import { BundleGate } from '../content/BundleGate'
import PeopleScreen from '../people/PeopleScreen'

export default function PeopleRoute() {
  return <BundleGate render={(bundle) => <PeopleScreen bundle={bundle} />} />
}
```

```tsx path=mobile/src/app/genealogy.tsx
import { BundleGate } from '../content/BundleGate'
import GenealogyScreen from '../people/GenealogyScreen'

export default function GenealogyRoute() {
  return <BundleGate render={(bundle) => <GenealogyScreen bundle={bundle} />} />
}
```

- [ ] **Step 3: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 인물 사전과 가계도(읽은 장까지, 가지가 갈라지면 나란히)"
```

---

### Task 9: 확인과 문서

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-native-app-design.md`, `README.md`

- [ ] **Step 1: Expo 웹으로 확인**

`npm run pipeline -- build && npm run content -w mobile` 뒤 `mobile-web` 미리 보기를 다시 띄운다(새 묶음을 Metro가 읽게). 숨은 창에서는 화면 캡처로 그리기를 일으킨 뒤 본다.

1. 홈: 날짜, "오늘의 읽기", 이어 읽기 카드(그림·장절·장면 제목), 계획 카드(10칸, 오늘 칸 테두리, 남은 날, 낭독 분), 바로 가기 6개.
2. 이어 읽기 → 읽기 화면이 저장된 절에서 열리고, 홈 단추로 돌아온다. 장면 끝까지 스크롤하면 홈의 연속 읽기 "1일째"가 보이고 계획 칸이 바뀐다.
3. 계획 바꾸기 → 하루 장면 3개로 바꾸면 제목·남은 날·오늘 안내가 바뀐다.
4. 절을 길게 눌러 노란 밑줄·메모·즐겨찾기를 저장하면 본문에 칠과 ✎, ★이 보이고, 홈의 내 메모 수가 바뀐다. 내 메모 목록에서 누르면 그 절로 간다.
5. 메모 시트의 "카드로 공유" → 카드 미리 보기가 그림·구절·장절로 그려진다(웹은 글 복사 안내).
6. 검색: "가죽옷", "가 죽 옷", "ㄱㅈㅇ"이 같은 본문 3:21을 찾고, 설정집 결과를 누르면 카드가 열린다. 본문 결과를 누르면 그 절로 간다(읽기 화면에서 연 검색이면 뒤로 돌아가며 옮긴다).
7. 연표·여정 지도 바로 가기 → 읽기 화면이 그 덮개를 연 채로 열린다.
8. 인물 사전·가계도: 읽은 장까지의 인물만 나오고, 가계도의 아담·하와 아래 가인·아벨·셋이 나란히, 셋 줄기가 노아까지 이어진다. 이름을 누르면 카드.
9. 새로 고침해도 밑줄·계획·위치가 남는다.

문제가 보이면 고친 뒤 다시 확인한다.

- [ ] **Step 2: 문서**

설계 문서 3절 "진행" 문단에 2단계 완료와 이 계획 머리의 "설계에서 바꾼 것" 다섯 가지를 적고, 6절 8·9번과 7절 표(`settings`는 동기화하지 않음, `activity` 없음, 읽은 날로 연속 읽기)를 그에 맞게 고친다. README의 네이티브 앱 절에 화면 목록(홈, 읽기, 내 메모, 검색, 인물 사전, 가계도)을 한 줄 더한다.

- [ ] **Step 3: 전체 시험과 커밋**

Run: `npm test && npm run typecheck -w mobile && npm run build -w app` → 모두 성공

```bash
git add README.md docs
git commit -m "docs: 네이티브 앱 2단계 완료와 바꾼 결정"
```
