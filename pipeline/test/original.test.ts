import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getBook } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanHebrew, strongOf } from '../src/original/hebrew.ts'
import { posLabel } from '../src/original/morph.ts'
import { parseOshb } from '../src/original/oshb.ts'
import { buildLexicon, memoizeFetch, originalBooks, oshbUrl, runOriginal } from '../src/original/runOriginal.ts'
import { parseStrongs } from '../src/original/strongs.ts'
import { STRONGS_URL } from '../src/original/urls.ts'
import { OSHB_VERSE_MAP_URL } from '../src/original/verseMap.ts'
import { displayPath } from '../src/paths.ts'
import type { KoreanGloss, LexiconEntry, LexiconFile, OriginalFile } from '../src/schema.ts'

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
      </div>
      <div type="entry" n="1254">
        <w gloss="278" lemma="בָּרָא" morph="v" POS="baw-raw'" xlit="bârâʼ" ID="H1254" xml:lang="heb">ברא</w>
        <note type="explanation">(absolutely) <hi>to create</hi></note>
        <note type="translation">choose, create (creator), cut down, dispatch, do, make (fat).</note>
      </div>
      <div type="entry" n="5921">
        <w gloss="1624p" lemma="עַל" morph="prep" POS="al" xlit="ʻal" ID="H5921" xml:lang="heb">על</w>
        <note type="explanation"><hi>above</hi>, <hi>over</hi>, <hi>upon</hi>, or <hi>against</hi></note>
        <note type="translation">above, according to(-ly), after.</note>
      </div>
      <div type="entry" n="6440">
        <w gloss="1782a" lemma="פָּנִים" morph="n-m" POS="paw-neem'" xlit="pânîym" ID="H6440" xml:lang="heb">פנים</w>
        <note type="explanation"><hi>the face</hi> (as the part that turns)</note>
        <note type="translation">face, presence, sight.</note>
      </div>`

// 사람이 쓴 한국어 뜻과 시험용 사전 항목
const gloss: KoreanGloss = { meaning: '아버지', note: '사람이 쓴 뜻', status: 'approved' }
const entryOf = (strong: string, korean: KoreanGloss | null): LexiconEntry => ({
  strong,
  lemma: 'אָב',
  xlit: 'ʼâb',
  pos: 'n-m',
  definition: 'father',
  usage: 'father',
  count: 5,
  korean,
})

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

// OSHB Deut.xml의 신명기 6:4 그대로. 첫 낱말과 끝 낱말의 마지막 글자는 큰 글자라 낱말 안에 seg로 적혀 있다.
const shema = `<verse osisID="Deut.6.4">
<w lemma="8085" n="1.0" morph="HVqv2ms" id="05WH5">שְׁמַ֖<seg type="x-large">ע</seg></w>
<note n="5">Large letter(s). Shown as large letters without a superscript note number. </note>
<w lemma="3478" n="1" morph="HNp" id="05Wu9">יִשְׂרָאֵ֑ל</w>
<w lemma="3068" morph="HNp" id="05Wfj">יְהוָ֥ה</w>
<w lemma="430" n="0.0" morph="HNcmpc/Sp1cp" id="05MRr">אֱלֹהֵ֖י/נוּ</w>
<w lemma="3068" morph="HNp" id="05d46">יְהוָ֥ה</w>
<seg type="x-paseq">׀</seg>
<w lemma="259" n="0" morph="HAcmsa" id="05vGY">אֶחָֽ<seg type="x-large">ד</seg></w><seg type="x-sof-pasuq">׃</seg>
<note n="5">Large letter(s). Shown as large letters without a superscript note number. </note>
</verse>`

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

  it('큰 글자처럼 안에 seg가 든 낱말도 빠뜨리지 않고, 그 글자는 보통 글자로 둔다(신명기 6:4)', () => {
    const words = parseOshb(shema)[0]!.verses[0]!.words
    expect(words.map((word) => [word.strong, word.morph])).toEqual([
      ['H8085', 'HVqv2ms'],
      ['H3478', 'HNp'],
      ['H3068', 'HNp'],
      ['H430', 'HNcmpc/Sp1cp'],
      ['H3068', 'HNp'],
      ['H259', 'HAcmsa'],
    ])
    // seg 태그만 지운 낱말과 같고, 큰 글자(ע, ד)가 낱말 끝에 남는다.
    expect(parseOshb(shema)).toEqual(parseOshb(shema.replace(/<seg type="x-large">([^<]*)<\/seg>/g, '$1')))
    expect(words[0]!.text.endsWith('ע')).toBe(true)
    expect(words[5]!.text.endsWith('ד')).toBe(true)
    expect(words.some((word) => word.text.includes('<'))).toBe(false)
  })
})

// 크티브(쓰인 대로)와 크레(읽는 대로)가 있는 OSHB 절 그대로(줄 앞 들여쓰기만 뺐다).
// 창세기 8:17: 크티브 하나(הוצא) → 크레 하나(הַיְצֵא)
const gen817 = `<verse osisID="Gen.8.17">
<w lemma="3605" morph="HNcmsc" id="01PUa">כָּל</w><seg type="x-maqqef">־</seg><w lemma="d/2416 c" morph="HTd/Ncfsa" id="01r3q">הַ/חַיָּ֨ה</w>
<w lemma="834 a" morph="HTr" id="01i7e">אֲשֶֽׁר</w><seg type="x-maqqef">־</seg><w lemma="854" n="1.0.2.0" morph="HR/Sp2ms" id="01Mem">אִתְּ/ךָ֜</w>
<w lemma="m/3605" morph="HR/Ncmsc" id="01wNK">מִ/כָּל</w><seg type="x-maqqef">־</seg><w lemma="1320" n="1.0.2" morph="HNcmsa" id="01bwY">בָּשָׂ֗ר</w>
<w lemma="b/5775" morph="HRd/Ncmsa" id="015e6">בָּ/ע֧וֹף</w>
<w lemma="c/b/929" n="1.0.1" morph="HC/Rd/Ncfsa" id="01yr6">וּ/בַ/בְּהֵמָ֛ה</w>
<w lemma="c/b/3605" morph="HC/R/Ncmsc" id="01ckn">וּ/בְ/כָל</w><seg type="x-maqqef">־</seg><w lemma="d/7431" n="1.0.0" morph="HTd/Ncmsa" id="01vA4">הָ/רֶ֛מֶשׂ</w>
<w lemma="d/7430" morph="HTd/Vqrmsa" id="01KEn">הָ/רֹמֵ֥שׂ</w>
<w lemma="5921 a" morph="HR" id="01cPC">עַל</w><seg type="x-maqqef">־</seg><w lemma="d/776" n="1.0" morph="HTd/Ncbsa" id="01Eoc">הָ/אָ֖רֶץ</w>
<w type="x-ketiv" lemma="3318" morph="HVhv2ms" id="01Pdv">הוצא</w><note type="variant"><catchWord>הוצא</catchWord><rdg type="x-qere"><w lemma="3318" morph="HVhv2ms" id="01S7t">הַיְצֵ֣א</w></rdg></note>
<w lemma="854" n="1" morph="HR/Sp2fs" id="018F2">אִתָּ֑/ךְ</w>
<w lemma="c/8317" morph="HC/Vqq3cp" id="01T2K">וְ/שָֽׁרְצ֣וּ</w>
<w lemma="b/776" n="0.1" morph="HRd/Ncbsa" id="01ouG">בָ/אָ֔רֶץ</w>
<w lemma="c/6509" morph="HC/Vqq3cp" id="01xxG">וּ/פָר֥וּ</w>
<w lemma="c/7235 a" n="0.0" morph="HC/Vqq3cp" id="01vin">וְ/רָב֖וּ</w>
<w lemma="5921 a" morph="HR" id="01KSD">עַל</w><seg type="x-maqqef">־</seg><w lemma="d/776" n="0" morph="HTd/Ncbsa" id="01Eiv">הָ/אָֽרֶץ</w><seg type="x-sof-pasuq">׃</seg>
</verse>`
// 창세기 30:11: 크티브 하나(ב/גד) → 크레 둘(בָּא גָד)
const gen3011 = `<verse osisID="Gen.30.11">
<w lemma="c/559" morph="HC/Vqw3fs" id="01uhc">וַ/תֹּ֥אמֶר</w>
<w lemma="3812" n="1.0" morph="HNp" id="01iC6">לֵאָ֖ה</w>
<w type="x-ketiv" lemma="b/1409" morph="HR/Ncmsa" id="01VG3">ב/גד</w><note type="variant"><catchWord>ב/גד</catchWord><rdg type="x-qere"><w lemma="935" morph="HVqrmsa" id="01Q3H">בָּ֣א</w> <w lemma="1409" n="1" morph="HNcmsa" id="01gKG">גָ֑ד</w></rdg></note>
<w lemma="c/7121" morph="HC/Vqw3fs" id="01tXk">וַ/תִּקְרָ֥א</w>
<w lemma="853" morph="HTo" id="01Nsp">אֶת</w><seg type="x-maqqef">־</seg><w lemma="8034" n="0.0" morph="HNcmsc/Sp3ms" id="01Pj7">שְׁמ֖/וֹ</w>
<w lemma="1410" n="0" morph="HNp" id="0188b">גָּֽד</w><seg type="x-sof-pasuq">׃</seg>
</verse>`
// 욥기 38:1: 크티브 둘(מנ ה/סערה) 사이에 다른 note가 있고 → 크레 둘
const job381 = `<verse osisID="Job.38.1">
<w lemma="c/6030 b" morph="HC/Vqw3ms" id="18A8D">וַ/יַּֽעַן</w><seg type="x-maqqef">־</seg><w lemma="3068" morph="HNp" id="18hrv">יְהוָ֣ה</w>
<w lemma="853" morph="HTo" id="18vzq">אֶת</w><seg type="x-maqqef">־</seg><w lemma="347" n="1.0" morph="HNp" id="18RTB">אִ֭יּוֹב</w>
<w type="x-ketiv" lemma="4480 a" morph="HR" id="18rDJ">מנ</w>
<note n="M">Marks a word with a final consonant that is a medial (not a final) form. </note>
<w type="x-ketiv" lemma="d/5591 b" morph="HTd/Ncfsa" id="18ZbD">ה/סערה</w><note type="variant"><catchWord>מנ ה/סערה</catchWord><rdg type="x-qere"><w lemma="4480 a" morph="HR" id="18pe5">מִ֥ן</w> <seg type="x-paseq">׀</seg><w lemma="d/5591 b" n="1" morph="HTd/Ncfsa" id="18Gfh">הַ/סְּעָרָ֗ה</w></rdg></note>
<w lemma="c/559" n="0" morph="HC/Vqw3ms" id="18sZ7">וַ/יֹּאמַֽר</w><seg type="x-sof-pasuq">׃</seg>
</verse>`
// 룻기 3:12: 크레가 비었다(쓰였지만 읽지 않는 אם)
const ruth312 = `<verse osisID="Ruth.3.12">
<w lemma="c/6258" n="1.1.0" morph="HC/D" id="08pVx">וְ/עַתָּה֙</w>
<w lemma="3588 a" morph="HC" id="08WAq">כִּ֣י</w>
<w lemma="551" n="1.1" morph="HD" id="08PxM">אָמְנָ֔ם</w>
<w lemma="3588 a" morph="HC" id="08oCH">כִּ֥י</w>
<w type="x-ketiv" lemma="518 a" morph="HC" id="08tQE">אם</w><note type="variant"><catchWord>אם</catchWord><rdg type="x-qere"/></note>
<w lemma="1350 a" n="1.0" morph="HVqrmsa" id="08wtX">גֹאֵ֖ל</w>
<w lemma="595" n="1" morph="HPp1cs" id="08Hso">אָנֹ֑כִי</w>
<w lemma="c/1571" n="0.0.0" morph="HC/Ta" id="08yS3">וְ/גַ֛ם</w>
<w lemma="3426" morph="HTm" id="08PHG">יֵ֥שׁ</w>
<w lemma="1350 a" n="0.0" morph="HVqrmsa" id="081go">גֹּאֵ֖ל</w>
<w lemma="7138" morph="HAamsa" id="08XLB">קָר֥וֹב</w>
<w lemma="4480 a" n="0" morph="HR/Sp1cs" id="08KTJ">מִמֶּֽ/נִּי</w><seg type="x-sof-pasuq">׃</seg>
</verse>`
// 룻기 3:5: 크티브 없는 크레(쓰이지 않았지만 읽는 אֵלַי)
const ruth35 = `<verse osisID="Ruth.3.5">
<w lemma="c/559" n="1.0" morph="HC/Vqw3fs" id="08pcg">וַ/תֹּ֖אמֶר</w>
<w lemma="413" n="1" morph="HR/Sp3fs" id="081pD">אֵלֶ֑י/הָ</w>
<w lemma="3605" n="0.0.0" morph="HNcmsa" id="08UCh">כֹּ֛ל</w>
<w lemma="834 a" morph="HTr" id="08jZZ">אֲשֶׁר</w><seg type="x-maqqef">־</seg><w lemma="559" morph="HVqi2fs" id="087a3">תֹּאמְרִ֥י</w>
<note type="variant"><rdg type="x-qere"><w lemma="413" n="0.0" morph="HR/Sp1cs" id="08k23">אֵלַ֖/י</w></rdg></note>
<w lemma="6213 a" n="0" morph="HVqi1cs" id="08nxs">אֶֽעֱשֶֽׂה</w><seg type="x-sof-pasuq">׃</seg>
</verse>`

// 첫 절의 낱말
const wordsOf = (xml: string) => parseOshb(xml)[0]!.verses[0]!.words
// 고정값의 크레 낱말(<rdg type="x-qere"> 안의 <w>)과 크티브 낱말(<w type="x-ketiv">)을 parseOshb처럼 다듬은 글
const qereTexts = (xml: string) =>
  [...xml.matchAll(/<rdg type="x-qere">([\s\S]*?)<\/rdg>/g)].flatMap((rdg) =>
    [...rdg[1]!.matchAll(/<w [^>]*>([^<]*)<\/w>/g)].map((word) => cleanHebrew(word[1]!)),
  )
const ketivTexts = (xml: string) => [...xml.matchAll(/<w type="x-ketiv"[^>]*>([^<]*)<\/w>/g)].map((word) => cleanHebrew(word[1]!))

describe('parseOshb 크티브와 크레', () => {
  it('크티브 자리에 크레를 쓰고 크레를 따로 한 번 더 읽지 않는다(창세기 8:17은 H3318 하나)', () => {
    const words = wordsOf(gen817)
    expect(words.map((word) => word.strong)).toEqual([
      'H3605', 'H2416', 'H834', 'H854', 'H3605', 'H1320', 'H5775', 'H929', 'H3605', 'H7431', 'H7430',
      'H5921', 'H776', 'H3318', 'H854', 'H8317', 'H776', 'H6509', 'H7235', 'H5921', 'H776',
    ])
    expect(words.filter((word) => word.strong === 'H3318')).toEqual([{ text: qereTexts(gen817)[0], strong: 'H3318', morph: 'HVhv2ms' }])
    expect(words.map((word) => word.text)).not.toContain(ketivTexts(gen817)[0])
  })

  it('크티브 하나가 크레 둘로 바뀐다(창세기 30:11)', () => {
    const words = wordsOf(gen3011)
    expect(words.map((word) => word.strong)).toEqual(['H559', 'H3812', 'H935', 'H1409', 'H7121', 'H853', 'H8034', 'H1410'])
    expect(words.slice(2, 4).map((word) => word.text)).toEqual(qereTexts(gen3011))
    expect(words.map((word) => word.text)).not.toContain(ketivTexts(gen3011)[0])
  })

  it('크티브 둘 사이에 다른 note가 있어도 둘 다 크레 둘로 바뀐다(욥기 38:1)', () => {
    const words = wordsOf(job381)
    expect(words.map((word) => word.strong)).toEqual(['H6030', 'H3068', 'H853', 'H347', 'H4480', 'H5591', 'H559'])
    expect(words.slice(4, 6).map((word) => word.text)).toEqual(qereTexts(job381))
    for (const ketiv of ketivTexts(job381)) expect(words.map((word) => word.text)).not.toContain(ketiv)
  })

  it('크레가 비었으면(쓰였지만 읽지 않는 낱말) 크티브를 뺀다(룻기 3:12)', () => {
    const words = wordsOf(ruth312)
    expect(words.map((word) => word.strong)).toEqual(['H6258', 'H3588', 'H551', 'H3588', 'H1350', 'H595', 'H1571', 'H3426', 'H1350', 'H7138', 'H4480'])
    expect(words.map((word) => word.text)).not.toContain(ketivTexts(ruth312)[0])
  })

  it('크티브 없는 크레(쓰이지 않았지만 읽는 낱말)는 그 자리에 넣는다(룻기 3:5)', () => {
    const words = wordsOf(ruth35)
    expect(words.map((word) => word.strong)).toEqual(['H559', 'H413', 'H3605', 'H834', 'H559', 'H413', 'H6213'])
    expect(words[5]!.text).toBe(qereTexts(ruth35)[0])
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
    expect(result).toEqual({ chapters: 1, words: 4, entries: 4, withKorean: 0, skipped: [] })
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
    expect(lexicon.entries.map((entry) => [entry.strong, entry.count])).toEqual([
      ['H1254', 1],
      ['H5921', 1],
      ['H6440', 1],
      ['H7225', 1],
    ])
    lexicon.entries.find((entry) => entry.strong === 'H7225')!.korean = { meaning: '처음', note: '', status: 'approved' }
    await writeFile(options.lexiconFile, JSON.stringify(lexicon))

    const result = await runOriginal('exodus', options)

    expect(result).toEqual({ chapters: 1, words: 4, entries: 5, withKorean: 1, skipped: [] })
    // H7225는 창세기 1:1에 한 번, 출애굽기 1:1과 1:3(WLC 2:1)에 두 번. H1은 출애굽기 1:1, 1:2
    const saved = await readJson<LexiconFile>(options.lexiconFile)
    expect(saved.entries.map((entry) => [entry.strong, entry.count, entry.korean])).toEqual([
      ['H1', 2, null],
      ['H1254', 1, null],
      ['H5921', 1, null],
      ['H6440', 1, null],
      ['H7225', 3, { meaning: '처음', note: '', status: 'approved' }],
    ])
    // 앞 책 원어는 그대로다.
    expect(await readFile(path.join(options.originalDir, 'genesis.json'), 'utf8')).toBe(genesis)
  })

  it('히브리어 절 번호를 개역한글 절 번호로 옮기고, 절 나눔이 본문과 다른 장은 원어 없이 두고 알린다', async () => {
    const lines: string[] = []
    const options = optionsOf()
    await writeSource('exodus', [3, 3, 2])
    const result = await runOriginal('exodus', options, (line) => lines.push(line))

    // WLC 2:1이 KJV 1:3으로 가서 1장은 1~3절이 되고, 2장에는 2~3절만 남는다. 3장은 OSHB에 아예 없다.
    expect(result).toMatchObject({ chapters: 1, skipped: [2, 3] })
    expect(lines).toContain('출애굽기 2장은 히브리어와 개역한글의 절 나눔이 달라 원어를 넣지 않았습니다(본문 3절, 원어 2절)')
    expect(lines).toContain('출애굽기 3장은 히브리어와 개역한글의 절 나눔이 달라 원어를 넣지 않았습니다(본문 2절, 원어 0절)')
    const original = await readJson<OriginalFile>(path.join(options.originalDir, 'exodus.json'))
    expect(strongsOf(original)).toEqual([[1, [['H1', 'H7225'], ['H1'], ['H7225']]]])
  })

  it('본문의 어느 장에도 원어를 맞추지 못하면 아무 파일도 쓰지 않고 멈춘다', async () => {
    const options = optionsOf()
    // OSHB 출애굽기 1장은 KJV 절 번호로 옮기면 3절이라 5절인 본문과 맞지 않는다.
    await writeSource('exodus', [5])
    await expect(runOriginal('exodus', options)).rejects.toThrow(
      `출애굽기 본문의 어느 장에도 원어를 맞추지 못했습니다. 받은 OSHB와 절 대응표가 맞는지 보세요: ${oshbUrl('exodus')}, ${OSHB_VERSE_MAP_URL}`,
    )
    expect(existsSync(path.join(options.originalDir, 'exodus.json'))).toBe(false)
    expect(existsSync(options.lexiconFile)).toBe(false)
  })

  it.each([
    [
      '스트롱 사전',
      STRONGS_URL,
      `스트롱 사전에 없는 번호가 4개 있습니다(H1254, H5921, H6440, H7225). 받은 글이 스트롱 사전인지 보세요: ${STRONGS_URL}`,
    ],
    ['OSHB', oshbUrl('genesis'), `OSHB 창세기 자료에서 절을 하나도 찾지 못했습니다. 받은 글이 OSHB 파일인지 보세요: ${oshbUrl('genesis')}`],
    ['절 대응표', OSHB_VERSE_MAP_URL, `받은 절 대응표에 <verseMap>이 없습니다. 받은 글이 VerseMap.xml인지 보세요: ${OSHB_VERSE_MAP_URL}`],
  ])('받은 %s 글이 HTML 쪽 같은 엉뚱한 글이면 아무 파일도 쓰지 않고 주소를 대며 멈춘다', async (_, junkUrl, message) => {
    // 사이에 낀 프록시가 200으로 돌려준 HTML 쪽
    const options = { ...optionsOf(), fetchText: async (url: string) => (url === junkUrl ? '<html><body>로그인하세요</body></html>' : fetchText(url)) }
    await mkdir(options.originalDir, { recursive: true })
    const lexicon = JSON.stringify({ entries: [entryOf('H7225', gloss)] }, null, 2) + '\n'
    await writeFile(options.lexiconFile, lexicon)

    await expect(runOriginal('genesis', options)).rejects.toThrow(message)
    expect(existsSync(path.join(options.originalDir, 'genesis.json'))).toBe(false)
    expect(await readFile(options.lexiconFile, 'utf8')).toBe(lexicon)
  })

  it('사전 파일이 깨졌으면 받기 전에 그 파일 이름을 대고 멈춘다', async () => {
    const options = optionsOf()
    await mkdir(options.originalDir, { recursive: true })
    await writeFile(options.lexiconFile, '{ 깨진 JSON')

    await expect(runOriginal('genesis', options)).rejects.toThrow(`${displayPath(options.lexiconFile)}: `)
    expect(urls).toEqual([])
    expect(existsSync(path.join(options.originalDir, 'genesis.json'))).toBe(false)
    expect(await readFile(options.lexiconFile, 'utf8')).toBe('{ 깨진 JSON')
  })

  it('다른 책 원어 파일이 깨졌으면 받거나 쓰기 전에 그 파일 이름을 대고 멈춘다', async () => {
    const options = optionsOf()
    await mkdir(options.originalDir, { recursive: true })
    const exodusFile = path.join(options.originalDir, 'exodus.json')
    await writeFile(exodusFile, '{ 깨진 JSON')
    await writeFile(options.lexiconFile, '{"entries":[]}')

    await expect(runOriginal('genesis', options)).rejects.toThrow(`${displayPath(exodusFile)}: `)
    // 이 책 원어도 사전도 쓰지 않았고, 받지도 않았다.
    expect(existsSync(path.join(options.originalDir, 'genesis.json'))).toBe(false)
    expect(await readFile(options.lexiconFile, 'utf8')).toBe('{"entries":[]}')
    expect(urls).toEqual([])
  })

  it('어느 책 원어에도 나오지 않게 된 번호는 한국어 뜻이 있으면 횟수 0으로 남기고, 뜻이 없으면 뺀다', async () => {
    const lines: string[] = []
    const options = optionsOf()
    await mkdir(options.originalDir, { recursive: true })
    // 창세기 고정값에는 H1과 H2가 나오지 않는다.
    await writeFile(options.lexiconFile, JSON.stringify({ entries: [entryOf('H1', gloss), entryOf('H2', null)] }))

    const result = await runOriginal('genesis', options, (line) => lines.push(line))

    const saved = await readJson<LexiconFile>(options.lexiconFile)
    expect(saved.entries.map((entry) => [entry.strong, entry.count])).toEqual([
      ['H1', 0],
      ['H1254', 1],
      ['H5921', 1],
      ['H6440', 1],
      ['H7225', 1],
    ])
    // 남긴 항목은 횟수만 0이고 나머지는 그대로다.
    expect(saved.entries[0]).toEqual({ ...entryOf('H1', gloss), count: 0 })
    expect(result).toMatchObject({ entries: 5, withKorean: 1 })
    expect(lines).toContain('어느 책 원어에도 나오지 않지만 한국어 뜻이 있어 남긴 사전 항목 1개: H1')
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

describe('memoizeFetch', () => {
  it('같은 주소는 한 번만 받고, 받다가 실패한 주소는 다음에 다시 받는다', async () => {
    const calls: string[] = []
    let failing = true
    const fetchText = memoizeFetch(async (url) => {
      calls.push(url)
      if (url === 'b' && failing) {
        failing = false
        throw new Error('연결이 끊겼습니다')
      }
      return `${url}의 글`
    })

    expect(await fetchText('a')).toBe('a의 글')
    expect(await fetchText('a')).toBe('a의 글')
    await expect(fetchText('b')).rejects.toThrow('연결이 끊겼습니다')
    expect(await fetchText('b')).toBe('b의 글')
    expect(await fetchText('b')).toBe('b의 글')
    expect(calls).toEqual(['a', 'b', 'b'])
  })
})

describe('buildLexicon', () => {
  const word = (strong: string) => ({ text: 'א', strong, morph: 'HNcmsa' })

  it('한국어 뜻이 있는 이전 항목은 사전에서 만들지 못해도 남기고, 스트롱 사전에 없는 번호는 missing으로 알린다', () => {
    const original: OriginalFile = { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word('H7225'), word('H9999'), word('H9999')] }] }] }
    // H9999는 원어에 나오지만 스트롱 사전에 없고, H8888은 어느 원어에도 없다. H7777은 한국어 뜻이 없다.
    const previous = [entryOf('H9999', gloss), entryOf('H8888', gloss), entryOf('H7777', null), entryOf('H7225', null)]

    const { entries, missing, kept } = buildLexicon([original], strongs, previous)

    expect(missing).toEqual(['H9999'])
    expect(kept.map((entry) => [entry.strong, entry.count])).toEqual([
      ['H8888', 0],
      ['H9999', 2],
    ])
    expect(entries.map((entry) => [entry.strong, entry.count, entry.korean?.meaning ?? null])).toEqual([
      ['H7225', 1, null],
      ['H8888', 0, '아버지'],
      ['H9999', 2, '아버지'],
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
