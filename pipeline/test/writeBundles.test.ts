import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeBundles, type BundleDirs } from '../src/build/writeBundle.ts'
import { displayPath } from '../src/paths.ts'
import { BundleSchema, type Bundle, type Place, type Scene } from '../src/schema.ts'
import { joinMp3, mp3DurationMs } from '../src/tts/mp3.ts'

// 임시 폴더에 두 책(창세기 2장, 출애굽기 1장)의 content를 만들어 writeBundles를 돌린다.
// 저장소의 content와 app/public/content는 읽지도 쓰지도 않는다.

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

// 에덴은 창세기에, 미디안은 출애굽기에 처음 나온다.
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

// MPEG-1 Layer III 128kbps 44.1kHz 프레임(417바이트, 약 26ms)을 count개 이은 낭독(mp3.test.ts와 같은 프레임).
// 프레임 내용을 fill로 채워 어느 절의 소리인지 알아본다.
function mp3(count: number, fill: number): Buffer {
  const frame = Buffer.alloc(417, fill)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  return Buffer.concat(Array.from({ length: count }, () => frame))
}
const verse1Audio = mp3(10, 0x11)
const verse2Audio = mp3(5, 0x22)
// 표본률만 48kHz인 같은 비트레이트의 프레임(384바이트)을 이은 낭독. 위 낭독들과는 이을 수 없는 형식이다.
const otherFormatAudio = (() => {
  const frame = Buffer.alloc(384, 0x33)
  frame.set([0xff, 0xfb, 0x94, 0x00])
  return Buffer.concat([frame, frame, frame])
})()

const exodusScenes = { chapter: 1, scenes: [scene('exodus-01-01', 1, 1, 2, { placeId: 'midian' })] }
const referenceUrl = 'https://example.org/ref'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// 폴더 아래 모든 파일의 (상대 경로 → 내용의 SHA-256). 폴더가 바이트까지 같은지 견줄 때 쓴다.
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    files[path.relative(dir, file).split(path.sep).join('/')] = digest(await readFile(file))
  }
  return files
}

