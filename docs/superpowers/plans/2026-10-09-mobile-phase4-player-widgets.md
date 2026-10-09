# 네이티브 앱 4단계: 낭독 플레이어와 홈 화면 위젯 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면을 꺼도 이어지는 낭독(잠금 화면·이어폰 조작, 속도, 자막, 잠자기 타이머, 다음에 들을 것)과 홈 화면 위젯 "오늘의 장면"(목업 10, 15)을 만든다.

**Architecture:** 파이프라인 `build`가 장면마다 절 낭독을 이어 붙인 장면 낭독 파일을 만든다(모든 낭독이 같은 고정 비트레이트 MP3라 프레임을 잇기만 하면 된다). 앱은 루트에 낭독 재생기 하나(`NarrationProvider`)를 두고 장면 파일을 재생한다. 지금 절은 재생 위치와 절 길이(`audioMs`)로 정한다. 읽기 화면, 새 낭독 플레이어(`/player`), 홈의 작은 재생 막대, 잠금 화면이 같은 재생을 본다. 위젯은 `reader-core`의 같은 계산(`widgetSnapshot`)으로 그릴 것을 정하고, 안드로이드는 `react-native-android-widget`(JS로 그림), iOS는 WidgetKit 확장(`@bacons/apple-targets`, App Group으로 데이터 공유)으로 그린다.

**Tech Stack:** expo-audio 57(잠금 화면 조작, 백그라운드 재생), expo-asset, react-native-android-widget 0.22, @bacons/apple-targets 5, SwiftUI/WidgetKit, sharp(위젯 그림), vitest.

**설계:** `docs/superpowers/specs/2026-10-09-native-app-design.md` 6절 10·15, 11절("네이티브 빌드 없이 만든 4단계 코드")

**설계에서 바꾸거나 새로 정하는 것:**
- 절 파일을 하나씩 바꿔 재생하지 않고 장면 파일 하나를 재생한다. 화면이 꺼진 동안 iOS는 파일을 바꾸는 틈에 앱을 멈출 수 있고, 안드로이드는 잠금 화면 조작을 켜야 3분 넘게 재생한다. 장면 파일이면 바꾸는 일이 장면 경계에서만 생기고, 잠금 화면에는 장면 하나가 곡 하나로 보인다(목업의 진행 막대도 장면 단위다). 웹 목업은 지금처럼 절 파일을 쓴다.
- 낭독은 앱 전체에 하나다. 읽기 화면을 닫아도 이어지고, 들은 곳까지 읽기 위치와 읽은 장면이 적힌다(듣는 것도 읽은 것으로 센다).
- 잠자기 타이머는 끔·15분·30분·60분·장면 끝. 분 타이머는 시간이 되면 그때 읽던 절을 마저 읽고 멈춘다(문장 가운데서 끊지 않게).
- 잠금 화면의 앞뒤 버튼은 10초 건너뛰기다(expo-audio가 곡 넘기기 단추를 주지 않는다). 절 넘기기는 플레이어 화면에서 한다.
- 플레이어는 목업처럼 테마와 상관없이 어두운 바탕이다. 홈에는 낭독 중일 때 작은 재생 막대가 뜨고, 계획 카드에 "오늘 분량 듣기"를 둔다. 읽기 화면에는 낭독 중일 때 플레이어를 여는 단추가 생긴다.
- 위젯은 홈의 이어 읽기 카드와 같은 장면(저장된 읽기 위치의 장면)과 연속 읽기 날수를 보인다. 누르면 읽기 화면이 열린다(`chansubible://read`). 위젯 그림은 장면 그림을 작게 줄인 것(420×474 JPEG)이다. 안드로이드 위젯은 큰 비트맵을 보내면 실패한다.
- 마이크 권한을 빼다. expo-audio 설정 플러그인이 기본으로 넣는 녹음 권한(iOS 마이크 설명, 안드로이드 RECORD_AUDIO)은 이 앱에 필요 없고 스토어 심사에서 이유를 묻는다.
- 위젯 모듈은 개발 빌드에만 있다. Expo Go와 웹에서는 위젯 코드를 불러오지 않는다(안드로이드 위젯 모듈은 불러오는 순간 네이티브 모듈을 찾아 Expo Go에서 앱이 죽는다).
- 기기 확인(잠금 화면 재생, 위젯 표시)은 빌드 환경이 정해진 뒤에 한다. 이 단계에서는 웹에서 플레이어를 확인하고, `expo prebuild`로 만든 네이티브 설정(권한, 백그라운드 모드, 위젯 등록, App Group)을 확인한다. 설계 11절대로 4단계 완료는 기기 확인 뒤에 표시한다.

**코드 블록 표기:** 정보 문자열에 `path=`가 붙은 코드 블록은 그 파일의 전체 내용이다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `pipeline/src/tts/mp3.ts` | 프레임 읽기, 길이, MP3 잇기(`joinMp3`) |
| `pipeline/src/build/buildBundle.ts`, `writeBundle.ts`, `schema.ts` | 장면의 `audio`, `audioMs`와 장면 낭독 파일 |
| `packages/reader-core/src/narration.ts` | 장면 낭독 안의 절 구간, 앞뒤 장면, 다음에 들을 것, 잠자기 타이머, 시각 표시 |
| `packages/reader-core/src/widget.ts` | 위젯에 그릴 것 |
| `mobile/src/narration/NarrationContext.tsx` | 앱 전체 낭독 재생기(잠금 화면, 백그라운드, 잠자기, 읽기 기록) |
| `mobile/src/player/{PlayerScreen,SleepSheet,MiniPlayer}.tsx`, `mobile/src/app/player.tsx` | 낭독 플레이어, 잠자기 타이머 시트, 홈의 작은 재생 막대 |
| `mobile/src/widgets/*` | 위젯 스냅숏, 안드로이드 위젯 그림과 작업, 위젯 갱신 |
| `mobile/targets/widget/*` | iOS 위젯 확장(설정, SwiftUI) |
| `mobile/index.ts` | 앱 진입점(expo-router + 안드로이드 위젯 작업 등록) |
| `mobile/scripts/sync-content.mjs` | 장면 낭독과 위젯 그림을 앱에 넣는다 |

---

### Task 1: 장면 낭독 파일

**Files:**
- Modify: `pipeline/src/tts/mp3.ts`(전체), `pipeline/test/mp3.test.ts`(더함), `pipeline/src/build/buildBundle.ts`, `pipeline/src/build/writeBundle.ts`, `pipeline/src/schema.ts`, `pipeline/test/buildBundle.test.ts`(더함), `docs/content-bundle.md`
- Modify: `packages/reader-core/src/types.ts`, `packages/reader-core/src/bundle.ts`

- [ ] **Step 1: MP3 잇기 시험**

`pipeline/test/mp3.test.ts`의 import를 `import { joinMp3, mp3DurationMs } from '../src/tts/mp3.ts'`로 바꾸고 끝에 더한다.

```ts
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
```

- [ ] **Step 2: 실패를 본다**

Run: `npx vitest run --root pipeline test/mp3.test.ts` → FAIL(`joinMp3` 없음)

- [ ] **Step 3: MP3 모듈**

```ts path=pipeline/src/tts/mp3.ts
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
```

Run: `npx vitest run --root pipeline test/mp3.test.ts` → PASS

- [ ] **Step 4: 묶음의 장면 낭독 시험**

`pipeline/test/buildBundle.test.ts`의 import를 `import { buildBundle, sceneAudioParts } from '../src/build/buildBundle.ts'`로 바꾸고 `describe('buildBundle')` 안 끝에 더한다.

```ts
  it('장면에 든 절 가운데 음성이 있는 절을 이어 장면 낭독으로 둔다(길이는 합)', () => {
    const audio = new Map<string, number | null>([
      ['genesis-01-001.mp3', 1000],
      ['genesis-01-003.mp3', 2500],
    ])
    const bundle = buildBundle(source, [{ chapter: 1, scenes: [scene({})] }], canonOf(places), audio)
    const built = bundle.chapters[0].scenes[0]
    expect(built.audio).toBe('content/audio/scenes/genesis-01-01.mp3')
    expect(built.audioMs).toBe(3500)
    expect(sceneAudioParts(built, bundle.chapters[0].verses)).toEqual([
      'content/audio/genesis-01-001.mp3',
      'content/audio/genesis-01-003.mp3',
    ])
  })

  it('음성이 하나도 없는 장면은 낭독이 null이고, 길이를 모르는 절이 있으면 길이만 null이다', () => {
    const none = buildBundle(source, [{ chapter: 1, scenes: [scene({})] }], canonOf(places))
    expect(none.chapters[0].scenes[0]).toMatchObject({ audio: null, audioMs: null })
    const unknown = buildBundle(source, [], canonOf(places), new Set(['genesis-02-001.mp3']))
    expect(unknown.chapters[1].scenes[0]).toMatchObject({ audio: 'content/audio/scenes/genesis-02-00.mp3', audioMs: null })
  })
```

(`buildBundle`의 장면 파일 인자 형식이 위와 다르면 같은 파일의 다른 시험처럼 맞춘다.)

- [ ] **Step 5: 묶음 구현**

`pipeline/src/schema.ts`의 `BundleSceneSchema`에 더한다.

```ts
  // 장면 낭독: 장면에 든 절의 낭독을 이은 파일(content/audio/scenes/<장면 id>.mp3)과 길이(ms). 음성이 없으면 null
  audio: z.string().nullable(),
  audioMs: z.number().int().nonnegative().nullable(),
```

`pipeline/src/build/buildBundle.ts`:
- `toBundleScene`과 `fallbackScene`이 돌려주는 형을 `SceneWithoutAudio`(= `Omit<BundleScene, 'audio' | 'audioMs'>`)로 바꾼다.
- 장의 장면을 만드는 두 곳을 `withSceneAudio(…, verses)`로 감싼다.

