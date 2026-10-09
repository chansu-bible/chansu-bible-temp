// MP3 파일을 프레임 머리로 읽는다. MPEG 1·2·2.5 Layer III만 다룬다.
// 지금 낭독(OpenAI 음성)은 모두 MPEG-2 Layer III, 24kHz, 단일 채널, 128kbps 고정이고 태그와 Xing 머리가 없다.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
// 머리의 버전 비트(3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5) → 표본률 표
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

type Frame = {
  // 프레임 길이(바이트), 담긴 샘플 수, 표본률
  length: number
  samples: number
  sampleRate: number
  // 이을 수 있는지 볼 때 비교하는 형식(버전, 표본률, 채널)
  format: string
  version: number
  mono: boolean
}

function skipId3(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f)
  const footer = (bytes[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

// 끝의 ID3v1 태그(128바이트, "TAG"로 시작)를 뺀 끝 위치
function endWithoutId3v1(bytes: Uint8Array): number {
  const at = bytes.length - 128
  return at >= 0 && bytes[at] === 0x54 && bytes[at + 1] === 0x41 && bytes[at + 2] === 0x47 ? at : bytes.length
}

// offset에 Layer III 프레임 머리가 있으면 읽는다.
function readFrame(bytes: Uint8Array, offset: number): Frame | null {
  if (offset + 4 > bytes.length) return null
  const b1 = bytes[offset]!
  const b2 = bytes[offset + 1]!
  const b3 = bytes[offset + 2]!
  const b4 = bytes[offset + 3]!
  if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) return null
  const version = (b2 >> 3) & 0x03
  const layer = (b2 >> 1) & 0x03
  const bitrateIndex = (b3 >> 4) & 0x0f
  const rateIndex = (b3 >> 2) & 0x03
  const padding = (b3 >> 1) & 0x01
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null
  const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex]!
  const sampleRate = SAMPLE_RATES[version]![rateIndex]!
  const samples = version === 3 ? 1152 : 576
  const mono = ((b4 >> 6) & 0x03) === 3
  return {
    length: Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding,
    samples,
    sampleRate,
    format: `MPEG-${version === 3 ? '1' : version === 2 ? '2' : '2.5'} ${sampleRate}Hz ${mono ? '단일' : '두'} 채널`,
    version,
    mono,
  }
}

function findFrame(bytes: Uint8Array, start: number, end: number): number | null {
  for (let offset = start; offset + 4 <= end; offset++) if (readFrame(bytes, offset)) return offset
  return null
}

// 재생 길이(ms). 프레임 머리를 하나씩 읽어 샘플 수를 더하므로 고정·가변 비트레이트 모두 맞다. 프레임이 없으면 null이다.
export function mp3DurationMs(bytes: Uint8Array): number | null {
  const end = endWithoutId3v1(bytes)
  let offset = skipId3(bytes)
  let seconds = 0
  let frames = 0
  while (offset + 4 <= end) {
    const frame = readFrame(bytes, offset)
    if (!frame) {
      offset++
      continue
    }
    seconds += frame.samples / frame.sampleRate
    frames++
    offset += frame.length
  }
  return frames > 0 ? Math.round(seconds * 1000) : null
}

// 첫 프레임이 Xing/Info/VBRI 머리(파일 전체 길이를 적어 둔 빈 프레임)인지
function hasVbrHeader(bytes: Uint8Array, offset: number, frame: Frame): boolean {
  const sideInfo = frame.version === 3 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17
  const tagAt = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  const tag = tagAt(offset + 4 + sideInfo)
  return tag === 'Xing' || tag === 'Info' || tagAt(offset + 36) === 'VBRI'
}

// 여러 MP3를 하나로 잇는다(장면 낭독 = 절 낭독을 차례로 이은 것). 태그는 빼고 프레임만 붙인다.
// 모두 같은 형식이어야 하고 Xing/Info 머리가 없어야 한다(있으면 재생기가 첫 파일 길이를 전체 길이로 읽는다). 아니면 던진다.
export function joinMp3(parts: Uint8Array[]): Uint8Array {
  let format: string | null = null
  const bodies: Uint8Array[] = []
  parts.forEach((bytes, index) => {
    const end = endWithoutId3v1(bytes)
    const start = findFrame(bytes, skipId3(bytes), end)
    if (start === null) throw new Error(`${index + 1}번째 파일에서 MP3 프레임을 찾지 못했습니다`)
    const frame = readFrame(bytes, start)!
    if (format === null) format = frame.format
    else if (frame.format !== format) throw new Error(`${index + 1}번째 파일의 형식(${frame.format})이 앞 파일(${format})과 달라 이을 수 없습니다`)
    if (hasVbrHeader(bytes, start, frame)) throw new Error(`${index + 1}번째 파일에 Xing/Info 머리가 있어 이을 수 없습니다`)
    bodies.push(bytes.subarray(start, end))
  })
  const joined = new Uint8Array(bodies.reduce((sum, body) => sum + body.length, 0))
  let at = 0
  for (const body of bodies) {
    joined.set(body, at)
    at += body.length
  }
  return joined
}
