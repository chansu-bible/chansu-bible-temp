import { describe, expect, it } from 'vitest'
import { joinMp3, mp3DurationMs } from '../src/tts/mp3.ts'

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

// MPEG-1 Layer III 128kbps 48kHz 프레임(형식이 다른 파일). 길이 384바이트
function frame48(): number[] {
  const bytes = new Array<number>(384).fill(0)
  bytes[0] = 0xff
  bytes[1] = 0xfb
  bytes[2] = 0x94
  bytes[3] = 0x00
  return bytes
}

describe('joinMp3', () => {
  it('프레임을 이어 붙여 길이가 합이 된다', () => {
    const joined = joinMp3([Uint8Array.from(frames(10)), Uint8Array.from(frames(5))])
    expect(joined.length).toBe(417 * 15)
    expect(mp3DurationMs(joined)).toBe(mp3DurationMs(Uint8Array.from(frames(15))))
  })

  it('ID3 태그(앞의 ID3v2, 끝의 ID3v1)는 빼고 잇는다', () => {
    const tag = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array<number>(20).fill(0x55)]
    const v1 = [0x54, 0x41, 0x47, ...new Array<number>(125).fill(0x20)]
    const joined = joinMp3([Uint8Array.from([...tag, ...frames(2), ...v1]), Uint8Array.from(frames(3))])
    expect(Array.from(joined)).toEqual(frames(5))
  })

  it('형식(표본률)이 다르면 던진다', () => {
    expect(() => joinMp3([Uint8Array.from(frames(2)), Uint8Array.from(frame48())])).toThrow(/형식/)
  })

  it('Xing 머리가 있으면 던진다(첫 파일의 길이를 전체 길이로 알리게 된다)', () => {
    const xing = frame()
    xing.splice(36, 4, 0x58, 0x69, 0x6e, 0x67)
    expect(() => joinMp3([Uint8Array.from([...xing, ...frames(2)])])).toThrow(/Xing/)
  })

  it('프레임이 없으면 던진다', () => {
    expect(() => joinMp3([Uint8Array.from([1, 2, 3, 4, 5])])).toThrow(/프레임/)
  })
})
