# 네이티브 앱 5단계: 원어와 출처, 이해 확인 퀴즈, 질문하기, 서재 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목업 11~14를 앱에 넣는다. 절마다 히브리어 낱말(음역, 품사, 사전 번호, 검수된 한국어 뜻)과 자료 출처, 장마다 검수된 4지선다 퀴즈, 검수된 자료 안에서만 답하고 근거를 붙이는 질문하기, 책 목록(서재)이다.

**Architecture:** 파이프라인에 단계 셋을 더한다. `original`은 OSHB(형태 분석)와 스트롱 사전(XML)을 고정된 커밋에서 받아 장 1~10의 낱말과 사전 항목을 `content/original/`에 둔다. `original-gloss`는 사전 항목마다 한국어 뜻 초안을 LLM으로 쓰고, `quiz`는 장마다 문제를 쓰고 검수 모델이 근거 절을 확인한다. 사람이 관리 도구에서 승인한 뜻과 문제만 묶음에 들어간다. 동기화 서버에 `POST /ask`를 더한다. 묶음에서 대목을 찾아(글자 두 개 단위 겹침) LLM에 그 대목만 주고, 문장마다 근거가 없으면 답을 버리고 "자료에 없어요"로 바꾼다. 앱에는 원어 시트, 자료 출처, 퀴즈, 질문하기, 서재 화면을 더한다.

**Tech Stack:** OSHB morphhb(CC BY 4.0, 본문 WLC 퍼블릭 도메인), 스트롱 히브리어 사전 XML(퍼블릭 도메인), OpenAI Responses API(파이프라인과 같은 구조화 출력), Hono, PGlite, expo-router, vitest.

**설계:** `docs/superpowers/specs/2026-10-09-native-app-design.md` 6절 11~14, 8절, 10절, 11절

**설계에서 바꾸거나 새로 정하는 것:**
- 스트롱 사전은 openscriptures/strongs의 XML(`StrongHebrewG.xml`, 자체 표기 "Public Domain")을 쓴다. 같은 저장소의 JSON판은 "CC-BY-SA"라고 적혀 있어 쓰지 않는다. 쓰는 것은 원형, 음역, 스트롱 품사, 정의(explanation), KJV 번역어(translation)뿐이다(TWOT 번호와 개요는 쓰지 않는다).
- 두 자료는 고정된 커밋에서 받는다(재현). morphhb `3d15126f…`, strongs `0acd2f25…`.
- 낱말 표시는 칸틸레이션 부호(악센트)와 형태소 구분 `/`를 빼고 모음 부호는 둔다. 마켑으로 이어진 낱말도 따로 보인다.
- 원어 보기는 목업처럼 낱말 풀이에 붙이지 않고 절에 붙인다(설계 11). 절을 길게 눌러 여는 시트에 "원어 보기"를 둔다. 낱말을 누르면 사전 항목(원형, 음역, 품사, 한국어 뜻, 영어 정의, 창세기 1~10장에서 몇 번, 나오는 곳)을 보인다. 한국어 뜻이 아직 승인되지 않았으면 "뜻 검수 중"과 영어 정의를 보인다.
- 퀴즈는 장마다 승인된 문제가 셋 이상일 때 연다. 점수는 남기지 않고, 끝까지 풀면 `quizDone`(동기화됨)만 남긴다. 장의 끝과 목차의 장 머리에서 연다.
- 질문하기의 근거 대목은 본문 절, 검수(reviewed·approved)된 장면의 해설·역사 배경, 설정집(묶음에 든 승인 항목)이다. 하루 20번(한국 날짜 기준). 질문 기록은 기기에도 서버에도 남기지 않는다(그날 화면에만). "자료에 없어요"에는 가까운 대목 둘을 근거 표식으로 붙여 스스로 찾아볼 수 있게 한다.
- 서재의 다른 책(출애굽기, 룻기, 요나, 마가복음)은 앱 안에 적은 소개다. 창세기 카드의 장·장면 수와 읽은 장은 묶음과 기록에서 센다.
- 자료 출처 화면(`/sources`)은 묶음의 `sources`를 보인다. 개역한글판(위키문헌, 2012년 저작권 만료), WLC, OSHB, 스트롱 사전, Natural Earth, 그림 참고 작품(style.json의 출처), AI가 만든 것(그림, 낭독, 글)을 적는다. 설정 시트와 서재에서 연다.
- 홈 바로 가기에 "질문하기", "서재"를 더해 여덟 칸이 된다. 읽기 화면 머리에 질문하기 단추를 둔다.

---

## 데이터

`content/original/genesis.json` (original 단계, 커밋한다. OSHB CC BY 4.0)

```json
{ "chapters": [ { "chapter": 1, "verses": [ { "verse": 1, "words": [ { "text": "בְּרֵאשִׁית", "strong": "H7225", "morph": "HR/Ncfsa" } ] } ] } ] }
```

`content/original/lexicon.json` (original 단계가 만들고 original-gloss 단계와 관리 도구가 한국어 뜻을 채운다)

```json
{ "entries": [ { "strong": "H7225", "lemma": "רֵאשִׁית", "xlit": "rêʼshîyth", "pos": "n-f",
  "definition": "the first, in place, time, order or rank (specifically, a firstfruit)",
  "usage": "beginning, chief(-est), first(-fruits, part, time), principal thing.", "count": 3,
  "korean": { "meaning": "처음, 시작", "note": "", "status": "draft" } } ] }
```

`content/quiz/genesis-04.json` (quiz 단계, 관리 도구가 승인)

```json
{ "chapter": 4, "questions": [ { "id": "genesis-04-q1", "question": "가인은 무엇을 제물로 드렸나요?",
  "options": ["땅의 소산", "양의 첫 새끼와 그 기름", "정금과 호마노", "수금과 퉁소"], "answer": 0,
  "explanation": "가인은 농사하는 자였고 …", "verse": 3, "status": "reviewed", "issues": [] } ] }
```

묶음(키를 더하기만 하므로 `schemaVersion`은 1 그대로):

