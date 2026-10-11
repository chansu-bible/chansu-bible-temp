import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sceneIdOf, type BookId } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { displayPath } from '../src/paths.ts'
import { chapterChecks } from '../src/release/checks.ts'
import { chapterInputsOf, findChapterInputs, readReleaseInputs, type ReleaseInputsOptions } from '../src/release/inputs.ts'
import type { Place, QuizQuestion, Scene } from '../src/schema.ts'
import { readAudioCatalog } from '../src/tts/audioCatalog.ts'
import { mp3DurationMs } from '../src/tts/mp3.ts'

// 폴더 목록의 순서는 운영체제마다 다르다(NTFS는 이름순이고 macOS는 아니다). reversed를 켜면 readdir이 목록을 거꾸로 돌려준다.
// 어느 운영체제에서 돌려도 "목록 순서에 기대면 결과가 달라지는" 상태가 되어, 이름순으로 정렬하지 않는 코드를 잡는다.
const listing = vi.hoisted(() => ({ reversed: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const list = actual.readdir as (...args: unknown[]) => Promise<unknown[]>
  const readdirOrReversed = async (...args: unknown[]) => {
    const names = await list(...args)
    return listing.reversed ? [...names].reverse() : names
  }
  return { ...actual, readdir: readdirOrReversed }
})

// 임시 폴더에 두 책(창세기 2장, 출애굽기 1장)의 content를 만들어 읽는다. 저장소의 content는 읽지 않는다.
// 창세기 1장은 모두 갖춘 장이고(장면 둘 승인, 그림 버전 둘, 절 낭독 셋), 2장은 본문뿐이다.

const verses = (...texts: string[]) => texts.map((text, index) => ({ verse: index + 1, text }))

const genesisSource = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    { chapter: 1, verses: verses('가', '나', '다') },
    { chapter: 2, verses: verses('라', '마') },
  ],
}
const exodusSource = { book: '출애굽기', translation: '개역한글', chapters: [{ chapter: 1, verses: verses('바', '사') }] }

const G11 = sceneIdOf('genesis', 1, 1)
const G12 = sceneIdOf('genesis', 1, 2)
const E11 = sceneIdOf('exodus', 1, 1)

function scene(id: string, chapter: number, verseStart: number, verseEnd: number, status: Scene['review']['status'] = 'approved'): Scene {
  return {
    id,
    chapter,
    verseStart,
    verseEnd,
    title: `${id} 제목`,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    visual: { description: '그림', characters: [] },
    placeId: null,
    eraId: null,
    image: null,
    review: { status, text: null, facts: null, image: null, attempts: 0 },
  }
}

function place(id: string, name: string, firstAppearance: string): Place {
  return {
    id,
    name,
    aliases: [],
    status: 'approved',
    facts: { firstAppearance, description: `${name} 설명`, sources: [firstAppearance] },
    location: { lat: 31, lng: 47, certainty: '추정' },
    design: { landscape: '', notes: '' },
  }
}

function question(chapterStem: string, number: number, status: QuizQuestion['status']): QuizQuestion {
  return {
    id: `${chapterStem}-q${number}`,
    question: '질문',
    options: ['가', '나', '다', '라'],
    answer: 0,
    explanation: '해설',
    verse: 1,
    status,
    issues: [],
  }
}