```ts
type SceneWithoutAudio = Omit<BundleScene, 'audio' | 'audioMs'>
type VerseAudio = { verse: number; audio: string | null; audioMs: number | null }

// 장면 낭독에 들어가는 절 낭독 파일(묶음 안 경로)을 차례대로. writeBundle이 이 파일들을 이어 붙인다.
// 앱은 장면마다 이 파일 하나를 재생한다. 화면을 꺼도 절마다 파일을 바꾸지 않아 끊기지 않고, 잠금 화면에는 장면 단위로 보인다.
export function sceneAudioParts(scene: { verseStart: number; verseEnd: number }, verses: VerseAudio[]): string[] {
  return verses.flatMap((verse) =>
    verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd && verse.audio !== null ? [verse.audio] : [],
  )
}

function withSceneAudio(scene: SceneWithoutAudio, verses: VerseAudio[]): BundleScene {
  const parts = verses.filter((verse) => verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd && verse.audio !== null)
  if (parts.length === 0) return { ...scene, audio: null, audioMs: null }
  const known = parts.every((verse) => verse.audioMs !== null)
  return {
    ...scene,
    audio: `content/audio/scenes/${scene.id}.mp3`,
    audioMs: known ? parts.reduce((sum, verse) => sum + (verse.audioMs ?? 0), 0) : null,
  }
}
```

`pipeline/src/build/writeBundle.ts`: 낭독 폴더를 복사한 다음 장면 낭독을 만든다(`joinMp3`, `sceneAudioParts`를 가져온다).

```ts
  // 장면 낭독: 절 낭독을 이어 붙인다. 모든 낭독이 같은 고정 비트레이트 MP3라 프레임을 잇기만 하면 된다.
  for (const chapter of bundle.chapters) {
    for (const scene of chapter.scenes) {
      if (!scene.audio) continue
      const parts = await Promise.all(
        sceneAudioParts(scene, chapter.verses).map((file) => readFile(path.join(audioDir, path.basename(file)))),
      )
      const target = path.join(appContentDir, 'audio', 'scenes', `${scene.id}.mp3`)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, joinMp3(parts))
    }
  }
```

`packages/reader-core/src/types.ts`의 `Scene`에 더한다.

```ts
  // 장면 낭독(절 낭독을 이은 파일)과 길이(ms). 음성이 없거나 옛 묶음이면 null이다(불러올 때 채운다).
  audio: string | null
  audioMs: number | null
```

`packages/reader-core/src/bundle.ts`의 `fillMissing`에서 장면을 채울 때 `audio: scene.audio ?? null, audioMs: scene.audioMs ?? null`을 더한다. reader-core 시험의 장면 고정값에도 `audio: null, audioMs: null`을 넣는다(형 검사가 알려 주는 곳).

`docs/content-bundle.md`: 파일 배치에 `audio/scenes/<장면 id>.mp3  장면 낭독(장면에 든 절 낭독을 이은 것)`, Scene 표에 `audio`, `audioMs`, 형식 버전 문단에 "장면의 `audio`, `audioMs`"를 더하고, 읽기 규칙의 낭독에 "앱은 장면 낭독을 재생하고 절 위치는 그 장면에서 음성이 있는 절의 `audioMs`를 차례로 더해 찾는다"를 적는다.

- [ ] **Step 6: 시험, 묶음 다시 만들기, 커밋**

Run: `npm test -w pipeline && npm test -w reader-core && npx tsc --noEmit -p packages/reader-core && npm run pipeline -- build`
Expected: 모두 통과. `app/public/content/audio/scenes/`에 장면 38개의 낭독이 생기고, 파일마다 `mp3DurationMs`가 묶음의 `audioMs`와 같다.

```bash
node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync('app/public/content/genesis.json','utf8'));let n=0;for(const c of b.chapters)for(const s of c.scenes)if(s.audio){n++;if(!fs.existsSync('app/public/content/'+s.audio.replace(/^content\//,'')))throw new Error('없음 '+s.audio)}console.log('장면 낭독',n)"
```

```bash
git add pipeline packages/reader-core docs/content-bundle.md
git commit -m "feat(pipeline): 장면 낭독 파일(절 낭독을 이은 MP3)과 묶음의 장면 audio·audioMs"
```

---

### Task 2: reader-core — 낭독 계산과 위젯 스냅숏

**Files:**
- Create: `packages/reader-core/src/narration.ts`, `narration.test.ts`, `widget.ts`, `widget.test.ts`
- Modify: `packages/reader-core/src/index.ts`

- [ ] **Step 1: 시험**

```ts path=packages/reader-core/src/narration.test.ts
import { describe, expect, it } from 'vitest'
import {
  adjacentTrack,
  clockLabel,
  sceneTrack,
  sleepLabel,
  sleepStopMs,
  startSleep,
  stepVerseMs,
  trackAt,
  upcomingTracks,
  verseAtTime,
  verseStartMs,
} from './narration.ts'
import type { Chapter, Scene, Verse } from './types.ts'

const verse = (chapter: number, n: number, audioMs: number | null): Verse => ({
  verse: n,
  text: `${n}절`,
  audio: audioMs === null ? null : `content/audio/genesis-${String(chapter).padStart(2, '0')}-${String(n).padStart(3, '0')}.mp3`,
  audioMs,
})

const scene = (id: string, verseStart: number, verseEnd: number, audio: boolean): Scene => ({
  id,
  verseStart,
  verseEnd,
  title: id,
  commentary: null,
  explanation: [],
  history: [],
  glossary: [],
  placeId: null,
  characters: [],
  images: {},
  reviewStatus: 'none',
  audio: audio ? `content/audio/scenes/${id}.mp3` : null,
  audioMs: null,
})

// 1장: 장면 a(1~2절), b(3~4절, 3절은 음성 없음), c(5절, 음성 없음). 2장: 장면 d(1~2절)
const chapters: Chapter[] = [
  {
    chapter: 1,
    verses: [verse(1, 1, 1000), verse(1, 2, 2000), verse(1, 3, null), verse(1, 4, 1500), verse(1, 5, null)],
    scenes: [scene('a', 1, 2, true), scene('b', 3, 4, true), scene('c', 5, 5, false)],
  },
  {
    chapter: 2,
    verses: [verse(2, 1, 500), verse(2, 2, 500)],
    scenes: [scene('d', 1, 2, true)],
  },
]

describe('장면 낭독', () => {
  it('절마다 구간을 매기고, 음성이 없는 절은 뺀다', () => {
    expect(sceneTrack(chapters[0]!, 0)).toEqual({
      chapter: 1,
      sceneIndex: 0,
      sceneId: 'a',
      audio: 'content/audio/scenes/a.mp3',
      verses: [
        { verse: 1, startMs: 0, endMs: 1000 },
        { verse: 2, startMs: 1000, endMs: 3000 },
      ],
      durationMs: 3000,
    })
    expect(sceneTrack(chapters[0]!, 1)?.verses).toEqual([{ verse: 4, startMs: 0, endMs: 1500 }])
    expect(sceneTrack(chapters[0]!, 2)).toBeNull()
  })

  it('재생 위치로 절을, 절로 재생 위치를 찾는다', () => {
    const track = sceneTrack(chapters[0]!, 0)!
    expect(verseAtTime(track, 0)).toBe(1)
    expect(verseAtTime(track, 999)).toBe(1)
    expect(verseAtTime(track, 1000)).toBe(2)
    expect(verseAtTime(track, 9999)).toBe(2)
    expect(verseStartMs(track, 2)).toBe(1000)
    expect(verseStartMs(sceneTrack(chapters[0]!, 1)!, 3)).toBe(0)
  })

  it('앞뒤 장면은 장을 넘고, 음성이 없는 장면은 건너뛴다', () => {
    expect(adjacentTrack(chapters, { chapter: 1, sceneIndex: 1 }, 1)?.sceneId).toBe('d')
    expect(adjacentTrack(chapters, { chapter: 2, sceneIndex: 0 }, -1)?.sceneId).toBe('b')
    expect(adjacentTrack(chapters, { chapter: 2, sceneIndex: 0 }, 1)).toBeNull()
    expect(upcomingTracks(chapters, { chapter: 1, sceneIndex: 0 }).map((track) => track.sceneId)).toEqual(['b', 'd'])
  })

  it('위치의 장면에 음성이 없으면 뒤로 처음 음성이 있는 장면이다', () => {
    expect(trackAt(chapters, { chapter: 1, verse: 2 })?.sceneId).toBe('a')
    expect(trackAt(chapters, { chapter: 1, verse: 5 })?.sceneId).toBe('d')
  })

  it('절 넘기기: 장면 안이면 위치, 밖이면 null. 뒤로는 2초 넘게 들었으면 지금 절의 처음', () => {
    const track = sceneTrack(chapters[0]!, 0)!
    expect(stepVerseMs(track, 500, 1)).toBe(1000)
    expect(stepVerseMs(track, 1500, 1)).toBeNull()
    expect(stepVerseMs(track, 1500, -1)).toBe(0)
    expect(stepVerseMs(track, 500, -1)).toBeNull()
    const long = sceneTrack(chapters[0]!, 0)!
    expect(stepVerseMs({ ...long, verses: [{ verse: 1, startMs: 0, endMs: 9000 }] }, 4000, -1)).toBe(0)
  })
})

describe('잠자기 타이머', () => {
  const track = sceneTrack(chapters[0]!, 0)!

  it('분 타이머는 시간이 되면 그때 읽던 절의 끝에서 멈춘다', () => {
    const timer = startSleep(15, 1_000)
    expect(timer).toEqual({ kind: 'minutes', minutes: 15, until: 1_000 + 15 * 60_000 })
    expect(sleepStopMs(timer, 2_000, track, 500)).toBeNull()
    expect(sleepStopMs(timer, timer.kind === 'minutes' ? timer.until : 0, track, 1500)).toBe(3000)
    expect(sleepStopMs(startSleep('sceneEnd', 0), 99_999_999, track, 500)).toBeNull()
  })

  it('남은 시간을 보여 준다', () => {
    expect(sleepLabel(startSleep('off', 0), 0)).toBe('잠자기 타이머')
    expect(sleepLabel(startSleep('sceneEnd', 0), 0)).toBe('장면 끝에서 멈춤')
    expect(sleepLabel(startSleep(30, 0), 61_000)).toBe('29분 뒤 멈춤')
  })

  it('시각은 분:초로 쓴다', () => {
    expect(clockLabel(0)).toBe('0:00')
    expect(clockLabel(72_400)).toBe('1:12')
  })
})
```