| 키 | 뜻 |
|---|---|
| `lexicon` | 스트롱 번호 → `{ lemma, xlit, english, korean, note, count }`. `korean`·`note`는 승인된 것만, 아니면 null |
| `chapter.original` | 절마다 `{ verse, words: [{ text, strong, morph, pos }] }`. `pos`는 한국어 품사 이름. 원어 자료가 없는 장은 null |
| `chapter.quiz` | 승인된 문제 `{ id, question, options, answer, explanation, verse }[]` |
| `sources` | 자료 출처 `{ id, title, detail, license, url }[]` |

---

### Task 1: original 단계(OSHB와 스트롱 사전)

**Files:**
- Create: `pipeline/src/original/{morph,hebrew,oshb,strongs,runOriginal}.ts`, `pipeline/test/original.test.ts`
- Modify: `pipeline/src/paths.ts`, `pipeline/src/schema.ts`, `pipeline/src/cli.ts`, `pipeline/src/index.ts`

- [ ] **Step 1: 시험**

```ts path=pipeline/test/original.test.ts
import { describe, expect, it } from 'vitest'
import { cleanHebrew, strongOf } from '../src/original/hebrew.ts'
import { posLabel } from '../src/original/morph.ts'
import { parseOshb } from '../src/original/oshb.ts'
import { parseStrongs } from '../src/original/strongs.ts'

const oshb = `<chapter osisID="Gen.1">
<verse osisID="Gen.1.1">
  <w lemma="b/7225" n="1.0" morph="HR/Ncfsa" id="01xeN">בְּ/רֵאשִׁ֖ית</w>
  <w lemma="1254 a" morph="HVqp3ms" id="01Nvk">בָּרָ֣א</w>
  <w lemma="5921 a" morph="HR" id="01qNN">עַל</w><seg type="x-maqqef">־</seg><w lemma="6440" morph="HNcbpc" id="01EVS">פְּנֵ֣י</w><seg type="x-sof-pasuq">׃</seg>
</verse>
</chapter>
<chapter osisID="Gen.4">
<verse osisID="Gen.4.15">
  <w lemma="l" morph="HR/Sp3ms" id="012bH">ל֣/וֹ</w>
</verse>
</chapter>
<chapter osisID="Gen.11"><verse osisID="Gen.11.1"><w lemma="1961" morph="HVqw3ms" id="x">וַיְהִי</w></verse></chapter>`

const strongs = `<div type="entry" n="7225">
        <w gloss="2097e" lemma="רֵאשִׁית" morph="n-f" POS="ray-sheeth'" xlit="rêʼshîyth" ID="H7225" xml:lang="heb">ראשית</w>
        <list><item>1) first</item></list>
        <note type="exegesis">from the same as <w lemma="רֹאשׁ" POS="roshe" src="7218" xlit="rôʼsh"/>;</note>
        <note type="explanation"><hi>the first</hi>, <hi>in place</hi>, <hi>time</hi>, <hi>order</hi> or <hi>rank</hi> (specifically, a firstfruit)</note>
        <note type="translation">beginning, chief(-est), first(-fruits, part, time), principal thing.</note>
      </div>
      <div type="entry" n="1">
        <w gloss="4a" lemma="אָב" morph="n-m" POS="awb" xlit="ʼâb" ID="H1" xml:lang="heb">אב</w>
        <note type="explanation"><hi>father</hi>, in a literal and immediate, or figurative and remote application</note>
        <note type="translation">chief, (fore-) father(-less), [idiom] patrimony, principal.</note>
      </div>`

describe('히브리어 낱말', () => {
  it('칸틸레이션 부호와 형태소 구분을 빼고 모음 부호는 둔다', () => {
    expect(cleanHebrew('בְּ/רֵאשִׁ֖ית')).toBe('בְּרֵאשִׁית')
    expect(cleanHebrew('אֱלֹהִ֑ים')).toBe('אֱלֹהִים')
  })

  it('원형(lemma)에서 스트롱 번호를 뽑는다. 접두사뿐이면 null', () => {
    expect(strongOf('b/7225')).toBe('H7225')
    expect(strongOf('1254 a')).toBe('H1254')
    expect(strongOf('c/d/776')).toBe('H776')
    expect(strongOf('l')).toBeNull()
  })
})

describe('posLabel', () => {
  it('형태소마다 품사를 붙이고, 동사는 어간과 활용을 적는다', () => {
    expect(posLabel('HR/Ncfsa')).toBe('전치사 + 명사')
    expect(posLabel('HVqp3ms')).toBe('동사(칼 완료)')
    expect(posLabel('HC/Vqw3ms')).toBe('접속사 + 동사(칼 연속 미완료)')
    expect(posLabel('HTd/Ncmpa')).toBe('정관사 + 명사')
    expect(posLabel('HNp')).toBe('고유 명사')
    expect(posLabel('HR/Sp3ms')).toBe('전치사 + 접미 대명사')
    expect(posLabel('HTo')).toBe('목적어 표지')
    expect(posLabel('HVhc')).toBe('동사(히필 부정사 연계형)')
    expect(posLabel('ANcmsa')).toBe('아람어 명사')
  })
})

describe('parseOshb', () => {
  it('고른 장의 절마다 낱말을 차례로 읽는다', () => {
    expect(parseOshb(oshb, new Set([1, 4]))).toEqual([
      {
        chapter: 1,
        verses: [
          {
            verse: 1,
            words: [
              { text: 'בְּרֵאשִׁית', strong: 'H7225', morph: 'HR/Ncfsa' },
              { text: 'בָּרָא', strong: 'H1254', morph: 'HVqp3ms' },
              { text: 'עַל', strong: 'H5921', morph: 'HR' },
              { text: 'פְּנֵי', strong: 'H6440', morph: 'HNcbpc' },
            ],
          },
        ],
      },
      { chapter: 4, verses: [{ verse: 15, words: [{ text: 'לוֹ', strong: null, morph: 'HR/Sp3ms' }] }] },
    ])
  })
})

describe('parseStrongs', () => {
  it('원하는 번호의 원형, 음역, 품사, 정의, 번역어를 읽고 태그를 지운다', () => {
    expect(parseStrongs(strongs, new Set(['H7225']))).toEqual(
      new Map([
        [
          'H7225',
          {
            strong: 'H7225',
            lemma: 'רֵאשִׁית',
            xlit: 'rêʼshîyth',
            pos: 'n-f',
            definition: 'the first, in place, time, order or rank (specifically, a firstfruit)',
            usage: 'beginning, chief(-est), first(-fruits, part, time), principal thing.',
          },
        ],
      ]),
    )
  })
})
```

