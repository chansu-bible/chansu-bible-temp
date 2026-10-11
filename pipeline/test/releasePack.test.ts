import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mediaPath, sceneIdOf, validatePack, verseAudioName, type BookId } from 'reader-core'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { BundleChapter, ImageCatalog } from '../src/build/buildBundle.ts'
import { writeBundles } from '../src/build/writeBundle.ts'
import { displayPath } from '../src/paths.ts'
import { contentHash } from '../src/release/hash.ts'
import { readReleaseInputs, type BookInputs, type ReleaseInputs, type ReleaseInputsOptions } from '../src/release/inputs.ts'
import { buildPack, type BuiltPack } from '../src/release/pack.ts'
import type { ReleaseParts } from '../src/release/releases.ts'
import {
  BundleSchema,
  type Bundle,
  type Character,
  type ImageVersion,
  type Place,
  type QuizFile,
  type QuizQuestion,
  type Scene,
  type SceneFile,
} from '../src/schema.ts'
import { joinMp3, mp3DurationMs } from '../src/tts/mp3.ts'

// 폴더 목록의 순서는 운영체제마다 다르다(NTFS는 이름순이고 macOS는 아니다). reversed를 켜면 readdir이 목록을 거꾸로 돌려준다.
// 같은 콘텐츠를 PC에서 공개하고 맥미니에서 다시 만들므로, 목록 순서가 꾸러미 바이트에 새면 모든 장이 "바뀜"이 된다.
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

// 임시 폴더에 두 책의 content를 만들어 읽는다. 저장소의 content는 읽지 않는다.
// 창세기 1장은 공개할 수 있게 다 갖춘 장(장면 둘, 그림 버전 둘, 절 낭독 셋, 퀴즈, 원어)이고 2장은 본문뿐이다.
// 출애굽기 1장은 절 하나, 장면 하나짜리 작은 장이다. 꾸러미 전체를 글자로 고정한다.

const verses = (...texts: string[]) => texts.map((text, index) => ({ verse: index + 1, text }))

const genesisSource = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    { chapter: 1, verses: verses('태초에 하나님이 천지를 창조하시니라', '땅이 혼돈하고 공허하며', '빛이 있으라') },
    { chapter: 2, verses: verses('천지와 만물이 다 이루니라', '일곱째 날에 안식하시니라') },
  ],
}
const exodusSource = { book: '출애굽기', translation: '개역한글', chapters: [{ chapter: 1, verses: verses('모세가 우물 곁에 앉았더라') }] }

const G11 = sceneIdOf('genesis', 1, 1)
const G12 = sceneIdOf('genesis', 1, 2)
const E11 = sceneIdOf('exodus', 1, 1)

