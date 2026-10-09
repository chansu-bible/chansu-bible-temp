import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanHebrew, strongOf } from '../src/original/hebrew.ts'
import { posLabel } from '../src/original/morph.ts'
import { parseOshb } from '../src/original/oshb.ts'
import { oshbUrl, runOriginal, STRONGS_URL } from '../src/original/runOriginal.ts'
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

describe('runOriginal', () => {
  let dir: string
  let urls: string[]
  const fetchText = async (url: string) => {
    urls.push(url)
    return url === STRONGS_URL ? strongs : oshb
  }
  const chapterOne = { chapter: 1, verses: [{ verse: 1, text: '태초에' }] }
  const optionsOf = () => ({ fetchText, sourceDir: dir, originalDir: path.join(dir, 'original'), lexiconFile: path.join(dir, 'lexicon.json') })

  beforeEach(async () => {
    urls = []
    dir = await mkdtemp(path.join(tmpdir(), 'original-'))
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify({ book: '창세기', translation: '개역한글', chapters: [chapterOne] }))
    await writeFile(path.join(dir, 'exodus.json'), JSON.stringify({ book: '출애굽기', translation: '개역한글', chapters: [chapterOne] }))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('책의 OSIS 이름으로 OSHB를 받아 original/<책 id>.json과 사전을 쓴다', async () => {
    const lines: string[] = []
    const options = optionsOf()
    const result = await runOriginal('genesis', options, (line) => lines.push(line))

    expect(urls).toEqual([
      'https://raw.githubusercontent.com/openscriptures/morphhb/3d15126fb1ef74867fc1434be1942e837932691f/wlc/Gen.xml',
      STRONGS_URL,
    ])
    expect(lines[0]).toBe('OSHB 창세기를 받는 중…')
    expect(result).toMatchObject({ chapters: 1, words: 4, entries: 1 })
    const original = JSON.parse(await readFile(path.join(options.originalDir, 'genesis.json'), 'utf8'))
    expect(original.chapters.map((chapter: { chapter: number }) => chapter.chapter)).toEqual([1])
    expect(existsSync(options.lexiconFile)).toBe(true)

    // 같은 책은 다시 만들 수 있다.
    await expect(runOriginal('genesis', options)).resolves.toMatchObject({ chapters: 1 })
  })

  it('다른 책 원어가 이미 있으면 받기 전에 멈춘다(사전이 아직 한 책으로만 세므로)', async () => {
    const options = optionsOf()
    await mkdir(options.originalDir, { recursive: true })
    await writeFile(path.join(options.originalDir, 'genesis.json'), JSON.stringify({ chapters: [] }))
    await writeFile(path.join(options.originalDir, 'lexicon.json'), JSON.stringify({ entries: [] }))
    await expect(runOriginal('exodus', options)).rejects.toThrow(
      '원어 사전은 아직 한 책으로만 만듭니다. 창세기 원어가 이미 있어 출애굽기 원어를 만들 수 없습니다.',
    )
    expect(urls).toEqual([])
  })

  it('OSHB 주소는 책의 OSIS 코드로 만든다', () => {
    expect(oshbUrl('exodus').endsWith('/wlc/Exod.xml')).toBe(true)
    expect(oshbUrl('1-samuel').endsWith('/wlc/1Sam.xml')).toBe(true)
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