- [ ] **Step 2: 구현**

```ts path=pipeline/src/original/hebrew.ts
// 히브리어 낱말 표시: 칸틸레이션 부호(U+0591~U+05AF), 메테그(U+05BD), 파섹(U+05C0), 위·아래 점(U+05C4, U+05C5)과
// 형태소 구분 '/'를 뺀다. 자음과 모음 부호(니쿠드), 신·쉰 점은 둔다.
export function cleanHebrew(text: string): string {
  return text.replace(/[֑-ֽ֯׀ׅׄ/]/g, '').normalize('NFC')
}

// OSHB 원형(lemma)에서 스트롱 번호. "b/7225", "1254 a", "c/d/776" → H7225, H1254, H776. 접두사뿐("l")이면 null
export function strongOf(lemma: string): string | null {
  const numbers = lemma.match(/\d+/g)
  return numbers ? `H${Number(numbers[numbers.length - 1])}` : null
}
```

```ts path=pipeline/src/original/morph.ts
// OSHB 형태 부호를 한국어 품사 이름으로 바꾼다(https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html).
// 부호는 언어(H 히브리어, A 아람어) 다음에 형태소마다 '/'로 나뉜다. 예: HC/Vqw3ms → 접속사 + 동사(칼 연속 미완료)
const PARTICLES: Record<string, string> = {
  a: '긍정어',
  d: '정관사',
  e: '권유어',
  i: '의문사',
  j: '감탄사',
  m: '지시사',
  n: '부정어',
  o: '목적어 표지',
  r: '관계사',
}
const NOUNS: Record<string, string> = { c: '명사', g: '민족 이름', p: '고유 명사' }
const SUFFIXES: Record<string, string> = { p: '접미 대명사', d: '방향 접미사', h: '덧붙은 he', n: '덧붙은 nun' }
// 히브리어 동사 어간. 한국 신학교에서 흔히 쓰는 이름
const STEMS: Record<string, string> = {
  q: '칼',
  N: '니팔',
  p: '피엘',
  P: '푸알',
  h: '히필',
  H: '호팔',
  t: '히트파엘',
  o: '폴렐',
  O: '폴랄',
  r: '히트폴렐',
  m: '포엘',
  M: '포알',
  k: '팔렐',
  K: '풀랄',
  Q: '칼 수동',
  l: '필펠',
  L: '폴팔',
  f: '히트팔펠',
  D: '니트파엘',
  j: '페알랄',
  i: '필렐',
  u: '호트팔',
  c: '티필',
  v: '히쉬타펠',
  w: '니트팔렐',
  y: '니트포엘',
  z: '히트포엘',
}
const FORMS: Record<string, string> = {
  p: '완료',
  q: '연속 완료',
  i: '미완료',
  w: '연속 미완료',
  h: '권유형',
  j: '지시형',
  v: '명령형',
  r: '능동 분사',
  s: '수동 분사',
  a: '부정사 절대형',
  c: '부정사 연계형',
}

function segmentLabel(segment: string): string {
  const kind = segment[0]
  const detail = segment[1] ?? ''
  switch (kind) {
    case 'A':
      return '형용사'
    case 'C':
      return '접속사'
    case 'D':
      return '부사'
    case 'N':
      return NOUNS[detail] ?? '명사'
    case 'P':
      return '대명사'
    case 'R':
      return '전치사'
    case 'S':
      return SUFFIXES[detail] ?? '접미사'
    case 'T':
      return PARTICLES[detail] ?? '불변사'
    case 'V': {
      const stem = STEMS[detail]
      const form = FORMS[segment[2] ?? '']
      const parts = [stem, form].filter(Boolean)
      return parts.length > 0 ? `동사(${parts.join(' ')})` : '동사'
    }
    default:
      return '기타'
  }
}

export function posLabel(morph: string): string {
  const language = morph[0] === 'A' ? '아람어 ' : ''
  const label = morph
    .slice(1)
    .split('/')
    .filter((segment) => segment !== '')
    .map(segmentLabel)
    .join(' + ')
  return language + label
}
```

```ts path=pipeline/src/original/oshb.ts
import { cleanHebrew, strongOf } from './hebrew.ts'

export type OriginalWord = { text: string; strong: string | null; morph: string }
export type OriginalVerse = { verse: number; words: OriginalWord[] }
export type OriginalChapter = { chapter: number; verses: OriginalVerse[] }

const attribute = (attributes: string, name: string): string | null =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? null

// OSHB(OSIS XML) 한 책에서 고른 장의 절마다 낱말을 차례로 읽는다. 마켑·소프 파숙 같은 seg는 뺀다.
export function parseOshb(xml: string, chapters: ReadonlySet<number>): OriginalChapter[] {
  const result = new Map<number, OriginalVerse[]>()
  for (const verseMatch of xml.matchAll(/<verse osisID="[A-Za-z0-9]+\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g)) {
    const chapter = Number(verseMatch[1])
    if (!chapters.has(chapter)) continue
    const words: OriginalWord[] = []
    for (const word of verseMatch[3]!.matchAll(/<w ([^>]*)>([^<]*)<\/w>/g)) {
      const lemma = attribute(word[1]!, 'lemma') ?? ''
      words.push({ text: cleanHebrew(word[2]!), strong: strongOf(lemma), morph: attribute(word[1]!, 'morph') ?? '' })
    }
    const verses = result.get(chapter) ?? []
    verses.push({ verse: Number(verseMatch[2]), words })
    result.set(chapter, verses)
  }
  return [...result.entries()].sort(([a], [b]) => a - b).map(([chapter, verses]) => ({ chapter, verses }))
}
```