```ts path=packages/reader-core/src/widget.test.ts
import { describe, expect, it } from 'vitest'
import type { Bundle, Scene } from './types.ts'
import { widgetSnapshot } from './widget.ts'

const scene = (id: string, verseStart: number, verseEnd: number, title: string): Scene => ({
  id,
  verseStart,
  verseEnd,
  title,
  commentary: null,
  explanation: [],
  history: [],
  glossary: [],
  placeId: null,
  characters: [],
  images: { v1: `content/images/v1/${id}.jpg` },
  reviewStatus: 'none',
  audio: null,
  audioMs: null,
})

const bundle = {
  schemaVersion: 1,
  book: '창세기',
  translation: '개역한글',
  places: [],
  characters: [],
  eras: [],
  things: [],
  imageVersions: [{ id: 'v1', label: '기본', note: '' }],
  defaultImageVersion: 'v1',
  chapters: [
    {
      chapter: 4,
      verses: Array.from({ length: 16 }, (_, index) => ({ verse: index + 1, text: '', audio: null, audioMs: null })),
      scenes: [scene('genesis-04-01', 1, 12, '가인과 아벨'), scene('genesis-04-02', 13, 16, '가인의 표와 떠남')],
    },
  ],
} as unknown as Bundle

describe('widgetSnapshot', () => {
  it('저장된 읽기 위치의 장면과 연속 읽기 날수를 보인다', () => {
    expect(widgetSnapshot(bundle, { chapter: 4, verse: 14 }, ['2026-10-08', '2026-10-09'], '2026-10-09')).toEqual({
      sceneId: 'genesis-04-02',
      image: 'content/images/v1/genesis-04-02.jpg',
      kicker: '오늘의 장면 · 창세기 4장',
      title: '가인의 표와 떠남',
      detail: '4:13~16절 · 2일째 이어 읽는 중',
    })
  })

  it('읽은 날이 없으면 절 범위만 보이고, 위치가 없으면 첫 장면이다', () => {
    expect(widgetSnapshot(bundle, null, [], '2026-10-09')).toMatchObject({ sceneId: 'genesis-04-01', detail: '4:1~12절' })
  })
})
```

Run: `npm test -w reader-core` → FAIL(모듈 없음)

- [ ] **Step 2: 구현**

```ts path=packages/reader-core/src/narration.ts
import type { Position } from './position.ts'
import type { Chapter } from './types.ts'

// 장면 낭독 파일(장면에 든 절의 낭독을 차례로 이은 것) 안에서 절마다의 구간(ms).
// 음성이 없는 절은 파일에 들어 있지 않아 빠진다.
export type TrackVerse = { verse: number; startMs: number; endMs: number }

export type TrackRef = { chapter: number; sceneIndex: number }

export type SceneTrack = TrackRef & {
  sceneId: string
  // 묶음 안 경로(content/audio/scenes/...)
  audio: string
  verses: TrackVerse[]
  durationMs: number
}

export function sceneTrack(chapter: Chapter, sceneIndex: number): SceneTrack | null {
  const scene = chapter.scenes[sceneIndex]
  if (!scene || !scene.audio) return null
  const verses: TrackVerse[] = []
  let at = 0
  for (const verse of chapter.verses) {
    if (verse.verse < scene.verseStart || verse.verse > scene.verseEnd || verse.audio === null) continue
    const length = verse.audioMs ?? 0
    verses.push({ verse: verse.verse, startMs: at, endMs: at + length })
    at += length
  }
  if (verses.length === 0) return null
  return { chapter: chapter.chapter, sceneIndex, sceneId: scene.id, audio: scene.audio, verses, durationMs: at }
}

// 앞뒤로 가장 가까운, 음성이 있는 장면. 장을 넘어간다.
export function adjacentTrack(chapters: Chapter[], from: TrackRef, direction: 1 | -1): SceneTrack | null {
  const order = chapters.flatMap((chapter) => chapter.scenes.map((_, sceneIndex) => ({ chapter, sceneIndex })))
  const at = order.findIndex((item) => item.chapter.chapter === from.chapter && item.sceneIndex === from.sceneIndex)
  if (at < 0) return null
  for (let index = at + direction; index >= 0 && index < order.length; index += direction) {
    const track = sceneTrack(order[index]!.chapter, order[index]!.sceneIndex)
    if (track) return track
  }
  return null
}

// 위치가 든 장면의 낭독. 그 장면에 음성이 없으면 뒤로 처음 음성이 있는 장면이다.
export function trackAt(chapters: Chapter[], position: Position): SceneTrack | null {
  const chapter = chapters.find((item) => item.chapter === position.chapter)
  if (!chapter) return null
  const found = chapter.scenes.findIndex((scene) => position.verse >= scene.verseStart && position.verse <= scene.verseEnd)
  const sceneIndex = found < 0 ? 0 : found
  return sceneTrack(chapter, sceneIndex) ?? adjacentTrack(chapters, { chapter: chapter.chapter, sceneIndex }, 1)
}

// "다음에 들을 것": 지금 장면 뒤로 음성이 있는 장면 count개
export function upcomingTracks(chapters: Chapter[], from: TrackRef, count = 3): SceneTrack[] {
  const tracks: SceneTrack[] = []
  let current = from
  while (tracks.length < count) {
    const next = adjacentTrack(chapters, current, 1)
    if (!next) break
    tracks.push(next)
    current = next
  }
  return tracks
}

// 재생 위치(ms)에서 읽는 절. 끝을 지나면 마지막 절이다.
export function verseAtTime(track: SceneTrack, ms: number): number {
  for (const item of track.verses) if (ms < item.endMs) return item.verse
  return track.verses[track.verses.length - 1]!.verse
}

// 그 절이 시작하는 위치(ms). 파일에 없는 절이면 그 뒤의 첫 절, 그것도 없으면 마지막 절이다.
export function verseStartMs(track: SceneTrack, verse: number): number {
  return (track.verses.find((item) => item.verse >= verse) ?? track.verses[track.verses.length - 1]!).startMs
}

// 앞뒤 절로 옮길 재생 위치. 장면 밖으로 나가면 null이다(앞뒤 장면으로 옮긴다).
// 뒤로 갈 때 지금 절을 2초 넘게 들었으면 지금 절의 처음으로 간다(음악 재생기와 같다).
export function stepVerseMs(track: SceneTrack, currentMs: number, direction: 1 | -1): number | null {
  const found = track.verses.findIndex((item) => currentMs < item.endMs)
  const index = found < 0 ? track.verses.length - 1 : found
  const current = track.verses[index]!
  if (direction === -1 && currentMs - current.startMs > 2000) return current.startMs
  return track.verses[index + direction]?.startMs ?? null
}

// 잠자기 타이머. 분 타이머는 시간이 되면 그때 읽던 절을 마저 읽고 멈춘다(문장 가운데서 끊지 않게).
export type SleepChoice = 'off' | 15 | 30 | 60 | 'sceneEnd'
export const SLEEP_CHOICES: SleepChoice[] = ['off', 15, 30, 60, 'sceneEnd']

export type SleepTimer = { kind: 'off' } | { kind: 'minutes'; minutes: number; until: number } | { kind: 'sceneEnd' }

export function startSleep(choice: SleepChoice, now: number): SleepTimer {
  if (choice === 'off') return { kind: 'off' }
  if (choice === 'sceneEnd') return { kind: 'sceneEnd' }
  return { kind: 'minutes', minutes: choice, until: now + choice * 60_000 }
}

export function sleepChoiceOf(timer: SleepTimer): SleepChoice {
  if (timer.kind === 'minutes') return SLEEP_CHOICES.find((choice) => choice === timer.minutes) ?? 'off'
  return timer.kind
}

// 지금 멈출 재생 위치(ms). 분 타이머의 시간이 지났으면 지금 절의 끝, 아니면 null이다.
export function sleepStopMs(timer: SleepTimer, now: number, track: SceneTrack, currentMs: number): number | null {
  if (timer.kind !== 'minutes' || now < timer.until) return null
  const verse = verseAtTime(track, currentMs)
  return track.verses.find((item) => item.verse === verse)!.endMs
}

export function sleepLabel(timer: SleepTimer, now: number): string {
  if (timer.kind === 'off') return '잠자기 타이머'
  if (timer.kind === 'sceneEnd') return '장면 끝에서 멈춤'
  return `${Math.max(1, Math.ceil((timer.until - now) / 60_000))}분 뒤 멈춤`
}

export function sleepChoiceLabel(choice: SleepChoice): string {
  return choice === 'off' ? '끔' : choice === 'sceneEnd' ? '장면 끝' : `${choice}분`
}

// 0:00 꼴 시각
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
```

