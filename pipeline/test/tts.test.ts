import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verseAudioName } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateSpeech, type Speak } from '../src/tts/generateSpeech.ts'
import { selectVersesToSpeak } from '../src/tts/select.ts'

describe('음성 파일 이름', () => {
  it('장은 두 자리, 절은 세 자리로 파일 이름을 만든다(reader-core의 verseAudioName)', () => {
    expect(verseAudioName('genesis', 1, 3)).toBe('genesis-01-003.mp3')
    expect(verseAudioName('genesis', 10, 32)).toBe('genesis-10-032.mp3')
  })
})

describe('selectVersesToSpeak', () => {
  const verses = [
    { verse: 1, text: '가' },
    { verse: 2, text: '나' },
    { verse: 3, text: '다' },
  ]
  const existing = new Set(['genesis-01-002.mp3'])
  const numbers = (selected: { verse: number }[]) => selected.map((verse) => verse.verse)

  it('음성 파일이 없는 절만 고른다', () => {
    expect(numbers(selectVersesToSpeak('genesis', 1, verses, existing, { force: false }))).toEqual([1, 3])
  })

  it('force면 이미 음성이 있는 절도 고른다', () => {
    expect(numbers(selectVersesToSpeak('genesis', 1, verses, existing, { force: true }))).toEqual([1, 2, 3])
  })

  it('limit만큼만 고른다', () => {
    expect(numbers(selectVersesToSpeak('genesis', 1, verses, existing, { force: false, limit: 1 }))).toEqual([1])
  })

  it('다른 장의 음성 파일은 상관하지 않는다', () => {
    expect(numbers(selectVersesToSpeak('genesis', 2, verses, existing, { force: false }))).toEqual([1, 2, 3])
  })

  it('다른 책의 음성 파일은 상관하지 않는다', () => {
    expect(numbers(selectVersesToSpeak('exodus', 1, verses, existing, { force: false }))).toEqual([1, 2, 3])
  })
})

// selectVersesToSpeak는 있는 파일을 건너뛰므로, 끊긴 실행이 반쯤 쓰인 낭독을 남기면 다시 실행해도 그 절은 영영 다시 만들지 않는다.
// 그래서 낭독은 임시 파일(<파일>.tmp)에 다 쓴 뒤 이름을 바꿔 둔다. 임시 폴더에서 가짜 낭독(Speak)으로 돌리고 API는 부르지 않는다.
describe('generateSpeech', () => {
  const source = {
    book: '창세기',
    translation: '개역한글',
    chapters: [{ chapter: 1, verses: ['가', '나', '다'].map((text, index) => ({ verse: index + 1, text })) }],
  }
  const allNames = ['genesis-01-001.mp3', 'genesis-01-002.mp3', 'genesis-01-003.mp3']
  let root: string
  let dirs: { sourceDir: string; audioDir: string }

  // 받은 글을 그대로 바이트로 돌려주는 가짜 낭독
  const speak: Speak = async (text) => Buffer.from(`소리 ${text}`)
  const run = (stub: Speak, force = false) =>
    generateSpeech({ book: 'genesis', chapter: 1, force, dryRun: false }, stub, () => undefined, dirs)
  const names = async () => (await readdir(dirs.audioDir)).sort()
  const read = (name: string) => readFile(path.join(dirs.audioDir, name), 'utf8')

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'tts-'))
    dirs = { sourceDir: path.join(root, 'source'), audioDir: path.join(root, 'audio') }
    await mkdir(dirs.sourceDir)
    await writeFile(path.join(dirs.sourceDir, 'genesis.json'), JSON.stringify(source))
    await mkdir(dirs.audioDir)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('절마다 낭독 파일을 쓰고 임시 파일은 남기지 않는다', async () => {
    expect(await run(speak)).toEqual({ selected: 3, spoken: 3, failed: [] })
    expect(await names()).toEqual(allNames)
    expect(await read('genesis-01-002.mp3')).toBe('소리 나')
  })

  it('낭독을 만들지 못한 절은 파일도 임시 파일도 남기지 않고 실패로 알린다', async () => {
    const failing: Speak = async (text) => {
      if (text === '나') throw new Error('요청 실패')
      return speak(text)
    }
    expect(await run(failing)).toEqual({ selected: 3, spoken: 2, failed: [{ verse: 2, reason: '요청 실패' }] })
    expect(await names()).toEqual(['genesis-01-001.mp3', 'genesis-01-003.mp3'])
  })

  it('이름을 바꾸지 못하면 임시 파일을 치우고 그 절만 실패로 알린다', async () => {
    // 낭독 파일 자리에 폴더가 있으면 그 이름으로 바꿀 수 없다. 이 절도 고르게 force로 돌린다.
    await mkdir(path.join(dirs.audioDir, 'genesis-01-002.mp3'))
    const result = await run(speak, true)
    expect(result).toMatchObject({ selected: 3, spoken: 2 })
    expect(result.failed.map((failure) => failure.verse)).toEqual([2])
    // 이름이 모두 낭독 파일 이름이다(임시 파일이 없다). 두 번째는 폴더 그대로다.
    expect(await names()).toEqual(allNames)
    expect(await read('genesis-01-003.mp3')).toBe('소리 다')
  })

  it('이미 있는 낭독을 다시 만들다 쓰지 못해도 있던 파일은 그대로다', async () => {
    await writeFile(path.join(dirs.audioDir, 'genesis-01-001.mp3'), '옛 소리')
    // 임시 파일 자리에 폴더가 있으면 쓸 수 없다. 다시 만든 절의 낭독이 있던 파일을 덮어쓰면 안 된다.
    await mkdir(path.join(dirs.audioDir, 'genesis-01-001.mp3.tmp'))
    const result = await run(speak, true)
    expect(result.failed.map((failure) => failure.verse)).toEqual([1])
    expect(await read('genesis-01-001.mp3')).toBe('옛 소리')
    expect(await read('genesis-01-002.mp3')).toBe('소리 나')
  })

  it('끊긴 실행이 남긴 임시 파일은 낭독으로 치지 않아, 다시 실행하면 그 절을 만들고 임시 파일을 치운다', async () => {
    await writeFile(path.join(dirs.audioDir, 'genesis-01-001.mp3.tmp'), '쓰다 만')
    expect(await run(speak)).toEqual({ selected: 3, spoken: 3, failed: [] })
    expect(await names()).toEqual(allNames)
    expect(await read('genesis-01-001.mp3')).toBe('소리 가')
  })
})