describe('writeBundles', () => {
  let root: string
  // 모든 폴더를 임시 폴더로 바꿔 준다. Required라서 폴더 옵션이 늘면 이 시험이 형 검사에서 걸린다.
  let dirs: Required<BundleDirs>

  async function put(file: string, data: unknown): Promise<void> {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data instanceof Uint8Array ? data : JSON.stringify(data))
  }

  async function readBundle(book: string): Promise<Bundle> {
    return BundleSchema.parse(JSON.parse(await readFile(path.join(dirs.appContentDir, `${book}.json`), 'utf8')))
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'write-bundles-'))
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
      appContentDir: path.join(root, 'app', 'public', 'content'),
    }
    await put('content/source/genesis.json', genesisSource)
    await put('content/source/exodus.json', exodusSource)
    // 창세기 1장만 장면 파일이 있다(2장은 대체 장면). 첫 장면은 낭독이 있는 1~2절이고 그림 한 장이 있다.
    await put('content/scenes/genesis-01.json', {
      chapter: 1,
      scenes: [
        scene('genesis-01-01', 1, 1, 2, { placeId: 'eden', image: 'genesis-01-01.png' }),
        scene('genesis-01-02', 1, 3, 3),
      ],
    })
    await put('content/scenes/exodus-01.json', exodusScenes)
    await put('content/story-bible/places.json', [place('eden', '에덴', 'genesis 1:1'), place('midian', '미디안', 'exodus 1:2')])
    await put('content/story-bible/style.json', {
      description: '수채화',
      promptPrefix: 'Watercolor.',
      promptRules: 'No faces.',
      references: [{ file: 'ref.jpg', label: '구도', source: `화가, 작품 (1600). 박물관. 퍼블릭 도메인. ${referenceUrl}` }],
    })
    await put('content/images/versions.json', [{ id: 'v1', label: '1차', note: '' }])
    await put('content/images/v1/genesis-01-01.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await put('content/audio/genesis-01-001.mp3', verse1Audio)
    await put('content/audio/genesis-01-002.mp3', verse2Audio)
    // 끊긴 작업이 남긴 임시 파일. 앱 콘텐츠 폴더로 복사하지 않는다.
    await put('content/audio/genesis-01-003.mp3.tmp', verse2Audio)
    await put('content/images/versions.json.tmp', [])
    await put('content/quiz/genesis-01.json', {
      chapter: 1,
      questions: [
        {
          id: 'genesis-01-q1',
          question: '질문',
          options: ['가', '나', '다', '라'],
          answer: 0,
          explanation: '해설',
          verse: 1,
          status: 'approved',
          issues: [],
        },
      ],
    })
    await put('content/original/genesis.json', {
      chapters: [{ chapter: 1, verses: [{ verse: 1, words: [{ text: 'בְּרֵאשִׁית', strong: 'H7225', morph: 'HR/Ncfsa' }] }] }],
    })
    await put('content/original/lexicon.json', {
      entries: [
        {
          strong: 'H7225',
          lemma: 'רֵאשִׁית',
          xlit: 'rêʼshîyth',
          pos: 'n',
          definition: 'beginning',
          usage: '',
          count: 1,
          korean: { meaning: '처음', note: '', status: 'approved' },
        },
      ],
    })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('책마다 <책 id>.json 묶음을 쓰고, 앱 콘텐츠 폴더에 있던 것은 비운다', async () => {
    await put('app/public/content/old.json', {})
    const bundles = await writeBundles(['genesis', 'exodus'], dirs)
    expect(bundles.map((bundle) => bundle.bookId)).toEqual(['genesis', 'exodus'])
    expect(await readBundle('genesis')).toMatchObject({ bookId: 'genesis', book: '창세기' })
    expect(await readBundle('exodus')).toMatchObject({ bookId: 'exodus', book: '출애굽기' })
    expect((await readdir(dirs.appContentDir)).sort()).toEqual(['audio', 'exodus.json', 'genesis.json', 'images'])
  })

  it('바꿔 준 폴더에서 본문, 장면, 퀴즈, 원어, 사전, 설정집, 화풍, 그림, 낭독을 읽고 앱 콘텐츠 폴더에만 쓴다', async () => {
    await writeBundles(['genesis', 'exodus'], dirs)
    const genesis = await readBundle('genesis')
    const exodus = await readBundle('exodus')
    expect(genesis.chapters.map((chapter) => chapter.verses.map((verse) => verse.text))).toEqual([['가', '나', '다'], ['라', '마']])
    // 장면 파일이 없는 2장은 대체 장면이다.
    expect(genesis.chapters.map((chapter) => chapter.scenes.map((item) => item.id))).toEqual([
      ['genesis-01-01', 'genesis-01-02'],
      ['genesis-02-00'],
    ])
    expect(exodus.chapters[0]!.scenes.map((item) => item.id)).toEqual(['exodus-01-01'])
    // 설정집은 그 책까지 나온 장소만 든다.
    expect(genesis.places.map((item) => item.id)).toEqual(['eden'])
    expect(exodus.places.map((item) => item.id)).toEqual(['eden', 'midian'])
    expect(genesis.chapters[0]!.quiz.map((question) => question.id)).toEqual(['genesis-01-q1'])
    // 원어는 책마다 파일이 있는 책만 들고, 사전은 그 묶음의 원어에 나오는 번호만 든다.
    expect(genesis.chapters[0]!.original?.[0]?.words.map((word) => word.strong)).toEqual(['H7225'])
    expect(genesis.lexicon).toMatchObject({ H7225: { korean: '처음', count: 1 } })
    expect(exodus.chapters[0]!.original).toBeNull()
    expect(exodus.lexicon).toEqual({})
    // 화풍 파일의 참고 작품은 자료 출처에 든다.
    const references = genesis.sources.filter((source) => source.id.startsWith('reference-'))
    expect(references.map((source) => source.url)).toEqual([referenceUrl])
    expect(genesis.imageVersions).toEqual([{ id: 'v1', label: '1차', note: '' }])
    expect(genesis.chapters[0]!.scenes[0]!.images).toEqual({ v1: 'content/images/v1/genesis-01-01.png' })
    expect(genesis.chapters[0]!.verses.map((verse) => verse.audio)).toEqual([
      'content/audio/genesis-01-001.mp3',
      'content/audio/genesis-01-002.mp3',
      null,
    ])
    // 앱 콘텐츠 폴더에는 묶음, 그림, 낭독만 있다(그림 버전 목록 파일과 임시 파일은 복사하지 않는다).
    expect(Object.keys(await snapshot(dirs.appContentDir)).sort()).toEqual([
      'audio/genesis-01-001.mp3',
      'audio/genesis-01-002.mp3',
      'audio/scenes/genesis-01-01.mp3',
      'exodus.json',
      'genesis.json',
      'images/v1/genesis-01-01.png',
    ])
  })

  it('책을 더해도 앞 책의 묶음은 그대로다', async () => {
    await writeBundles(['genesis'], dirs)
    const alone = await snapshot(dirs.appContentDir)
    expect(alone).toHaveProperty(['genesis.json'])
    expect(alone).not.toHaveProperty(['exodus.json'])

    // 출애굽기 원어도 창세기와 같은 H7225를 두 번 쓴다. 책을 더할 때 비로소 생기는 파일이라, 사전의 횟수가 책을 넘어 세어지면
    // 창세기 묶음의 횟수가 1에서 3으로 바뀌어 아래에서 걸린다.
    const word = { text: 'בְּרֵאשִׁית', strong: 'H7225', morph: 'HR/Ncfsa' }
    await put('content/original/exodus.json', { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [word, word] }] }] })

    await writeBundles(['genesis', 'exodus'], dirs)
    const both = await snapshot(dirs.appContentDir)
    expect(both['genesis.json']).toBe(alone['genesis.json'])
    expect(both).toHaveProperty(['exodus.json'])
    // 사전의 횟수는 그 책의 원어에서만 센다. 창세기 몫(1)을 더한 3도, lexicon.json의 count(1)도 아니다.
    expect((await readBundle('genesis')).lexicon.H7225?.count).toBe(1)
    expect((await readBundle('exodus')).lexicon.H7225?.count).toBe(2)
    // 창세기만 만들 때 나간 낭독과 그림도 같은 내용이다.
    for (const [file, hash] of Object.entries(alone)) expect(both[file], file).toBe(hash)
  })

  it('장면 낭독은 장면에 든 절 낭독을 이어 붙인 파일이고, 길이는 절 낭독 길이의 합이다', async () => {
    const [genesis] = await writeBundles(['genesis', 'exodus'], dirs)
    const [narrated, silent] = genesis!.chapters[0]!.scenes
    expect(narrated!.audio).toBe('content/audio/scenes/genesis-01-01.mp3')
    const bytes = await readFile(path.join(dirs.appContentDir, 'audio', 'scenes', 'genesis-01-01.mp3'))
    expect(digest(bytes)).toBe(digest(joinMp3([verse1Audio, verse2Audio])))
    const sum = mp3DurationMs(verse1Audio)! + mp3DurationMs(verse2Audio)!
    expect(narrated!.audioMs).toBe(sum)
    // 이어 붙인 파일을 직접 재도 같다.
    expect(mp3DurationMs(bytes)).toBe(sum)
    // 낭독이 있는 절이 없는 장면은 낭독 파일도 없다.
    expect(silent).toMatchObject({ audio: null, audioMs: null })
    expect(existsSync(path.join(dirs.appContentDir, 'audio', 'scenes', 'genesis-01-02.mp3'))).toBe(false)
  })

  // 앱 콘텐츠 폴더는 비우기 전에 모든 책의 검증과 장면 낭독 잇기를 끝낸다. 어느 쪽이 걸려도 앞서 쓴 폴더는 그대로여야 한다.
  describe('책 하나가 실패하면', () => {
    // 오류 글은 바꿔 준 폴더가 정해진 뒤에 알 수 있어 함수로 둔다.
    it.each([
      [
        '장면의 절 범위가 장을 덮지 않을 때',
        scene('exodus-01-01', 1, 1, 1),
        // 어느 책의 장인지 밝힌다.
        () => '출애굽기 1장 장면의 절 범위가 맞지 않습니다:\n마지막 장면이 2절에서 끝나야 하는데 1절에서 끝납니다',
      ],
      [
        '장면이 그림 폴더에 없는 그림을 가리킬 때',
        scene('exodus-01-01', 1, 1, 2, { image: 'none.png' }),
        // 바꿔 준 그림 폴더를 밝힌다(저장소의 content/images가 아니다).
        () => `exodus-01-01: 그림 파일 none.png이 ${displayPath(path.join(dirs.imagesDir, 'v1'))}에 없습니다`,
      ],
    ])('%s 던지고, 앞서 쓴 앱 콘텐츠 폴더는 그대로 둔다', async (_name, broken, message) => {
      await writeBundles(['genesis', 'exodus'], dirs)
      const before = await snapshot(dirs.appContentDir)

      // 창세기를 바꿔 두면, 실패한 출애굽기 때문에 새 창세기 묶음이 나가는 것도 잡힌다.
      const changedChapters = [{ chapter: 1, verses: verses('가가', '나', '다') }, genesisSource.chapters[1]]
      await put('content/source/genesis.json', { ...genesisSource, chapters: changedChapters })
      await put('content/scenes/exodus-01.json', { chapter: 1, scenes: [broken] })
      await expect(writeBundles(['genesis', 'exodus'], dirs)).rejects.toThrow(message())
      expect(await snapshot(dirs.appContentDir)).toEqual(before)

      // 출애굽기를 고치면 바뀐 창세기 묶음이 나간다. 앞의 실패는 창세기를 바꾼 탓이 아니다.
      await put('content/scenes/exodus-01.json', exodusScenes)
      await writeBundles(['genesis', 'exodus'], dirs)
      expect((await snapshot(dirs.appContentDir))['genesis.json']).not.toBe(before['genesis.json'])
    })

    it('그림 버전이 하나도 없는데 장면이 그림을 가리키면 그림 폴더를 밝혀 던지고, 앞서 쓴 앱 콘텐츠 폴더는 그대로 둔다', async () => {
      await writeBundles(['genesis', 'exodus'], dirs)
      const before = await snapshot(dirs.appContentDir)

      await put('content/images/versions.json', [])
      await expect(writeBundles(['genesis', 'exodus'], dirs)).rejects.toThrow(
        `genesis-01-01: 그림 파일 genesis-01-01.png이 ${displayPath(dirs.imagesDir)}에 없습니다`,
      )
      expect(await snapshot(dirs.appContentDir)).toEqual(before)
    })

    // 비거나 MP3가 아니거나 형식이 다른 절 낭독도 묶음 검증은 지나간다(길이를 못 재면 audioMs가 null일 뿐이다).
    // 장면 낭독으로 이을 때 비로소 걸리는데, 그때가 폴더를 비운 뒤이면 폴더가 반쯤 쓰인 채 남는다.
    it.each([
      ['비어 있을 때', Buffer.alloc(0), '2번째 파일에서 MP3 프레임을 찾지 못했습니다'],
      ['MP3가 아닐 때', Buffer.from('MP3가 아닌 바이트'), '2번째 파일에서 MP3 프레임을 찾지 못했습니다'],
      [
        '앞 절과 형식이 다를 때',
        otherFormatAudio,
        '2번째 파일의 형식(MPEG-1 48000Hz 두 채널)이 앞 파일(MPEG-1 44100Hz 두 채널)과 달라 이을 수 없습니다',
      ],
    ])('절 낭독 파일이 %s 장면 id를 밝혀 던지고, 앞서 쓴 앱 콘텐츠 폴더는 그대로 둔다', async (_name, bytes, reason) => {
      await writeBundles(['genesis', 'exodus'], dirs)
      const before = await snapshot(dirs.appContentDir)

      await put('content/audio/genesis-01-002.mp3', bytes)
      await expect(writeBundles(['genesis', 'exodus'], dirs)).rejects.toThrow(
        `genesis-01-01: 장면 낭독을 잇지 못했습니다(genesis-01-001.mp3, genesis-01-002.mp3): ${reason}`,
      )
      expect(await snapshot(dirs.appContentDir)).toEqual(before)

      // 절 낭독을 되돌리면 앞서 쓴 것과 같은 폴더가 다시 만들어진다.
      await put('content/audio/genesis-01-002.mp3', verse2Audio)
      await writeBundles(['genesis', 'exodus'], dirs)
      expect(await snapshot(dirs.appContentDir)).toEqual(before)
    })
  })

  it('책이 없으면 던지고, 앞서 쓴 앱 콘텐츠 폴더는 그대로 둔다', async () => {
    await writeBundles(['genesis'], dirs)
    const before = await snapshot(dirs.appContentDir)
    await expect(writeBundles([], dirs)).rejects.toThrow('본문이 있는 책이 없습니다')
    expect(await snapshot(dirs.appContentDir)).toEqual(before)
  })
})