```ts path=pipeline/src/original/strongs.ts
// 스트롱 히브리어 사전(openscriptures/strongs의 StrongHebrewG.xml, 퍼블릭 도메인)에서 항목을 읽는다.
// 쓰는 것: 원형, 음역, 스트롱 품사, 정의(explanation), KJV 번역어(translation). TWOT 번호와 개요는 쓰지 않는다.
export type StrongsEntry = { strong: string; lemma: string; xlit: string; pos: string; definition: string; usage: string }

const attribute = (attributes: string, name: string): string =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? ''

// 태그를 지우고 공백을 하나로 모은다. 안의 <w .../> 참조는 그 원형으로 바꾼다.
function plainText(xml: string): string {
  return xml
    .replace(/<w [^>]*lemma="([^"]*)"[^>]*\/>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseStrongs(xml: string, wanted: ReadonlySet<string>): Map<string, StrongsEntry> {
  const entries = new Map<string, StrongsEntry>()
  for (const entry of xml.matchAll(/<div type="entry" n="(\d+)">([\s\S]*?)<\/div>/g)) {
    const strong = `H${Number(entry[1])}`
    if (!wanted.has(strong)) continue
    const body = entry[2]!
    const head = /<w ([^>]*ID="H\d+"[^>]*)>/.exec(body)?.[1] ?? ''
    entries.set(strong, {
      strong,
      lemma: attribute(head, 'lemma'),
      xlit: attribute(head, 'xlit'),
      pos: attribute(head, 'morph'),
      definition: plainText(/<note type="explanation">([\s\S]*?)<\/note>/.exec(body)?.[1] ?? ''),
      usage: plainText(/<note type="translation">([\s\S]*?)<\/note>/.exec(body)?.[1] ?? ''),
    })
  }
  return entries
}
```

`pipeline/src/paths.ts`에 더한다.

```ts
// 원어: OSHB 낱말(genesis.json)과 스트롱 사전 항목·한국어 뜻(lexicon.json)
export const originalDir = path.join(contentDir, 'original')
export const originalFile = path.join(originalDir, 'genesis.json')
export const lexiconFile = path.join(originalDir, 'lexicon.json')
// 이해 확인 퀴즈. 장마다 genesis-NN.json
export const quizDir = path.join(contentDir, 'quiz')
export function quizFilePath(chapter: number, dir: string = quizDir): string {
  return path.join(dir, `genesis-${String(chapter).padStart(2, '0')}.json`)
}
```

`pipeline/src/schema.ts`에 더한다.

```ts
export const OriginalWordSchema = z.object({ text: z.string(), strong: z.string().regex(/^H\d+$/).nullable(), morph: z.string() })
export const OriginalFileSchema = z.object({
  chapters: z.array(
    z.object({
      chapter: z.number().int().positive(),
      verses: z.array(z.object({ verse: z.number().int().positive(), words: z.array(OriginalWordSchema) })),
    }),
  ),
})

// 사전 항목의 한국어 뜻. draft는 original-gloss 단계의 초안, approved는 사람이 관리 도구에서 승인한 것
export const KoreanGlossSchema = z.object({
  meaning: z.string().min(1),
  note: z.string(),
  status: z.enum(['draft', 'approved']),
})
export const LexiconEntrySchema = z.object({
  strong: z.string().regex(/^H\d+$/),
  lemma: z.string(),
  xlit: z.string(),
  pos: z.string(),
  definition: z.string(),
  usage: z.string(),
  // 이 묶음의 장(창세기 1~10장)에 나오는 횟수
  count: z.number().int().nonnegative(),
  korean: KoreanGlossSchema.nullable(),
})
export const LexiconFileSchema = z.object({ entries: z.array(LexiconEntrySchema) })

export type OriginalFile = z.infer<typeof OriginalFileSchema>
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>
export type LexiconFile = z.infer<typeof LexiconFileSchema>
```

```ts path=pipeline/src/original/runOriginal.ts
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { lexiconFile as defaultLexiconFile, originalFile as defaultOriginalFile, sourceFile as defaultSourceFile } from '../paths.ts'
import { LexiconFileSchema, SourceSchema, type LexiconEntry, type OriginalFile } from '../schema.ts'
import { parseOshb } from './oshb.ts'
import { parseStrongs } from './strongs.ts'

// 고정된 커밋에서 받는다(같은 자료로 다시 만들 수 있게).
// OSHB: 본문은 WLC(퍼블릭 도메인), 원형과 형태 분석은 CC BY 4.0. 스트롱 사전 XML은 퍼블릭 도메인.
export const OSHB_URL = 'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc/Gen.xml'
export const STRONGS_URL =
  'https://raw.githubusercontent.com/openscriptures/strongs/0acd2f251c2d35ff8db2dece4e0593979d3ac223/hebrew/StrongHebrewG.xml'

export type OriginalOptions = {
  fetchText?: (url: string) => Promise<string>
  sourceFile?: string
  originalFile?: string
  lexiconFile?: string
}

async function defaultFetch(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}을 받지 못했습니다(${response.status})`)
  return response.text()
}