```ts path=packages/reader-core/src/widget.ts
import { findSceneIndex, initialPosition } from './readingPosition.ts'
import { readingStreak } from './streak.ts'
import type { Position } from './position.ts'
import type { Bundle } from './types.ts'

// 홈 화면 위젯 "오늘의 장면"(목업 15)에 그릴 것. 앱 홈의 이어 읽기 카드와 같은 장면(저장된 읽기 위치의 장면)이다.
// 안드로이드 위젯은 이것을 바로 그리고, iOS 위젯은 App Group에 JSON으로 받아 그린다.
export type WidgetSnapshot = {
  sceneId: string
  // 기본 그림 버전의 그림(묶음 안 경로). 없으면 null
  image: string | null
  // '오늘의 장면 · 창세기 4장'
  kicker: string
  title: string
  // '4:13~16절 · 12일째 이어 읽는 중'
  detail: string
}

export function widgetSnapshot(bundle: Bundle, saved: Position | null, readDays: Iterable<string>, today: string): WidgetSnapshot {
  const position = initialPosition(bundle.chapters, saved)
  const chapter = bundle.chapters.find((item) => item.chapter === position.chapter) ?? bundle.chapters[0]!
  const scene = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const range =
    scene.verseStart === scene.verseEnd
      ? `${chapter.chapter}:${scene.verseStart}절`
      : `${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}절`
  const streak = readingStreak(new Set(readDays), today)
  return {
    sceneId: scene.id,
    image: bundle.defaultImageVersion ? (scene.images[bundle.defaultImageVersion] ?? null) : null,
    kicker: `오늘의 장면 · ${bundle.book} ${chapter.chapter}장`,
    title: scene.title,
    detail: streak > 0 ? `${range} · ${streak}일째 이어 읽는 중` : range,
  }
}
```

`index.ts`에 `export * from './narration.ts'`, `export * from './widget.ts'`를 더한다.

- [ ] **Step 3: 통과와 커밋**

Run: `npm test -w reader-core && npx tsc --noEmit -p packages/reader-core` → PASS

```bash
git add packages/reader-core
git commit -m "feat(core): 장면 낭독 계산(절 구간, 앞뒤 장면, 잠자기 타이머)과 위젯 스냅숏"
```

---

### Task 3: 앱 전체 낭독 재생기

**Files:**
- Create: `mobile/src/narration/NarrationContext.tsx`
- Modify: `mobile/src/app/_layout.tsx`, `mobile/src/reader/ReaderScreen.tsx`, `mobile/src/reader/ScenePane.tsx`, `mobile/src/ui/Icon.tsx`, `mobile/app.json`, `mobile/scripts/sync-content.mjs`(전체)
- Delete: `mobile/src/reader/useNarration.ts`

- [ ] **Step 1: 앱에 장면 낭독과 위젯 그림 넣기**

```js path=mobile/scripts/sync-content.mjs
// 웹 묶음(app/public/content, 파이프라인 build의 결과)에서 앱에 넣을 것만 assets/content로 복사하고,
// 그림·낭독 경로를 require() 표로 바꾼 src/content/assets.generated.ts를 만든다.
// 그림은 기본 그림 버전만 넣는다(웹의 그림 버전 전환은 시험용이라 앱에는 두지 않는다).
// 낭독은 장면 낭독(장면마다 절 낭독을 이은 파일)만 넣는다. 앱은 장면 단위로 재생한다.
// 홈 화면 위젯용 작은 그림(assets/content/widget/<장면 id>.jpg)을 만든다. 안드로이드 위젯은 큰 그림을 보내면 실패한다.
// 바뀐 파일만 쓰고 필요 없어진 파일만 지운다. Metro가 떠 있는 동안 돌려도(형 검사가 먼저 부른다) 파일이 잠깐 사라지지 않게.
// 실행: npm run content -w mobile  (먼저 npm run pipeline -- build)
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const mobile = path.resolve(import.meta.dirname, '..')
const source = path.resolve(mobile, '../app/public/content')
const target = path.join(mobile, 'assets/content')
const generated = path.join(mobile, 'src/content/assets.generated.ts')

// 위젯의 그림 칸(140×158pt)의 세 배
const WIDGET_IMAGE = { width: 420, height: 474 }

if (!existsSync(path.join(source, 'genesis.json'))) {
  console.error('app/public/content/genesis.json이 없습니다. 먼저 npm run pipeline -- build를 실행하세요.')
  process.exit(1)
}

const bundle = JSON.parse(await readFile(path.join(source, 'genesis.json'), 'utf8'))
const version = bundle.defaultImageVersion
const images = []
const audio = []
const widgetImages = []
for (const chapter of bundle.chapters) {
  for (const scene of chapter.scenes) {
    const image = version ? scene.images[version] : undefined
    if (image) {
      images.push(image)
      widgetImages.push([scene.id, image])
    }
    if (scene.audio) audio.push(scene.audio)
  }
}

// 묶음 안 경로는 content/로 시작한다(docs/content-bundle.md). 앞의 content/를 떼면 묶음 폴더 기준이다.
const inBundle = (file) => file.replace(/^content\//, '')

// 내용이 같으면 쓰지 않는다.
async function writeIfChanged(file, bytes) {
  const current = await readFile(file).catch(() => null)
  if (current && Buffer.compare(current, bytes) === 0) return false
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return true
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

// 만들 파일 → 내용을 만드는 함수
const wanted = new Map()
for (const file of ['content/genesis.json', ...images, ...audio]) {
  wanted.set(path.join(target, inBundle(file)), () => readFile(path.join(source, inBundle(file))))
}
for (const [id, image] of widgetImages) {
  wanted.set(path.join(target, 'widget', `${id}.jpg`), () =>
    sharp(path.join(source, inBundle(image)))
      .resize(WIDGET_IMAGE.width, WIDGET_IMAGE.height, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer(),
  )
}

let written = 0
for (const [file, make] of wanted) if (await writeIfChanged(file, await make())) written++
let removed = 0
for await (const file of walk(target)) {
  if (!wanted.has(file)) {
    await rm(file)
    removed++
  }
}

const entry = (key, file) => `  ${JSON.stringify(key)}: require(${JSON.stringify(`../../assets/content/${file}`)}),`
const table = [
  '// npm run content -w mobile이 만든다. 고치지 말 것.',
  '// 묶음 안 경로(content/...) → 앱에 넣은 자원',
  'export const imageAssets: Record<string, number> = {',
  ...images.map((file) => entry(file, inBundle(file))),
  '}',
  '',
  'export const audioAssets: Record<string, number> = {',
  ...audio.map((file) => entry(file, inBundle(file))),
  '}',
  '',
  '// 장면 id → 홈 화면 위젯용 작은 그림',
  'export const widgetImageAssets: Record<string, number> = {',
  ...widgetImages.map(([id]) => entry(id, `widget/${id}.jpg`)),
  '}',
  '',
].join('\n')
await writeIfChanged(generated, Buffer.from(table))
console.log(
  `묶음과 그림 ${images.length}개(버전 ${version}), 장면 낭독 ${audio.length}개, 위젯 그림 ${widgetImages.length}개를 앱에 넣었습니다(새로 쓴 파일 ${written}, 지움 ${removed})`,
)
```

`genesis.json`은 `content/genesis.json`으로 넣어 `inBundle`이 `genesis.json`으로 바꾼다(앞 코드와 같은 자리).

Run: `npm run content -w mobile` → 장면 낭독 38개, 위젯 그림 33개

- [ ] **Step 2: 아이콘**

`mobile/src/ui/Icon.tsx`의 `IconName`에 `'headphones' | 'moon' | 'previous' | 'next' | 'pauseBars'`를, 모양에 더한다.

```tsx
  headphones: (
    <>
      <Path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <Path d="M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z" />
    </>
  ),
  moon: <Path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />,
  // 채워 쓰는 재생 조작(낭독 플레이어)
  previous: <Path d="M6 5h2v14H6zM20 5v14L9 12z" />,
  next: <Path d="M16 5h2v14h-2zM4 5v14l11-7z" />,
  pauseBars: <Path d="M7 5h3v14H7zM14 5h3v14h-3z" />,
```

- [ ] **Step 3: 낭독 재생기**