function scene(id: string, chapter: number, verseStart: number, verseEnd: number, overrides: Partial<Scene> = {}): Scene {
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
    review: { status: 'approved', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

const genesisScenes = {
  chapter: 1,
  scenes: [
    scene(G11, 1, 1, 2, {
      // 문단이 둘이고 이름순이 아니다. 장면 파일의 배열을 제자리에서 정렬하거나 뒤집으면 드러난다.
      explanation: ['하나님이 하늘과 땅을 지으셨다.', '땅은 아직 비어 있었다.'],
      glossary: [{ verse: 2, word: '혼돈', meaning: '질서가 없는 상태' }],
      placeId: 'eden',
      // 모세는 뒤 책(출애굽기)에서 처음 나오고 하와는 승인 전이라 창세기 꾸러미의 장면에 들지 않는다.
      visual: { description: '그림', characters: ['adam', 'moses', 'eve'] },
    }),
    scene(G12, 1, 3, 3),
  ],
}

const exodusScene = scene(E11, 1, 1, 1, {
  title: '우물 곁의 모세',
  commentary: '모세가 쉬는 장면',
  explanation: ['모세는 미디안으로 피했다.'],
  history: [{ text: '우물은 사람들이 모이는 자리였다.', basis: '고대 근동의 관습', certainty: '추정', sources: ['출애굽기 2:15'] }],
  glossary: [{ verse: 1, word: '우물', meaning: '물을 긷는 곳' }],
  placeId: 'midian',
  // 십보라는 설정집에 없어 빠진다.
  visual: { description: '우물', characters: ['moses', 'zipporah'] },
})

function character(id: string, name: string, firstAppearance: string, status: Character['status'] = 'approved'): Character {
  return {
    id,
    name,
    aliases: [],
    status,
    facts: {
      firstAppearance,
      gender: '남',
      years: { born: null, died: null },
      relations: [],
      attire: [],
      notes: '',
      sources: [firstAppearance],
    },
    design: { build: '', face: '', hair: '', skin: '', ageNotes: '', notes: '' },
    refs: [],
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

function question(id: string, status: QuizQuestion['status'], overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id,
    question: '질문',
    options: ['가', '나', '다', '라'],
    answer: 0,
    explanation: '해설',
    verse: 1,
    status,
    issues: [],
    ...overrides,
  }
}

const exodusQuestion = question('exodus-01-q1', 'approved', {
  question: '모세는 어디 곁에 앉았나요?',
  options: ['우물', '장막', '산', '강'],
  explanation: '1절에 모세가 우물 곁에 앉았다고 나온다.',
})

// MPEG-1 Layer III 128kbps 44.1kHz 프레임(417바이트, 약 26ms)을 count개 이은 낭독. fill로 어느 절의 소리인지 알아본다.
function mp3(count: number, fill: number): Buffer {
  const frame = Buffer.alloc(417, fill)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  return Buffer.concat(Array.from({ length: count }, () => frame))
}

const audio = { g1: mp3(10, 0x11), g2: mp3(5, 0x22), g3: mp3(2, 0x33), e1: mp3(10, 0x44) }

// 그림은 내용으로만 다룬다(꾸러미는 파일 바이트의 해시로 이름을 짓는다).
const image = {
  g11v1: Buffer.from('g11-v1'),
  g12v1: Buffer.from('g12-v1'),
  g11v2: Buffer.from('g11-v2'),
  g12v2: Buffer.from('g12-v2'),
  e11v1: Buffer.from('e11-v1'),
  e11v2: Buffer.from('e11-v2'),
}

const v1 = { id: 'v1', label: '1차', note: '' }
const v2 = { id: 'v2', label: '2차', note: '' }
const v3 = { id: 'v3', label: '3차', note: '' }

// 읽기 전용 필드를 푼 형. 형 변환으로 읽기 전용 입력의 필드를 바꾸는 시험에 쓴다.
type Writable<T> = { -readonly [Key in keyof T]: T[Key] }

const word = (text: string, strong: string | null, morph: string) => ({ text, strong, morph })

const PARTS: (keyof ReleaseParts)[] = ['text', 'images', 'audio', 'quiz', 'original']

// 두 꾸러미 사이에 바뀐 부분
const changedParts = (before: BuiltPack, after: BuiltPack) => PARTS.filter((key) => after.parts[key] !== before.parts[key])

// 꾸러미에만 있는 바뀜을 되돌린다. 절 낭독은 묶음 경로로, 장면의 그림·낭독은 media/ 경로에서 묶음 경로로 돌린다.
// 그림의 원래 파일 이름은 미디어 목록(to → from)에서 찾는다. 키 차례는 그대로 둔다.
function undoPackChanges(built: BuiltPack, inputs: ReleaseInputs): BundleChapter {
  const { pack } = built
  const fromOf = new Map(built.media.flatMap((item) => ('from' in item ? [[item.to, item.from] as const] : [])))
  return {
    chapter: pack.chapter,
    verses: pack.verses.map((verse) => {
      const name = verseAudioName(pack.bookId, pack.chapter, verse.verse)
      return { ...verse, audio: inputs.audio.has(name) ? `content/audio/${name}` : null, audioMs: verse.audioMs ?? null }
    }),
    scenes: pack.scenes.map((item) => ({
      ...item,
      images: Object.fromEntries(
        Object.entries(item.images).map(([version, file]) => [version, `content/images/${version}/${path.basename(fromOf.get(file)!)}`]),
      ),
      audio: item.audio === null ? null : `content/audio/scenes/${item.id}.mp3`,
    })),
    original: pack.original,
    quiz: pack.quiz,
  }
}

// 객체와 배열을 모두 얼린다. 얼린 값을 바꾸려 하면 엄격 모드(ES 모듈)에서 TypeError가 난다. Map의 항목은 얼릴 수 없어 따로 견준다.
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  Object.freeze(value)
  if (value instanceof Map) {
    for (const [key, item] of value) {
      deepFreeze(key)
      deepFreeze(item)
    }
  } else {
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

describe('buildPack', () => {
  let root: string
  // 모든 폴더를 임시 폴더로 바꿔 준다. Required라서 폴더 옵션이 늘면 이 시험이 형 검사에서 걸린다.
  let dirs: Required<ReleaseInputsOptions>

  async function put(file: string, data: unknown): Promise<void> {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data instanceof Uint8Array ? data : JSON.stringify(data))
  }

  const readInputs = () => readReleaseInputs(dirs)
  const genesisQuestions = [
    question('genesis-01-q1', 'approved'),
    question('genesis-01-q2', 'draft'),
    question('genesis-01-q3', 'reviewed'),
    question('genesis-01-q4', 'flagged'),
    question('genesis-01-q5', 'rejected'),
    question('genesis-01-q6', 'approved', { answer: 2, verse: 3 }),
  ]

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'release-pack-'))
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
    await put('content/scenes/genesis-01.json', genesisScenes)
    await put('content/scenes/exodus-01.json', { chapter: 1, scenes: [exodusScene] })
    await put('content/story-bible/characters.json', [
      character('adam', '아담', 'genesis 1:1'),
      character('eve', '하와', 'genesis 1:2', 'draft'),
      character('moses', '모세', 'exodus 1:1'),
    ])
    await put('content/story-bible/places.json', [place('eden', '에덴', 'genesis 1:1'), place('midian', '미디안', 'exodus 1:1')])
    // 그림 버전은 둘이고 기본은 목록의 마지막인 v2다. v2의 창세기 1장 둘째 장면과 출애굽기 그림은 jpg다.
    await put('content/images/versions.json', [v1, v2])
    await put(`content/images/v1/${G11}.png`, image.g11v1)
    await put(`content/images/v1/${G12}.png`, image.g12v1)
    await put(`content/images/v1/${E11}.png`, image.e11v1)
    await put(`content/images/v2/${G11}.png`, image.g11v2)
    await put(`content/images/v2/${G12}.jpg`, image.g12v2)
    await put(`content/images/v2/${E11}.jpg`, image.e11v2)
    await put('content/audio/genesis-01-001.mp3', audio.g1)
    await put('content/audio/genesis-01-002.mp3', audio.g2)
    await put('content/audio/genesis-01-003.mp3', audio.g3)
    await put('content/audio/exodus-01-001.mp3', audio.e1)
    await put('content/quiz/genesis-01.json', { chapter: 1, questions: genesisQuestions })
    await put('content/quiz/exodus-01.json', { chapter: 1, questions: [exodusQuestion, question('exodus-01-q2', 'draft')] })
    await put('content/original/genesis.json', {
      chapters: [
        { chapter: 1, verses: [{ verse: 1, words: [word('בְּרֵאשִׁית', 'H7225', 'HR/Ncfsa'), word('בָּרָא', 'H1254', 'HVqp3ms')] }] },
        { chapter: 2, verses: [{ verse: 1, words: [word('וַיְכֻלּוּ', 'H3615', 'HC/Vpw3mp')] }] },
      ],
    })
    await put('content/original/exodus.json', { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word('בָּרָא', 'H1254', 'HVqp3ms')] }] }] })
  })

  afterEach(async () => {
    listing.reversed = false
    await rm(root, { recursive: true, force: true })
  })

  // 꾸러미 해시는 이 바이트로 정한다. 키 순서나 모양이 바뀌면 같은 내용이어도 해시가 바뀌어, 공개된 모든 장이 "바뀜"이 된다.
  describe('꾸러미 전체를 글자로 고정한다(출애굽기 1장)', () => {
    const exodusVerse = '{"verse":1,"text":"모세가 우물 곁에 앉았더라","audio":null,"audioMs":261}'
    const exodusSceneText =
      '"id":"exodus-01-01","verseStart":1,"verseEnd":1,"title":"우물 곁의 모세","commentary":"모세가 쉬는 장면",' +
      '"explanation":["모세는 미디안으로 피했다."],' +
      '"history":[{"text":"우물은 사람들이 모이는 자리였다.","basis":"고대 근동의 관습","certainty":"추정","sources":["출애굽기 2:15"]}],' +
      '"glossary":[{"verse":1,"word":"우물","meaning":"물을 긷는 곳"}],' +
      '"placeId":"midian","characters":["moses"]'
    // 원어 낱말은 원어 파일의 낱말 뒤에 품사(pos)가 붙는 차례다.
    const exodusOriginal = '[{"verse":1,"words":[{"text":"בָּרָא","strong":"H1254","morph":"HVqp3ms","pos":"동사(칼 완료)"}]}]'
    // 승인된 문제만, 검수 상태(status)와 지적(issues) 없이 든다.
    const exodusQuiz =
      '[{"id":"exodus-01-q1","question":"모세는 어디 곁에 앉았나요?","options":["우물","장막","산","강"],"answer":0,' +
      '"explanation":"1절에 모세가 우물 곁에 앉았다고 나온다.","verse":1}]'

    const packJson = (images: string, sceneAudio: string) =>
      '{"schemaVersion":1,"bookId":"exodus","chapter":1,' +
      `"verses":[${exodusVerse}],` +
      `"scenes":[{${exodusSceneText},"images":${images},"reviewStatus":"approved","audio":"${sceneAudio}","audioMs":261}],` +
      `"original":${exodusOriginal},` +
      `"quiz":${exodusQuiz}}`

    // 부분 해시는 이 바이트들의 해시다. 글은 절 본문과 장면에서 그림·낭독을 뺀 모든 것이다.
    const partsOf = (images: string, sceneAudio: string): ReleaseParts => ({
      text: contentHash(`{"verses":[{"verse":1,"text":"모세가 우물 곁에 앉았더라"}],"scenes":[{${exodusSceneText},"reviewStatus":"approved"}]}`),
      images: contentHash(`[{"id":"exodus-01-01","images":${images}}]`),
      audio: contentHash(`{"verses":[{"verse":1,"audioMs":261}],"scenes":[{"id":"exodus-01-01","audio":"${sceneAudio}","audioMs":261}]}`),
      quiz: contentHash(exodusQuiz),
      original: contentHash(exodusOriginal),
    })

    const sceneAudioBytes = Buffer.from(joinMp3([audio.e1]))

    it('낭독 길이는 프레임으로 잰 길이다(아래 글자의 261)', () => {
      expect(mp3DurationMs(audio.e1)).toBe(261)
    })

    it('공개 꾸러미의 바이트, 해시, 부분 해시, 미디어', async () => {
      const imagePath = `media/exodus-01-01.${contentHash(image.e11v2)}.jpg`
      const audioPath = `media/exodus-01-01.${contentHash(sceneAudioBytes)}.mp3`
      const images = `{"v2":"${imagePath}"}`
      const expected = packJson(images, audioPath)

      const built = await buildPack(await readInputs(), 'exodus', 1, { preview: false })
      expect(built.bytes.toString('utf8')).toBe(expected)
      expect(built.hash).toBe(contentHash(expected))
      expect(built.parts).toEqual(partsOf(images, audioPath))
      expect(built.media).toEqual([
        { from: path.join(dirs.imagesDir, 'v2', `${E11}.jpg`), to: imagePath, size: image.e11v2.length },
        { bytes: sceneAudioBytes, to: audioPath, size: sceneAudioBytes.length },
      ])
      // 꾸러미 값은 바이트를 읽은 것과 같고, 앱의 꾸러미 검사를 통과한다.
      expect(built.pack).toEqual(JSON.parse(expected))
      expect(validatePack(JSON.parse(expected), { book: 'exodus', chapter: 1 })).toBeTruthy()
    })

    it('미리 보기 꾸러미는 모든 그림 버전을 preview/ 아래 경로로 가리키고, 나머지는 공개 꾸러미와 같다', async () => {
      const v1Path = `preview/media/exodus-01-01.${contentHash(image.e11v1)}.png`
      const v2Path = `preview/media/exodus-01-01.${contentHash(image.e11v2)}.jpg`
      const audioPath = `preview/media/exodus-01-01.${contentHash(sceneAudioBytes)}.mp3`
      const images = `{"v1":"${v1Path}","v2":"${v2Path}"}`
      const expected = packJson(images, audioPath)

      const built = await buildPack(await readInputs(), 'exodus', 1, { preview: true })
      expect(built.bytes.toString('utf8')).toBe(expected)
      expect(built.hash).toBe(contentHash(expected))
      expect(built.parts).toEqual(partsOf(images, audioPath))
      expect(built.media).toEqual([
        { from: path.join(dirs.imagesDir, 'v1', `${E11}.png`), to: v1Path, size: image.e11v1.length },
        { from: path.join(dirs.imagesDir, 'v2', `${E11}.jpg`), to: v2Path, size: image.e11v2.length },
        { bytes: sceneAudioBytes, to: audioPath, size: sceneAudioBytes.length },
      ])
      expect(validatePack(JSON.parse(expected), { book: 'exodus', chapter: 1 })).toBeTruthy()
    })
  })

  it('꾸러미에만 있는 바뀜(절 낭독 null, 장면의 그림·낭독 media/ 경로)을 되돌리면 같은 콘텐츠로 만든 책 묶음의 장과 같다', async () => {
    const appContentDir = path.join(root, 'app-content')
    await writeBundles(['genesis', 'exodus'], { ...dirs, appContentDir })
    const readBundle = async (book: BookId): Promise<Bundle> =>
      BundleSchema.parse(JSON.parse(await readFile(path.join(appContentDir, `${book}.json`), 'utf8')))
    const bundles = { genesis: await readBundle('genesis'), exodus: await readBundle('exodus') }
    const inputs = await readInputs()

    // 창세기 2장은 장면 파일이 없어 대체 장면 하나다.
    for (const [book, chapter] of [['genesis', 1], ['genesis', 2], ['exodus', 1]] as const) {
      const label = `${book} ${chapter}`
      const expected = bundles[book].chapters.find((item) => item.chapter === chapter)!

      // 미리 보기 꾸러미는 모든 그림 버전이 들어 묶음의 장과 바이트까지 같다.
      const preview = await buildPack(inputs, book, chapter, { preview: true })
      expect(undoPackChanges(preview, inputs), label).toEqual(expected)
      expect(JSON.stringify(undoPackChanges(preview, inputs)), label).toBe(JSON.stringify(expected))

      // 공개 꾸러미는 기본 그림 버전(v2)만 든다.
      const published = await buildPack(inputs, book, chapter, { preview: false })
      const defaultOnly = {
        ...expected,
        scenes: expected.scenes.map((item) => ({ ...item, images: item.images.v2 ? { v2: item.images.v2 } : {} })),
      }
      expect(JSON.stringify(undoPackChanges(published, inputs)), label).toBe(JSON.stringify(defaultOnly))

      // 장면 낭독은 묶음이 쓴 장면 낭독 파일과 같은 바이트이고, 그림은 묶음이 복사한 그 버전의 그 파일이다.
      for (const item of preview.pack.scenes) {
        if (item.audio !== null) {
          const media = preview.media.find((entry) => entry.to === item.audio)!
          const written = await readFile(path.join(appContentDir, 'audio', 'scenes', `${item.id}.mp3`))
          expect('bytes' in media && media.bytes.equals(written), `${label} ${item.id}`).toBe(true)
        }
        for (const [version, file] of Object.entries(item.images)) {
          const media = preview.media.find((entry) => entry.to === file)!
          if (!('from' in media)) throw new Error(`${file}의 원본 파일이 없습니다`)
          const copied = await readFile(path.join(appContentDir, 'images', version, path.basename(media.from)))
          expect((await readFile(media.from)).equals(copied), `${label} ${item.id} ${version}`).toBe(true)
        }
      }
    }
    // 묶음 쪽에도 낭독이 있는 장면이 있어야 위의 견줌이 뜻이 있다.
    expect(bundles.genesis.chapters[0]!.scenes.map((item) => item.audio)).toEqual([
      `content/audio/scenes/${G11}.mp3`,
      `content/audio/scenes/${G12}.mp3`,
    ])
  })

  describe('같은 콘텐츠면 같은 바이트와 해시', () => {
    const cases = [
      ['genesis', 1],
      ['genesis', 2],
      ['exodus', 1],
    ] as const

    it('같은 inputs로 다시 만들어도, 콘텐츠를 다시 읽어 만들어도 같다', async () => {
      const inputs = await readInputs()
      for (const [book, chapter] of cases) {
        for (const preview of [false, true]) {
          const first = await buildPack(inputs, book, chapter, { preview })
          for (const again of [await buildPack(inputs, book, chapter, { preview }), await buildPack(await readInputs(), book, chapter, { preview })]) {
            expect(again.bytes.equals(first.bytes), `${book} ${chapter} ${preview}`).toBe(true)
            expect(again.hash).toBe(first.hash)
            expect(again.parts).toEqual(first.parts)
            expect(again.media).toEqual(first.media)
          }
        }
      }
    })

    it('시험용 readdir은 목록을 거꾸로 돌려준다', async () => {
      const normal = await readdir(path.join(dirs.imagesDir, 'v2'))
      listing.reversed = true
      expect(await readdir(path.join(dirs.imagesDir, 'v2'))).toEqual([...normal].reverse())
    })

    it('운영체제가 폴더 목록을 어떤 순서로 주어도 같다', async () => {
      const normal = await readInputs()
      listing.reversed = true
      const reversed = await readInputs()
      for (const [book, chapter] of cases) {
        for (const preview of [false, true]) {
          const a = await buildPack(normal, book, chapter, { preview })
          const b = await buildPack(reversed, book, chapter, { preview })
          expect(b.bytes.equals(a.bytes), `${book} ${chapter} ${preview}`).toBe(true)
          expect(b.hash).toBe(a.hash)
          expect(b.parts).toEqual(a.parts)
          expect(b.media).toEqual(a.media)
        }
      }
    })

    it('건네받은 그림 목록과 낭독 목록의 순서를 뒤집어도 같다. 한 버전에 같은 장면의 그림이 둘이어도 이름순으로 앞의 것을 고른다', async () => {
      const inputs = await readInputs()
      // 읽을 때는 assertUniqueImageStems가 막지만, 목록을 직접 건네면 한 버전에 같은 장면의 그림이 둘일 수 있다.
      const extra = Buffer.from('g11-v2-jpg')
      await put(`content/images/v2/${G11}.jpg`, extra)
      const files = { ...inputs.catalog.files, v2: [...inputs.catalog.files.v2!, `${G11}.jpg`].sort() }
      const sorted: ReleaseInputs = { ...inputs, catalog: { ...inputs.catalog, files } }
      const reversed: ReleaseInputs = {
        ...inputs,
        catalog: { ...inputs.catalog, files: Object.fromEntries(Object.entries(files).map(([version, names]) => [version, [...names].reverse()])) },
        audio: new Map([...inputs.audio].reverse()),
      }
      for (const preview of [false, true]) {
        const a = await buildPack(sorted, 'genesis', 1, { preview })
        const b = await buildPack(reversed, 'genesis', 1, { preview })
        expect(b.bytes.equals(a.bytes), String(preview)).toBe(true)
        expect(b.hash).toBe(a.hash)
        expect(b.parts).toEqual(a.parts)
        expect(b.media).toEqual(a.media)
        expect(b.pack.scenes[0]!.images.v2).toBe(mediaPath(G11, contentHash(extra), 'jpg', preview))
      }
    })
  })

  describe('바뀐 것마다 그 부분과 꾸러미 해시만 바뀐다', () => {
    const editScenes = (edit: (scenes: Scene[]) => Scene[]) => ({ ...genesisScenes, scenes: edit(genesisScenes.scenes) })

    it.each<[string, keyof ReleaseParts, (put: (file: string, data: unknown) => Promise<void>) => Promise<void>]>([
      [
        '장면 해설 한 글자',
        'text',
        (put) =>
          put('content/scenes/genesis-01.json', editScenes(([first, second]) => [{ ...first!, explanation: ['하나님이 하늘과 땅을 지으셨다!'] }, second!])),
      ],
      [
        '장면 제목',
        'text',
        (put) => put('content/scenes/genesis-01.json', editScenes(([first, second]) => [first!, { ...second!, title: '빛' }])),
      ],
      [
        '절 본문 한 글자',
        'text',
        (put) =>
          put('content/source/genesis.json', {
            ...genesisSource,
            chapters: [{ chapter: 1, verses: verses('태초에 하나님이 천지를 창조하시니라', '땅이 혼돈하고 공허하며', '빛이 있으라!') }, genesisSource.chapters[1]],
          }),
      ],
      ['기본 버전 그림 파일', 'images', (put) => put(`content/images/v2/${G11}.png`, Buffer.from('g11-v2 새 그림'))],
      ['절 낭독 파일(같은 길이)', 'audio', (put) => put('content/audio/genesis-01-002.mp3', mp3(5, 0x55))],
      ['절 낭독 파일(다른 길이)', 'audio', (put) => put('content/audio/genesis-01-003.mp3', mp3(3, 0x33))],
      [
        '퀴즈 승인',
        'quiz',
        (put) => put('content/quiz/genesis-01.json', { chapter: 1, questions: genesisQuestions.map((item) => ({ ...item, status: 'approved' })) }),
      ],
      [
        '원어 낱말',
        'original',
        (put) =>
          put('content/original/genesis.json', {
            chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word('בְּרֵאשִׁית', 'H7225', 'HR/Ncfsa')] }] }],
          }),
      ],
    ])('%s이 바뀌면 %s 부분만 바뀐다', async (_name, part, change) => {
      const inputs = await readInputs()
      const before = [await buildPack(inputs, 'genesis', 1, { preview: false }), await buildPack(inputs, 'genesis', 1, { preview: true })]
      await change(put)
      const changed = await readInputs()
      const after = [await buildPack(changed, 'genesis', 1, { preview: false }), await buildPack(changed, 'genesis', 1, { preview: true })]
      for (const index of [0, 1]) {
        const label = index === 0 ? '공개' : '미리 보기'
        expect(after[index]!.hash, label).not.toBe(before[index]!.hash)
        expect(changedParts(before[index]!, after[index]!), label).toEqual([part])
      }
    })

    it('기본 버전 그림 파일이 바뀌면 그 그림의 경로와 미디어만 바뀐다', async () => {
      const before = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
      const changed = Buffer.from('g11-v2 새 그림')
      await put(`content/images/v2/${G11}.png`, changed)
      const after = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
      expect(after.pack.scenes.map((item) => item.images)).toEqual([
        { v2: mediaPath(G11, contentHash(changed), 'png') },
        before.pack.scenes[1]!.images,
      ])
      expect(after.pack.scenes[0]!.images.v2).not.toBe(before.pack.scenes[0]!.images.v2)
      expect(after.media.filter((item) => !before.media.some((old) => old.to === item.to)).map((item) => item.to)).toEqual([
        mediaPath(G11, contentHash(changed), 'png'),
      ])
      expect(after.media).toHaveLength(before.media.length)
    })

    it('기본 버전이 아닌 그림이 바뀌면 공개 꾸러미는 그대로이고 미리 보기 꾸러미만 바뀐다', async () => {
      const published = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
      const preview = await buildPack(await readInputs(), 'genesis', 1, { preview: true })
      await put(`content/images/v1/${G11}.png`, Buffer.from('g11-v1 새 그림'))
      const inputs = await readInputs()
      expect((await buildPack(inputs, 'genesis', 1, { preview: false })).bytes.equals(published.bytes)).toBe(true)
      const changedPreview = await buildPack(inputs, 'genesis', 1, { preview: true })
      expect(changedPreview.hash).not.toBe(preview.hash)
      expect(changedParts(preview, changedPreview)).toEqual(['images'])
    })
  })

  describe('그림', () => {
    it('공개 꾸러미에는 기본 그림 버전만, 미리 보기 꾸러미에는 모든 버전이 버전 목록 차례로 든다', async () => {
      const inputs = await readInputs()
      const published = await buildPack(inputs, 'genesis', 1, { preview: false })
      expect(published.pack.scenes.map((item) => item.images)).toEqual([
        { v2: mediaPath(G11, contentHash(image.g11v2), 'png') },
        { v2: mediaPath(G12, contentHash(image.g12v2), 'jpg') },
      ])
      const preview = await buildPack(inputs, 'genesis', 1, { preview: true })
      expect(preview.pack.scenes.map((item) => item.images)).toEqual([
        { v1: mediaPath(G11, contentHash(image.g11v1), 'png', true), v2: mediaPath(G11, contentHash(image.g11v2), 'png', true) },
        { v1: mediaPath(G12, contentHash(image.g12v1), 'png', true), v2: mediaPath(G12, contentHash(image.g12v2), 'jpg', true) },
      ])
      expect(preview.pack.scenes.map((item) => Object.keys(item.images))).toEqual([
        ['v1', 'v2'],
        ['v1', 'v2'],
      ])
    })

    it('기본 버전은 이름이 뒤인 버전이 아니라 버전 목록의 마지막이다', async () => {
      await put('content/images/versions.json', [v2, v1])
      const inputs = await readInputs()
      const published = await buildPack(inputs, 'genesis', 1, { preview: false })
      expect(published.pack.scenes.map((item) => item.images)).toEqual([
        { v1: mediaPath(G11, contentHash(image.g11v1), 'png') },
        { v1: mediaPath(G12, contentHash(image.g12v1), 'png') },
      ])
      const preview = await buildPack(inputs, 'genesis', 1, { preview: true })
      expect(preview.pack.scenes.map((item) => Object.keys(item.images))).toEqual([
        ['v2', 'v1'],
        ['v2', 'v1'],
      ])
    })

    it('기본 버전에 그림이 없는 장면은 공개 꾸러미에서 그림이 비고, 그림 버전이 하나도 없으면 모두 빈다', async () => {
      await rm(path.join(dirs.imagesDir, 'v2', `${G12}.jpg`))
      const inputs = await readInputs()
      expect((await buildPack(inputs, 'genesis', 1, { preview: false })).pack.scenes[1]!.images).toEqual({})
      expect((await buildPack(inputs, 'genesis', 1, { preview: true })).pack.scenes[1]!.images).toEqual({
        v1: mediaPath(G12, contentHash(image.g12v1), 'png', true),
      })

      await put('content/images/versions.json', [])
      const none = await buildPack(await readInputs(), 'genesis', 1, { preview: true })
      expect(none.pack.scenes.map((item) => item.images)).toEqual([{}, {}])
      expect(none.media.every((item) => 'bytes' in item)).toBe(true)
    })

    it('미디어 경로의 해시는 파일 바이트의 해시이고, 크기는 바이트 수다', async () => {
      const built = await buildPack(await readInputs(), 'genesis', 1, { preview: true })
      expect(built.media).toHaveLength(6)
      for (const item of built.media) {
        const bytes = 'from' in item ? await readFile(item.from) : item.bytes
        expect(item.to, item.to).toContain(`.${contentHash(bytes)}.`)
        expect(item.size).toBe(bytes.length)
      }
    })

    it('두 버전의 그림이 같은 내용이면 같은 경로를 가리키고 미디어 목록에는 한 번만 든다', async () => {
      await put(`content/images/v1/${G11}.png`, image.g11v2)
      const built = await buildPack(await readInputs(), 'genesis', 1, { preview: true })
      const same = mediaPath(G11, contentHash(image.g11v2), 'png', true)
      expect(built.pack.scenes[0]!.images).toEqual({ v1: same, v2: same })
      expect(built.media.filter((item) => item.to === same)).toHaveLength(1)
      expect(new Set(built.media.map((item) => item.to)).size).toBe(built.media.length)
    })
  })

  describe('낭독', () => {
    it('절 낭독은 null이고 길이는 남는다. 장면 낭독은 절 낭독을 이은 바이트로 이름을 짓고, 길이는 절 낭독 길이의 합이다', async () => {
      const built = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
      const [ms1, ms2, ms3] = [audio.g1, audio.g2, audio.g3].map((bytes) => mp3DurationMs(bytes)!)
      expect(built.pack.verses).toEqual([
        { verse: 1, text: '태초에 하나님이 천지를 창조하시니라', audio: null, audioMs: ms1 },
        { verse: 2, text: '땅이 혼돈하고 공허하며', audio: null, audioMs: ms2 },
        { verse: 3, text: '빛이 있으라', audio: null, audioMs: ms3 },
      ])
      const first = Buffer.from(joinMp3([audio.g1, audio.g2]))
      const second = Buffer.from(joinMp3([audio.g3]))
      expect(built.pack.scenes.map((item) => [item.audio, item.audioMs])).toEqual([
        [mediaPath(G11, contentHash(first), 'mp3'), ms1! + ms2!],
        [mediaPath(G12, contentHash(second), 'mp3'), ms3],
      ])
      // 미디어 목록에는 이은 바이트가 장면 차례로 든다.
      const narrations = built.media.flatMap((item) => ('bytes' in item ? [item] : []))
      expect(narrations.map((item) => item.to)).toEqual(built.pack.scenes.map((item) => item.audio))
      expect(narrations.map((item) => item.bytes)).toEqual([first, second])
    })

    it('절 낭독이 없는 장면은 낭독이 없고 미디어도 없다', async () => {
      await rm(path.join(dirs.audioDir, 'genesis-01-003.mp3'))
      const silent = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
      expect(silent.pack.verses[2]).toEqual({ verse: 3, text: '빛이 있으라', audio: null, audioMs: null })
      expect(silent.pack.scenes[1]).toMatchObject({ audio: null, audioMs: null })
      expect(silent.media.filter((item) => 'bytes' in item)).toHaveLength(1)
    })
  })

  it('승인된 퀴즈만 든다', async () => {
    const built = await buildPack(await readInputs(), 'genesis', 1, { preview: false })
    expect(built.pack.quiz).toEqual([
      { id: 'genesis-01-q1', question: '질문', options: ['가', '나', '다', '라'], answer: 0, explanation: '해설', verse: 1 },
      { id: 'genesis-01-q6', question: '질문', options: ['가', '나', '다', '라'], answer: 2, explanation: '해설', verse: 3 },
    ])
  })

  it('원어는 그 장의 것만 들고, 원어 파일이 없거나 그 장이 없으면 null이다', async () => {
    const inputs = await readInputs()
    const first = await buildPack(inputs, 'genesis', 1, { preview: false })
    expect(first.pack.original?.map((verse) => verse.words.map((item) => item.strong))).toEqual([['H7225', 'H1254']])
    await rm(path.join(dirs.originalDir, 'exodus.json'))
    await put('content/original/genesis.json', { chapters: [{ chapter: 2, verses: [{ verse: 1, words: [word('וַיְכֻלּוּ', 'H3615', 'HC/Vpw3mp')] }] }] })
    const changed = await readInputs()
    expect((await buildPack(changed, 'genesis', 1, { preview: false })).pack.original).toBeNull()
    expect((await buildPack(changed, 'exodus', 1, { preview: false })).pack.original).toBeNull()
  })

  it('설정집은 그 책까지 나온 승인된 항목만 쓴다. 뒤 책의 인물과 승인 전 인물은 장면에서 빠지고, 뒤 책의 장소를 가리키면 던진다', async () => {
    const inputs = await readInputs()
    expect((await buildPack(inputs, 'genesis', 1, { preview: false })).pack.scenes[0]).toMatchObject({ placeId: 'eden', characters: ['adam'] })
    expect((await buildPack(inputs, 'exodus', 1, { preview: false })).pack.scenes[0]).toMatchObject({ placeId: 'midian', characters: ['moses'] })

    await put('content/scenes/genesis-01.json', { ...genesisScenes, scenes: [{ ...genesisScenes.scenes[0]!, placeId: 'midian' }, genesisScenes.scenes[1]] })
    await expect(buildPack(await readInputs(), 'genesis', 1, { preview: false })).rejects.toThrow(
      `${G11}: 장소 midian는 출애굽기 1:1에서 처음 나와 창세기 묶음에 넣을 수 없습니다`,
    )
  })

  it('장면 파일이 없는 장은 장 전체를 덮는 대체 장면 하나다', async () => {
    const built = await buildPack(await readInputs(), 'genesis', 2, { preview: false })
    expect(built.pack.scenes).toEqual([
      expect.objectContaining({ id: 'genesis-02-00', verseStart: 1, verseEnd: 2, reviewStatus: 'none', images: {}, audio: null }),
    ])
    expect(built.media).toEqual([])
  })

  it('입력을 바꾸지 않고, 꾸러미는 입력과 객체나 배열을 함께 쓰지 않는다', async () => {
    const inputs = deepFreeze(await readInputs())
    const snapshot = structuredClone(inputs)
    const preview = await buildPack(inputs, 'genesis', 1, { preview: true })
    await buildPack(inputs, 'genesis', 1, { preview: false })
    await buildPack(inputs, 'exodus', 1, { preview: false })
    expect(inputs).toEqual(snapshot)

    // 받은 꾸러미를 고쳐도 입력은 그대로다(얼린 배열을 함께 쓰면 여기서 TypeError가 난다).
    const [first] = preview.pack.scenes
    first!.explanation.push('덧붙인 해설')
    first!.glossary.push({ verse: 1, word: '태초', meaning: '맨 처음' })
    first!.history.push({ text: '덧붙인 배경', basis: '', certainty: '추정', sources: [] })
    first!.characters.push('eve')
    preview.pack.verses[0]!.text = '바꾼 본문'
    preview.pack.quiz[0]!.options.push('마')
    preview.pack.original![0]!.words.push({ ...word('א', null, 'HTd'), pos: '관사' })
    expect(inputs).toEqual(snapshot)
  })

  it('입력은 읽기 전용 형이라 필드, 목록, 표를 고치면 형 오류가 난다', () => {
    // 형 검사(npm run typecheck)가 본다. 읽기 전용을 빼면 Readonly를 씌운 형과 달라져 여기서 형 오류가 난다.
    expectTypeOf<ReleaseInputs>().toEqualTypeOf<Readonly<ReleaseInputs>>()
    expectTypeOf<BookInputs>().toEqualTypeOf<Readonly<BookInputs>>()
    expectTypeOf<ImageCatalog>().toEqualTypeOf<Readonly<ImageCatalog>>()
    expectTypeOf<ReleaseInputs['books']>().toEqualTypeOf<readonly BookId[]>()
    expectTypeOf<ReleaseInputs['byBook']>().toEqualTypeOf<ReadonlyMap<BookId, BookInputs>>()
    expectTypeOf<ReleaseInputs['audio']>().toEqualTypeOf<ReadonlyMap<string, number | null>>()
    expectTypeOf<ReleaseInputs['canon']['places']>().toEqualTypeOf<readonly Place[]>()
    expectTypeOf<ReleaseInputs['catalog']['versions']>().toEqualTypeOf<readonly ImageVersion[]>()
    expectTypeOf<ReleaseInputs['catalog']['files']>().toEqualTypeOf<Readonly<Record<string, readonly string[]>>>()
    expectTypeOf<BookInputs['sceneFiles']>().toEqualTypeOf<readonly SceneFile[]>()
    expectTypeOf<BookInputs['quizzes']>().toEqualTypeOf<readonly QuizFile[]>()
  })

  // 장 문맥은 inputs 객체마다 쌓아 두고 다시 쓴다. 형 변환으로 읽기 전용을 풀어 같은 객체의 일부를 다른 객체로 바꿔도 낡은 문맥을 쓰면 안 된다.
  describe('같은 inputs 객체의 일부를 다른 객체로 바꾸면 쌓아 둔 장 문맥을 쓰지 않는다', () => {
    it('catalog를 바꾸면 새 catalog의 그림을 쓴다. 공개 꾸러미의 기본 그림 버전도 새 catalog의 마지막이다', async () => {
      const inputs = await readInputs()
      // 먼저 만들어 장 문맥을 쌓아 둔다.
      const before = await buildPack(inputs, 'genesis', 1, { preview: true })
      expect(before.pack.scenes.map((item) => Object.keys(item.images))).toEqual([
        ['v1', 'v2'],
        ['v1', 'v2'],
      ])

      // 그림 버전 v3을 더해 새로 읽고, 그 catalog만 처음 inputs 객체에 끼운다(읽기 전용은 형 변환으로 푼다).
      const v3Image = { g11: Buffer.from('g11-v3'), g12: Buffer.from('g12-v3') }
      await put('content/images/versions.json', [v1, v2, v3])
      await put(`content/images/v3/${G11}.png`, v3Image.g11)
      await put(`content/images/v3/${G12}.png`, v3Image.g12)
      const next = await readInputs()
      expect(next.catalog).not.toBe(inputs.catalog)
      const writable = inputs as Writable<ReleaseInputs>
      writable.catalog = next.catalog

      const preview = await buildPack(inputs, 'genesis', 1, { preview: true })
      expect(preview.pack.scenes.map((item) => Object.keys(item.images))).toEqual([
        ['v1', 'v2', 'v3'],
        ['v1', 'v2', 'v3'],
      ])
      const published = await buildPack(inputs, 'genesis', 1, { preview: false })
      expect(published.pack.scenes.map((item) => item.images)).toEqual([
        { v3: mediaPath(G11, contentHash(v3Image.g11), 'png') },
        { v3: mediaPath(G12, contentHash(v3Image.g12), 'png') },
      ])
      // 새로 읽은 inputs로 만든 꾸러미와 바이트까지 같다.
      expect((await buildPack(next, 'genesis', 1, { preview: true })).bytes.equals(preview.bytes)).toBe(true)
      expect((await buildPack(next, 'genesis', 1, { preview: false })).bytes.equals(published.bytes)).toBe(true)
    })

    it.each<[string, (put: (file: string, data: unknown) => Promise<void>) => Promise<void>, (target: Writable<ReleaseInputs>, next: ReleaseInputs) => void]>([
      [
        '낭독 목록(audio)',
        // 셋째 절 낭독이 없어지면 둘째 장면의 낭독이 없어진다. 낡은 목록이면 없는 파일을 읽으려다 던진다.
        () => rm(path.join(dirs.audioDir, 'genesis-01-003.mp3')),
        (target, next) => {
          target.audio = next.audio
        },
      ],
      [
        '설정집(canon)',
        // 하와가 승인되면 첫 장면의 인물에 든다.
        (put) =>
          put('content/story-bible/characters.json', [
            character('adam', '아담', 'genesis 1:1'),
            character('eve', '하와', 'genesis 1:2'),
            character('moses', '모세', 'exodus 1:1'),
          ]),
        (target, next) => {
          target.canon = next.canon
        },
      ],
      [
        '책의 콘텐츠(byBook의 창세기)',
        // 퀴즈가 모두 승인되면 꾸러미의 퀴즈가 는다.
        (put) =>
          put('content/quiz/genesis-01.json', { chapter: 1, questions: genesisQuestions.map((item) => ({ ...item, status: 'approved' })) }),
        (target, next) => {
          const books = target.byBook as Map<BookId, BookInputs>
          books.set('genesis', next.byBook.get('genesis')!)
        },
      ],
    ])('%s', async (_name, change, replace) => {
      const inputs = await readInputs()
      const before = [await buildPack(inputs, 'genesis', 1, { preview: false }), await buildPack(inputs, 'genesis', 1, { preview: true })]
      await change(put)
      const next = await readInputs()
      replace(inputs, next)
      for (const [index, preview] of [false, true].entries()) {
        const label = preview ? '미리 보기' : '공개'
        const after = await buildPack(inputs, 'genesis', 1, { preview })
        const fresh = await buildPack(next, 'genesis', 1, { preview })
        expect(after.bytes.equals(fresh.bytes), label).toBe(true)
        expect(after.media, label).toEqual(fresh.media)
        // 바꾼 것이 꾸러미에 드러나, 낡은 문맥과 견주는 시험이 뜻이 있다.
        expect(after.hash, label).not.toBe(before[index]!.hash)
      }
    })
  })

  it('미리 보기와 공개 꾸러미를 번갈아 만들어도 서로 섞이지 않는다', async () => {
    const inputs = await readInputs()
    const published = await buildPack(inputs, 'genesis', 1, { preview: false })
    await buildPack(inputs, 'genesis', 1, { preview: true })
    const again = await buildPack(inputs, 'genesis', 1, { preview: false })
    expect(again.bytes.equals(published.bytes)).toBe(true)
    expect(published.media.every((item) => item.to.startsWith('media/'))).toBe(true)
    expect((await buildPack(inputs, 'genesis', 1, { preview: true })).media.every((item) => item.to.startsWith('preview/media/'))).toBe(true)
  })

  it('꾸러미 값은 바이트를 읽은 것과 같고 앱의 꾸러미 검사를 통과한다', async () => {
    const inputs = await readInputs()
    for (const [book, chapter] of [['genesis', 1], ['genesis', 2], ['exodus', 1]] as const) {
      for (const preview of [false, true]) {
        const built = await buildPack(inputs, book, chapter, { preview })
        const read = JSON.parse(built.bytes.toString('utf8')) as unknown
        expect(read).toEqual(built.pack)
        expect(validatePack(read, { book, chapter })).toBeTruthy()
        expect(built.hash).toBe(contentHash(built.bytes))
      }
    }
  })

  describe('오류', () => {
    it('본문에 없는 장, 책에 없는 장, 본문이 없는 책은 던진다', async () => {
      const inputs = await readInputs()
      await expect(buildPack(inputs, 'genesis', 3, { preview: false })).rejects.toThrow('창세기 본문에 3장이 없습니다. 먼저 source --book genesis를 실행하세요.')
      await expect(buildPack(inputs, 'genesis', 51, { preview: false })).rejects.toThrow('창세기에는 51장이 없습니다')
      await expect(buildPack(inputs, 'leviticus', 1, { preview: true })).rejects.toThrow('레위기 본문이 없습니다. 먼저 source --book leviticus를 실행하세요.')
    })

    it('장면 검사에 걸리면 책 이름을 밝힌 묶음의 오류를 그대로 던진다', async () => {
      await put('content/scenes/genesis-01.json', { chapter: 1, scenes: [genesisScenes.scenes[0]] })
      await expect(buildPack(await readInputs(), 'genesis', 1, { preview: true })).rejects.toThrow(
        '창세기 1장 장면의 절 범위가 맞지 않습니다',
      )
    })

    it('절 낭독을 잇지 못하면 장면 id와 절 낭독 파일을 밝혀 던진다', async () => {
      await put('content/audio/genesis-01-002.mp3', Buffer.from('MP3가 아닌 바이트'))
      await expect(buildPack(await readInputs(), 'genesis', 1, { preview: false })).rejects.toThrow(
        `${G11}: 장면 낭독을 잇지 못했습니다(genesis-01-001.mp3, genesis-01-002.mp3): 2번째 파일에서 MP3 프레임을 찾지 못했습니다`,
      )
    })

    it('그림 파일을 읽지 못하면 장면 id, 그림 버전, 파일 이름을 밝혀 던진다. 경로는 displayPath로 보인다', async () => {
      const inputs = await readInputs()
      const missing = path.join(dirs.imagesDir, 'v1', `${G12}.png`)
      await rm(missing)
      const message = `${G12}: v1 그림을 읽지 못했습니다(${G12}.png): ENOENT: no such file or directory, open '${displayPath(missing)}'`
      await expect(buildPack(inputs, 'genesis', 1, { preview: true })).rejects.toThrow(new Error(message))
      // 공개 꾸러미는 기본 그림 버전(v2)만 읽으니 v1의 빠진 그림에 걸리지 않는다.
      expect((await buildPack(inputs, 'genesis', 1, { preview: false })).pack.scenes[1]!.images).toEqual({
        v2: mediaPath(G12, contentHash(image.g12v2), 'jpg'),
      })
    })
  })
})