// 본문에 있는 장의 히브리어 낱말과 그 낱말들의 사전 항목을 만든다. 이미 있는 한국어 뜻(초안, 승인)은 그대로 둔다.
export async function runOriginal(options: OriginalOptions = {}, log: (line: string) => void = () => {}) {
  const fetchText = options.fetchText ?? defaultFetch
  const sourceFile = options.sourceFile ?? defaultSourceFile
  const originalFile = options.originalFile ?? defaultOriginalFile
  const lexiconFile = options.lexiconFile ?? defaultLexiconFile

  const source = SourceSchema.parse(JSON.parse(await readFile(sourceFile, 'utf8')))
  const chapterNumbers = new Set(source.chapters.map((chapter) => chapter.chapter))
  log('OSHB 창세기를 받는 중…')
  const chapters = parseOshb(await fetchText(OSHB_URL), chapterNumbers)
  for (const chapter of source.chapters) {
    const found = chapters.find((item) => item.chapter === chapter.chapter)
    if (!found || found.verses.length !== chapter.verses.length) {
      throw new Error(`${chapter.chapter}장의 절 수가 본문(${chapter.verses.length})과 OSHB(${found?.verses.length ?? 0})에서 다릅니다`)
    }
  }

  const counts = new Map<string, number>()
  for (const chapter of chapters) {
    for (const verse of chapter.verses) {
      for (const word of verse.words) if (word.strong) counts.set(word.strong, (counts.get(word.strong) ?? 0) + 1)
    }
  }
  log('스트롱 사전을 받는 중…')
  const dictionary = parseStrongs(await fetchText(STRONGS_URL), new Set(counts.keys()))
  const missing = [...counts.keys()].filter((strong) => !dictionary.has(strong))
  if (missing.length > 0) log(`사전에 없는 번호 ${missing.length}개: ${missing.slice(0, 10).join(', ')}`)

  const previous = existsSync(lexiconFile)
    ? new Map(LexiconFileSchema.parse(JSON.parse(await readFile(lexiconFile, 'utf8'))).entries.map((entry) => [entry.strong, entry]))
    : new Map<string, LexiconEntry>()
  const entries: LexiconEntry[] = [...counts.entries()]
    .filter(([strong]) => dictionary.has(strong))
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([strong, count]) => ({ ...dictionary.get(strong)!, count, korean: previous.get(strong)?.korean ?? null }))

  const original: OriginalFile = { chapters }
  await mkdir(path.dirname(originalFile), { recursive: true })
  await writeFile(originalFile, JSON.stringify(original, null, 1) + '\n', 'utf8')
  await writeFile(lexiconFile, JSON.stringify({ entries }, null, 2) + '\n', 'utf8')
  const words = chapters.reduce((sum, chapter) => sum + chapter.verses.reduce((n, verse) => n + verse.words.length, 0), 0)
  return { chapters: chapters.length, words, entries: entries.length, withKorean: entries.filter((entry) => entry.korean).length }
}
```

`cli.ts`에 `original` 명령(`runOriginal`)을, `index.ts`에 `runOriginal`과 새 스키마·경로를 내보낸다.

- [ ] **Step 3: 시험·실행·커밋**

Run: `npm test -w pipeline && npm run pipeline -- original`
Expected: 장 10, 낱말 3401, 사전 항목 568(사전에 없는 번호가 있으면 기록에 나온다)

```bash
git add pipeline content/original
git commit -m "feat(pipeline): original 단계(OSHB 낱말과 형태, 스트롱 사전 항목, 한국어 품사 이름)"
```

---

### Task 2: original-gloss 단계(한국어 뜻 초안)

**Files:**
- Create: `pipeline/src/original/{glossPrompt,runGloss}.ts`, `pipeline/test/gloss.test.ts`
- Modify: `pipeline/src/cli.ts`, `pipeline/src/index.ts`

작성 모델에 사전 항목 40개씩 보낸다. 항목마다 원형, 음역, 품사, 영어 정의, KJV 번역어, 이 책에서 나오는 절 둘(개역한글 본문)을 준다. 받는 것: `{ items: [{ strong, meaning, note }] }`. `meaning`은 사전 표제어처럼 짧은 한국어 뜻(쉼표로 둘까지, 20자 안), `note`는 창세기 1~10장에서 알아 둘 쓰임이 있으면 한 문장(해요체), 없으면 빈 문자열이다. 받은 항목은 `korean: { meaning, note, status: 'draft' }`로 적는다. 이미 한국어 뜻이 있는 항목은 건너뛴다(`--force`면 초안만 다시 쓴다. 승인된 것은 건드리지 않는다). `--limit`은 이번에 쓸 항목 수다.

```ts path=pipeline/src/original/glossPrompt.ts
import { z } from 'zod'
import type { LexiconEntry } from '../schema.ts'

export const GlossOutputSchema = z.object({
  items: z.array(z.object({ strong: z.string(), meaning: z.string(), note: z.string() })),
})

const SYSTEM = `너는 성경 히브리어 사전의 한국어 뜻을 쓰는 사람이다. 성경을 처음 읽는 한국어 독자가 창세기 1~10장의 히브리어 낱말을 볼 때 곁에 붙는 짧은 뜻을 쓴다.

규칙:
- meaning: 사전 표제어처럼 짧게. 뜻이 둘 이상이면 쉼표로 둘까지. 20자를 넘기지 않는다. 고유 명사는 개역한글의 표기(예: 에덴, 가인, 셋)로 쓰고 무엇의 이름인지 괄호로 붙인다(예: "에덴(땅 이름)").
- 문법 낱말(목적어 표지, 관계사, 전치사 등)은 하는 일을 적는다(예: "목적어 표지(번역하지 않음)").
- note: 창세기 1~10장의 쓰임에서 독자가 알아 두면 좋은 것이 있으면 한 문장, "~해요" 체. 없으면 빈 문자열. 교리 해석을 단정하지 않는다.
- 영어 정의와 KJV 번역어, 주어진 절을 근거로 쓴다. 지어내지 않는다.
- 받은 항목을 모두, 같은 strong 번호로 돌려준다.`

export function buildGlossPrompt(entries: LexiconEntry[], examples: Map<string, string[]>): { system: string; user: string } {
  const lines = entries.map((entry) =>
    [
      `- ${entry.strong} ${entry.lemma} (${entry.xlit}, 스트롱 품사 ${entry.pos})`,
      `  정의: ${entry.definition}`,
      `  KJV: ${entry.usage}`,
      ...(examples.get(entry.strong) ?? []).map((line) => `  예: ${line}`),
    ].join('\n'),
  )
  return { system: SYSTEM, user: ['## 사전 항목', ...lines].join('\n') }
}
```

`runGloss`(`pipeline/src/original/runGloss.ts`): lexicon과 원어 낱말, 본문을 읽고, 대상 항목을 모아 40개씩 `createLlm({ stage: 'original-gloss', chapter: null })`로 부른다. 예문은 그 번호가 처음 나오는 절 둘의 "창세기 c:v 본문"이다. 돌려받지 못한 번호는 기록에 남기고 건너뛴다. 묶음마다 파일을 써서 중간에 멈춰도 쓴 것은 남는다. 시험(`pipeline/test/gloss.test.ts`)은 가짜 LLM으로 초안이 적히고, 승인된 뜻은 그대로이며, limit만큼만 쓰는지 본다.

- [ ] **Step: 시험·커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): original-gloss 단계(사전 항목의 한국어 뜻 초안)"
```