```tsx path=mobile/src/narration/NarrationContext.tsx
import { Asset } from 'expo-asset'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioMetadata, type AudioStatus } from 'expo-audio'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  adjacentTrack,
  localDay,
  sleepStopMs,
  startSleep,
  stepVerseMs,
  trackAt,
  verseAtTime,
  verseStartMs,
  type Bundle,
  type Position,
  type SceneTrack,
  type SleepChoice,
  type SleepTimer,
} from 'reader-core'
import { audioSource, imageSource } from '../content/bundle'
import { markSceneRead, savePositionRecord } from '../data/reading'
import { useSettings } from '../settings/SettingsContext'

type NarrationValue = {
  // 지금 장면의 낭독. 낭독을 연 적이 없거나 닫았으면 null
  track: SceneTrack | null
  // 지금 읽는 절
  verse: number | null
  playing: boolean
  sleep: SleepTimer
  // 위치의 절부터 읽는다. autoplay가 false면 준비만 한다.
  start: (position: Position, options?: { autoplay?: boolean }) => void
  playTrack: (track: SceneTrack) => void
  toggle: () => void
  pause: () => void
  seekMs: (ms: number) => void
  stepVerse: (direction: 1 | -1) => void
  setSleep: (choice: SleepChoice) => void
  // 멈추고 잠금 화면 조작을 치운다.
  close: () => void
}

// 재생 위치는 1초에 네 번 바뀐다. 진행 막대만 보는 곳이 따로 받게 나눠, 나머지 화면이 그때마다 다시 그려지지 않게 한다.
type ClockValue = { positionMs: number; durationMs: number }

const NarrationContext = createContext<NarrationValue | null>(null)
const ClockContext = createContext<ClockValue>({ positionMs: 0, durationMs: 0 })

function rangeLabel(verseStart: number, verseEnd: number): string {
  return verseStart === verseEnd ? `${verseStart}절` : `${verseStart}~${verseEnd}절`
}

// 앱 전체에서 하나만 쓰는 낭독 재생기. 읽기 화면, 낭독 플레이어, 홈의 작은 재생 막대, 잠금 화면이 같은 재생을 본다.
// 장면마다 낭독 파일 하나(절 낭독을 이은 것)를 재생하고, 지금 절은 재생 위치로 정한다. 장면이 끝나면 다음 장면으로 넘어간다.
// 들은 곳까지 읽기 위치와 읽은 장면을 적는다(읽기 화면을 닫고 들어도 이어 읽기가 맞게).
export function NarrationProvider({ bundle, children }: { bundle: Bundle | null; children: ReactNode }) {
  const { settings } = useSettings()
  const chapters = useMemo(() => bundle?.chapters ?? [], [bundle])
  const player = useAudioPlayer(null, { updateInterval: 250 })
  const status = useAudioPlayerStatus(player)
  const [track, setTrack] = useState<SceneTrack | null>(null)
  const [sleep, setSleepState] = useState<SleepTimer>({ kind: 'off' })
  const trackRef = useRef<SceneTrack | null>(null)
  const sleepRef = useRef<SleepTimer>({ kind: 'off' })
  const speedRef = useRef(settings.speed)
  // 잠자기 분 타이머가 다 되었을 때 멈출 재생 위치(그때 읽던 절의 끝)
  const stopAt = useRef<number | null>(null)
  const lockScreen = useRef(false)

  trackRef.current = track
  sleepRef.current = sleep
  speedRef.current = settings.speed

  // 무음 모드에서도 들리고 화면을 꺼도 이어 읽는다. 잠금 화면 조작이 이 재생기를 가리키도록 다른 앱 소리와 섞지 않는다.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => undefined)
  }, [])

  useEffect(() => {
    player.setPlaybackRate(settings.speed)
  }, [player, settings.speed])

  // 잠금 화면(iOS 지금 재생 중, 안드로이드 미디어 알림, 웹 Media Session)에 장면을 보인다.
  const showOnLockScreen = useCallback(
    (next: SceneTrack) => {
      const chapter = chapters.find((item) => item.chapter === next.chapter)
      const scene = chapter?.scenes[next.sceneIndex]
      if (!bundle || !scene) return
      const metadata: AudioMetadata = {
        title: scene.title,
        artist: `${bundle.book} ${next.chapter}장 ${rangeLabel(scene.verseStart, scene.verseEnd)}`,
        albumTitle: '장면 성경',
      }
      try {
        if (lockScreen.current) player.updateLockScreenMetadata(metadata)
        else player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true })
        lockScreen.current = true
      } catch {
        // 잠금 화면 조작을 지원하지 않는 곳(일부 웹 브라우저)에서는 재생만 한다.
        return
      }
      const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
      if (image === null) return
      const asset = Asset.fromModule(image)
      asset
        .downloadAsync()
        .then(() => {
          const artworkUrl = asset.localUri ?? asset.uri
          if (trackRef.current?.sceneId === next.sceneId) player.updateLockScreenMetadata({ ...metadata, artworkUrl })
        })
        .catch(() => undefined)
    },
    [bundle, chapters, player],
  )

  const load = useCallback(
    (next: SceneTrack, startMs: number, autoplay: boolean) => {
      const source = audioSource(next.audio)
      if (source === null) return
      trackRef.current = next
      setTrack(next)
      stopAt.current = null
      player.replace(source)
      player.setPlaybackRate(speedRef.current)
      if (startMs > 0) void player.seekTo(startMs / 1000)
      if (autoplay) player.play()
      showOnLockScreen(next)
    },
    [player, showOnLockScreen],
  )

  // 재생 상태가 올 때마다: 잠자기 타이머, 장면 끝에서 다음 장면으로. 화면이 꺼져 있어도 이 이벤트는 온다.
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (update: AudioStatus) => {
      const current = trackRef.current
      if (!current) return
      const ms = update.currentTime * 1000
      if (update.playing) {
        stopAt.current ??= sleepStopMs(sleepRef.current, Date.now(), current, ms)
        if (stopAt.current !== null && ms >= stopAt.current - 150) {
          player.pause()
          void player.seekTo(stopAt.current / 1000)
          stopAt.current = null
          setSleepState({ kind: 'off' })
          return
        }
      }
      if (!update.didJustFinish) return
      if (sleepRef.current.kind === 'sceneEnd') {
        setSleepState({ kind: 'off' })
        return
      }
      const next = adjacentTrack(chapters, current, 1)
      if (next) load(next, 0, true)
    })
    return () => subscription.remove()
  }, [player, chapters, load])

  const positionMs = track ? status.currentTime * 1000 : 0
  const verse = track ? verseAtTime(track, positionMs) : null
  const playing = track !== null && status.playing

  // 들은 곳을 읽기 위치로 적고, 장면의 마지막 절에 오면 그 장면을 오늘 읽은 것으로 적는다.
  useEffect(() => {
    if (!playing || !track || verse === null) return
    savePositionRecord({ chapter: track.chapter, verse })
    if (verse === track.verses[track.verses.length - 1]!.verse) markSceneRead(track.sceneId, localDay(new Date()))
  }, [playing, track, verse])

  const start = useCallback(
    (position: Position, options?: { autoplay?: boolean }) => {
      const next = trackAt(chapters, position)
      if (!next) return
      const inside = next.chapter === position.chapter && next.verses.some((item) => item.verse >= position.verse)
      load(next, inside ? verseStartMs(next, position.verse) : 0, options?.autoplay ?? true)
    },
    [chapters, load],
  )

  const playTrack = useCallback((next: SceneTrack) => load(next, 0, true), [load])

  const toggle = useCallback(() => {
    const current = trackRef.current
    if (!current) return
    if (player.playing) {
      player.pause()
      return
    }
    // 장면 끝에서 멈춰 있으면(장면 끝 타이머) 다음 장면부터 읽는다.
    if (player.currentTime * 1000 >= current.durationMs - 300) {
      const next = adjacentTrack(chapters, current, 1)
      if (next) {
        load(next, 0, true)
        return
      }
      void player.seekTo(0)
    }
    player.play()
  }, [player, chapters, load])

  const pause = useCallback(() => player.pause(), [player])

  const seekMs = useCallback(
    (ms: number) => {
      stopAt.current = null
      void player.seekTo(Math.max(0, ms) / 1000)
    },
    [player],
  )

  const stepVerse = useCallback(
    (direction: 1 | -1) => {
      const current = trackRef.current
      if (!current) return
      const target = stepVerseMs(current, player.currentTime * 1000, direction)
      if (target !== null) {
        seekMs(target)
        return
      }
      const other = adjacentTrack(chapters, current, direction)
      if (!other) return
      // 앞 장면으로 가면 그 장면의 마지막 절부터 읽는다.
      load(other, direction === 1 ? 0 : other.verses[other.verses.length - 1]!.startMs, player.playing)
    },
    [player, chapters, load, seekMs],
  )

  const setSleep = useCallback((choice: SleepChoice) => {
    stopAt.current = null
    setSleepState(startSleep(choice, Date.now()))
  }, [])

  const close = useCallback(() => {
    player.pause()
    try {
      player.clearLockScreenControls()
    } catch {
      // 위와 같다.
    }
    lockScreen.current = false
    trackRef.current = null
    setTrack(null)
    setSleepState({ kind: 'off' })
  }, [player])

  const value = useMemo(
    () => ({ track, verse, playing, sleep, start, playTrack, toggle, pause, seekMs, stepVerse, setSleep, close }),
    [track, verse, playing, sleep, start, playTrack, toggle, pause, seekMs, stepVerse, setSleep, close],
  )
  const durationMs = track ? (status.duration > 0 ? status.duration * 1000 : track.durationMs) : 0
  const clock = useMemo(() => ({ positionMs, durationMs }), [positionMs, durationMs])

  return (
    <NarrationContext.Provider value={value}>
      <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
    </NarrationContext.Provider>
  )
}

export function useNarration(): NarrationValue {
  const value = useContext(NarrationContext)
  if (!value) throw new Error('NarrationProvider 밖에서 useNarration을 불렀습니다')
  return value
}

export function useNarrationClock(): ClockValue {
  return useContext(ClockContext)
}
```

- [ ] **Step 4: 루트에 달고 읽기 화면을 옮긴다**

`mobile/src/app/_layout.tsx`:
- `setAudioModeAsync` 효과와 import를 지운다(재생기로 옮겼다).
- `SyncProvider` 안쪽을 `<NarrationProvider bundle={content.bundle}>`로 감싼다(`content`는 `../content/bundle`).
- `<Stack …>`에 `<Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />`를 둔다.

`mobile/src/reader/ReaderScreen.tsx`:
- `useNarration` import를 `../narration/NarrationContext`로 바꾸고, `audio`, `audioSource`, 옛 `useNarration(…)` 호출을 지운다.
- 낭독을 따라간다.

```tsx
  const narration = useNarration()
  // 낭독 중에는 읽는 절을 따라 본문과 장면을 옮긴다(장이 바뀌어도 따라간다).
  useEffect(() => {
    if (!narration.playing || narration.track === null || narration.verse === null) return
    const next = { chapter: narration.track.chapter, verse: narration.verse }
    setPosition((current) => (current.chapter === next.chapter && current.verse === next.verse ? current : next))
  }, [narration.playing, narration.track, narration.verse])
```

- `goToChapter`, `jumpTo`의 `narration.stop()`을 `narration.pause()`로, `togglePlay`를 바꾼다.

```tsx
  function togglePlay() {
    if (narration.playing) narration.pause()
    else narration.start(position)
  }
```

- `ScenePane`에 `canPlay={scene.audio !== null}`, `onOpenPlayer={narration.track !== null ? () => router.push('/player') : undefined}`를 준다.

