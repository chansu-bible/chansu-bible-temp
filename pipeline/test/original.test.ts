import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getBook } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanHebrew, strongOf } from '../src/original/hebrew.ts'
import { posLabel } from '../src/original/morph.ts'
import { parseOshb } from '../src/original/oshb.ts'
import { originalBooks, oshbUrl, runOriginal } from '../src/original/runOriginal.ts'
import { parseStrongs } from '../src/original/strongs.ts'
import { STRONGS_URL } from '../src/original/urls.ts'
import { OSHB_VERSE_MAP_URL } from '../src/original/verseMap.ts'
import type { LexiconFile, OriginalFile } from '../src/schema.ts'

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

  it('장을 고르지 않으면 모든 장을 읽는다', () => {
    expect(parseOshb(oshb).map((chapter) => chapter.chapter)).toEqual([1, 4, 11])
  })
})

// 출애굽기 OSHB. 아래 대응표(시험용으로 지어낸 것)로 WLC 2:1이 KJV 1:3이 된다.
const exodusOshb = `<chapter osisID="Exod.1">
<verse osisID="Exod.1.1"><w lemma="1" morph="HNcmsc" id="e1">אֲבִי</w><w lemma="b/7225" morph="HR/Ncfsa" id="e2">בְּ/רֵאשִׁית</w></verse>
<verse osisID="Exod.1.2"><w lemma="1" morph="HNcmsc" id="e3">אֲבִי</w></verse>
</chapter>
<chapter osisID="Exod.2">
<verse osisID="Exod.2.1"><w lemma="7225" morph="HNcfsa" id="e4">רֵאשִׁית</w></verse>
<verse osisID="Exod.2.2"><w lemma="1" morph="HNcmsc" id="e5">אֲבִי</w></verse>
<verse osisID="Exod.2.3"><w lemma="1" morph="HNcmsc" id="e6">אֲבִי</w></verse>
</chapter>`

const verseMap = `<verseMap>
	<book osisID="Gen"/>
	<book osisID="Exod">
		<verse wlc="Exod.2.1" kjv="Exod.1.3" type="full"/>
	</book>
</verseMap>`