---

### Task 3: quiz 단계(작성과 검수)

**Files:**
- Create: `pipeline/src/quiz/{output,prompt,files,runQuiz}.ts`, `pipeline/test/quiz.test.ts`
- Modify: `pipeline/src/schema.ts`, `pipeline/src/cli.ts`, `pipeline/src/index.ts`

```ts
// schema.ts에 더한다. 이해 확인 문제. reviewed는 검수 모델 통과, flagged는 검수 모델이 지적, approved는 사람이 승인, rejected는 버림
export const QuizQuestionSchema = z.object({
  id: z.string().regex(/^genesis-\d{2}-q\d+$/),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
  verse: z.number().int().positive(),
  status: z.enum(['draft', 'reviewed', 'flagged', 'approved', 'rejected']),
  issues: z.array(z.string()),
})
export const QuizFileSchema = z.object({ chapter: z.number().int().positive(), questions: z.array(QuizQuestionSchema) })
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>
export type QuizFile = z.infer<typeof QuizFileSchema>
```

작성 프롬프트(`buildQuizPrompt`): 장 본문 전체(절 번호와 함께), 검수(reviewed·approved)된 장면의 제목·해설·낱말 풀이. 규칙: 문제 다섯, 4지선다, 정답은 하나만 본문으로 확인되게, 답의 근거 절 번호를 반드시 적는다, 본문과 검수된 해설에 있는 것만 묻는다, 해석이 갈리는 교리나 해설의 의견은 묻지 않는다, 기억력 시험(숫자 맞히기)보다 장면의 흐름과 뜻을 묻는다, 보기는 모두 그럴듯하지만 본문을 읽으면 가를 수 있게, 정답의 자리를 섞는다, 질문은 "~나요?" 체, 해설은 "~해요" 체로 두세 문장.
작성 출력: `{ questions: [{ question, options, answer, explanation, verse }] }`.
검수 프롬프트(`buildQuizReviewPrompt`, 검수 모델): 장 본문과 문제들을 주고 문제마다 볼 것: 정답이 근거 절로 확인되는가, 다른 보기도 맞을 수 있는가, 본문 밖의 지식이나 교리 해석을 묻는가, 해설이 본문과 맞는가, 말이 어려운가. 검수 출력: `{ results: [{ index, verdict: 'pass' | 'fail', issues: string[] }] }`. pass면 `reviewed`, fail이면 `flagged`와 issues.
`runQuiz(chapter, { force, dryRun })`: 파일이 있으면 `--force` 없이는 건너뛴다(승인된 문제는 다시 써도 지우지 않는다: force일 때 approved는 두고 나머지만 새로 쓴다). id는 `genesis-NN-q1`부터.
시험(`pipeline/test/quiz.test.ts`): 가짜 작성·검수 LLM으로 상태가 reviewed/flagged로 나뉘고, 근거 절이 장에 없으면 flagged(코드 검사), 보기 넷이 서로 같으면 flagged, 다시 쓸 때 승인된 문제가 남는지 본다.

- [ ] **Step: 시험·커밋**

```bash
git add pipeline
git commit -m "feat(pipeline): quiz 단계(장마다 4지선다 다섯 문제, 검수 모델이 근거 절 확인)"
```

---

### Task 4: 묶음에 원어·퀴즈·출처

**Files:**
- Create: `pipeline/src/build/sources.ts`
- Modify: `pipeline/src/schema.ts`(Bundle), `pipeline/src/build/buildBundle.ts`, `pipeline/src/build/writeBundle.ts`, `pipeline/test/buildBundle.test.ts`, `packages/reader-core/src/{types,bundle}.ts`, `docs/content-bundle.md`

- `buildBundle`에 인자 `extras: { original?: OriginalFile; lexicon?: LexiconFile; quizzes?: QuizFile[]; sources?: BundleSource[] }`를 더한다.
- `chapter.original`: 그 장의 원어 낱말에 `pos: posLabel(morph)`를 붙인다. 없으면 null.
- `lexicon`: 묶음의 장에 나오는 번호만, `{ lemma, xlit, english: definition, korean: approved ? meaning : null, note: approved && note ? note : null, count }`.
- `chapter.quiz`: `status === 'approved'`인 문제만 `{ id, question, options, answer, explanation, verse }`.
- `sources`: `buildSources(style)`가 돌려주는 목록(아래). `writeBundle`이 `content/original/*`, `content/quiz/*`, style.json을 읽어 넘긴다.
- reader-core `types.ts`: `Bundle.lexicon`, `Bundle.sources`, `Chapter.original`, `Chapter.quiz`와 형들, `fillMissing`이 옛 묶음을 채운다(`{}`, `[]`, null, `[]`).
- `docs/content-bundle.md`에 새 키를 적는다.