`mobile/src/reader/ScenePane.tsx`: `Props`에 `onOpenPlayer?: () => void`를 더하고, 오른쪽 단추 줄의 재생 단추 아래에 둔다.

```tsx
          {onOpenPlayer && <RoundButton name="headphones" label="낭독 플레이어 열기" onPress={onOpenPlayer} />}
```

`mobile/src/reader/useNarration.ts`를 지운다.

- [ ] **Step 5: 설정 플러그인**

`mobile/app.json`의 `plugins`에서 `"expo-audio"`를 바꾼다.

```json
      ["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false, "enableBackgroundPlayback": true }],
```

- [ ] **Step 6: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 앱 전체 낭독 재생기(장면 낭독, 잠금 화면, 백그라운드, 잠자기 타이머, 들은 곳 기록)"
```

---

### Task 4: 낭독 플레이어와 작은 재생 막대

**Files:**
- Create: `mobile/src/player/PlayerScreen.tsx`, `mobile/src/player/SleepSheet.tsx`, `mobile/src/player/MiniPlayer.tsx`, `mobile/src/app/player.tsx`
- Modify: `mobile/src/home/HomeScreen.tsx`

- [ ] **Step 1: 플레이어**

```tsx path=mobile/src/player/PlayerScreen.tsx
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { clockLabel, hueOf, initialPosition, sleepLabel, SPEEDS, upcomingTracks, type Bundle } from 'reader-core'
import { imageSource } from '../content/bundle'
import { savedPosition } from '../data/reading'
import { useNarration, useNarrationClock } from '../narration/NarrationContext'
import { goBack } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { dark, fonts, placeholderColors } from '../theme/palette'
import Icon, { type IconName } from '../ui/Icon'
import SleepSheet from './SleepSheet'

// 낭독 플레이어(목업 10). 바탕은 테마와 상관없이 어둡다(음악 재생기처럼 그림이 돋보이게).
const colors = {
  background: dark.surface,
  ink: dark.ink,
  soft: dark.inkSoft,
  faint: dark.inkFaint,
  accent: dark.accent,
  chip: 'rgba(255, 255, 255, 0.08)',
  chipOn: 'rgba(255, 255, 255, 0.16)',
  line: 'rgba(255, 255, 255, 0.2)',
  rail: 'rgba(255, 255, 255, 0.18)',
}