describe('runOriginal', () => {
  let dir: string
  let urls: string[]
  const texts: Record<string, string> = {
    [oshbUrl('genesis')]: oshb,
    [oshbUrl('exodus')]: exodusOshb,
    [OSHB_VERSE_MAP_URL]: verseMap,
    [STRONGS_URL]: strongs,
  }
  const fetchText = async (url: string) => {
    urls.push(url)
    const text = texts[url]
    if (text === undefined) throw new Error(`시험에 없는 주소: ${url}`)
    return text
  }
  // 사전은 실제처럼 원어 폴더 안에 둔다.
  const optionsOf = () => {
    const originalDir = path.join(dir, 'original')
    return { fetchText, sourceDir: dir, originalDir, lexiconFile: path.join(originalDir, 'lexicon.json') }
  }
  // 장마다 절 수를 받아 그 책의 본문 파일을 쓴다.
  const writeSource = (book: 'genesis' | 'exodus', verseCounts: number[]) =>
    writeFile(
      path.join(dir, `${book}.json`),
      JSON.stringify({
        book: getBook(book).name,
        translation: '개역한글',
        chapters: verseCounts.map((count, index) => ({
          chapter: index + 1,
          verses: Array.from({ length: count }, (_, verse) => ({ verse: verse + 1, text: '본문' })),
        })),
      }),
    )
  const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T
  // 장마다 절의 스트롱 번호
  const strongsOf = (original: OriginalFile) =>
    original.chapters.map((chapter) => [chapter.chapter, chapter.verses.map((verse) => verse.words.map((word) => word.strong))])

  beforeEach(async () => {
    urls = []
    dir = await mkdtemp(path.join(tmpdir(), 'original-'))
    await writeSource('genesis', [1])
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('책의 OSIS 이름으로 OSHB와 절 대응표를 받아 original/<책 id>.json과 사전을 쓴다', async () => {
    const lines: string[] = []
    const options = optionsOf()
    const result = await runOriginal('genesis', options, (line) => lines.push(line))

    expect(urls).toEqual([
      'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc/Gen.xml',
      'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc/VerseMap.xml',
      STRONGS_URL,
    ])
    expect(lines[0]).toBe('OSHB 창세기를 받는 중…')
    expect(result).toEqual({ chapters: 1, words: 4, entries: 1, withKorean: 0, skipped: [] })
    // 본문에 있는 장만 쓴다.
    const original = await readJson<OriginalFile>(path.join(options.originalDir, 'genesis.json'))
    expect(original.chapters.map((chapter) => chapter.chapter)).toEqual([1])
    expect(existsSync(options.lexiconFile)).toBe(true)

    // 같은 책은 다시 만들 수 있다.
    await expect(runOriginal('genesis', options)).resolves.toMatchObject({ chapters: 1 })
  })

  it('다른 책 원어가 있어도 만들고, 사전 횟수는 모든 책을 합치며 한국어 뜻은 남는다', async () => {
    const options = optionsOf()
    await writeSource('exodus', [3])
    await runOriginal('genesis', options)
    await writeFile(path.join(options.originalDir, 'README.md'), '# 원어 자료\n')
    const genesis = await readFile(path.join(options.originalDir, 'genesis.json'), 'utf8')
    // 사람이 검수한 한국어 뜻
    const lexicon = await readJson<LexiconFile>(options.lexiconFile)
    expect(lexicon.entries.map((entry) => [entry.strong, entry.count])).toEqual([['H7225', 1]])
    lexicon.entries[0]!.korean = { meaning: '처음', note: '', status: 'approved' }
    await writeFile(options.lexiconFile, JSON.stringify(lexicon))

    const result = await runOriginal('exodus', options)

    expect(result).toEqual({ chapters: 1, words: 4, entries: 2, withKorean: 1, skipped: [] })
    // H7225는 창세기 1:1에 한 번, 출애굽기 1:1과 1:3(WLC 2:1)에 두 번. H1은 출애굽기 1:1, 1:2
    const saved = await readJson<LexiconFile>(options.lexiconFile)
    expect(saved.entries.map((entry) => [entry.strong, entry.count, entry.korean])).toEqual([
      ['H1', 2, null],
      ['H7225', 3, { meaning: '처음', note: '', status: 'approved' }],
    ])
    // 앞 책 원어는 그대로다.
    expect(await readFile(path.join(options.originalDir, 'genesis.json'), 'utf8')).toBe(genesis)
  })

  it('히브리어 절 번호를 개역한글 절 번호로 옮기고, 절 나눔이 본문과 다른 장은 원어 없이 두고 알린다', async () => {
    const lines: string[] = []
    const options = optionsOf()
    await writeSource('exodus', [3, 3])
    const result = await runOriginal('exodus', options, (line) => lines.push(line))

    // WLC 2:1이 KJV 1:3으로 가서 1장은 1~3절이 되고, 2장에는 2~3절만 남는다.
    expect(result).toMatchObject({ chapters: 1, skipped: [2] })
    expect(lines).toContain('출애굽기 2장은 히브리어와 개역한글의 절 나눔이 달라 원어를 넣지 않았습니다(본문 3절, 원어 2절)')
    const original = await readJson<OriginalFile>(path.join(options.originalDir, 'exodus.json'))
    expect(strongsOf(original)).toEqual([[1, [['H1', 'H7225'], ['H1'], ['H7225']]]])
  })

  it('신약 책은 본문을 읽거나 받기 전에 멈춘다', async () => {
    await expect(runOriginal('matthew', optionsOf())).rejects.toThrow('신약 원어 자료는 아직 정하지 않았어요(마태복음)')
    expect(urls).toEqual([])
  })

  it('OSHB 주소는 책의 OSIS 코드로 만든다', () => {
    expect(oshbUrl('exodus').endsWith('/wlc/Exod.xml')).toBe(true)
    expect(oshbUrl('1-samuel').endsWith('/wlc/1Sam.xml')).toBe(true)
  })
})

describe('originalBooks', () => {
  it('모든 책을 돌릴 때 구약 책만 남기고, 신약 책은 건너뛴다고 알린다', () => {
    const lines: string[] = []
    expect(originalBooks(['genesis', 'malachi', 'matthew', 'romans'], (line) => lines.push(line))).toEqual(['genesis', 'malachi'])
    expect(lines).toEqual(['마태복음은 신약이라 원어를 건너뜁니다', '로마서는 신약이라 원어를 건너뜁니다'])
  })

  it('구약 책뿐이면 그대로이고 알리지 않는다', () => {
    const lines: string[] = []
    expect(originalBooks(['genesis', 'psalms'], (line) => lines.push(line))).toEqual(['genesis', 'psalms'])
    expect(lines).toEqual([])
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