```ts path=pipeline/src/build/sources.ts
import type { Style } from '../schema.ts'

// 앱의 자료 출처 화면에 보일 목록. 그림 참고 작품은 style.json의 출처에서 모은다.
export type BundleSource = { id: string; title: string; detail: string; license: string; url: string | null }

export function buildSources(style: Style | null): BundleSource[] {
  const references = [...new Set((style?.references ?? []).map((reference) => reference.source))]
  return [
    {
      id: 'krv',
      title: '개역한글판 성경',
      detail: '본문. 위키문헌의 "개역한글판/창세기"에서 받았어요.',
      license: '2012년에 저작권이 끝난 저작물(위키문헌 PD-old-60)',
      url: 'https://ko.wikisource.org/wiki/개역한글판/창세기',
    },
    {
      id: 'wlc',
      title: '웨스트민스터 레닌그라드 사본(WLC)',
      detail: '원어 보기의 히브리어 본문',
      license: '퍼블릭 도메인',
      url: 'https://tanach.us',
    },
    {
      id: 'oshb',
      title: 'Open Scriptures Hebrew Bible',
      detail: '히브리어 낱말의 원형과 형태 분석(품사, 어간, 활용)',
      license: 'CC BY 4.0',
      url: 'https://hb.openscriptures.org',
    },
    {
      id: 'strongs',
      title: '스트롱 히브리어 사전(1894)',
      detail: '사전 번호, 음역, 영어 정의. XML판은 David Troidl, David Instone-Brewer가 정리해 Open Scriptures가 공개했어요. 한국어 뜻은 이 앱이 써서 사람이 검수했어요.',
      license: '퍼블릭 도메인',
      url: 'https://github.com/openscriptures/strongs',
    },
    {
      id: 'natural-earth',
      title: 'Natural Earth',
      detail: '여정 지도의 해안선, 강, 호수',
      license: '퍼블릭 도메인',
      url: 'https://www.naturalearthdata.com',
    },
    ...references.map((source, index) => ({
      id: `reference-${index + 1}`,
      title: '그림 참고 작품',
      detail: source,
      license: '출처에 적힌 대로',
      url: /https?:\/\/\S+/.exec(source)?.[0] ?? null,
    })),
    {
      id: 'ai',
      title: 'AI가 만든 것',
      detail:
        '장면 그림, 낭독 음성, 장면 제목·해설·낱말 풀이·역사 배경, 한국어 뜻 초안, 퀴즈 초안은 OpenAI 모델로 만들었어요. 글은 검수 모델과 사람이 검수한 뒤 앱에 나가요.',
      license: '이 앱의 자료',
      url: null,
    },
  ]
}
```

- [ ] **Step: 시험·묶음·커밋**

`buildBundle` 시험: 원어가 있는 장에 `pos`가 붙고, 승인된 뜻만 `korean`에 들어가며, 승인된 문제만 `quiz`에 들어가는지 본다.

```bash
git add pipeline packages/reader-core docs/content-bundle.md
git commit -m "feat(pipeline): 묶음에 원어 낱말·사전(승인된 한국어 뜻), 승인된 퀴즈, 자료 출처"
```

---

### Task 5: 관리 도구 — 단계와 검수 화면

**Files:**
- Modify: `admin/server/jobs.ts`(STAGES), `admin/server/stages.ts`(옵션과 실행), `admin/server/app.ts`(경로), `admin/src/App.tsx`(메뉴), `admin/src/pages/Queue.tsx`(대기열), `admin/src/api.ts`, `admin/src/types.ts`
- Create: `admin/server/routes/{lexicon,quiz}.ts`, `admin/src/pages/{Lexicon,Quiz}.tsx`, `admin/test/{lexicon,quiz}.test.ts`

- 작업 단계: `original`(옵션 없음), `original-gloss`(limit, force, dryRun), `quiz`(chapter 필수, force, dryRun).
- `GET /api/lexicon` → 항목 목록. `PUT /api/lexicon/:strong` 본문 `{ meaning, note, status }`(status는 draft·approved, meaning이 비면 korean을 null로) → 검증 후 그 항목만 바꿔 파일을 쓴다.
- `GET /api/quiz/:chapter` → 퀴즈 파일(없으면 404)과 장 본문. `PUT /api/quiz/:chapter/:id` 본문은 문제 전체(question, options, answer, explanation, verse, status) → 검증 후 그 문제만 바꾼다.
- "원어 뜻" 화면: 거르기(초안·승인·없음), 표(원형, 음역, 품사, 영어 정의, 횟수, 한국어 뜻·메모 입력, 상태), 줄마다 "승인"과 "저장", 초안 전체 승인은 두지 않는다(하나씩 본다).
- "퀴즈" 화면: 장 고르기, 문제 카드(질문, 보기 넷과 정답 표시, 해설, 근거 절 본문, 검수 지적), "승인", "버림", 고치기(입력), 장마다 승인 수 / 5.
- 대기열: "한국어 뜻 초안 N개", "검수 통과·지적된 퀴즈 N개"를 각 화면 링크로.
- 시험: 경로가 파일을 바르게 바꾸고 잘못된 본문은 400인지 본다.

```bash
git add admin
git commit -m "feat(admin): 원어 뜻과 퀴즈 검수 화면, original·original-gloss·quiz 단계"
```

---

### Task 6: 서버 — 질문하기

**Files:**
- Create: `server/src/ask/{passages,retrieve,answer,usage}.ts`, `server/test/ask.test.ts`
- Modify: `server/src/{app,config,db,index}.ts`, `server/package.json`(openai)

- `passages.ts`: 묶음에서 대목을 만든다. 본문 절(`v:4:15`, "본문 4:15"), 검수된 장면(`s:<장면 id>`, "해설 · 제목", 해설·짧은 해설·역사 배경), 설정집 인물·장소·물건(`c:character:cain`, "설정집 · 가인", 설명과 다른 이름). 대목마다 이동할 곳(절, 장면, 설정집 항목)을 둔다.
- `retrieve.ts`: 띄어쓰기를 지운 글자 두 개 단위(바이그램)로 질문과 대목의 겹침을 세고 드문 바이그램일수록 무겁게(idf) 센다. 질문한 장의 대목은 1.5배. 위에서 10개.
- `answer.ts`: 대목에 번호를 매겨 LLM에 준다. 출력 `{ found: boolean, sentences: [{ text, sources: string[] }] }`. 문장마다 근거 번호가 하나 이상이고 모두 준 대목이어야 한다. 하나라도 어긋나거나 found가 false면 "자료에 없어요"와 가까운 대목 둘. LLM은 주입한다(`AskModel = (prompt) => Promise<unknown>`), 실제는 OpenAI Responses API(`OPENAI_API_KEY`, 모델 `ASK_MODEL`, 기본 파이프라인 작성 모델).
- `usage.ts`: `ask_usage(user_id, day, count)` 표, 한국 날짜, `INSERT … ON CONFLICT DO UPDATE SET count = ask_usage.count + 1 RETURNING count`. 20을 넘으면 429. LLM이 실패하면 하나를 되돌린다.
- `POST /ask`(로그인): 본문 `{ question: 1~300자, chapter?: number }` → `{ status: 'answer' | 'none', text, citations: [{ id, kind, label, chapter, verse, sceneId, entity }], remaining }`.
- 서버는 시작할 때 묶음(`BUNDLE_FILE`, 기본 `app/public/content/genesis.json`)과 리포 루트 `.env`를 읽는다.
- 시험: 대목 찾기 순위, 근거 없는 문장이 있으면 none, 모르는 근거 번호면 none, 하루 21번째는 429, 로그인 없으면 401(가짜 LLM).

