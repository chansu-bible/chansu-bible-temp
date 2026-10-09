// MP3 파일의 재생 길이(ms). 프레임 머리를 하나씩 읽어 샘플 수를 더하므로 고정·가변 비트레이트 모두 맞다.
// MPEG 1·2·2.5 Layer III만 다룬다(OpenAI 음성은 MPEG-1 Layer III). 프레임을 하나도 못 찾으면 null이다.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
// 머리의 버전 비트(3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5) → 표본률 표
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

function skipId3(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f)
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

export function mp3DurationMs(bytes: Uint8Array): number | null {
  let offset = skipId3(bytes)
  let seconds = 0
  let frames = 0
  while (offset + 4 <= bytes.length) {
    const b1 = bytes[offset]!
    const b2 = bytes[offset + 1]!
    const b3 = bytes[offset + 2]!
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) {
      offset++
      continue
    }
    const version = (b2 >> 3) & 0x03
    const layer = (b2 >> 1) & 0x03
    const bitrateIndex = (b3 >> 4) & 0x0f
    const rateIndex = (b3 >> 2) & 0x03
    const padding = (b3 >> 1) & 0x01
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset++
      continue
    }
    const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]!
    const sampleRate = SAMPLE_RATES[version]![rateIndex]!
    const samples = version === 3 ? 1152 : 576
    const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding
    seconds += samples / sampleRate
    frames++
    offset += length
  }
  return frames > 0 ? Math.round(seconds * 1000) : null
}