// MPEG-1 Layer III 128kbps 44.1kHz 프레임(417바이트, 약 26ms)을 count개 이은 낭독(writeBundles.test.ts와 같은 프레임)
function mp3(count: number): Buffer {
  const frame = Buffer.alloc(417)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  return Buffer.concat(Array.from({ length: count }, () => frame))
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const word = (strong: string | null) => ({ text: '낱말', strong, morph: 'HNcmsa' })
const lexiconEntry = (strong: string, korean: { meaning: string; note: string; status: 'draft' | 'approved' } | null) => ({
  strong,
  lemma: '표제어',
  xlit: 'xlit',
  pos: 'n',
  definition: 'definition',
  usage: '',
  count: 1,
  korean,
})

describe('공개 점검과 콘텐츠 읽기', () => {
  let root: string
  // 모든 폴더를 임시 폴더로 바꿔 준다. Required라서 폴더 옵션이 늘면 이 시험이 형 검사에서 걸린다.
  let dirs: Required<ReleaseInputsOptions>

  async function put(file: string, data: unknown): Promise<void> {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data instanceof Uint8Array ? data : JSON.stringify(data))
  }

  const readInputs = () => readReleaseInputs(dirs)

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'release-checks-'))
    const content = path.join(root, 'content')
    dirs = {
      sourceDir: path.join(content, 'source'),
      scenesDir: path.join(content, 'scenes'),
      quizDir: path.join(content, 'quiz'),
      originalDir: path.join(content, 'original'),
      lexiconFile: path.join(content, 'original', 'lexicon.json'),
      storyBibleDir: path.join(content, 'story-bible'),
      styleFile: path.join(content, 'story-bible', 'style.json'),
      imagesDir: path.join(content, 'images'),
      imageVersionsFile: path.join(content, 'images', 'versions.json'),
      audioDir: path.join(content, 'audio'),
    }
    await put('content/source/genesis.json', genesisSource)
    await put('content/source/exodus.json', exodusSource)
    await put('content/scenes/genesis-01.json', { chapter: 1, scenes: [scene(G11, 1, 1, 2), scene(G12, 1, 3, 3)] })
    await put('content/scenes/exodus-01.json', { chapter: 1, scenes: [scene(E11, 1, 1, 2)] })
    // 그림 버전은 둘이고 기본은 마지막인 v2다. 두 버전 모두 창세기 1장의 장면마다 그림이 있다.
    await put('content/images/versions.json', [
      { id: 'v1', label: '1차', note: '' },
      { id: 'v2', label: '2차', note: '' },
    ])
    for (const version of ['v1', 'v2']) {
      for (const id of [G11, G12]) await put(`content/images/${version}/${id}.png`, png)
    }
    await put('content/audio/genesis-01-001.mp3', mp3(10))
    await put('content/audio/genesis-01-002.mp3', mp3(5))
    await put('content/audio/genesis-01-003.mp3', mp3(2))
  })

  afterEach(async () => {
    listing.reversed = false
    await rm(root, { recursive: true, force: true })
  })

  describe('chapterChecks', () => {
    const required = (scenesApproved: boolean, imagesComplete: boolean, audioComplete: boolean) => ({
      scenesApproved,
      imagesComplete,
      audioComplete,
    })
    const checksOf = async (book: BookId, chapter: number) => chapterChecks(await readInputs(), book, chapter)

    it('장면 승인, 기본 그림, 절 낭독을 모두 갖춘 장은 필수 점검이 모두 참이다. 선택 점검은 퀴즈와 원어가 없어 0이다', async () => {
      expect(await checksOf('genesis', 1)).toEqual({
        required: required(true, true, true),
        optional: { quizApproved: 0, glossesApproved: 0, glossesTotal: 0 },
      })
    })

    it.each(['draft', 'reviewed', 'flagged'] as const)('장면 하나가 %s이면 scenesApproved만 거짓이다', async (status) => {
      await put('content/scenes/genesis-01.json', { chapter: 1, scenes: [scene(G11, 1, 1, 2), scene(G12, 1, 3, 3, status)] })
      expect((await checksOf('genesis', 1)).required).toEqual(required(false, true, true))
    })

    it('장면 파일이 없는 장은 scenesApproved와 imagesComplete가 거짓이다. 낭독은 장면과 따로 본다', async () => {
      await put('content/audio/genesis-02-001.mp3', mp3(2))
      await put('content/audio/genesis-02-002.mp3', mp3(3))
      expect((await checksOf('genesis', 2)).required).toEqual(required(false, false, true))
    })

    it('장면이 하나도 없는 장면 파일도 통과하지 못한다', async () => {
      await put('content/scenes/genesis-02.json', { chapter: 2, scenes: [] })
      await put('content/audio/genesis-02-001.mp3', mp3(2))
      await put('content/audio/genesis-02-002.mp3', mp3(3))
      expect((await checksOf('genesis', 2)).required).toEqual(required(false, false, true))
    })

    it('기본 그림 버전에 그림이 하나 빠지면 imagesComplete가 거짓이다. 앞 버전에는 있어도 같다', async () => {
      await rm(path.join(dirs.imagesDir, 'v2', `${G12}.png`))
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, false, true))
    })

    it('앞 버전에 그림이 빠져도 기본 버전에 다 있으면 imagesComplete가 참이다', async () => {
      await rm(path.join(dirs.imagesDir, 'v1', `${G12}.png`))
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, true, true))
    })

    it('기본 그림 버전은 이름이 뒤인 버전이 아니라 버전 목록의 마지막이다', async () => {
      // 목록을 v2, v1 차례로 바꾸면 기본은 v1이다. 이름이 뒤인 v2에는 그림이 다 있어도 v1에 하나가 빠지면 거짓이다.
      await put('content/images/versions.json', [
        { id: 'v2', label: '2차', note: '' },
        { id: 'v1', label: '1차', note: '' },
      ])
      await rm(path.join(dirs.imagesDir, 'v1', `${G12}.png`))
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, false, true))
    })

    it('그림 버전이 하나도 없으면 imagesComplete가 거짓이다', async () => {
      await put('content/images/versions.json', [])
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, false, true))
    })

    it('기본 버전 폴더가 아직 없어도 던지지 않고 imagesComplete가 거짓이다', async () => {
      await put('content/images/versions.json', [
        { id: 'v1', label: '1차', note: '' },
        { id: 'v3', label: '3차', note: '' },
      ])
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, false, true))
    })

    it.each([
      ['다른 장면의 그림', `${E11}.png`],
      ['그림이 아닌 파일', `${G12}.txt`],
      ['끊긴 작업이 남긴 임시 파일', `${G12}.png.tmp`],
      ['대문자 확장자', `${G12}.PNG`],
      ['장면 id가 이름 끝에 붙은 파일', `x-${G12}.png`],
    ])('%s는 그 장면의 그림으로 세지 않는다', async (_name, other) => {
      await rm(path.join(dirs.imagesDir, 'v2', `${G12}.png`))
      await put(`content/images/v2/${other}`, png)
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, false, true))
    })

    it.each(['jpg', 'jpeg', 'webp'])('그림 확장자라면 png가 아니어도 된다(%s)', async (ext) => {
      await rm(path.join(dirs.imagesDir, 'v2', `${G12}.png`))
      await put(`content/images/v2/${G12}.${ext}`, png)
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, true, true))
    })

    it('절 낭독이 하나 빠지면 audioComplete가 거짓이다', async () => {
      await rm(path.join(dirs.audioDir, 'genesis-01-002.mp3'))
      expect((await checksOf('genesis', 1)).required).toEqual(required(true, true, false))
    })

    it('장의 절을 모두 채워야 참이다. 다른 장의 낭독은 세지 않는다', async () => {
      await put('content/audio/genesis-02-001.mp3', mp3(2))
      expect((await checksOf('genesis', 2)).required.audioComplete).toBe(false)
      await put('content/audio/genesis-02-002.mp3', mp3(3))
      expect((await checksOf('genesis', 2)).required.audioComplete).toBe(true)
    })

    // 비거나 MP3가 아닌 절 낭독은 길이를 잴 수 없다. 길이를 모르는 절은 장면 낭독에서 빠지므로 공개할 수 없다.
    it.each([
      ['비어 있는', Buffer.alloc(0)],
      ['MP3가 아닌', Buffer.from('MP3가 아닌 바이트')],
    ])('길이를 잴 수 없는(%s) 절 낭독이 있으면 audioComplete가 거짓이다', async (_name, bytes) => {
      await put('content/audio/genesis-01-002.mp3', bytes)
      const inputs = await readInputs()
      expect(inputs.audio.get('genesis-01-002.mp3')).toBeNull()
      expect(chapterChecks(inputs, 'genesis', 1).required).toEqual(required(true, true, false))
    })

    it('승인된 문제 수를 센다. 승인되지 않은 문제와 다른 장의 퀴즈는 세지 않는다', async () => {
      await put('content/quiz/genesis-01.json', {
        chapter: 1,
        questions: [
          question('genesis-01', 1, 'approved'),
          question('genesis-01', 2, 'approved'),
          question('genesis-01', 3, 'draft'),
          question('genesis-01', 4, 'reviewed'),
          question('genesis-01', 5, 'flagged'),
          question('genesis-01', 6, 'rejected'),
        ],
      })
      await put('content/quiz/genesis-02.json', { chapter: 2, questions: [question('genesis-02', 1, 'approved')] })
      const inputs = await readInputs()
      expect(chapterChecks(inputs, 'genesis', 1).optional.quizApproved).toBe(2)
      expect(chapterChecks(inputs, 'genesis', 2).optional.quizApproved).toBe(1)
      // 퀴즈 파일이 없는 책의 장은 0이다.
      expect(chapterChecks(inputs, 'exodus', 1).optional.quizApproved).toBe(0)
    })

    describe('원어 뜻', () => {
      beforeEach(async () => {
        // 1장: H7225가 둘, 접두사뿐인 낱말(strong null), H1254, H430, 사전에 없는 H1 → 서로 다른 번호는 넷
        await put('content/original/genesis.json', {
          chapters: [
            { chapter: 1, verses: [{ verse: 1, words: [word('H7225'), word('H1254'), word(null), word('H7225')] }, { verse: 2, words: [word('H430'), word('H1')] }] },
            { chapter: 2, verses: [{ verse: 1, words: [word('H5')] }] },
          ],
        })
      })

      it('그 장 원어의 서로 다른 스트롱 번호 수와, 그 가운데 한국어 뜻이 승인된 수를 센다', async () => {
        await put('content/original/lexicon.json', {
          entries: [
            lexiconEntry('H7225', { meaning: '처음', note: '', status: 'approved' }),
            // 초안이거나 한국어 뜻이 없는 항목, 사전에 항목이 없는 번호(H1)는 승인된 것이 아니다.
            lexiconEntry('H1254', { meaning: '창조하다', note: '', status: 'draft' }),
            lexiconEntry('H430', null),
            // 이 장에 나오지 않는 번호는 세지 않는다.
            lexiconEntry('H9999', { meaning: '다른 장', note: '', status: 'approved' }),
            lexiconEntry('H5', { meaning: '2장의 낱말', note: '', status: 'approved' }),
          ],
        })
        const inputs = await readInputs()
        expect(chapterChecks(inputs, 'genesis', 1).optional).toEqual({ quizApproved: 0, glossesApproved: 1, glossesTotal: 4 })
        expect(chapterChecks(inputs, 'genesis', 2).optional).toEqual({ quizApproved: 0, glossesApproved: 1, glossesTotal: 1 })
      })

      it('사전 파일이 없으면 승인된 뜻이 0이다', async () => {
        expect((await checksOf('genesis', 1)).optional).toEqual({ quizApproved: 0, glossesApproved: 0, glossesTotal: 4 })
      })

      it('원어 파일이 없는 책의 장은 둘 다 0이다', async () => {
        expect((await checksOf('exodus', 1)).optional).toEqual({ quizApproved: 0, glossesApproved: 0, glossesTotal: 0 })
      })

      it('원어 파일에 그 장이 없으면 둘 다 0이다', async () => {
        await put('content/original/genesis.json', { chapters: [{ chapter: 2, verses: [{ verse: 1, words: [word('H5')] }] }] })
        expect((await checksOf('genesis', 1)).optional).toEqual({ quizApproved: 0, glossesApproved: 0, glossesTotal: 0 })
      })
    })

    it('책마다 그 책의 장만 본다', async () => {
      // 출애굽기 1장은 장면은 승인됐지만 그림도 낭독도 없다. 창세기 1장이 갖추고 있어도 영향이 없다.
      const inputs = await readInputs()
      expect(chapterChecks(inputs, 'exodus', 1).required).toEqual(required(true, false, false))
      expect(chapterChecks(inputs, 'genesis', 1).required).toEqual(required(true, true, true))
    })

    it('본문에 없는 장, 책에 없는 장, 본문이 없는 책은 던진다', async () => {
      const inputs = await readInputs()
      expect(() => chapterChecks(inputs, 'genesis', 3)).toThrow('창세기 본문에 3장이 없습니다. 먼저 source --book genesis를 실행하세요.')
      expect(() => chapterChecks(inputs, 'genesis', 51)).toThrow('창세기에는 51장이 없습니다')
      expect(() => chapterChecks(inputs, 'leviticus', 1)).toThrow('레위기 본문이 없습니다. 먼저 source --book leviticus를 실행하세요.')
    })
  })

  describe('readReleaseInputs', () => {
    it('본문이 있는 책을 성경 순서로 모으고, 책마다 본문, 장면 파일, 퀴즈 파일, 원어 파일을 읽는다', async () => {
      // 책 파일이 아닌 이름은 건너뛴다. 장 번호의 반대 차례로 만들어도 장 번호 순으로 모은다.
      await put('content/source/notes.json', {})
      await put('content/scenes/genesis-02.json', { chapter: 2, scenes: [scene(sceneIdOf('genesis', 2, 1), 2, 1, 2)] })
      await put('content/quiz/genesis-02.json', { chapter: 2, questions: [question('genesis-02', 1, 'draft')] })
      await put('content/quiz/genesis-01.json', { chapter: 1, questions: [question('genesis-01', 1, 'approved')] })
      await put('content/original/genesis.json', { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word('H7225')] }] }] })

      const inputs = await readInputs()
      expect(inputs.books).toEqual(['genesis', 'exodus'])
      expect([...inputs.byBook.keys()]).toEqual(['genesis', 'exodus'])
      const genesis = inputs.byBook.get('genesis')!
      // 저장소의 창세기(50장)가 아니라 바꿔 준 폴더의 2장이다.
      expect(genesis.source.chapters.map((item) => item.chapter)).toEqual([1, 2])
      expect(genesis.sceneFiles.map((file) => file.chapter)).toEqual([1, 2])
      expect(genesis.quizzes.map((file) => file.chapter)).toEqual([1, 2])
      expect(genesis.original?.chapters.map((item) => item.chapter)).toEqual([1])
      const exodus = inputs.byBook.get('exodus')!
      expect(exodus.source.book).toBe('출애굽기')
      expect(exodus.sceneFiles.map((file) => file.chapter)).toEqual([1])
      expect(exodus.quizzes).toEqual([])
      expect(exodus.original).toBeNull()
      expect(inputs.byBook.has('leviticus')).toBe(false)
    })

    it('바꿔 준 폴더에서 설정집, 화풍, 사전, 그림 목록, 낭독 길이를 읽는다', async () => {
      await put('content/story-bible/places.json', [place('eden', '에덴', 'genesis 1:1')])
      await put('content/story-bible/style.json', { description: '수채화', promptPrefix: 'Watercolor.', promptRules: 'No faces.', references: [] })
      await put('content/original/lexicon.json', { entries: [lexiconEntry('H7225', { meaning: '처음', note: '', status: 'approved' })] })

      const inputs = await readInputs()
      // 설정집은 승인 전 항목까지 읽는다(승인된 것만 거르는 일은 묶음과 꾸러미를 만들 때 한다).
      expect(inputs.canon.places.map((item) => item.id)).toEqual(['eden'])
      expect(inputs.style?.description).toBe('수채화')
      expect(inputs.lexicon?.entries.map((entry) => entry.strong)).toEqual(['H7225'])
      expect(inputs.catalog.versions.map((version) => version.id)).toEqual(['v1', 'v2'])
      expect(inputs.catalog.files).toEqual({ v1: [`${G11}.png`, `${G12}.png`], v2: [`${G11}.png`, `${G12}.png`] })
      expect(inputs.audio.get('genesis-01-001.mp3')).toBe(mp3DurationMs(mp3(10)))
      expect(inputs.audio.get('genesis-01-002.mp3')).toBe(mp3DurationMs(mp3(5)))
      expect(inputs.audio.size).toBe(3)
      // 그림과 낭독 파일은 꾸러미를 만들 때 이 폴더에서 읽는다.
      expect(inputs.imagesDir).toBe(dirs.imagesDir)
      expect(inputs.audioDir).toBe(dirs.audioDir)
    })

    it('파일이 없으면 던지지 않고 빈 채로 돌려준다', async () => {
      const nothing = path.join(root, 'nothing')
      const empty: Required<ReleaseInputsOptions> = {
        sourceDir: path.join(nothing, 'source'),
        scenesDir: path.join(nothing, 'scenes'),
        quizDir: path.join(nothing, 'quiz'),
        originalDir: path.join(nothing, 'original'),
        lexiconFile: path.join(nothing, 'original', 'lexicon.json'),
        storyBibleDir: path.join(nothing, 'story-bible'),
        styleFile: path.join(nothing, 'story-bible', 'style.json'),
        imagesDir: path.join(nothing, 'images'),
        imageVersionsFile: path.join(nothing, 'images', 'versions.json'),
        audioDir: path.join(nothing, 'audio'),
      }
      expect(await readReleaseInputs(empty)).toEqual({
        books: [],
        byBook: new Map(),
        canon: { characters: [], places: [], eras: [], things: [], proposals: [] },
        catalog: { versions: [], files: {} },
        audio: new Map(),
        lexicon: null,
        style: null,
        imagesDir: empty.imagesDir,
        audioDir: empty.audioDir,
      })
    })

    it('본문 파일이 깨졌으면 파일 이름을 밝혀 던진다', async () => {
      await put('content/source/exodus.json', { book: '출애굽기' })
      await expect(readInputs()).rejects.toThrow(displayPath(path.join(dirs.sourceDir, 'exodus.json')))
    })

    describe('폴더 목록 순서', () => {
      it('시험용 readdir은 목록을 거꾸로 돌려준다', async () => {
        const normal = await readdir(dirs.audioDir)
        listing.reversed = true
        expect(await readdir(dirs.audioDir)).toEqual([...normal].reverse())
      })

      it('운영체제가 폴더 목록을 어떤 순서로 주어도 낭독과 그림 파일 이름과 책을 이름순으로 모은다', async () => {
        // 파일도 이름의 반대 순서로 만든다. 만든 순서가 아니라 이름이 순서를 정해야 한다.
        for (const verse of [3, 2, 1]) await put(`content/audio/genesis-02-00${verse}.mp3`, mp3(verse))
        for (const id of [sceneIdOf('genesis', 2, 2), sceneIdOf('genesis', 2, 1)]) await put(`content/images/v2/${id}.jpg`, png)
        const normal = await readInputs()

        listing.reversed = true
        const reversed = await readInputs()
        expect(reversed).toEqual(normal)
        expect([...reversed.audio.keys()]).toEqual([
          'genesis-01-001.mp3',
          'genesis-01-002.mp3',
          'genesis-01-003.mp3',
          'genesis-02-001.mp3',
          'genesis-02-002.mp3',
          'genesis-02-003.mp3',
        ])
        expect(reversed.catalog.files.v2).toEqual([`${G11}.png`, `${G12}.png`, 'genesis-02-01.jpg', 'genesis-02-02.jpg'])
        expect(reversed.catalog.files.v1).toEqual([`${G11}.png`, `${G12}.png`])
        expect(reversed.books).toEqual(['genesis', 'exodus'])
        expect(reversed.byBook.get('genesis')!.sceneFiles.map((file) => file.chapter)).toEqual([1])
      })
    })

    describe('한 장면의 그림이 한 버전 폴더에 둘 이상일 때', () => {
      it('확장자를 뗀 이름이 같은 두 파일을 밝혀 던진다', async () => {
        // 어느 쪽을 그림으로 고를지 폴더 목록 순서에 맡기면 컴퓨터마다 다른 꾸러미가 된다.
        await put(`content/images/v2/${G11}.jpg`, png)
        await expect(readInputs()).rejects.toThrow(
          `${displayPath(path.join(dirs.imagesDir, 'v2'))}: 같은 장면의 그림이 둘 이상입니다(${G11}.jpg, ${G11}.png). 하나만 남기세요`,
        )
      })

      it('폴더 목록 순서와 상관없이 같은 오류를 낸다', async () => {
        await put(`content/images/v2/${G11}.jpg`, png)
        listing.reversed = true
        await expect(readInputs()).rejects.toThrow(`같은 장면의 그림이 둘 이상입니다(${G11}.jpg, ${G11}.png)`)
      })

      it('장면 그림이 아닌 남은 파일은 이름 앞부분이 같아도 던지지 않는다(장면 그림으로 고르지 않는다)', async () => {
        for (const name of [`${G12}.bak`, `${G12}.PNG`, `${G12}.gif`, G12]) await put(`content/images/v2/${name}`, png)
        const inputs = await readInputs()
        expect(chapterChecks(inputs, 'genesis', 1).required).toEqual({ scenesApproved: true, imagesComplete: true, audioComplete: true })
      })

      it('다른 버전 폴더에 같은 장면의 그림이 하나씩 있는 것은 괜찮다', async () => {
        const inputs = await readInputs()
        expect(inputs.catalog.files.v1).toContain(`${G11}.png`)
        expect(inputs.catalog.files.v2).toContain(`${G11}.png`)
      })
    })

    describe('chapterInputsOf', () => {
      it('그 장의 본문, 장면 파일, 퀴즈 파일, 원어를 모아 준다', async () => {
        await put('content/quiz/genesis-01.json', { chapter: 1, questions: [question('genesis-01', 1, 'approved')] })
        await put('content/original/genesis.json', { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word('H7225')] }] }] })
        const inputs = await readInputs()

        const first = chapterInputsOf(inputs, 'genesis', 1)
        expect(first.source.verses.map((verse) => verse.text)).toEqual(['가', '나', '다'])
        expect(first.sceneFile?.scenes.map((item) => item.id)).toEqual([G11, G12])
        expect(first.quiz?.questions.map((item) => item.id)).toEqual(['genesis-01-q1'])
        expect(first.original?.verses.map((verse) => verse.verse)).toEqual([1])

        // 2장은 본문뿐이다.
        const second = chapterInputsOf(inputs, 'genesis', 2)
        expect(second.source.verses).toHaveLength(2)
        expect(second.sceneFile).toBeNull()
        expect(second.quiz).toBeNull()
        expect(second.original).toBeNull()
      })

      it('본문에 그 책이나 그 장이 없으면 findChapterInputs는 null이고 chapterInputsOf는 던진다', async () => {
        const inputs = await readInputs()
        expect(findChapterInputs(inputs, 'genesis', 1)).not.toBeNull()
        for (const [book, chapter] of [['genesis', 3], ['genesis', 51], ['genesis', 0], ['leviticus', 1]] as const) {
          expect(findChapterInputs(inputs, book, chapter), `${book} ${chapter}`).toBeNull()
          expect(() => chapterInputsOf(inputs, book, chapter), `${book} ${chapter}`).toThrow()
        }
      })
    })
  })

  describe('readAudioCatalog', () => {
    it('*.mp3의 재생 길이를 이름순으로 모으고, mp3가 아닌 파일과 끊긴 작업의 임시 파일은 건너뛴다', async () => {
      await put('content/audio/genesis-01-004.mp3.tmp', mp3(3))
      await put('content/audio/README.txt', 'x')
      const audio = await readAudioCatalog(dirs.audioDir)
      expect([...audio.entries()]).toEqual([
        ['genesis-01-001.mp3', mp3DurationMs(mp3(10))],
        ['genesis-01-002.mp3', mp3DurationMs(mp3(5))],
        ['genesis-01-003.mp3', mp3DurationMs(mp3(2))],
      ])
    })

    it('길이를 잴 수 없는 파일은 null이다', async () => {
      await put('content/audio/genesis-01-002.mp3', Buffer.alloc(0))
      await put('content/audio/genesis-01-003.mp3', Buffer.from('MP3가 아닌 바이트'))
      const audio = await readAudioCatalog(dirs.audioDir)
      expect([...audio.keys()]).toEqual(['genesis-01-001.mp3', 'genesis-01-002.mp3', 'genesis-01-003.mp3'])
      expect(audio.get('genesis-01-002.mp3')).toBeNull()
      expect(audio.get('genesis-01-003.mp3')).toBeNull()
    })

    it('폴더가 없으면 빈 목록이다', async () => {
      expect((await readAudioCatalog(path.join(root, 'none'))).size).toBe(0)
    })

    it('한 번에 읽는 수보다 많은 파일도 모두 이름순으로 읽는다', async () => {
      const names = Array.from({ length: 70 }, (_, index) => `psalms-119-${String(index + 1).padStart(3, '0')}.mp3`)
      for (const name of [...names].reverse()) await put(`content/audio/${name}`, mp3(1))
      const audio = await readAudioCatalog(dirs.audioDir)
      expect([...audio.keys()]).toEqual(['genesis-01-001.mp3', 'genesis-01-002.mp3', 'genesis-01-003.mp3', ...names])
      expect(audio.get(names[69]!)).toBe(mp3DurationMs(mp3(1)))
    })
  })
})
