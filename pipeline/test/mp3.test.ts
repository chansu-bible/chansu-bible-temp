import { describe, expect, it } from 'vitest'
import { mp3DurationMs } from '../src/tts/mp3.ts'

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