function CircleButton({ name, label, onPress, active = false }: { name: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, { backgroundColor: active ? colors.chipOn : colors.chip, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={name} size={20} color={colors.ink} />
    </Pressable>
  )
}

function Chip({ label, onPress, on = false, hint }: { label: string; onPress: () => void; on?: boolean; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.chipOn : 'transparent', opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

export default function PlayerScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { settings, update, subtitles, setSubtitles } = useSettings()
  const narration = useNarration()
  const clock = useNarrationClock()
  const [sleepOpen, setSleepOpen] = useState(false)
  const [railWidth, setRailWidth] = useState(0)

  // 낭독을 연 적이 없으면 읽던 곳부터 들을 준비만 한다(재생은 누르면 시작).
  useEffect(() => {
    if (narration.track === null) narration.start(initialPosition(bundle.chapters, savedPosition()), { autoplay: false })
    // 처음 열 때 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const track = narration.track
  if (track === null) return <View style={[styles.root, { backgroundColor: colors.background }]} />
  const chapter = bundle.chapters.find((item) => item.chapter === track.chapter)!
  const scene = chapter.scenes[track.sceneIndex]!
  const verse = chapter.verses.find((item) => item.verse === narration.verse) ?? null
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), dark)
  const upcoming = upcomingTracks(bundle.chapters, track, 2)
  const range = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}~${scene.verseEnd}절`
  const progress = clock.durationMs > 0 ? Math.min(1, clock.positionMs / clock.durationMs) : 0
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length]!

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.top}>
          <CircleButton name="chevronDown" label="접기" onPress={() => goBack(router)} />
          <Text style={styles.kicker}>{`AI 음성 낭독 · ${bundle.book} ${track.chapter}장`}</Text>
          <CircleButton name="moon" label="잠자기 타이머" active={narration.sleep.kind !== 'off'} onPress={() => setSleepOpen(true)} />
        </View>

        <View style={[styles.art, { backgroundColor: placeholder.background }]}>
          {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessible={false} />}
        </View>

        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">
            {scene.title}
          </Text>
          <Text style={styles.meta}>{`${bundle.book} ${track.chapter}장 ${range}${narration.verse !== null ? ` · 지금 ${narration.verse}절` : ''}`}</Text>
          {subtitles && verse !== null && <Text style={styles.subtitle}>{verse.text}</Text>}
        </View>

        <View style={styles.progress}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={`재생 위치 ${clockLabel(clock.positionMs)}, 전체 ${clockLabel(clock.durationMs)}`}
            onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              if (railWidth > 0) narration.seekMs((event.nativeEvent.locationX / railWidth) * clock.durationMs)
            }}
            style={styles.railHit}
          >
            <View style={[styles.rail, { backgroundColor: colors.rail }]}>
              <View style={[styles.railFill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
            </View>
          </Pressable>
          <View style={styles.times}>
            <Text style={styles.time}>{clockLabel(clock.positionMs)}</Text>
            <Text style={styles.time}>{clockLabel(clock.durationMs)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 절" onPress={() => narration.stepVerse(-1)} style={styles.side}>
            <Icon name="previous" size={28} color={colors.ink} filled />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={narration.playing ? '일시정지' : '재생'}
            onPress={narration.toggle}
            style={({ pressed }) => [styles.main, { backgroundColor: colors.ink, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={narration.playing ? 'pauseBars' : 'play'} size={30} color={colors.background} filled />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 절" onPress={() => narration.stepVerse(1)} style={styles.side}>
            <Icon name="next" size={28} color={colors.ink} filled />
          </Pressable>
        </View>

        <View style={styles.chips}>
          <Chip label={`속도 ${settings.speed.toFixed(1)}×`} hint={`누르면 ${nextSpeed.toFixed(1)}배로 바뀌어요`} onPress={() => update({ speed: nextSpeed })} />
          <Chip label={sleepLabel(narration.sleep, Date.now())} on={narration.sleep.kind !== 'off'} onPress={() => setSleepOpen(true)} />
          <Chip label={subtitles ? '자막 켬' : '자막 끔'} on={subtitles} onPress={() => setSubtitles(!subtitles)} />
        </View>

        {upcoming.length > 0 && (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>다음에 들을 것</Text>
            {upcoming.map((item, index) => {
              const target = bundle.chapters.find((candidate) => candidate.chapter === item.chapter)!.scenes[item.sceneIndex]!
              return (
                <Pressable
                  key={item.sceneId}
                  accessibilityRole="button"
                  accessibilityLabel={`${target.title} 듣기`}
                  onPress={() => narration.playTrack(item)}
                  style={({ pressed }) => [styles.nextRow, { backgroundColor: index === 0 ? colors.chip : 'rgba(255, 255, 255, 0.05)', opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.nextTitle} numberOfLines={1}>
                    {target.title}
                  </Text>
                  <Text style={styles.nextRange}>{`${item.chapter}:${target.verseStart}~${target.verseEnd}`}</Text>
                </Pressable>
              )
            })}
          </View>
        )}

        <Text style={styles.note}>
          {Platform.OS === 'web'
            ? '웹 미리 보기에서는 이 탭이 열려 있는 동안 들려요.'
            : '화면을 꺼도 계속 들려요. 잠금 화면과 이어폰 버튼으로 조절할 수 있어요.'}
        </Text>
      </ScrollView>

      {sleepOpen && (
        <SleepSheet
          sleep={narration.sleep}
          onChoose={(choice) => {
            narration.setSleep(choice)
            setSleepOpen(false)
          }}
          onClose={() => setSleepOpen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, color: colors.soft, letterSpacing: 0.5 },
  art: { width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  titles: { gap: 6 },
  title: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.ink },
  meta: { fontSize: 13, color: colors.soft },
  subtitle: { marginTop: 4, fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: colors.ink },
  progress: { gap: 6 },
  railHit: { paddingVertical: 8 },
  rail: { height: 4, borderRadius: 2, overflow: 'hidden' },
  railFill: { height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 11, color: colors.soft, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  side: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  main: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipText: { fontSize: 13, color: colors.ink },
  next: { gap: 8 },
  nextLabel: { fontSize: 11, color: colors.soft, letterSpacing: 0.5 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  nextTitle: { flex: 1, fontSize: 13, color: colors.ink },
  nextRange: { fontSize: 13, color: colors.soft },
  note: { fontSize: 11, lineHeight: 17, color: colors.faint },
})
```

```tsx path=mobile/src/player/SleepSheet.tsx
import { Text } from 'react-native'
import { SLEEP_CHOICES, sleepChoiceLabel, sleepChoiceOf, type SleepChoice, type SleepTimer } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const options: SegmentOption<SleepChoice>[] = SLEEP_CHOICES.map((choice) => ({ value: choice, label: sleepChoiceLabel(choice) }))

// 잠자기 타이머: 끔, 15·30·60분, 장면 끝
export default function SleepSheet({ sleep, onChoose, onClose }: { sleep: SleepTimer; onChoose: (choice: SleepChoice) => void; onClose: () => void }) {
  const { palette } = useSettings()
  return (
    <Sheet title="잠자기 타이머" closeLabel="잠자기 타이머 닫기" onClose={onClose}>
      <Segments label="멈출 때" options={options} value={sleepChoiceOf(sleep)} onChange={onChoose} />
      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        시간이 되면 그때 읽던 절을 마저 읽고 멈춰요. "장면 끝"은 지금 장면을 다 읽고 멈춰요.
      </Text>
    </Sheet>
  )
}
```

```tsx path=mobile/src/player/MiniPlayer.tsx
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { hueOf, type Bundle } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useNarration } from '../narration/NarrationContext'
import { useSettings } from '../settings/SettingsContext'
import { placeholderColors } from '../theme/palette'
import { IconButton } from '../ui/IconButton'

// 낭독 중일 때 홈 아래에 뜨는 작은 재생 막대. 누르면 낭독 플레이어가 열린다.
export function MiniPlayer({ bundle, bottom }: { bundle: Bundle; bottom: number }) {
  const router = useRouter()
  const { palette } = useSettings()
  const narration = useNarration()
  const track = narration.track
  if (track === null) return null
  const scene = bundle.chapters.find((item) => item.chapter === track.chapter)?.scenes[track.sceneIndex]
  if (!scene) return null
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`낭독 플레이어 열기. ${scene.title}`}
      onPress={() => router.push('/player')}
      style={[styles.bar, { bottom, backgroundColor: palette.surface, borderColor: palette.line }]}
    >
      <View style={[styles.thumb, { backgroundColor: placeholderColors(hueOf(scene.id), palette).background }]}>
        {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
          {scene.title}
        </Text>
        <Text style={[styles.meta, { color: palette.inkSoft }]}>{`${bundle.book} ${track.chapter}장 ${narration.verse ?? scene.verseStart}절`}</Text>
      </View>
      <IconButton
        name={narration.playing ? 'pause' : 'play'}
        label={narration.playing ? '낭독 일시정지' : '낭독 이어 듣기'}
        color={palette.ink}
        onPress={narration.toggle}
      />
      <IconButton name="close" label="낭독 닫기" color={palette.inkSoft} onPress={narration.close} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12 },
})
```

```tsx path=mobile/src/app/player.tsx
import { BundleGate } from '../content/BundleGate'
import PlayerScreen from '../player/PlayerScreen'

export default function PlayerRoute() {
  return <BundleGate render={(bundle) => <PlayerScreen bundle={bundle} />} />
}
```

- [ ] **Step 2: 홈**

`mobile/src/home/HomeScreen.tsx`:
- `useNarration`, `MiniPlayer`를 가져와 `const narration = useNarration()`를 둔다.
- 계획 카드의 `todayNote` 줄 아래에 "오늘 분량 듣기"를 둔다(오늘 읽을 장면에 낭독이 있을 때).

```tsx
          {summary.today.length > 0 && summary.todayAudioMs > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={listenToday}
              style={({ pressed }) => [styles.listen, { backgroundColor: palette.accentSoft, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon name="headphones" size={16} color={palette.accent} />
              <Text style={[styles.listenText, { color: palette.accent }]}>오늘 분량 듣기</Text>
            </Pressable>
          )}
```

```tsx
  function listenToday() {
    const first = summary.today[0]
    if (!first) return
    narration.start({ chapter: first.chapter, verse: first.scene.verseStart })
    router.push('/player')
  }
```

- 스크롤 내용의 아래 여백을 낭독 중이면 막대 높이(72)만큼 늘리고, 화면 끝에 `<MiniPlayer bundle={bundle} bottom={insets.bottom + 12} />`를 둔다.
- 스타일: `listen: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 }`, `listenText: { fontSize: 13, fontWeight: '600' }`

- [ ] **Step 3: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile
git commit -m "feat(mobile): 낭독 플레이어(속도, 잠자기 타이머, 자막, 다음에 들을 것)와 홈의 작은 재생 막대, 오늘 분량 듣기"
```

---

### Task 5: 홈 화면 위젯

**Files:**
- Create: `mobile/index.ts`, `mobile/src/widgets/{register.ts,snapshot.ts,TodaySceneWidget.tsx,androidTaskHandler.tsx,updateWidgets.tsx,WidgetSync.tsx}`, `mobile/targets/widget/{expo-target.config.js,TodaySceneWidget.swift}`
- Modify: `mobile/package.json`(main), `mobile/app.json`, `mobile/src/app/_layout.tsx`

- [ ] **Step 1: 진입점과 등록**

```ts path=mobile/index.ts
// 앱 진입점. expo-router를 띄우고, 안드로이드 위젯이 그려 달라고 할 때 부를 작업을 등록한다.
// 위젯 작업은 앱이 꺼져 있을 때도 이 파일부터 불러 따로 돈다.
import 'expo-router/entry'
import { registerWidgets } from './src/widgets/register'

registerWidgets()
```

`mobile/package.json`의 `"main"`을 `"index.ts"`로 바꾼다.

```ts path=mobile/src/widgets/register.ts
import { Platform, TurboModuleRegistry } from 'react-native'

// 안드로이드 위젯 모듈은 개발 빌드·출시 빌드에만 있다(Expo Go와 웹에는 없다).
// react-native-android-widget은 불러오는 순간 네이티브 모듈을 찾아, 없으면 앱이 죽는다. 그래서 있는지 먼저 보고 그때만 불러온다.
export const androidWidgetsAvailable = Platform.OS === 'android' && TurboModuleRegistry.get('AndroidWidget') != null

export function registerWidgets(): void {
  if (!androidWidgetsAvailable) return
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget')
  const { widgetTaskHandler } = require('./androidTaskHandler') as typeof import('./androidTaskHandler')
  registerWidgetTaskHandler(widgetTaskHandler)
}
```

```ts path=mobile/src/widgets/snapshot.ts
import { localDay, widgetSnapshot, type WidgetSnapshot } from 'reader-core'
import { content } from '../content/bundle'
import { savedPosition } from '../data/reading'
import { store } from '../data/store'

// 저장된 읽기 위치와 읽은 날로 위젯에 그릴 것을 만든다. 앱과 안드로이드 위젯 작업(앱이 꺼져 있을 때도)이 함께 쓴다.
export function currentWidgetSnapshot(): WidgetSnapshot | null {
  if (!content.bundle) return null
  const days = store
    .list<{ day?: unknown }>('readScenes')
    .flatMap((item) => (typeof item.data?.day === 'string' ? [item.data.day] : []))
  return widgetSnapshot(content.bundle, savedPosition(), days, localDay(new Date()))
}
```

- [ ] **Step 2: 안드로이드 위젯**

```tsx path=mobile/src/widgets/TodaySceneWidget.tsx
import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import type { WidgetSnapshot } from 'reader-core'
import { widgetImageAssets } from '../content/assets.generated'

// 안드로이드 홈 화면 위젯 "오늘의 장면"(목업 15). 누르면 읽기 화면이 열린다. 색은 앱의 밝은 화면 색이다.
// 이 파일은 위젯 모듈이 있을 때만 불러온다(register.ts).
const play = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 4v16l13-8z" fill="#ffffff"/></svg>'

export function TodaySceneWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const image = snapshot ? widgetImageAssets[snapshot.sceneId] : undefined
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'chansubible://read' }}
      style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', backgroundColor: '#faf7f2', borderRadius: 24 }}
    >
      {image !== undefined && (
        <ImageWidget image={image} imageWidth={140} imageHeight={158} radius={24} resizeMode="cover" style={{ height: 'match_parent' }} />
      )}
      <FlexWidget
        style={{
          flex: 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={snapshot?.kicker ?? '장면 성경'} style={{ fontSize: 11, color: '#6f665e' }} />
          <TextWidget
            text={snapshot?.title ?? '앱을 열면 이어 읽을 장면이 보여요'}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 17, fontFamily: 'serif', fontWeight: '700', color: '#2b2622', marginTop: 4 }}
          />
          {snapshot !== null && <TextWidget text={snapshot.detail} style={{ fontSize: 12, color: '#6f665e', marginTop: 4 }} />}
        </FlexWidget>
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#8a5a2b' }}
        >
          <SvgWidget svg={play} style={{ width: 12, height: 12 }} />
          <TextWidget text="이어 읽기" style={{ fontSize: 12, color: '#ffffff', marginLeft: 6 }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
```

```tsx path=mobile/src/widgets/androidTaskHandler.tsx
import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { currentWidgetSnapshot } from './snapshot'
import { TodaySceneWidget } from './TodaySceneWidget'

// 안드로이드가 위젯을 그려 달라고 할 때(놓을 때, 주기 갱신, 크기 바꿈) 부른다. 누르는 것은 OPEN_URI라 앱이 직접 연다.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE' || props.widgetAction === 'WIDGET_RESIZED') {
    props.renderWidget(<TodaySceneWidget snapshot={currentWidgetSnapshot()} />)
  }
}
```

- [ ] **Step 3: 위젯 갱신(두 플랫폼)**

```tsx path=mobile/src/widgets/updateWidgets.tsx
import { ExtensionStorage } from '@bacons/apple-targets'
import { Platform } from 'react-native'
import { androidWidgetsAvailable } from './register'
import { currentWidgetSnapshot } from './snapshot'

// 앱과 iOS 위젯이 함께 보는 App Group. app.json의 ios.entitlements와 같은 값이다.
export const APP_GROUP = 'group.com.chansubible.app'
// ExtensionStorage는 네이티브 모듈이 없으면(Expo Go) 아무것도 하지 않는다.
const iosStorage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null

let last = ''

// 위젯에 보일 것이 바뀌었으면 위젯을 다시 그리게 한다.
export function updateWidgets(): void {
  const snapshot = currentWidgetSnapshot()
  if (!snapshot) return
  const json = JSON.stringify(snapshot)
  if (json === last) return
  last = json
  if (iosStorage) {
    iosStorage.set('todayScene', json)
    ExtensionStorage.reloadWidget('TodayScene')
  }
  if (androidWidgetsAvailable) {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget')
    const { TodaySceneWidget } = require('./TodaySceneWidget') as typeof import('./TodaySceneWidget')
    requestWidgetUpdate({ widgetName: 'TodayScene', renderWidget: () => <TodaySceneWidget snapshot={snapshot} /> }).catch(() => undefined)
  }
}
```

```tsx path=mobile/src/widgets/WidgetSync.tsx
import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { store } from '../data/store'
import { updateWidgets } from './updateWidgets'

