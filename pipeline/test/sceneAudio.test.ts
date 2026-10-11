import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { joinSceneAudio, sceneAudioParts } from '../src/build/sceneAudio.ts'
import { joinMp3 } from '../src/tts/mp3.ts'

// MPEG-1 Layer III 128kbps 44.1kHz 프레임(417바이트)을 count개 이은 낭독. fill로 어느 절의 소리인지 알아본다.
function mp3(count: number, fill: number): Buffer {
  const frame = Buffer.alloc(417, fill)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  return Buffer.concat(Array.from({ length: count }, () => frame))
}

const scene = { id: 'genesis-01-01', verseStart: 2, verseEnd: 3 }
// 절 낭독 경로는 묶음 경로(content/audio/...)이고, 파일 이름만 audioDir에서 찾는다. 4절은 장면 밖이고 5절은 낭독이 없다.
const verses = [
  { verse: 1, audio: 'content/audio/genesis-01-001.mp3' },
  { verse: 2, audio: 'content/audio/genesis-01-002.mp3' },
  { verse: 3, audio: 'content/audio/genesis-01-003.mp3' },
  { verse: 4, audio: 'content/audio/genesis-01-004.mp3' },
  { verse: 5, audio: null },
]

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'scene-audio-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('sceneAudioParts', () => {
  it('장면 범위 안의 절 가운데 낭독이 있는 절의 낭독 경로를 절 차례로 돌려준다', () => {
    expect(sceneAudioParts(scene, verses)).toEqual(['content/audio/genesis-01-002.mp3', 'content/audio/genesis-01-003.mp3'])
    expect(sceneAudioParts({ verseStart: 4, verseEnd: 5 }, verses)).toEqual(['content/audio/genesis-01-004.mp3'])
    expect(sceneAudioParts({ verseStart: 5, verseEnd: 5 }, verses)).toEqual([])
  })
})

describe('joinSceneAudio', () => {
  it('장면에 든 절 낭독을 audioDir에서 읽어 차례로 이은 바이트를 돌려준다', async () => {
    const parts = [mp3(3, 0x22), mp3(2, 0x33)]
    await writeFile(path.join(dir, 'genesis-01-002.mp3'), parts[0]!)
    await writeFile(path.join(dir, 'genesis-01-003.mp3'), parts[1]!)
    const joined = await joinSceneAudio(scene, verses, dir)
    expect(joined.equals(Buffer.from(joinMp3(parts)))).toBe(true)
  })

  it('이을 절 낭독이 없으면(꾸러미처럼 절 낭독이 null인 절) 장면 id를 밝혀 던진다', async () => {
    await expect(joinSceneAudio(scene, [{ verse: 2, audio: null }, { verse: 3, audio: null }], dir)).rejects.toThrow(
      'genesis-01-01: 장면 낭독에 들어갈 절 낭독이 없습니다',
    )
  })

  it('절 낭독 파일이 없거나 MP3가 아니면 장면 id와 절 낭독 파일 이름을 밝혀 던진다', async () => {
    await writeFile(path.join(dir, 'genesis-01-002.mp3'), mp3(3, 0x22))
    await expect(joinSceneAudio(scene, verses, dir)).rejects.toThrow('genesis-01-01: 장면 낭독을 잇지 못했습니다(genesis-01-002.mp3, genesis-01-003.mp3): ')
    await writeFile(path.join(dir, 'genesis-01-003.mp3'), Buffer.from('MP3가 아닌 바이트'))
    await expect(joinSceneAudio(scene, verses, dir)).rejects.toThrow(
      'genesis-01-01: 장면 낭독을 잇지 못했습니다(genesis-01-002.mp3, genesis-01-003.mp3): 2번째 파일에서 MP3 프레임을 찾지 못했습니다',
    )
  })
})