```bash
git add server package-lock.json
git commit -m "feat(server): 질문하기(검수된 자료에서 대목 찾기, 문장마다 근거 확인, 하루 20번)"
```

---

### Task 7: 앱 화면

**Files:**
- Create: `packages/reader-core/src/{josa,library,ask}.ts`(+시험), `mobile/src/original/OriginalSheet.tsx`, `mobile/src/sources/SourcesScreen.tsx`, `mobile/src/quiz/QuizScreen.tsx`, `mobile/src/ask/{AskScreen,askApi}.tsx`, `mobile/src/library/{LibraryScreen,HowWeMakeSheet}.tsx`, `mobile/src/app/{sources,ask,library}.tsx`, `mobile/src/app/quiz/[chapter].tsx`
- Modify: `mobile/src/reader/{ReaderScreen,MarkSheet,VersePane,SettingsSheet}.tsx`, `mobile/src/home/HomeScreen.tsx`, `mobile/src/data/reading.ts`(quizDone)

- reader-core: `josa(word, '은는' | '이가' | '을를' | '이에요예요')`, `bookProgress(bundle, readIds)`(장·장면 수, 다 읽은 장), `askSuggestions(bundle, chapter)`(그 장의 장소·인물·낱말로 질문 셋: "놋은 어디예요?", "라멕은 누구예요?", "'칠 배'는 무슨 뜻이에요?"), `wordOccurrences(bundle, strong)`(나오는 절).
- 원어 시트(읽기 화면 덮개): 머리 "원어 · 창세기 4장 15절", 개역한글 절, 히브리어 낱말(오른쪽에서 왼쪽으로 줄 바꿈, 낱말 아래 한국어 뜻 또는 영어 정의 앞부분), 낱말을 누르면 아래에 사전 항목(원형 크게, 음역, 품사, 한국어 뜻·메모 또는 "뜻 검수 중"과 영어 정의, 칩: "스트롱 H7014", "창세기 1~10장에서 N번", "나오는 곳" 펼치면 절 목록, 누르면 그 절로), 아래에 자료 표기(WLC, OSHB CC BY 4.0, 스트롱 사전).
- 밑줄·메모 시트에 "원어 보기"(그 장에 원어 자료가 있을 때).
- 자료 출처 화면: `bundle.sources`를 카드로(제목, 설명, 이용 조건, 주소는 누르면 브라우저). 설정 시트 아래와 서재의 제작 과정 시트에서 연다.
- 퀴즈 화면(목업 12): 머리 "N장을 다 읽었어요 / 이해 확인", "2 / 5", 문제마다 진행 칸(맞음 초록, 지금 강조, 남음 회색), 문제 카드, 보기 넷(누르면 잠그고 정답·오답 표시), 맞았어요/아쉬워요 카드(해설, 근거 절 본문 "· 창세기 4:3", "장면 '…'로 돌아가기"), "다음 문제", 마지막은 "다 풀었어요"와 "다시 풀기", "읽기로 돌아가기". 끝까지 풀면 `quizDone`을 적는다. 바닥 글 "문제는 본문과 검수된 해설에서만 내요. 틀려도 점수는 남지 않아요."
- 질문하기 화면(목업 13): 머리 "질문하기", "창세기 N장 읽는 중", 말풍선(내 질문 강조색, 답 흰색), 근거 칩(본문·해설은 누르면 그 자리로, 설정집은 눌러 설명을 펼침), "자료에 없어요" 답은 점선 테두리와 딱지, 제안 질문 칩 셋, 입력과 보내기, "오늘 남은 질문 N번", 바닥 글. 로그인하지 않았으면 안내와 로그인 단추.
- 서재 화면(목업 14): 창세기 카드(첫 장면 그림, "읽을 수 있음", "1~10장 · 장면 38개", 읽은 장 막대와 범례), 다른 책 넷(만드는 중·예정, 소개), "어떻게 만드나요"와 "제작 과정 보기"(시트: 설정집 → 장면 글 → 검수 → 그림·낭독 → 원어·퀴즈 → 묶음, 자료 출처 링크).
- 홈 바로 가기: 질문하기, 서재. 읽기 화면 머리: 질문하기 단추. 장의 끝: 퀴즈가 있으면 "이해 확인 퀴즈".

```bash
git add packages/reader-core mobile
git commit -m "feat(mobile): 원어 시트, 자료 출처, 이해 확인 퀴즈, 질문하기, 서재"
```

---

### Task 8: 단계 실행과 확인, 문서

- [ ] `npm run pipeline -- original`, `npm run pipeline -- original-gloss`(사전 항목 568개, 40개씩), 장마다 `npm run pipeline -- quiz --chapter N`(1~10). 비용은 `content/runs/`의 기록으로 확인한다.
- [ ] 관리 도구에서 초안과 문제가 보이는지 본다. 승인은 사람이 한다. 화면 확인용으로는 임시로 초안을 승인 상태로 바꾼 묶음을 만들어 앱을 본 뒤 되돌린다(커밋하지 않는다).
- [ ] Expo 웹: 원어 시트(낱말 누르기, 나오는 곳에서 절로), 자료 출처, 퀴즈(맞음·틀림, 끝까지 풀면 quizDone), 질문하기(로그인, 근거 칩 이동, 자료에 없어요, 남은 횟수), 서재.
- [ ] 설계 문서 진행, README(새 단계와 화면), `docs/content-bundle.md`.
- [ ] `npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run build -w app`

```bash
git add README.md docs content
git commit -m "docs: 네이티브 앱 5단계(원어, 퀴즈, 질문하기, 서재) 완료"
```