// 읽기 기록(위치, 읽은 장면)이 바뀌면 2초 모았다가 위젯을 다시 그린다. 앱이 뒤로 갈 때도 한 번 그린다.
export function WidgetSync() {
  useEffect(() => {
    if (Platform.OS === 'web') return
    let timer: ReturnType<typeof setTimeout> | null = null
    updateWidgets()
    const unsubscribe = store.subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(updateWidgets, 2000)
    })
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') updateWidgets()
    })
    return () => {
      unsubscribe()
      subscription.remove()
      if (timer) clearTimeout(timer)
    }
  }, [])
  return null
}
```

`mobile/src/app/_layout.tsx`의 `NarrationProvider` 안, `Frame` 옆에 `<WidgetSync />`를 둔다.

- [ ] **Step 4: iOS 위젯 확장**

```js path=mobile/targets/widget/expo-target.config.js
// iOS 홈 화면 위젯 "오늘의 장면"(목업 15). @bacons/apple-targets가 npx expo prebuild 때 Xcode 대상으로 만든다.
// 장면 그림은 npm run content -w mobile이 만든 작은 그림(assets/content/widget/<장면 id>.jpg)을 위젯 안 그림으로 넣는다.
const fs = require('fs')
const path = require('path')

const thumbnails = path.join(__dirname, '../../assets/content/widget')

function sceneImages() {
  if (!fs.existsSync(thumbnails)) return {}
  return Object.fromEntries(
    fs
      .readdirSync(thumbnails)
      .filter((name) => name.endsWith('.jpg'))
      .map((name) => [name.replace(/\.jpg$/, ''), path.join('../../assets/content/widget', name)]),
  )
}

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TodaySceneWidget',
  displayName: '오늘의 장면',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: { light: '#faf7f2', dark: '#2a2521' },
    $accent: { light: '#8a5a2b', dark: '#d6a56f' },
    widgetBackground: { light: '#faf7f2', dark: '#2a2521' },
    widgetInk: { light: '#2b2622', dark: '#efe9e0' },
    widgetInkSoft: { light: '#6f665e', dark: '#b8ad9f' },
    widgetAccent: { light: '#8a5a2b', dark: '#d6a56f' },
  },
  images: sceneImages(),
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
```

```swift path=mobile/targets/widget/TodaySceneWidget.swift
import SwiftUI
import WidgetKit

// 앱이 App Group에 적어 둔 "오늘의 장면"(mobile/src/widgets/updateWidgets.tsx의 WidgetSnapshot JSON)을 그린다.
private let appGroup = "group.com.chansubible.app"

struct TodayScene: Decodable {
  let sceneId: String
  let kicker: String
  let title: String
  let detail: String
}

struct SceneEntry: TimelineEntry {
  let date: Date
  let scene: TodayScene?
}

struct Provider: TimelineProvider {
  private let sample = TodayScene(sceneId: "", kicker: "오늘의 장면 · 창세기 1장", title: "빛이 있으라", detail: "1:1~5절")

  func placeholder(in context: Context) -> SceneEntry {
    SceneEntry(date: Date(), scene: sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (SceneEntry) -> Void) {
    completion(SceneEntry(date: Date(), scene: load() ?? sample))
  }

  // 앱이 읽기 기록을 바꾸면 다시 그리게 한다(ExtensionStorage.reloadWidget). 날이 바뀌면 한 번 더 읽는다.
  func getTimeline(in context: Context, completion: @escaping (Timeline<SceneEntry>) -> Void) {
    let calendar = Calendar.current
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: Date())) ?? Date().addingTimeInterval(86_400)
    completion(Timeline(entries: [SceneEntry(date: Date(), scene: load())], policy: .after(tomorrow)))
  }

  private func load() -> TodayScene? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: "todayScene"),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(TodayScene.self, from: data)
  }
}

struct TodaySceneView: View {
  let entry: SceneEntry

  var body: some View {
    if let scene = entry.scene {
      HStack(spacing: 0) {
        if let image = UIImage(named: scene.sceneId) {
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(width: 140)
            .frame(maxHeight: .infinity)
            .clipped()
        }
        VStack(alignment: .leading, spacing: 4) {
          Text(scene.kicker)
            .font(.system(size: 11))
            .foregroundStyle(Color("widgetInkSoft"))
          Text(scene.title)
            .font(.system(size: 17, weight: .semibold, design: .serif))
            .foregroundStyle(Color("widgetInk"))
            .lineLimit(2)
          Text(scene.detail)
            .font(.system(size: 12))
            .foregroundStyle(Color("widgetInkSoft"))
            .lineLimit(1)
          Spacer(minLength: 6)
          HStack(spacing: 6) {
            Image(systemName: "play.fill").font(.system(size: 10))
            Text("이어 읽기").font(.system(size: 12, weight: .medium))
          }
          .foregroundStyle(.white)
          .padding(.horizontal, 12)
          .frame(height: 30)
          .background(Capsule().fill(Color("widgetAccent")))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        Spacer(minLength: 0)
      }
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text("장면 성경")
          .font(.system(size: 17, weight: .semibold, design: .serif))
          .foregroundStyle(Color("widgetInk"))
        Text("앱을 열면 이어 읽을 장면이 여기 보여요.")
          .font(.system(size: 12))
          .foregroundStyle(Color("widgetInkSoft"))
      }
      .padding(16)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}

struct TodaySceneWidget: Widget {
  let kind = "TodayScene"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      TodaySceneView(entry: entry)
        .containerBackground(for: .widget) { Color("widgetBackground") }
        .widgetURL(URL(string: "chansubible://read"))
    }
    .configurationDisplayName("오늘의 장면")
    .description("이어 읽을 장면과 연속으로 읽은 날을 보여 줘요.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

@main
struct ChansuBibleWidgets: WidgetBundle {
  var body: some Widget {
    TodaySceneWidget()
  }
}
```

- [ ] **Step 5: 앱 설정**

`mobile/app.json`:
- `ios`에 `"entitlements": { "com.apple.security.application-groups": ["group.com.chansubible.app"] }`
- `plugins`의 `"react-native-android-widget"`을 설정과 함께 둔다(안드로이드 칸 4×2 = 250×110dp).

```json
      [
        "react-native-android-widget",
        {
          "widgets": [
            {
              "name": "TodayScene",
              "label": "오늘의 장면",
              "description": "이어 읽을 장면과 연속으로 읽은 날",
              "minWidth": "250dp",
              "minHeight": "110dp",
              "targetCellWidth": 4,
              "targetCellHeight": 2,
              "resizeMode": "horizontal|vertical",
              "updatePeriodMillis": 1800000
            }
          ]
        }
      ],
```

- [ ] **Step 6: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile package-lock.json
git commit -m "feat(mobile): 홈 화면 위젯 오늘의 장면(안드로이드 react-native-android-widget, iOS WidgetKit, App Group)"
```

---

### Task 6: 확인과 문서

- [ ] **Step 1: 웹에서 확인**

Metro를 다시 띄우고(새 모듈, 새 진입점) Expo 웹에서 본다.
1. 읽기 화면의 재생 → 장면 낭독이 나오고 절 강조가 따라간다. 낭독 중에 생긴 헤드폰 단추로 플레이어를 연다.
2. 플레이어: 그림·제목·"지금 N절"·자막·진행 막대·시각이 맞다. 이전/다음 절, 일시정지/재생, 진행 막대 누르기, 속도 칩(0.8→1.0→1.2, 재생 속도가 바뀐다), 자막 칩, 다음에 들을 것(누르면 그 장면).
3. 잠자기: "장면 끝"을 고르고 장면 끝 가까이 옮기면 장면 끝에서 멈춘다. 분 타이머는 남은 분이 보인다.
4. 접기 → 읽기 화면이 낭독을 따라 와 있다. 홈 → 작은 재생 막대(재생/일시정지, 닫기, 누르면 플레이어). 계획 카드의 "오늘 분량 듣기".
5. 웹 Media Session(`navigator.mediaSession.metadata`)에 장면 제목이 들어 있다(잠금 화면 정보 경로 확인).
6. 들은 곳이 읽기 위치로 적힌다(홈의 이어 읽기).

- [ ] **Step 2: 네이티브 설정 확인(prebuild)**

`mobile`에서 `npx expo prebuild --no-install --platform android`, `--platform ios`로 네이티브 폴더를 만들어(둘 다 gitignore) 확인하고 지운다.
- 안드로이드 `AndroidManifest.xml`: `RECORD_AUDIO` 없음, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 있음, 위젯 리시버(`TodayScene`)와 `appwidget-provider` 설정, `chansubible` 스킴.
- iOS `Info.plist`: `UIBackgroundModes`에 `audio`, `NSMicrophoneUsageDescription` 없음. 앱과 위젯의 entitlements에 App Group, Xcode 프로젝트에 `TodaySceneWidget` 대상과 장면 그림 imageset.
- prebuild가 `package.json`의 스크립트를 바꾸면 되돌린다.

- [ ] **Step 3: 문서**

설계 문서 "진행"에 4단계(코드와 웹 확인, prebuild 확인, 기기 확인은 빌드 환경을 정한 뒤)와 바꾼 것을 적는다. README에 플레이어와 위젯, 위젯·백그라운드 재생은 개발 빌드가 있어야 보인다는 것을 적는다.

- [ ] **Step 4: 전체 시험과 커밋**

Run: `npm test && npm run typecheck -w mobile && npm run typecheck -w server && npm run build -w app`

```bash
git add README.md docs
git commit -m "docs: 네이티브 앱 4단계(낭독 플레이어와 위젯) 코드 완료, 기기 확인 전"
```
