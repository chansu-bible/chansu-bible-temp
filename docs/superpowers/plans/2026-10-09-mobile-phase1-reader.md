# 네이티브 앱 1단계: reader-core 분리와 Expo 읽기 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 목업의 읽기 경험(장면 그림, 본문, 낱말 풀이, 이름 카드, 목차·연표, 읽기 설정, 여정 지도와 장소 전환 안내, 해설 시트, 낭독)을 Expo 앱으로 옮기고, 웹과 앱이 같은 읽기 계산 모듈(`reader-core`)을 쓰게 한다.

**Architecture:** `app/src/reader/`의 순수 모듈과 묶음 타입을 `packages/reader-core`로 옮기고, 저장소(localStorage)에 기대던 함수는 저장소를 인자로 받게 바꾼다. 새 `mobile/` 워크스페이스는 Expo SDK 57과 expo-router로 만들고, 묶음·그림·음성은 `app/public/content`(파이프라인 `build` 결과)에서 복사해 앱 안에 넣는다. 지도는 Natural Earth 벡터를 SVG로 그린다(설계 문서 5절).

**Tech Stack:** TypeScript 6, React 19.2.3, Expo SDK 57(React Native 0.86), expo-router, expo-image, expo-audio, expo-sqlite(kv-store), react-native-svg, react-native-gesture-handler, vitest 5.

**설계:** `docs/superpowers/specs/2026-10-09-native-app-design.md`

**코드 블록 표기:** 정보 문자열에 `path=`가 붙은 코드 블록은 그 파일의 전체 내용이다. 실행할 때 이 블록을 그대로 그 경로에 쓴다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `packages/reader-core/src/types.ts` | 묶음 타입(옮김) |
| `packages/reader-core/src/store.ts` | 키·값 저장소 인터페이스와 메모리 저장소 |
| `packages/reader-core/src/bundle.ts` | 묶음 검사(`validateBundle`)와 옛 묶음 채우기(`fillMissing`) |
| `packages/reader-core/src/{activeScene,entity,glossary,hue,names,placeChange,readingPosition,route,timeline}.ts` | 읽기 계산(옮김, 내용 그대로) |
| `packages/reader-core/src/{position,progress,settings,subtitles,imageVersion}.ts` | 읽기 기록 해석과 저장(옮김, 저장소를 인자로 받게 바꿈) |
| `packages/reader-core/src/scenes.ts` | 앞·뒤 장면으로 넘기기 |
| `packages/reader-core/src/mapView.ts` | 지도 투영과 보는 범위 계산 |
| `packages/reader-core/src/index.ts` | 공개 목록 |
| `app/src/storage.ts` | 웹의 localStorage 저장소 |
| `app/src/reader/useSettings.ts` | 웹의 설정 훅(문서 루트에 테마 적기) |
| `mobile/scripts/sync-content.mjs` | 묶음·그림·음성 복사와 `require()` 표 만들기 |
| `mobile/scripts/build-basemap.mts` | Natural Earth로 바탕 지도 SVG 경로 만들기 |
| `mobile/src/app/{_layout,index,read}.tsx` | 경로(글꼴, 공급자, 읽기 화면) |
| `mobile/src/content/bundle.ts` | 앱 안 묶음 읽기, 그림·음성 자원 찾기 |
| `mobile/src/storage/kv.ts`, `kv.web.ts` | 기기 저장소(네이티브: expo-sqlite kv-store, 웹: localStorage) |
| `mobile/src/settings/SettingsContext.tsx` | 읽기 설정·자막 상태와 색 |
| `mobile/src/theme/palette.ts` | 색, 글꼴 |
| `mobile/src/ui/*` | 아이콘, 단추, 시트, 덮는 화면, 분할 선택, 동작 줄이기 |
| `mobile/src/reader/*` | 읽기 화면과 그 부품, 낭독 |
| `mobile/src/map/{MapView,MapScreen}.tsx`, `basemap.generated.ts` | 여정 지도 |

---

### Task 1: reader-core 패키지

**Files:**
- Create: `packages/reader-core/package.json`, `packages/reader-core/tsconfig.json`, `packages/reader-core/src/{store,bundle,scenes,mapView,index}.ts`
- Move (git mv): `app/src/content/types.ts` → `packages/reader-core/src/types.ts`; `app/src/reader/{activeScene,entity,glossary,hue,imageVersion,names,placeChange,position,progress,readingPosition,route,settings,subtitles,timeline}.ts`와 그 `.test.ts` → `packages/reader-core/src/`; `app/src/content/loadBundle.test.ts` → `packages/reader-core/src/bundle.test.ts`
- Modify: 옮긴 `position.ts`, `progress.ts`, `settings.ts`, `subtitles.ts`, `imageVersion.ts`와 그 시험
- Test: `packages/reader-core/src/*.test.ts`

- [ ] **Step 1: 패키지 파일을 만든다**

```json path=packages/reader-core/package.json
{
  "name": "reader-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "웹 목업(app)과 네이티브 앱(mobile)이 함께 쓰는 읽기 계산 모듈과 묶음 타입. 브라우저·React Native API를 쓰지 않는다.",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "~6.0.2",
    "vitest": "^5.0.3"
  }
}
```

```json path=packages/reader-core/tsconfig.json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "types": [],
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 모듈과 시험을 옮기고 경로를 고친다**

```bash
mkdir -p packages/reader-core/src
git mv app/src/content/types.ts packages/reader-core/src/types.ts
git mv app/src/content/loadBundle.test.ts packages/reader-core/src/bundle.test.ts
for f in activeScene entity glossary hue imageVersion names placeChange position progress readingPosition route settings subtitles timeline; do
  git mv app/src/reader/$f.ts packages/reader-core/src/$f.ts
  [ -f app/src/reader/$f.test.ts ] && git mv app/src/reader/$f.test.ts packages/reader-core/src/$f.test.ts
done
```

옮긴 파일 안의 `'../content/types.ts'`를 `'./types.ts'`로, `bundle.test.ts`의 `'./loadBundle.ts'`를 `'./bundle.ts'`로 바꾼다.

```bash
node -e "
const fs=require('fs');const dir='packages/reader-core/src/';
for (const f of fs.readdirSync(dir)) {
  const p=dir+f; let s=fs.readFileSync(p,'utf8');
  const t=s.split(\"'../content/types.ts'\").join(\"'./types.ts'\").split(\"'./loadBundle.ts'\").join(\"'./bundle.ts'\");
  if (t!==s) fs.writeFileSync(p,t);
}"
```

- [ ] **Step 3: 저장소 인터페이스를 만든다**

```ts path=packages/reader-core/src/store.ts
// 읽기 기록을 적는 저장소. 웹은 localStorage, 앱은 expo-sqlite의 kv-store를 넘긴다.
// 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)도 있어서, 이 저장소를 쓰는 함수들은 오류를 삼키고 기본값을 쓴다.
export type KeyValueStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type MemoryStore = KeyValueStore & { entries: Map<string, string> }

// 시험과 저장소가 없는 환경에서 쓰는 메모리 저장소
export function memoryStore(initial: Record<string, string> = {}): MemoryStore {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}
```

- [ ] **Step 4: 저장소를 인자로 받는 시험을 먼저 쓴다**

```ts path=packages/reader-core/src/progress.test.ts
import { describe, expect, it } from 'vitest'
import { chapterProgress, loadReadScenes, markRead, saveReadScenes, sceneStatus } from './progress.ts'
import { memoryStore } from './store.ts'
import type { Scene } from './types.ts'

function scene(id: string): Scene {
  return {
    id,
    verseStart: 1,
    verseEnd: 2,
    title: id,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    placeId: null,
    characters: [],
    images: {},
    reviewStatus: 'none',
  }
}

describe('읽은 장면', () => {
  it('저장된 것이 없으면 빈 Set이다', () => {
    expect(loadReadScenes(memoryStore())).toEqual(new Set())
  })

  it('저장한 장면 id를 배열로 적고 되살린다', () => {
    const store = memoryStore()
    saveReadScenes(store, new Set(['a', 'b']))
    expect(JSON.parse(store.entries.get('reader-read-scenes')!)).toEqual(['a', 'b'])
    expect(loadReadScenes(store)).toEqual(new Set(['a', 'b']))
  })

  it('깨진 값이나 문자열이 아닌 항목은 버린다', () => {
    const store = memoryStore()
    store.setItem('reader-read-scenes', 'nope')
    expect(loadReadScenes(store)).toEqual(new Set())
    store.setItem('reader-read-scenes', JSON.stringify(['a', 3, null]))
    expect(loadReadScenes(store)).toEqual(new Set(['a']))
    store.setItem('reader-read-scenes', JSON.stringify({ a: 1 }))
    expect(loadReadScenes(store)).toEqual(new Set())
  })

  it('저장소가 막혀 있으면 빈 Set을 주고 저장은 조용히 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadReadScenes(broken)).toEqual(new Set())
    expect(() => saveReadScenes(broken, new Set(['a']))).not.toThrow()
  })

  it('markRead는 원래 Set을 건드리지 않고 새 Set을 준다', () => {
    const before = new Set(['a'])
    const after = markRead(before, 'b')
    expect(after).toEqual(new Set(['a', 'b']))
    expect(before).toEqual(new Set(['a']))
    expect(after).not.toBe(before)
  })

  it('이미 읽은 장면이면 같은 Set을 그대로 준다', () => {
    const before = new Set(['a'])
    expect(markRead(before, 'a')).toBe(before)
  })
})

describe('장의 진도', () => {
  const scenes = [scene('a'), scene('b'), scene('c')]

  it('읽은 장면 수와 전체 수를 센다', () => {
    expect(chapterProgress(scenes, new Set(['a', 'c', 'x']))).toEqual({ read: 2, total: 3, done: false })
    expect(chapterProgress(scenes, new Set(['a', 'b', 'c']))).toEqual({ read: 3, total: 3, done: true })
    expect(chapterProgress([], new Set())).toEqual({ read: 0, total: 0, done: false })
  })

  it('장면 상태는 읽는 중이 읽음보다 앞선다', () => {
    expect(sceneStatus('a', 'a', new Set(['a']))).toBe('reading')
    expect(sceneStatus('b', 'a', new Set(['b']))).toBe('read')
    expect(sceneStatus('c', 'a', new Set())).toBe('unread')
  })
})
```

```ts path=packages/reader-core/src/settings.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, FONT_SCALES, loadSettings, parseSettings, saveSettings } from './settings.ts'
import { memoryStore } from './store.ts'

describe('settings', () => {
  it('저장된 값이 없으면 기본값이다', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toEqual({ fontScale: 3, theme: 'auto', speed: 1, placeFlash: true })
  })

  it('저장한 값을 그대로 되살린다', () => {
    const store = memoryStore()
    const settings = { fontScale: 5, theme: 'dark', speed: 1.2, placeFlash: false } as const
    saveSettings(store, settings)
    expect(store.entries.has('reader-settings')).toBe(true)
    expect(loadSettings(store)).toEqual(settings)
  })

  it('JSON이 깨졌으면 기본값이다', () => {
    expect(loadSettings(memoryStore({ 'reader-settings': '{oops' }))).toEqual(DEFAULT_SETTINGS)
  })

  it('잘못된 항목만 기본값으로 바꾸고 나머지는 살린다', () => {
    expect(parseSettings(JSON.stringify({ fontScale: 9, theme: 'dark', speed: 3, placeFlash: 'yes' }))).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
    })
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS)
  })

  it('저장소를 쓸 수 없어도 기본값을 주고 저장은 조용히 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow()
  })

  it('글자 크기 3이 기준 크기다', () => {
    expect(FONT_SCALES[3]).toBe(1)
    expect(FONT_SCALES[1]).toBeLessThan(FONT_SCALES[5])
  })
})
```

```ts path=packages/reader-core/src/position.test.ts
import { describe, expect, it } from 'vitest'
import { loadPosition, parsePosition, savePosition } from './position.ts'
import { memoryStore } from './store.ts'

describe('parsePosition', () => {
  it('장과 절이 있으면 위치로 읽는다', () => {
    expect(parsePosition('{"chapter":2,"verse":5}')).toEqual({ chapter: 2, verse: 5 })
  })

  it('저장된 값이 없으면 null이다', () => {
    expect(parsePosition(null)).toBeNull()
  })

  it('예전 형식(장면 id)은 무시한다', () => {
    expect(parsePosition('{"chapter":2,"sceneId":"gen-02-a"}')).toBeNull()
  })

  it('JSON이 아니면 null이다', () => {
    expect(parsePosition('{')).toBeNull()
    expect(parsePosition('null')).toBeNull()
  })
})

describe('loadPosition / savePosition', () => {
  it('저장한 위치를 되살린다', () => {
    const store = memoryStore()
    savePosition(store, { chapter: 3, verse: 7 })
    expect(store.entries.get('reader-position')).toBe('{"chapter":3,"verse":7}')
    expect(loadPosition(store)).toEqual({ chapter: 3, verse: 7 })
  })

  it('저장소가 막혀 있으면 null이고 저장은 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadPosition(broken)).toBeNull()
    expect(() => savePosition(broken, { chapter: 1, verse: 1 })).not.toThrow()
  })
})
```

```ts path=packages/reader-core/src/subtitles.test.ts
import { describe, expect, it } from 'vitest'
import { memoryStore } from './store.ts'
import { loadSubtitles, saveSubtitles } from './subtitles.ts'

describe('그림 위 자막', () => {
  it('처음에는 켜져 있고, 끈 것을 기억한다', () => {
    const store = memoryStore()
    expect(loadSubtitles(store)).toBe(true)
    saveSubtitles(store, false)
    expect(store.entries.get('reader-subtitles')).toBe('off')
    expect(loadSubtitles(store)).toBe(false)
    saveSubtitles(store, true)
    expect(loadSubtitles(store)).toBe(true)
  })

  it('저장소가 막혀 있으면 켜진 것으로 보고 저장은 건너뛴다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘')
      },
      setItem: () => {
        throw new Error('막힘')
      },
    }
    expect(loadSubtitles(broken)).toBe(true)
    expect(() => saveSubtitles(broken, false)).not.toThrow()
  })
})
```

`imageVersion.test.ts` 맨 아래에 저장 시험을 덧붙인다(import 줄도 바꾼다).

```ts
// 맨 위 import를 다음으로 바꾼다
import { loadImageVersion, nextImageVersion, pickImageVersion, saveImageVersion } from './imageVersion.ts'
import { memoryStore } from './store.ts'

// 파일 끝에 더한다
describe('그림 버전 저장', () => {
  it('고른 버전을 저장하고 되살린다', () => {
    const store = memoryStore()
    expect(loadImageVersion(store)).toBeNull()
    saveImageVersion(store, 'v2')
    expect(loadImageVersion(store)).toBe('v2')
  })
})
```

- [ ] **Step 5: 시험이 실패하는지 본다**

Run: `npx vitest run --root packages/reader-core`
Expected: FAIL — `progress`, `settings`, `position`, `subtitles`, `imageVersion` 시험이 저장소 인자 때문에 실패한다(예: `loadReadScenes(store)`가 localStorage를 찾다 `localStorage is not defined`).

- [ ] **Step 6: 저장 함수가 저장소를 받게 바꾼다**

```ts path=packages/reader-core/src/position.ts
import type { KeyValueStore } from './store.ts'

// 장 번호와 그 장 안의 절 번호로 읽던 곳을 나타낸다.
export type Position = { chapter: number; verse: number }

const key = 'reader-position'

export function parsePosition(raw: string | null): Position | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Position> | null
    // 예전 형식({ chapter, sceneId })은 저장된 위치가 없는 것으로 본다.
    if (typeof value?.chapter !== 'number' || typeof value.verse !== 'number') return null
    return { chapter: value.chapter, verse: value.verse }
  } catch {
    return null
  }
}

export function loadPosition(store: KeyValueStore): Position | null {
  try {
    return parsePosition(store.getItem(key))
  } catch {
    return null
  }
}

export function savePosition(store: KeyValueStore, position: Position): void {
  try {
    store.setItem(key, JSON.stringify(position))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 위치 저장을 건너뛴다.
  }
}
```

```ts path=packages/reader-core/src/progress.ts
import type { KeyValueStore } from './store.ts'
import type { Scene } from './types.ts'

const key = 'reader-read-scenes'

// 읽은 장면 id들. 장면의 마지막 절까지 오면 읽은 것으로 본다.
export function loadReadScenes(store: KeyValueStore): Set<string> {
  try {
    const value: unknown = JSON.parse(store.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return new Set()
    return new Set(value.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function saveReadScenes(store: KeyValueStore, scenes: Set<string>): void {
  try {
    store.setItem(key, JSON.stringify([...scenes]))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 진도 저장을 건너뛴다.
  }
}

// 장면을 읽음으로 적은 새 Set. 이미 읽었으면 같은 Set을 돌려주어 상태가 쓸데없이 바뀌지 않게 한다.
export function markRead(scenes: Set<string>, sceneId: string): Set<string> {
  if (scenes.has(sceneId)) return scenes
  return new Set([...scenes, sceneId])
}

export type ChapterProgress = { read: number; total: number; done: boolean }

export function chapterProgress(scenes: Scene[], readScenes: Set<string>): ChapterProgress {
  const read = scenes.filter((scene) => readScenes.has(scene.id)).length
  return { read, total: scenes.length, done: scenes.length > 0 && read === scenes.length }
}

export type SceneStatus = 'reading' | 'read' | 'unread'

// 지금 읽는 장면이면 읽었더라도 '읽는 중'이다.
export function sceneStatus(sceneId: string, currentSceneId: string, readScenes: Set<string>): SceneStatus {
  if (sceneId === currentSceneId) return 'reading'
  return readScenes.has(sceneId) ? 'read' : 'unread'
}
```

```ts path=packages/reader-core/src/settings.ts
import type { KeyValueStore } from './store.ts'

export type FontScale = 1 | 2 | 3 | 4 | 5
export type Theme = 'auto' | 'light' | 'dark'
export type Speed = 0.8 | 1 | 1.2

// 읽기 설정. 이 기기에만 저장한다.
// fontScale: 글자 크기 단계(3이 기본), theme: 어두운 화면(auto는 기기 따름), speed: 낭독 속도,
// placeFlash: 장소가 바뀌면 지도를 잠깐 보여 줄지
export type Settings = { fontScale: FontScale; theme: Theme; speed: Speed; placeFlash: boolean }

export const DEFAULT_SETTINGS: Settings = { fontScale: 3, theme: 'auto', speed: 1, placeFlash: true }

// 글자 크기 단계 → 절 글꼴 배율
export const FONT_SCALES = { 1: 0.85, 2: 0.93, 3: 1, 4: 1.1, 5: 1.25 } as const

export const FONT_SCALE_STEPS: FontScale[] = [1, 2, 3, 4, 5]
export const SPEEDS: Speed[] = [0.8, 1, 1.2]
export const THEMES: Theme[] = ['auto', 'light', 'dark']

const key = 'reader-settings'

// 저장된 글을 설정으로 바꾼다. 깨졌거나 모르는 값인 항목은 기본값으로 둔다.
export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_SETTINGS
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_SETTINGS
  const saved = value as Record<string, unknown>
  return {
    fontScale: FONT_SCALE_STEPS.includes(saved.fontScale as FontScale)
      ? (saved.fontScale as FontScale)
      : DEFAULT_SETTINGS.fontScale,
    theme: THEMES.includes(saved.theme as Theme) ? (saved.theme as Theme) : DEFAULT_SETTINGS.theme,
    speed: SPEEDS.includes(saved.speed as Speed) ? (saved.speed as Speed) : DEFAULT_SETTINGS.speed,
    placeFlash: typeof saved.placeFlash === 'boolean' ? saved.placeFlash : DEFAULT_SETTINGS.placeFlash,
  }
}

export function loadSettings(store: KeyValueStore): Settings {
  try {
    return parseSettings(store.getItem(key))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(key, JSON.stringify(settings))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 설정 저장을 건너뛴다.
  }
}
```

```ts path=packages/reader-core/src/subtitles.ts
import type { KeyValueStore } from './store.ts'

const key = 'reader-subtitles'

// 그림 위 자막은 처음에 켜져 있다.
export function loadSubtitles(store: KeyValueStore): boolean {
  try {
    return store.getItem(key) !== 'off'
  } catch {
    return true
  }
}

export function saveSubtitles(store: KeyValueStore, on: boolean): void {
  try {
    store.setItem(key, on ? 'on' : 'off')
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 자막 설정 저장을 건너뛴다.
  }
}
```

```ts path=packages/reader-core/src/imageVersion.ts
import type { KeyValueStore } from './store.ts'
import type { Bundle, ImageVersion } from './types.ts'

const key = 'reader-image-version'

// 저장해 둔 버전이 묶음에 아직 있으면 그 버전을, 아니면 기본 버전을 고른다.
export function pickImageVersion(
  bundle: Pick<Bundle, 'imageVersions' | 'defaultImageVersion'>,
  saved: string | null,
): string | null {
  return bundle.imageVersions.some((version) => version.id === saved) ? saved : bundle.defaultImageVersion
}

// 버튼을 누를 때마다 다음 버전으로 넘어가고, 마지막 다음은 처음이다.
export function nextImageVersion(versions: ImageVersion[], current: string | null): string | null {
  if (versions.length === 0) return null
  const index = versions.findIndex((version) => version.id === current)
  return versions[(index + 1) % versions.length]!.id
}

export function loadImageVersion(store: KeyValueStore): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

export function saveImageVersion(store: KeyValueStore, id: string): void {
  try {
    store.setItem(key, id)
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 선택을 저장하지 않는다.
  }
}
```

- [ ] **Step 7: 묶음 검사, 장면 넘기기, 지도 계산의 시험을 쓴다**

```ts path=packages/reader-core/src/validateBundle.test.ts
import { describe, expect, it } from 'vitest'
import { validateBundle } from './bundle.ts'

const chapter = { chapter: 1, verses: [{ verse: 1, text: '태초에', audio: null }], scenes: [] }

describe('validateBundle', () => {
  it('형식 버전이 1이고 장이 있으면 그대로 준다', () => {
    const bundle = { schemaVersion: 1, chapters: [chapter] }
    expect(validateBundle(bundle)).toBe(bundle)
  })

  it('형식 버전이 다르면 오류를 던진다', () => {
    expect(() => validateBundle({ schemaVersion: 2, chapters: [chapter] })).toThrow('묶음 형식이 다릅니다 (schemaVersion 2)')
  })

  it('장이 없으면 오류를 던진다', () => {
    expect(() => validateBundle({ schemaVersion: 1, chapters: [] })).toThrow('묶음에 장이 없습니다')
  })

  it('객체가 아니면 오류를 던진다', () => {
    expect(() => validateBundle(null)).toThrow('묶음이 비어 있습니다')
  })
})
```

```ts path=packages/reader-core/src/scenes.test.ts
import { describe, expect, it } from 'vitest'
import { adjacentScenePosition } from './scenes.ts'
import type { Chapter, Scene } from './types.ts'

function scene(id: string, verseStart: number, verseEnd: number): Scene {
  return {
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
  }
}

function verses(count: number) {
  return Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: '', audio: null }))
}

const chapters: Chapter[] = [
  { chapter: 1, verses: verses(4), scenes: [scene('a', 1, 2), scene('b', 3, 4)] },
  { chapter: 2, verses: verses(2), scenes: [scene('c', 1, 2)] },
]

describe('adjacentScenePosition', () => {
  it('같은 장의 다음 장면 첫 절로 간다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 1 }, 1)).toEqual({ chapter: 1, verse: 3 })
  })

  it('장의 마지막 장면 다음은 다음 장의 첫 장면이다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 4 }, 1)).toEqual({ chapter: 2, verse: 1 })
  })

  it('앞 장면은 앞 장으로도 넘어간다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 2, verse: 2 }, -1)).toEqual({ chapter: 1, verse: 3 })
  })

  it('처음 장면의 앞과 마지막 장면의 뒤는 없다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 1, verse: 1 }, -1)).toBeNull()
    expect(adjacentScenePosition(chapters, { chapter: 2, verse: 1 }, 1)).toBeNull()
  })

  it('모르는 장이면 null이다', () => {
    expect(adjacentScenePosition(chapters, { chapter: 9, verse: 1 }, 1)).toBeNull()
  })
})
```

```ts path=packages/reader-core/src/mapView.test.ts
import { describe, expect, it } from 'vitest'
import {
  cameraAt,
  clampCamera,
  easeInOut,
  fitCamera,
  flyCamera,
  panCamera,
  project,
  REGION_CAMERA,
  SPAN_DEGREES,
  spanOf,
  viewBoxOf,
  zoomCamera,
  type Camera,
} from './mapView.ts'

const cos33 = Math.cos((33 * Math.PI) / 180)

function expectCamera(actual: Camera, expected: Camera) {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
  expect(actual.span).toBeCloseTo(expected.span)
}

describe('project', () => {
  it('경도는 북위 33도의 코사인을 곱해 펴고, 위도는 뒤집어 위쪽이 작은 y가 되게 한다', () => {
    const point = project(40, 33)
    expect(point.x).toBeCloseTo(40 * cos33 * 10)
    expect(point.y).toBeCloseTo(-330)
    expect(project(40, 35).y).toBeLessThan(project(40, 30).y)
  })
})

describe('범위', () => {
  it('spanOf는 경도 폭(도)을 지도 단위로 바꾼다', () => {
    expect(spanOf(10)).toBeCloseTo(10 * cos33 * 10)
  })

  it('cameraAt은 장소를 가운데에 둔다', () => {
    const camera = cameraAt(47.43, 31.02, SPAN_DEGREES.place)
    expect(camera.x).toBeCloseTo(project(47.43, 31.02).x)
    expect(camera.y).toBeCloseTo(project(47.43, 31.02).y)
    expect(camera.span).toBeCloseTo(spanOf(8.8))
  })

  it('viewBoxOf는 가운데와 폭, 화면 비율(세로÷가로)로 보는 상자를 만든다', () => {
    expect(viewBoxOf({ x: 100, y: -300, span: 200 }, 0.5)).toEqual({ x: 0, y: -350, width: 200, height: 100 })
  })
})

describe('fitCamera', () => {
  const options = { padding: 0.1, minSpan: 10, single: 50, empty: REGION_CAMERA }

  it('점이 없으면 empty를 준다', () => {
    expect(fitCamera([], 1, options)).toBe(REGION_CAMERA)
  })

  it('점이 하나면 그 점을 가운데에 두고 single 폭으로 본다', () => {
    expect(fitCamera([{ x: 5, y: 6 }], 1, options)).toEqual({ x: 5, y: 6, span: 50 })
  })

  it('가로로 퍼진 점은 가로 폭에 여백을 더한다', () => {
    expectCamera(fitCamera([{ x: 0, y: 0 }, { x: 100, y: 10 }], 1, options), { x: 50, y: 5, span: 120 })
  })

  it('세로로 퍼진 점은 화면 비율로 나눈 세로 폭을 쓴다', () => {
    // 세로 80, 화면 세로가 가로의 2배 → 필요한 가로 폭 40, 여백을 더해 48
    expectCamera(fitCamera([{ x: 0, y: 0 }, { x: 10, y: 80 }], 2, options), { x: 5, y: 40, span: 48 })
  })

  it('minSpan보다 좁히지 않는다', () => {
    expect(fitCamera([{ x: 0, y: 0 }, { x: 2, y: 0 }], 1, options).span).toBe(10)
  })
})

describe('flyCamera', () => {
  const from: Camera = { x: 0, y: 0, span: 100 }
  const to: Camera = { x: 400, y: 0, span: 50 }

  it('처음과 끝은 출발·도착 범위다', () => {
    expectCamera(flyCamera(from, to, 0), from)
    expectCamera(flyCamera(from, to, 1), to)
  })

  it('가운데쯤에서는 두 곳의 중간이고, 멀리 갈 때는 더 넓게 본다', () => {
    const middle = flyCamera(from, to, 0.5)
    expect(middle.x).toBeCloseTo(200)
    expect(middle.span).toBeGreaterThan(100)
  })

  it('t가 0~1을 벗어나면 끝으로 자른다', () => {
    expectCamera(flyCamera(from, to, 2), to)
  })

  it('easeInOut은 0, 절반, 1을 지난다', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(1)).toBe(1)
  })
})

describe('손가락으로 옮기기', () => {
  it('오른쪽으로 끌면 지도가 따라오므로 가운데는 왼쪽으로 간다', () => {
    expect(panCamera({ x: 0, y: 0, span: 200 }, 100, -40, 400)).toEqual({ x: -50, y: 20, span: 200 })
  })

  it('화면 폭을 모르면 그대로 둔다', () => {
    const camera = { x: 1, y: 2, span: 3 }
    expect(panCamera(camera, 10, 10, 0)).toBe(camera)
  })

  it('가운데를 기준으로 두 배 확대하면 폭이 반이 된다', () => {
    expect(zoomCamera({ x: 10, y: 20, span: 100 }, 2, 1)).toEqual({ x: 10, y: 20, span: 50 })
  })

  it('왼쪽 위를 기준으로 확대하면 왼쪽 위 모서리가 그대로 남는다', () => {
    const camera = { x: 0, y: 0, span: 100 }
    const before = viewBoxOf(camera, 1)
    const after = viewBoxOf(zoomCamera(camera, 2, 1, { fx: 0, fy: 0 }), 1)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(after.width).toBeCloseTo(50)
  })

  it('clampCamera는 바탕 지도 범위와 배율을 넘지 않게 자른다', () => {
    const bounds = { minX: 0, minY: -100, maxX: 100, maxY: 0 }
    expect(clampCamera({ x: 999, y: -999, span: 1 }, bounds, { minSpan: 5, maxSpan: 50 })).toEqual({
      x: 100,
      y: -100,
      span: 5,
    })
  })
})
```

- [ ] **Step 8: 시험이 실패하는지 본다**

Run: `npx vitest run --root packages/reader-core`
Expected: FAIL — `bundle.ts`, `scenes.ts`, `mapView.ts`가 없다(`Failed to resolve import`).

- [ ] **Step 9: 구현한다**

```ts path=packages/reader-core/src/bundle.ts
import type { Bundle } from './types.ts'

// 묶음 본체가 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다. 형식은 docs/content-bundle.md에 있다.
export function validateBundle(value: unknown): Bundle {
  if (typeof value !== 'object' || value === null) throw new Error('묶음이 비어 있습니다')
  const bundle = value as Bundle
  if (bundle.schemaVersion !== 1) throw new Error(`묶음 형식이 다릅니다 (schemaVersion ${String(bundle.schemaVersion)})`)
  if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) throw new Error('묶음에 장이 없습니다')
  return bundle
}

// 인물·시대는 나중에 더한 키라 옛 묶음에는 없다. 없으면 빈 배열로 채워 화면이 그대로 그려지게 한다.
export function fillMissing(bundle: Bundle): Bundle {
  return {
    ...bundle,
    characters: Array.isArray(bundle.characters) ? bundle.characters : [],
    eras: Array.isArray(bundle.eras) ? bundle.eras : [],
    chapters: bundle.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        characters: Array.isArray(scene.characters) ? scene.characters : [],
      })),
    })),
  }
}
```

```ts path=packages/reader-core/src/scenes.ts
import type { Position } from './position.ts'
import { findSceneIndex } from './readingPosition.ts'
import type { Chapter } from './types.ts'

// 지금 위치의 앞(-1)이나 뒤(1) 장면의 첫 절. 장의 처음·끝이면 앞·뒤 장의 장면으로 넘어가고, 더 없으면 null이다.
export function adjacentScenePosition(chapters: Chapter[], position: Position, direction: 1 | -1): Position | null {
  const chapter = chapters.find((item) => item.chapter === position.chapter)
  if (!chapter || chapter.scenes.length === 0) return null
  const current = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const all = chapters.flatMap((item) => item.scenes.map((scene) => ({ chapter: item.chapter, scene })))
  const target = all[all.findIndex((item) => item.scene.id === current.id) + direction]
  return target ? { chapter: target.chapter, verse: target.scene.verseStart } : null
}
```

```ts path=packages/reader-core/src/mapView.ts
// 여정 지도의 투영과 보는 범위 계산. 앱은 이 단위로 그린 SVG 지도(바탕 지도와 장소)를 보여 준다.

// 북위 33도를 표준 위선으로 하는 등장방형 투영이다. 근동 일대(북위 5~50도)만 그려서 왜곡이 작다.
const standardParallel = 33
const cosPhi = Math.cos((standardParallel * Math.PI) / 180)
// 위도 1도가 지도 10단위다.
export const MAP_UNITS_PER_DEGREE = 10

export type MapPoint = { x: number; y: number }

export function project(lng: number, lat: number): MapPoint {
  return { x: lng * cosPhi * MAP_UNITS_PER_DEGREE, y: -lat * MAP_UNITS_PER_DEGREE }
}

// 보는 범위. x, y는 가운데, span은 보이는 가로 폭(지도 단위)이다.
export type Camera = { x: number; y: number; span: number }

// 보이는 가로 폭(경도 몇 도). 웹 목업 지도(Leaflet)의 배율 4·5·6·7을 폰 너비(약 400px)로 옮긴 값이다.
// region: 처음 열 때의 근동 전체, from: 장소 전환 때 출발 장소, place: 장소 하나, closest: 가장 가까이
export const SPAN_DEGREES = { region: 35, from: 17.5, place: 8.8, closest: 4.4 } as const

export function spanOf(degrees: number): number {
  return degrees * cosPhi * MAP_UNITS_PER_DEGREE
}

export function cameraAt(lng: number, lat: number, spanDegrees: number): Camera {
  return { ...project(lng, lat), span: spanOf(spanDegrees) }
}

// 아직 지나온 장소가 없을 때 보여 줄 범위: 고대 근동 일대(북위 33.5도, 동경 42도)
export const REGION_CAMERA: Camera = cameraAt(42, 33.5, SPAN_DEGREES.region)

export type ViewBox = { x: number; y: number; width: number; height: number }

// aspect는 화면의 세로 ÷ 가로다.
export function viewBoxOf(camera: Camera, aspect: number): ViewBox {
  const width = camera.span
  const height = camera.span * aspect
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height }
}

export type FitOptions = { padding: number; minSpan: number; single: number; empty: Camera }

// 점들이 모두 보이는 범위. 양쪽에 padding(폭의 비율)만큼 여백을 두고 minSpan보다 좁히지 않는다.
// 점이 하나(또는 모두 한 자리)면 그 점을 가운데에 두고 single 폭으로, 점이 없으면 empty로 본다.
export function fitCamera(points: MapPoint[], aspect: number, options: FitOptions): Camera {
  if (points.length === 0) return options.empty
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  if (maxX === minX && maxY === minY) return { ...center, span: options.single }
  const needed = Math.max(maxX - minX, (maxY - minY) / aspect)
  return { ...center, span: Math.max(options.minSpan, needed * (1 + 2 * options.padding)) }
}

// 0 → 1로 가는 동안 천천히 출발해 천천히 멈춘다.
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// from에서 to로 날아가는 도중의 범위(t는 0~1). 멀리 갈수록 중간에 더 넓게 보았다가 다시 다가간다.
export function flyCamera(from: Camera, to: Camera, t: number): Camera {
  const e = easeInOut(Math.min(1, Math.max(0, t)))
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const lift = Math.min(1, distance / Math.max(from.span, to.span))
  const logSpan = Math.log(from.span) + (Math.log(to.span) - Math.log(from.span)) * e
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    span: Math.exp(logSpan) * (1 + lift * Math.sin(Math.PI * e)),
  }
}

// 화면을 dx, dy 픽셀 끌었을 때의 범위. 지도가 손가락을 따라오므로 가운데는 반대로 움직인다.
export function panCamera(camera: Camera, dx: number, dy: number, widthPixels: number): Camera {
  if (widthPixels <= 0) return camera
  const unit = camera.span / widthPixels
  return { ...camera, x: camera.x - dx * unit, y: camera.y - dy * unit }
}

// factor배 확대한 범위(2면 두 배 가까이). focus는 화면에서 제자리에 남길 점(가로·세로 0~1 비율)이고 기본은 가운데다.
export function zoomCamera(
  camera: Camera,
  factor: number,
  aspect: number,
  focus: { fx: number; fy: number } = { fx: 0.5, fy: 0.5 },
): Camera {
  if (factor <= 0) return camera
  const view = viewBoxOf(camera, aspect)
  const anchor = { x: view.x + view.width * focus.fx, y: view.y + view.height * focus.fy }
  return {
    x: anchor.x + (camera.x - anchor.x) / factor,
    y: anchor.y + (camera.y - anchor.y) / factor,
    span: camera.span / factor,
  }
}

export type MapBounds = { minX: number; minY: number; maxX: number; maxY: number }

// 가운데가 바탕 지도 밖으로 나가지 않게, 너무 멀거나 가까이 보지 않게 막는다.
export function clampCamera(camera: Camera, bounds: MapBounds, limits: { minSpan: number; maxSpan: number }): Camera {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, camera.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, camera.y)),
    span: Math.min(limits.maxSpan, Math.max(limits.minSpan, camera.span)),
  }
}
```

```ts path=packages/reader-core/src/index.ts
// 웹 목업(app)과 네이티브 앱(mobile)이 함께 쓰는 읽기 모듈. 브라우저·React Native API를 쓰지 않는다.
export * from './activeScene.ts'
export * from './bundle.ts'
export * from './entity.ts'
export * from './glossary.ts'
export * from './hue.ts'
export * from './imageVersion.ts'
export * from './mapView.ts'
export * from './names.ts'
export * from './placeChange.ts'
export * from './position.ts'
export * from './progress.ts'
export * from './readingPosition.ts'
export * from './route.ts'
export * from './scenes.ts'
export * from './settings.ts'
export * from './store.ts'
export * from './subtitles.ts'
export * from './timeline.ts'
export * from './types.ts'
```

- [ ] **Step 10: 시험과 형 검사가 통과하는지 본다**

Run: `npx vitest run --root packages/reader-core && npx tsc --noEmit -p packages/reader-core`
Expected: 모든 시험 PASS, 형 오류 없음. 형 검사에서 strict 때문에 옮긴 모듈에 오류가 나면(예: 배열 인덱스가 `undefined`일 수 있음) 그 줄에 `!`이나 기본값을 더해 고친다.

- [ ] **Step 11: 커밋**

```bash
git add packages/reader-core
git commit -m "refactor: 읽기 계산 모듈과 묶음 타입을 reader-core 패키지로 옮기고 저장소를 인자로 받게 함"
```

---

### Task 2: 웹 목업이 reader-core를 쓰게 한다

**Files:**
- Modify: `package.json`(workspaces, overrides, test), `app/package.json`, `admin/package.json`, `app/src/App.tsx`, `app/src/content/loadBundle.ts`, `app/src/components/*.tsx`, `app/src/reader/useNarration.ts`, `docs/content-bundle.md`
- Create: `app/src/storage.ts`, `app/src/reader/useSettings.ts`

- [ ] **Step 1: 워크스페이스와 React 버전을 맞춘다**

루트 `package.json`의 `workspaces`를 `["packages/reader-core", "pipeline", "app", "admin"]`로, `test`를 `"npm test -w reader-core && npm test -w pipeline && npm test -w app && npm test -w admin"`로 바꾸고, Expo SDK 57이 고정한 React와 같게 `"overrides": { "react": "19.2.3", "react-dom": "19.2.3" }`를 더한다. `app/package.json`과 `admin/package.json`의 `react`, `react-dom`을 `"19.2.3"`으로 바꾸고, `app/package.json`의 `dependencies`에 `"reader-core": "*"`를, `test` 스크립트를 `"vitest run --passWithNoTests"`로 바꾼다.

Run: `npm install`
Expected: `node_modules/reader-core`가 `packages/reader-core`를 가리키는 링크로 생기고, `node -p "require('react/package.json').version"`이 `19.2.3`이다.

- [ ] **Step 2: 웹 저장소와 설정 훅을 만든다**

```ts path=app/src/storage.ts
import type { KeyValueStore } from 'reader-core'

// 브라우저의 localStorage. 막힌 환경(사생활 보호 모드 등)에서는 읽기·쓰기가 오류를 던지고, reader-core가 그 오류를 삼킨다.
export const browserStore: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}
```

```ts path=app/src/reader/useSettings.ts
import { useCallback, useEffect, useState } from 'react'
import { FONT_SCALES, loadSettings, saveSettings, type Settings } from 'reader-core'
import { browserStore } from '../storage.ts'

// 설정 상태와 바꾸는 함수. 바꾸면 바로 저장하고, 어두운 화면 설정은 문서 루트에 적는다.
// 글자 크기는 verseScale로 돌려주어 .reader의 --verse-scale에 쓰게 한다.
export function useSettings() {
  const [settings, setSettings] = useState(() => loadSettings(browserStore))

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial }
      saveSettings(browserStore, next)
      return next
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  return { settings, update, verseScale: FONT_SCALES[settings.fontScale] }
}
```

```ts path=app/src/content/loadBundle.ts
import { fillMissing, validateBundle, type Bundle } from 'reader-core'

export async function loadBundle(): Promise<Bundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}content/genesis.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return fillMissing(validateBundle(await response.json()))
}
```

- [ ] **Step 3: 가져오는 경로를 바꾼다**

```bash
node -e "
const fs=require('fs');
const files=['app/src/App.tsx','app/src/reader/useNarration.ts',...fs.readdirSync('app/src/components').map(f=>'app/src/components/'+f)];
const moved='activeScene|entity|glossary|hue|imageVersion|names|placeChange|position|progress|readingPosition|route|settings|subtitles|timeline';
const re=new RegExp(\"from '(\\\\.\\\\./content/types|\\\\./content/types|\\\\.\\\\./reader/(\"+moved+\"))\\\\.ts'\",'g');
for (const f of files) { const s=fs.readFileSync(f,'utf8'); const t=s.replace(re,\"from 'reader-core'\"); if (t!==s) fs.writeFileSync(f,t); }"
```

그다음 `app/src/components/ReaderScreen.tsx`만 손으로 고친다.

- `import { useSettings } from 'reader-core'` → `import { useSettings } from '../reader/useSettings.ts'`
- 맨 위에 `import { browserStore } from '../storage.ts'`를 더한다.
- `loadPosition()` → `loadPosition(browserStore)`, `loadImageVersion()` → `loadImageVersion(browserStore)`
- `useState(loadSubtitles)` → `useState(() => loadSubtitles(browserStore))`, `useState(loadReadScenes)` → `useState(() => loadReadScenes(browserStore))`
- `savePosition(position)` → `savePosition(browserStore, position)`, `saveReadScenes(readScenes)` → `saveReadScenes(browserStore, readScenes)`, `saveImageVersion(next)` → `saveImageVersion(browserStore, next)`, `saveSubtitles(!subtitles)` → `saveSubtitles(browserStore, !subtitles)`

- [ ] **Step 4: 문서의 타입 위치를 고친다**

`docs/content-bundle.md` 첫 문단의 "웹 앱의 타입은 `app/src/content/types.ts`에 있다"를 "앱의 타입은 웹·네이티브가 함께 쓰는 `packages/reader-core/src/types.ts`에 있다"로 바꾼다.

- [ ] **Step 5: 웹 목업이 그대로 도는지 본다**

Run: `npm test && npm run lint -w app && npm run build -w app`
Expected: 모든 워크스페이스 시험 PASS, 린트 경고 없음, `tsc -b && vite build` 성공.

미리 보기(`preview_start` name `app`)로 웹 목업을 열어 본문이 그려지고, 콘솔 오류가 없고, 목차·설정·지도가 열리는지 본다.

- [ ] **Step 6: 커밋**

```bash
git add -A package.json package-lock.json app admin docs/content-bundle.md
git commit -m "refactor(app): 웹 목업이 reader-core를 쓰고 React를 19.2.3으로 맞춤"
```

---

### Task 3: Expo 앱 껍데기

**Files:**
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/.gitignore`, `mobile/assets/*`(템플릿 아이콘), `mobile/src/app/_layout.tsx`(임시), `mobile/src/app/index.tsx`
- Modify: 루트 `package.json`(workspaces), `.claude/launch.json`

- [ ] **Step 1: 템플릿 파일을 가져온다**

`expo-template-blank-typescript@sdk-57`(57.0.29)의 `assets/`와 `gitignore`를 쓴다. `App.tsx`, `index.ts`는 쓰지 않는다(expo-router가 진입점).

```bash
mkdir -p mobile && cd mobile
npm pack expo-template-blank-typescript@sdk-57 --silent
tar -xzf expo-template-blank-typescript-57.0.29.tgz
cp -r package/assets ./assets && cp package/gitignore ./.gitignore
rm -rf package expo-template-blank-typescript-57.0.29.tgz
cd ..
```

`mobile/.gitignore` 끝에 다음을 더한다.

```
# npm run content가 app/public/content에서 복사해 만든다
/assets/content/
/src/content/assets.generated.ts
```

- [ ] **Step 2: 패키지와 앱 설정을 쓴다**

```json path=mobile/package.json
{
  "name": "mobile",
  "version": "0.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "web": "expo start --port 8081",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "content": "node scripts/sync-content.mjs",
    "basemap": "tsx scripts/build-basemap.mts",
    "typecheck": "node scripts/sync-content.mjs && tsc --noEmit"
  },
  "dependencies": {
    "expo": "~57.0.27",
    "expo-status-bar": "~57.0.1",
    "react": "19.2.3",
    "react-native": "0.86.3",
    "reader-core": "*"
  },
  "devDependencies": {
    "@types/react": "~19.2.2",
    "typescript": "~6.0.3"
  }
}
```

```json path=mobile/app.json
{
  "expo": {
    "name": "장면 성경",
    "slug": "chansu-bible",
    "scheme": "chansubible",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.chansubible.app"
    },
    "android": {
      "package": "com.chansubible.app",
      "adaptiveIcon": {
        "backgroundColor": "#F3E9DC",
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro",
      "output": "single"
    },
    "plugins": ["expo-router"]
  }
}
```

```json path=mobile/tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "scripts"]
}
```

루트 `package.json`의 `workspaces`에 `"mobile"`을 더한다(`["packages/reader-core", "pipeline", "app", "admin", "mobile"]`). 루트 `test`에는 넣지 않는다(앱 형 검사는 콘텐츠 복사가 먼저 필요해서 따로 돈다).

- [ ] **Step 3: 의존성을 설치한다**

```bash
npm install
cd mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants react-native-gesture-handler react-native-svg expo-image expo-audio expo-sqlite expo-linear-gradient expo-font @expo-google-fonts/nanum-myeongjo react-dom react-native-web @expo/metro-runtime
npm install --save-dev @turf/bbox-clip @turf/simplify @types/geojson
cd ..
```

Expected: `mobile/package.json`에 SDK 57 버전이 적히고, `node -p "require.resolve('react', {paths:['mobile']})"`가 루트 `node_modules/react`(19.2.3) 하나만 가리킨다. 리눅스 CI가 깨지지 않게 `package-lock.json`에 리눅스용 선택 의존성(`*-linux-x64-gnu`)이 남아 있는지 본다.

- [ ] **Step 4: 임시 화면으로 웹 실행을 확인한다**

```tsx path=mobile/src/app/_layout.tsx
import { Stack } from 'expo-router'

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

```tsx path=mobile/src/app/index.tsx
import { Redirect } from 'expo-router'

// 1단계에서는 앱을 열면 바로 읽기 화면이다. 2단계에서 홈(읽기 계획과 진도)으로 바뀐다.
export default function Index() {
  return <Redirect href="/read" />
}
```

```tsx path=mobile/src/app/read.tsx
import { Text, View } from 'react-native'

export default function ReadRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>장면 성경</Text>
    </View>
  )
}
```

`.claude/launch.json`의 `configurations`에 다음을 더한다.

```json
{ "name": "mobile-web", "runtimeExecutable": "npm", "runtimeArgs": ["run", "web", "-w", "mobile"], "port": 8081 }
```

Run: `preview_start` name `mobile-web` → `http://localhost:8081`
Expected: "장면 성경" 글자가 보이고 콘솔 오류가 없다.

- [ ] **Step 5: 커밋**

```bash
git add mobile package.json package-lock.json .claude/launch.json
git commit -m "feat(mobile): Expo SDK 57 앱 껍데기 (expo-router, 웹 미리 보기)"
```

---

### Task 4: 묶음, 기기 저장소, 설정과 색

**Files:**
- Create: `mobile/scripts/sync-content.mjs`, `mobile/src/content/bundle.ts`, `mobile/src/storage/kv.ts`, `mobile/src/storage/kv.web.ts`, `mobile/src/theme/palette.ts`, `mobile/src/settings/SettingsContext.tsx`

- [ ] **Step 1: 콘텐츠 복사 스크립트를 쓴다**

```js path=mobile/scripts/sync-content.mjs
// 웹 묶음(app/public/content, 파이프라인 build의 결과)에서 앱에 넣을 것만 assets/content로 복사하고,
// 그림·음성 경로를 require() 표로 바꾼 src/content/assets.generated.ts를 만든다.
// 그림은 기본 그림 버전만 넣는다(웹의 그림 버전 전환은 시험용이라 앱에는 두지 않는다).
// 실행: npm run content -w mobile  (먼저 npm run pipeline -- build)
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mobile = path.resolve(import.meta.dirname, '..')
const source = path.resolve(mobile, '../app/public/content')
const target = path.join(mobile, 'assets/content')
const generated = path.join(mobile, 'src/content/assets.generated.ts')

if (!existsSync(path.join(source, 'genesis.json'))) {
  console.error('app/public/content/genesis.json이 없습니다. 먼저 npm run pipeline -- build를 실행하세요.')
  process.exit(1)
}

const bundle = JSON.parse(await readFile(path.join(source, 'genesis.json'), 'utf8'))
const version = bundle.defaultImageVersion
const images = []
const audio = []
for (const chapter of bundle.chapters) {
  for (const scene of chapter.scenes) {
    const image = version ? scene.images[version] : undefined
    if (image) images.push(image)
  }
  for (const verse of chapter.verses) if (verse.audio) audio.push(verse.audio)
}

// 묶음 안 경로는 content/로 시작한다(docs/content-bundle.md). 앞의 content/를 떼면 묶음 폴더 기준이다.
const inBundle = (file) => file.replace(/^content\//, '')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(path.join(source, 'genesis.json'), path.join(target, 'genesis.json'))
for (const file of [...images, ...audio]) {
  const to = path.join(target, inBundle(file))
  await mkdir(path.dirname(to), { recursive: true })
  await cp(path.join(source, inBundle(file)), to)
}

const entry = (file) => `  ${JSON.stringify(file)}: require(${JSON.stringify(`../../assets/content/${inBundle(file)}`)}),`
await mkdir(path.dirname(generated), { recursive: true })
await writeFile(
  generated,
  [
    '// npm run content -w mobile이 만든다. 고치지 말 것.',
    '// 묶음 안 경로(content/...) → 앱에 넣은 자원',
    'export const imageAssets: Record<string, number> = {',
    ...images.map(entry),
    '}',
    '',
    'export const audioAssets: Record<string, number> = {',
    ...audio.map(entry),
    '}',
    '',
  ].join('\n'),
)
console.log(`묶음과 그림 ${images.length}개(버전 ${version}), 음성 ${audio.length}개를 앱에 넣었습니다`)
```

Run: `npm run pipeline -- build && npm run content -w mobile`
Expected: `묶음과 그림 33개(버전 v3-reference), 음성 267개를 앱에 넣었습니다`

- [ ] **Step 2: 묶음 모듈과 기기 저장소를 쓴다**

```ts path=mobile/src/content/bundle.ts
import { fillMissing, validateBundle, type Bundle } from 'reader-core'
import { audioAssets, imageAssets } from './assets.generated'

type Loaded = { bundle: Bundle; error: null } | { bundle: null; error: string }

// 묶음은 앱 안에 들어 있다(npm run content가 복사). 앱이 시작할 때 한 번 읽고 검사한다.
function load(): Loaded {
  try {
    return { bundle: fillMissing(validateBundle(require('../../assets/content/genesis.json'))), error: null }
  } catch (error) {
    return { bundle: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export const content = load()

// 묶음 안 경로(content/images/...)의 그림. 앱에 없으면 null이다.
export function imageSource(file: string | undefined): number | null {
  return file ? (imageAssets[file] ?? null) : null
}

// 묶음 안 경로(content/audio/...)의 절 낭독. 앱에 없으면 null이다.
export function audioSource(file: string | null | undefined): number | null {
  return file ? (audioAssets[file] ?? null) : null
}
```

```ts path=mobile/src/storage/kv.ts
import Storage from 'expo-sqlite/kv-store'
import type { KeyValueStore } from 'reader-core'

// 기기 저장소. expo-sqlite의 키·값 저장소를 동기 API로 쓴다(앱을 껐다 켜도 남는다).
export const kv: KeyValueStore = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
}
```

```ts path=mobile/src/storage/kv.web.ts
import type { KeyValueStore } from 'reader-core'

// Expo 웹 미리 보기에서는 브라우저의 localStorage를 쓴다.
export const kv: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
}
```

- [ ] **Step 3: 색과 설정 공급자를 쓴다**

```ts path=mobile/src/theme/palette.ts
import { Platform } from 'react-native'

// 웹 목업(app/src/index.css)의 색을 그대로 옮겼다. 지도 색(map*, halo)은 앱에서 새로 정했다.
export type Palette = {
  dark: boolean
  paper: string
  surface: string
  ink: string
  inkSoft: string
  inkFaint: string
  line: string
  accent: string
  accentSoft: string
  warn: string
  warnSoft: string
  ok: string
  okSoft: string
  flood: string
  floodSoft: string
  floatBg: string
  backdrop: string
  mapSea: string
  mapLand: string
  mapRiver: string
  mapLabel: string
  halo: string
}

export const light: Palette = {
  dark: false,
  paper: '#faf7f2',
  surface: '#ffffff',
  ink: '#2b2622',
  inkSoft: '#6f665e',
  inkFaint: '#a39a90',
  line: '#e7e0d6',
  accent: '#8a5a2b',
  accentSoft: '#f3e9dc',
  warn: '#9a5b00',
  warnSoft: '#fbefd6',
  ok: '#3f7d4e',
  okSoft: '#e3f0e4',
  flood: '#3b6fb6',
  floodSoft: 'rgba(59, 111, 182, 0.14)',
  floatBg: 'rgba(255, 255, 255, 0.9)',
  backdrop: '#ece7df',
  mapSea: '#d6e0e0',
  mapLand: '#efe8da',
  mapRiver: '#8fb0c0',
  mapLabel: '#6f8890',
  halo: '#ffffff',
}

export const dark: Palette = {
  dark: true,
  paper: '#1d1a17',
  surface: '#2a2521',
  ink: '#efe9e0',
  inkSoft: '#b8ad9f',
  inkFaint: '#857b6f',
  line: '#3a342e',
  accent: '#d6a56f',
  accentSoft: '#3d3128',
  warn: '#e0a24a',
  warnSoft: '#3d2f1c',
  ok: '#7cc08c',
  okSoft: '#22362a',
  flood: '#7fa8e0',
  floodSoft: 'rgba(127, 168, 224, 0.18)',
  floatBg: 'rgba(42, 37, 33, 0.9)',
  backdrop: '#141210',
  mapSea: '#1c2427',
  mapLand: '#2c2722',
  mapRiver: '#3e5a66',
  mapLabel: '#7f9198',
  halo: '#1d1a17',
}

// 본문 글꼴은 나눔명조(OFL, 웹 목업의 두 번째 후보 글꼴), 나머지는 기기 글꼴이다.
export const fonts = {
  serif: 'NanumMyeongjo_400Regular',
  serifBold: 'NanumMyeongjo_700Bold',
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }),
} as const

// '#rrggbb'에 투명도를 더한 rgba 문자열
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

// 그림이 없을 때의 바탕색과 글자색(웹의 hsl(var(--hue) 32% 84%))
export function placeholderColors(hue: number, palette: Palette): { background: string; text: string } {
  return palette.dark
    ? { background: `hsl(${hue}, 18%, 24%)`, text: `hsl(${hue}, 25%, 72%)` }
    : { background: `hsl(${hue}, 32%, 84%)`, text: `hsl(${hue}, 30%, 32%)` }
}
```

```tsx path=mobile/src/settings/SettingsContext.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { FONT_SCALES, loadSettings, loadSubtitles, saveSettings, saveSubtitles, type Settings } from 'reader-core'
import { kv } from '../storage/kv'
import { dark, light, type Palette } from '../theme/palette'

type SettingsValue = {
  settings: Settings
  update: (partial: Partial<Settings>) => void
  // 절 글꼴 배율. 기기의 글자 크기 설정은 React Native가 따로 곱한다.
  verseScale: number
  palette: Palette
  // 그림 위 자막. 장면 그림의 단추와 읽기 설정이 같은 값을 쓴다.
  subtitles: boolean
  setSubtitles: (on: boolean) => void
}

const SettingsContext = createContext<SettingsValue | null>(null)

// 읽기 설정과 자막. 바꾸면 바로 이 기기에 저장한다. 웹 목업과 같은 키·형식이다.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => loadSettings(kv))
  const [subtitles, setSubtitlesState] = useState(() => loadSubtitles(kv))
  const scheme = useColorScheme()

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial }
      saveSettings(kv, next)
      return next
    })
  }, [])

  const setSubtitles = useCallback((on: boolean) => {
    setSubtitlesState(on)
    saveSubtitles(kv, on)
  }, [])

  const isDark = settings.theme === 'dark' || (settings.theme === 'auto' && scheme === 'dark')
  const value = useMemo(
    () => ({
      settings,
      update,
      verseScale: FONT_SCALES[settings.fontScale],
      palette: isDark ? dark : light,
      subtitles,
      setSubtitles,
    }),
    [settings, update, isDark, subtitles, setSubtitles],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('SettingsProvider 밖에서 useSettings를 불렀습니다')
  return value
}
```

- [ ] **Step 4: 형 검사**

Run: `npm run typecheck -w mobile`
Expected: 오류 없음.

- [ ] **Step 5: 커밋**

```bash
git add mobile
git commit -m "feat(mobile): 앱 안 묶음과 자원 표, 기기 저장소, 읽기 설정과 색"
```

---

### Task 5: 화면 부품

**Files:**
- Create: `mobile/src/ui/{Icon,IconButton,Sheet,OverlayScreen,Segments,sheetStyles,useReduceMotion}.tsx|ts`

- [ ] **Step 1: 아이콘과 단추**

```tsx path=mobile/src/ui/Icon.tsx
import type { ReactNode } from 'react'
import Svg, { Circle, G, Path } from 'react-native-svg'

export type IconName =
  | 'map'
  | 'question'
  | 'close'
  | 'back'
  | 'play'
  | 'pause'
  | 'subtitles'
  | 'list'
  | 'gear'
  | 'person'
  | 'clock'
  | 'pin'
  | 'chevronDown'
  | 'plus'
  | 'minus'

// 웹 목업(app/src/components/Icon.tsx)과 같은 선 아이콘
const shapes: Record<IconName, ReactNode> = {
  map: (
    <>
      <Path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <Path d="M9 4v14M15 6v14" />
    </>
  ),
  question: (
    <>
      <Path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4" />
      <Path d="M12 18h.01" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  play: <Path d="M8 5v14l11-7z" />,
  pause: <Path d="M9 5v14M15 5v14" />,
  subtitles: (
    <>
      <Path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <Path d="M7 15h4M14 15h3M7 11h10" />
    </>
  ),
  list: <Path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  gear: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  person: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <Circle cx={12} cy={10} r={2.5} />
    </>
  ),
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
}

export default function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {shapes[name]}
      </G>
    </Svg>
  )
}
```

```tsx path=mobile/src/ui/IconButton.tsx
import { Pressable, StyleSheet } from 'react-native'
import { useSettings } from '../settings/SettingsContext'
import Icon, { type IconName } from './Icon'

type IconButtonProps = {
  name: IconName
  label: string
  color: string
  onPress: () => void
  size?: number
}

// 테두리 없는 40×40 아이콘 단추
export function IconButton({ name, label, color, onPress, size = 22 }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  )
}

type RoundButtonProps = {
  name: IconName
  label: string
  onPress: () => void
  // 소리가 없는 절의 재생처럼 누를 수 없을 때 흐리게 둔다.
  disabled?: boolean
  // 켜고 끄는 단추(자막)가 켜져 있을 때
  toggled?: boolean
}

// 그림 위에 뜨는 둥근 단추
export function RoundButton({ name, label, onPress, disabled = false, toggled }: RoundButtonProps) {
  const { palette } = useSettings()
  const on = toggled === true
  return (
    <Pressable
      accessibilityRole={toggled === undefined ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={{ disabled, checked: toggled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: on ? palette.accent : palette.floatBg },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={name} color={on ? palette.paper : palette.ink} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
})
```

- [ ] **Step 2: 시트와 덮는 화면**

```tsx path=mobile/src/ui/Sheet.tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { IconButton } from './IconButton'

type Props = {
  // 제목 글 또는 직접 그린 머리. 둘 다 없으면 닫기 단추만 있다.
  title?: string
  header?: ReactNode
  closeLabel: string
  onClose: () => void
  children: ReactNode
}

// 아래에서 올라오는 시트. 바탕을 누르면 닫힌다. 안드로이드 뒤로 가기는 ReaderScreen이 처리한다.
export function Sheet({ title, header, closeLabel, onClose, children }: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const offset = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(offset, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [offset])

  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [0, 400] })

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: palette.surface, paddingBottom: 24 + insets.bottom, transform: [{ translateY }] }]}
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            {header ??
              (title ? (
                <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
                  {title}
                </Text>
              ) : null)}
          </View>
          <IconButton name="close" label={closeLabel} color={palette.ink} onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { maxHeight: '80%', paddingTop: 12, paddingHorizontal: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 4 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.serifBold, fontSize: 18 },
  body: { gap: 12, paddingBottom: 4 },
})
```

```tsx path=mobile/src/ui/OverlayScreen.tsx
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../settings/SettingsContext'
import { IconButton } from './IconButton'

// 덮는 화면의 머리: 뒤로 가기 단추와 제목
export function OverlayHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  const { palette } = useSettings()
  return (
    <View style={styles.header}>
      <IconButton name="back" label={backLabel} color={palette.ink} onPress={onBack} />
      <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  )
}

// 읽기 화면 전체를 덮는 화면(목차)
export function OverlayScreen({
  title,
  backLabel,
  onBack,
  children,
}: {
  title: string
  backLabel: string
  onBack: () => void
  children: ReactNode
}) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.paper, paddingTop: insets.top }]} accessibilityViewIsModal>
      <OverlayHeader title={title} backLabel={backLabel} onBack={onBack} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  title: { fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 3: 분할 선택, 시트 글 모양, 동작 줄이기**

```tsx path=mobile/src/ui/Segments.tsx
import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native'
import { useSettings } from '../settings/SettingsContext'

export type SegmentOption<T> = { value: T; label: string; accessibilityLabel?: string; textStyle?: TextStyle }

// 여럿 중 하나를 고르는 분할 단추(읽기 설정)
export function Segments<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { palette } = useSettings()
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      <View
        style={[styles.segments, { borderColor: palette.line, backgroundColor: palette.paper }]}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              onPress={() => onChange(option.value)}
              style={[styles.segment, checked && { backgroundColor: palette.surface }]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: checked ? palette.ink : palette.inkSoft, fontWeight: checked ? '600' : '400' },
                  option.textStyle,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 15 },
  segments: { flexDirection: 'row', padding: 3, borderWidth: 1, borderRadius: 10 },
  segment: { minWidth: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13 },
})
```

```ts path=mobile/src/ui/sheetStyles.ts
import { StyleSheet } from 'react-native'
import { fonts } from '../theme/palette'

// 시트 안 글 모양(웹 목업의 .sheet h3, .term, .explanation, .chip). 색은 쓰는 곳에서 더한다.
export const sheetStyles = StyleSheet.create({
  h3: { marginTop: 6, fontSize: 14, fontWeight: '700' },
  term: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 14, lineHeight: 21, overflow: 'hidden' },
  termVerse: { fontSize: 12 },
  explanation: { gap: 10 },
  paragraph: { fontSize: 15, lineHeight: 25.5 },
  serifParagraph: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 25.5 },
  empty: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderRadius: 999, fontSize: 12, overflow: 'hidden' },
  note: { fontSize: 12, lineHeight: 19 },
})
```

```ts path=mobile/src/ui/useReduceMotion.ts
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

// 기기의 "동작 줄이기" 설정. 켜져 있으면 지도가 날아가지 않고 바로 옮긴다.
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value)
      })
      .catch(() => undefined)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])
  return reduce
}
```

- [ ] **Step 4: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile/src/ui
git commit -m "feat(mobile): 화면 부품 (아이콘, 단추, 시트, 덮는 화면, 분할 선택)"
```

---

### Task 6: 시트 넷 (해설, 인물·장소 카드, 읽기 설정, 장 고르기)

**Files:**
- Create: `mobile/src/reader/{BackgroundSheet,EntityCard,SettingsSheet,ChapterPicker}.tsx`

- [ ] **Step 1: 해설 시트**

```tsx path=mobile/src/reader/BackgroundSheet.tsx
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Scene } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

// 그림의 ? 단추로 여는 장면 해설: 해설 문단, 낱말 풀이, 역사 배경
export default function BackgroundSheet({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const { palette } = useSettings()
  const { explanation, history } = scene

  return (
    <Sheet title={scene.title} closeLabel="해설 닫기" onClose={onClose}>
      {explanation.length > 0 ? (
        <View style={sheetStyles.explanation}>
          {explanation.map((paragraph, index) => (
            <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
              {paragraph}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>이 장면의 해설은 아직 준비 중이에요.</Text>
      )}

      {scene.glossary.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            낱말 풀이
          </Text>
          {scene.glossary.map((gloss, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              <Text style={[sheetStyles.termVerse, { color: palette.inkFaint }]}>{gloss.verse}절 </Text>
              <Text style={styles.word}>{gloss.word} </Text>
              {gloss.meaning}
            </Text>
          ))}
        </>
      )}

      {history.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            역사 배경
          </Text>
          {history.map((note, index) => (
            <View key={index} style={[styles.history, { borderColor: palette.line }]}>
              <Text style={[styles.certainty, { backgroundColor: palette.accentSoft, color: palette.accent }]}>
                {note.certainty}
              </Text>
              <Text style={[styles.historyText, { color: palette.ink }]}>{note.text}</Text>
              <Text style={[styles.basis, { color: palette.inkSoft }]}>근거: {note.basis}</Text>
              {note.sources.length > 0 && (
                <View style={styles.sources}>
                  {note.sources.map((url, sourceIndex) => (
                    <Pressable
                      key={`${sourceIndex}-${url}`}
                      accessibilityRole="link"
                      accessibilityLabel={`출처 ${sourceIndex + 1} 열기`}
                      onPress={() => void Linking.openURL(url)}
                    >
                      <Text style={[styles.source, { color: palette.accent }]}>출처 {sourceIndex + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  word: { fontWeight: '700' },
  history: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 },
  certainty: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, overflow: 'hidden' },
  historyText: { fontSize: 14, lineHeight: 22.4 },
  basis: { fontSize: 13, lineHeight: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  source: { fontSize: 13, textDecorationLine: 'underline' },
})
```

- [ ] **Step 2: 인물·장소 카드**

```tsx path=mobile/src/reader/EntityCard.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  firstSentence,
  groupRelations,
  paragraphs,
  yearsLabel,
  type Character,
  type Entity,
  type Place,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

type Props = {
  entity: Entity
  characters: Character[]
  places: Place[]
  // 지금 장면에 나오는 인물 id
  sceneCharacters: string[]
  // 관계에서 다른 인물을 누르면 카드가 그 인물로 바뀐다.
  onOpenEntity: (entity: Entity) => void
  onOpenMap: () => void
  onClose: () => void
}

const genderText: Record<Character['gender'], string | null> = { 남: '남자', 여: '여자', 불명: null }

// 본문에서 누른 인물·장소의 카드
export default function EntityCard({ entity, characters, places, sceneCharacters, onOpenEntity, onOpenMap, onClose }: Props) {
  const { palette } = useSettings()
  const character = entity.kind === 'character' ? characters.find((item) => item.id === entity.id) : undefined
  const place = entity.kind === 'place' ? places.find((item) => item.id === entity.id) : undefined
  const kindText = entity.kind === 'character' ? '인물' : '장소'
  const title = character?.name ?? place?.name ?? kindText

  return (
    <Sheet
      closeLabel={`${kindText} 카드 닫기`}
      onClose={onClose}
      header={
        <View style={styles.head}>
          <View style={styles.kind}>
            <Icon name={entity.kind === 'character' ? 'person' : 'pin'} size={14} color={palette.accent} />
            <Text style={[styles.kindText, { color: palette.accent }]}>{kindText} · 설정집 검수됨</Text>
          </View>
          <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
      }
    >
      {character ? (
        <CharacterBody
          character={character}
          characters={characters}
          inScene={sceneCharacters.includes(character.id)}
          onOpenEntity={onOpenEntity}
        />
      ) : null}
      {place ? <PlaceBody place={place} onOpenMap={onOpenMap} /> : null}
      {!character && !place ? (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>설정집에 아직 없어요.</Text>
      ) : null}
    </Sheet>
  )
}

function Chip({ text, strong = false }: { text: string; strong?: boolean }) {
  const { palette } = useSettings()
  return (
    <Text
      style={[
        sheetStyles.chip,
        strong
          ? { backgroundColor: palette.accentSoft, borderColor: 'transparent', color: palette.accent, fontWeight: '600' }
          : { backgroundColor: palette.paper, borderColor: palette.line, color: palette.inkSoft },
      ]}
    >
      {text}
    </Text>
  )
}

function CharacterBody({
  character,
  characters,
  inScene,
  onOpenEntity,
}: {
  character: Character
  characters: Character[]
  inScene: boolean
  onOpenEntity: (entity: Entity) => void
}) {
  const { palette } = useSettings()
  const summary = firstSentence(character.notes)
  const years = yearsLabel(character.years)
  const gender = genderText[character.gender]
  const relations = groupRelations(character.relations)
    .map((group) => ({
      type: group.type,
      people: group.ids.flatMap((id) => characters.filter((item) => item.id === id)),
    }))
    .filter((group) => group.people.length > 0)
  const notes = paragraphs(character.notes)

  return (
    <>
      {summary ? <Text style={[sheetStyles.serifParagraph, { color: palette.ink }]}>{summary}</Text> : null}

      <View style={sheetStyles.chips}>
        {inScene ? <Chip text="이 장면에 나와요" strong /> : null}
        {character.firstAppearance ? <Chip text={`처음 등장 ${character.firstAppearance}`} /> : null}
        {gender ? <Chip text={gender} /> : null}
        {years ? <Chip text={years} /> : null}
      </View>

      {relations.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            관계
          </Text>
          <View style={styles.relations}>
            {relations.map((group) => (
              <View key={group.type} style={styles.relation}>
                <Text style={[styles.relationType, { color: palette.inkSoft }]}>{group.type}</Text>
                <View style={styles.relationPeople}>
                  {group.people.map((person) => (
                    <Pressable
                      key={person.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name} 인물 카드 보기`}
                      onPress={() => onOpenEntity({ kind: 'character', id: person.id })}
                      style={[styles.relationName, { borderColor: palette.line, backgroundColor: palette.surface }]}
                    >
                      <Text style={[styles.relationNameText, { color: palette.ink }]}>{person.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {character.attire.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            옷차림
          </Text>
          {character.attire.map((item, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              <Text style={[sheetStyles.termVerse, { color: palette.inkFaint }]}>{item.from} </Text>
              {item.description}
            </Text>
          ))}
        </>
      )}

      {notes.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            본문이 말하는 것
          </Text>
          <View style={sheetStyles.explanation}>
            {notes.map((paragraph, index) => (
              <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
                {paragraph}
              </Text>
            ))}
          </View>
        </>
      )}

      {character.sources.length > 0 && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>본문 근거: {character.sources.join(', ')}</Text>
      )}
    </>
  )
}

function PlaceBody({ place, onOpenMap }: { place: Place; onOpenMap: () => void }) {
  const { palette } = useSettings()
  const mapped = place.lat !== null && place.lng !== null
  return (
    <>
      {place.estimated && (
        <View style={sheetStyles.chips}>
          <Chip text="추정 위치" />
        </View>
      )}
      {place.description ? (
        <Text style={[sheetStyles.paragraph, { color: palette.ink }]}>{place.description}</Text>
      ) : (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>이 장소의 설명은 아직 준비 중이에요.</Text>
      )}
      {mapped && (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenMap}
          style={[styles.wide, { borderColor: palette.line, backgroundColor: palette.paper }]}
        >
          <Icon name="map" size={18} color={palette.ink} />
          <Text style={[styles.wideText, { color: palette.ink }]}>지도에서 보기</Text>
        </Pressable>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindText: { fontSize: 12 },
  title: { fontFamily: fonts.serifBold, fontSize: 22 },
  relations: { gap: 8 },
  relation: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  relationType: { minWidth: 44, fontSize: 13 },
  relationPeople: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relationName: { paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderRadius: 999 },
  relationNameText: { fontFamily: fonts.serif, fontSize: 14 },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 1, borderRadius: 12 },
  wideText: { fontSize: 15, fontWeight: '600' },
})
```

- [ ] **Step 3: 읽기 설정과 장 고르기**

```tsx path=mobile/src/reader/SettingsSheet.tsx
import type { ReactNode } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { FONT_SCALE_STEPS, type Speed, type Theme, type Verse } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const themeOptions: SegmentOption<Theme>[] = [
  { value: 'auto', label: '기기 따름' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
]

const speedOptions: SegmentOption<Speed>[] = [
  { value: 0.8, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.2, label: '빠르게' },
]

// 글자 크기는 슬라이더 대신 다섯 단계 "가" 단추로 고른다(React Native에는 기본 슬라이더가 없다).
const fontOptions = FONT_SCALE_STEPS.map((step) => ({
  value: step,
  label: '가',
  accessibilityLabel: `글자 크기 5단계 중 ${step}단계`,
  textStyle: { fontSize: 11 + step * 2 },
}))

// 읽기 설정 시트. 바꾸면 바로 반영되고 이 기기에 저장된다.
export default function SettingsSheet({ verse, onClose }: { verse: Verse | undefined; onClose: () => void }) {
  const { settings, update, palette, verseScale, subtitles, setSubtitles } = useSettings()
  const previewSize = 17 * verseScale

  return (
    <Sheet title="읽기 설정" closeLabel="읽기 설정 닫기" onClose={onClose}>
      <Group title="글">
        <Segments label="글자 크기" options={fontOptions} value={settings.fontScale} onChange={(fontScale) => update({ fontScale })} />
        {verse ? (
          <Text
            style={[styles.preview, { backgroundColor: palette.paper, color: palette.ink, fontSize: previewSize, lineHeight: previewSize * 1.75 }]}
            accessibilityLabel="글자 크기 미리 보기"
          >
            <Text style={[styles.previewNumber, { color: palette.accent }]}>{verse.verse} </Text>
            {verse.text}
          </Text>
        ) : null}
        <Segments label="어두운 화면" options={themeOptions} value={settings.theme} onChange={(theme) => update({ theme })} />
      </Group>

      <Group title="낭독">
        <Segments label="속도" options={speedOptions} value={settings.speed} onChange={(speed) => update({ speed })} />
        <SwitchRow label="그림 위 자막" value={subtitles} onChange={setSubtitles} />
      </Group>

      <Group title="그림과 지도">
        <SwitchRow
          label="장소가 바뀌면 지도 보여 주기"
          value={settings.placeFlash}
          onChange={(placeFlash) => update({ placeFlash })}
        />
      </Group>

      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        본문은 개역한글(퍼블릭 도메인), 그림은 이 앱에서 만든 것. 설정은 이 기기에만 저장돼요.
      </Text>
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { palette } = useSettings()
  return (
    <View style={[styles.group, { borderBottomColor: palette.line }]}>
      <Text style={[styles.groupTitle, { color: palette.accent }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { palette } = useSettings()
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, { color: palette.ink }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.line }}
        thumbColor={palette.surface}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  groupTitle: { fontSize: 12, fontWeight: '700' },
  preview: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontFamily: fonts.serif, overflow: 'hidden' },
  previewNumber: { fontFamily: fonts.sans, fontSize: 11 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, fontSize: 15 },
})
```

```tsx path=mobile/src/reader/ChapterPicker.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { chapterProgress, type Chapter } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'

type Props = {
  chapters: Chapter[]
  current: number
  readScenes: Set<string>
  onPick: (chapter: number) => void
  onClose: () => void
}

// 본문 머리의 "창세기 N장"을 눌러 여는 장 고르기. 다 읽은 장은 초록으로 표시한다.
export default function ChapterPicker({ chapters, current, readScenes, onPick, onClose }: Props) {
  const { palette } = useSettings()
  return (
    <Sheet title="장 고르기" closeLabel="장 고르기 닫기" onClose={onClose}>
      <View style={styles.grid}>
        {chapters.map((chapter) => {
          const done = chapterProgress(chapter.scenes, readScenes).done
          const selected = chapter.chapter === current
          return (
            <Pressable
              key={chapter.chapter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${chapter.chapter}장${selected ? ', 읽는 중' : ''}${done ? ', 다 읽음' : ''}`}
              onPress={() => onPick(chapter.chapter)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? palette.accent : palette.line,
                  backgroundColor: selected ? palette.accent : done ? palette.okSoft : palette.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? palette.paper : done ? palette.ok : palette.ink, fontWeight: selected ? '700' : '400' },
                ]}
              >
                {chapter.chapter}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: 52, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15 },
})
```

- [ ] **Step 4: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile/src/reader
git commit -m "feat(mobile): 해설 시트, 인물·장소 카드, 읽기 설정, 장 고르기"
```

---

### Task 7: 목차와 연표

**Files:**
- Create: `mobile/src/reader/{ContentsScreen,TimelineView}.tsx`

- [ ] **Step 1: 연표**

```tsx path=mobile/src/reader/TimelineView.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { timelineLayout, type Character, type Entity, type Era } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts, withAlpha } from '../theme/palette'
import { sheetStyles } from '../ui/sheetStyles'

// 연표 그림 부분의 높이(px)
const plotHeight = 360
// 왼쪽 햇수 눈금 자리의 폭(px)
const gutter = 52

type Props = {
  characters: Character[]
  eras: Era[]
  // 지금 장면에 나오는 인물 id. 진한 색으로 그린다.
  sceneCharacters: string[]
  onOpenEntity: (entity: Entity) => void
}

// 세로 연표: 위에서 아래로 창조 원년부터 햇수가 흐르고, 인물마다 산 기간을 막대로 그린다.
// 이름은 웹처럼 세로로 쓴다(글자마다 줄을 바꿈).
export default function TimelineView({ characters, eras, sceneCharacters, onOpenEntity }: Props) {
  const { palette } = useSettings()
  const layout = timelineLayout(characters, eras, { height: plotHeight })

  if (layout.bars.length === 0) {
    return <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>연표에 놓을 인물이 아직 없어요.</Text>
  }

  return (
    <View>
      <View style={styles.grid}>
        {layout.ticks.map((tick) => (
          <View key={tick.year} style={[styles.tick, { top: tick.top, borderColor: palette.line }]}>
            <Text style={[styles.tickText, { color: palette.inkFaint, backgroundColor: palette.paper }]}>{tick.year}년</Text>
          </View>
        ))}
        {layout.bands.map((band) => (
          <View
            key={band.id}
            style={[
              styles.band,
              { top: band.top, height: Math.max(2, band.height), backgroundColor: band.flood ? palette.flood : palette.accentSoft },
            ]}
          >
            <Text style={[styles.bandText, { color: band.flood ? palette.flood : palette.inkFaint, fontWeight: band.flood ? '600' : '400' }]}>
              {band.name} {band.from === band.to ? `${band.from}년` : `${band.from}~${band.to}년`}
            </Text>
          </View>
        ))}

        <View style={styles.columns}>
          {layout.bars.map((bar) => {
            const strong = sceneCharacters.includes(bar.id)
            const span = bar.died === null ? `${bar.born}년에 태어나 데려감` : `${bar.born}년 ~ ${bar.died}년`
            const open = () => onOpenEntity({ kind: 'character', id: bar.id })
            const barColor = strong ? palette.accent : withAlpha(palette.accent, 0.35)
            return (
              <View key={bar.id} style={styles.column}>
                <View style={styles.track}>
                  <Pressable
                    accessible={false}
                    onPress={open}
                    style={[
                      styles.bar,
                      { top: bar.top, height: Math.max(2, bar.height) },
                      bar.open
                        ? { borderColor: strong ? palette.accent : withAlpha(palette.accent, 0.55), borderWidth: 2, borderBottomWidth: 0, borderStyle: 'dashed', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                        : { backgroundColor: barColor },
                    ]}
                  />
                  {bar.open && (
                    <Text style={[styles.taken, { top: bar.top + bar.height, color: palette.inkFaint }]}>데려감</Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${bar.name}, 창조 원년 기준 ${span}${strong ? ', 이 장면에 나와요' : ''}. 인물 카드 보기`}
                  onPress={open}
                  style={styles.name}
                >
                  <Text style={[styles.nameText, { color: strong ? palette.ink : palette.inkSoft, fontFamily: strong ? fonts.serifBold : fonts.serif }]}>
                    {[...bar.name].join('\n')}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
      <Text style={[sheetStyles.note, styles.note, { color: palette.inkFaint }]}>
        창조 원년 기준. 5장의 나이를 더해 계산했고 번역·사본에 따라 다를 수 있어요.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { position: 'relative', marginTop: 12, paddingLeft: gutter },
  tick: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  tickText: { position: 'absolute', left: 0, top: -8, paddingRight: 4, fontSize: 11 },
  band: { position: 'absolute', left: gutter, right: 0 },
  bandText: { position: 'absolute', right: 0, bottom: 2, fontSize: 11 },
  columns: { flexDirection: 'row', gap: 2 },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  track: { position: 'relative', width: '100%', height: plotHeight },
  bar: { position: 'absolute', left: '50%', width: 10, marginLeft: -5, borderRadius: 5 },
  taken: { position: 'absolute', alignSelf: 'center', fontSize: 10 },
  name: { marginTop: 6, paddingVertical: 2 },
  nameText: { fontSize: 13, lineHeight: 15, textAlign: 'center' },
  note: { marginTop: 16 },
})
```

- [ ] **Step 2: 목차**

```tsx path=mobile/src/reader/ContentsScreen.tsx
import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  chapterProgress,
  hueOf,
  sceneStatus,
  type Bundle,
  type Entity,
  type Position,
  type Scene,
  type SceneStatus,
} from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors } from '../theme/palette'
import Icon from '../ui/Icon'
import { OverlayScreen } from '../ui/OverlayScreen'
import TimelineView from './TimelineView'

export type ContentsTab = 'scenes' | 'timeline'

type Props = {
  bundle: Bundle
  currentChapter: number
  currentSceneId: string
  // 지금 장면에 나오는 인물 id. 연표에서 진하게 그린다.
  sceneCharacters: string[]
  readScenes: Set<string>
  tab: ContentsTab
  onTabChange: (tab: ContentsTab) => void
  // 장면을 누르면 그 장면의 첫 절로 옮기고 목차를 닫는다.
  onJump: (position: Position) => void
  onOpenEntity: (entity: Entity) => void
  onClose: () => void
}

const statusText: Record<SceneStatus, string> = { reading: '읽는 중', read: '읽음', unread: '' }

// 목차: 장마다 장면 목록과 읽은 진도, 그리고 인물 연표
export default function ContentsScreen({
  bundle,
  currentChapter,
  currentSceneId,
  sceneCharacters,
  readScenes,
  tab,
  onTabChange,
  onJump,
  onOpenEntity,
  onClose,
}: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  // 목록을 보여 줄 장. 장 칩을 누르면 바뀌기만 하고 읽는 곳은 옮기지 않는다.
  const [shownChapter, setShownChapter] = useState(currentChapter)
  const chapter = bundle.chapters.find((c) => c.chapter === shownChapter) ?? bundle.chapters[0]!
  const progress = chapterProgress(chapter.scenes, readScenes)
  const percent = progress.total ? (progress.read / progress.total) * 100 : 0

  return (
    <OverlayScreen title="목차" backLabel="목차 닫기" onBack={onClose}>
      <View style={[styles.tabs, { borderBottomColor: palette.line }]} accessibilityRole="tablist">
        <TabButton label="장면" selected={tab === 'scenes'} onPress={() => onTabChange('scenes')} />
        <TabButton label="연표" selected={tab === 'timeline'} onPress={() => onTabChange('timeline')} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        {tab === 'scenes' ? (
          <>
            <View style={styles.chips} accessibilityLabel="장 고르기">
              {bundle.chapters.map((c) => {
                const done = chapterProgress(c.scenes, readScenes).done
                const selected = c.chapter === chapter.chapter
                const current = c.chapter === currentChapter
                return (
                  <Pressable
                    key={c.chapter}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${c.chapter}장${current ? ', 읽는 중' : ''}${done ? ', 다 읽음' : ''}`}
                    onPress={() => setShownChapter(c.chapter)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected || current ? palette.accent : done ? 'transparent' : palette.line,
                        backgroundColor: selected ? palette.accent : done ? palette.okSoft : palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: selected ? palette.paper : current ? palette.accent : done ? palette.ok : palette.ink,
                        fontWeight: current ? '700' : '400',
                      }}
                    >
                      {c.chapter}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.summary}>
              <Text style={[styles.summaryTitle, { color: palette.ink }]}>
                {chapter.chapter}장 · 장면 {chapter.scenes.length}개 · {chapter.verses.length}절
              </Text>
              <Text style={[styles.summaryText, { color: palette.inkSoft }]}>
                읽은 장면 {progress.read} / {progress.total}
              </Text>
              <View
                style={[styles.progress, { backgroundColor: palette.line }]}
                accessibilityRole="progressbar"
                accessibilityLabel={`${chapter.chapter}장 읽은 장면`}
                accessibilityValue={{ min: 0, max: progress.total, now: progress.read }}
              >
                <View style={{ width: `${percent}%`, height: '100%', backgroundColor: palette.ok }} />
              </View>
            </View>

            {chapter.scenes.map((scene, index) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                number={index + 1}
                imageVersionId={bundle.defaultImageVersion}
                placeName={bundle.places.find((place) => place.id === scene.placeId)?.name ?? null}
                status={sceneStatus(scene.id, currentSceneId, readScenes)}
                onPress={() => onJump({ chapter: chapter.chapter, verse: scene.verseStart })}
              />
            ))}
          </>
        ) : (
          <TimelineView
            characters={bundle.characters}
            eras={bundle.eras}
            sceneCharacters={sceneCharacters}
            onOpenEntity={onOpenEntity}
          />
        )}
      </ScrollView>
    </OverlayScreen>
  )
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { palette } = useSettings()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, { borderBottomColor: selected ? palette.accent : 'transparent' }]}
    >
      <Text style={[styles.tabText, { color: selected ? palette.ink : palette.inkSoft }]}>{label}</Text>
    </Pressable>
  )
}

function SceneRow({
  scene,
  number,
  imageVersionId,
  placeName,
  status,
  onPress,
}: {
  scene: Scene
  number: number
  imageVersionId: string | null
  placeName: string | null
  status: SceneStatus
  onPress: () => void
}) {
  const { palette } = useSettings()
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const thumb = placeholderColors(hueOf(scene.id), palette)
  const verses = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}–${scene.verseEnd}절`
  const reading = status === 'reading'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${number}. ${scene.title}, ${verses}${statusText[status] ? `, ${statusText[status]}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        reading && { borderColor: palette.line, backgroundColor: palette.surface },
        pressed && { backgroundColor: palette.surface },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: thumb.background }]}>
        {image !== null ? (
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={[styles.thumbNumber, { color: thumb.text }]}>{number}</Text>
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: palette.ink }]} numberOfLines={1}>
          {scene.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.metaText, { color: palette.inkSoft }]}>{verses}</Text>
          {placeName ? (
            <View style={[styles.placeChip, { backgroundColor: palette.accentSoft }]}>
              <Icon name="pin" size={12} color={palette.accent} />
              <Text style={[styles.metaText, { color: palette.accent }]}>{placeName}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={[
          styles.status,
          { color: reading ? palette.accent : status === 'read' ? palette.ok : palette.inkFaint, fontWeight: reading ? '600' : '400' },
        ]}
      >
        {statusText[status]}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2 },
  tabText: { fontSize: 15, fontWeight: '600' },
  body: { padding: 16, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minWidth: 36, height: 36, paddingHorizontal: 8, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  summary: { marginTop: 16, marginBottom: 10, gap: 4 },
  summaryTitle: { fontFamily: fonts.serifBold, fontSize: 17 },
  summaryText: { fontSize: 13 },
  progress: { height: 4, marginTop: 4, borderRadius: 999, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbNumber: { fontWeight: '700', fontSize: 16 },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 15 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12 },
  placeChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6, paddingRight: 8, paddingVertical: 1, borderRadius: 999 },
  status: { fontSize: 12 },
})
```

- [ ] **Step 3: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile/src/reader
git commit -m "feat(mobile): 목차(장면 목록과 진도)와 인물 연표"
```

---

### Task 8: 여정 지도

**Files:**
- Create: `mobile/scripts/build-basemap.mts`, `mobile/src/map/basemap.generated.ts`(스크립트가 만듦, 커밋), `mobile/src/map/MapView.tsx`, `mobile/src/map/MapScreen.tsx`

- [ ] **Step 1: 바탕 지도 스크립트**

```ts path=mobile/scripts/build-basemap.mts
// Natural Earth 1:50m(퍼블릭 도메인)의 육지·호수·강을 근동 일대로 잘라 여정 지도의 바탕 SVG 경로로 바꾼다.
// 실행: npm run basemap -w mobile  →  src/map/basemap.generated.ts (만든 파일은 커밋한다)
import bboxClip from '@turf/bbox-clip'
import simplify from '@turf/simplify'
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { project } from 'reader-core'

// 서경 10도~동경 65도, 북위 5~50도: 다시스(스페인)부터 이란, 구스(에티오피아)부터 흑해까지
const BBOX: [number, number, number, number] = [-10, 5, 65, 50]
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
// 단순화 허용 오차(도). 폰 화면에서 가장 가까이 볼 때(경도 4.4도 폭)도 각이 보이지 않을 만큼
const TOLERANCE = 0.02

// 바다와 큰 강의 이름. 강 이름은 개역한글을 따른다.
const LABELS = [
  { text: '지중해', kind: 'sea', lng: 18, lat: 34.2 },
  { text: '홍해', kind: 'sea', lng: 38.6, lat: 20.5 },
  { text: '페르시아 만', kind: 'sea', lng: 51.2, lat: 27 },
  { text: '흑해', kind: 'sea', lng: 34.5, lat: 43.2 },
  { text: '카스피 해', kind: 'sea', lng: 50.6, lat: 41.8 },
  { text: '유브라데', kind: 'river', lng: 40.2, lat: 35.6 },
  { text: '힛데겔', kind: 'river', lng: 43.9, lat: 35.2 },
  { text: '나일', kind: 'river', lng: 31.9, lat: 26.8 },
] as const

type Shape = Polygon | MultiPolygon | LineString | MultiLineString

async function load(name: string): Promise<FeatureCollection<Shape>> {
  const response = await fetch(SOURCE + name)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return (await response.json()) as FeatureCollection<Shape>
}

const round = (value: number) => Math.round(value * 10) / 10

function point([lng, lat]: Position): string {
  const p = project(lng!, lat!)
  return `${round(p.x)} ${round(p.y)}`
}

function line(coordinates: Position[], close: boolean): string {
  return coordinates.length < 2 ? '' : `M${coordinates.map(point).join('L')}${close ? 'Z' : ''}`
}

// 잘라 낸 뒤 고리가 될 수 없는 조각(점 4개 미만)은 버린다.
const rings = (polygon: Position[][]) => polygon.filter((ring) => ring.length >= 4)

function toPath(feature: Feature<Shape>): string {
  const clipped = bboxClip(feature as Feature<Polygon | MultiPolygon | LineString | MultiLineString>, BBOX)
  const geometry = clipped.geometry as Shape
  if (geometry.type === 'Polygon') geometry.coordinates = rings(geometry.coordinates)
  if (geometry.type === 'MultiPolygon') geometry.coordinates = geometry.coordinates.map(rings).filter((polygon) => polygon.length > 0)
  if (geometry.type === 'MultiLineString') geometry.coordinates = geometry.coordinates.filter((part) => part.length >= 2)
  if (geometry.coordinates.length === 0) return ''

  let shape = geometry
  try {
    shape = simplify({ ...clipped, geometry } as Feature<Shape>, { tolerance: TOLERANCE }).geometry as Shape
  } catch {
    // 단순화할 수 없는 작은 조각은 그대로 쓴다.
  }
  switch (shape.type) {
    case 'Polygon':
      return rings(shape.coordinates).map((ring) => line(ring, true)).join('')
    case 'MultiPolygon':
      return shape.coordinates.flatMap(rings).map((ring) => line(ring, true)).join('')
    case 'LineString':
      return line(shape.coordinates, false)
    case 'MultiLineString':
      return shape.coordinates.map((part) => line(part, false)).join('')
  }
}

const paths = (collection: FeatureCollection<Shape>) => collection.features.map(toPath).join('')

const [land, lakes, rivers] = await Promise.all([
  load('ne_50m_land.geojson'),
  load('ne_50m_lakes.geojson'),
  load('ne_50m_rivers_lake_centerlines.geojson'),
])

const [west, south, east, north] = BBOX
const topLeft = project(west, north)
const bottomRight = project(east, south)
const basemap = {
  bounds: { minX: round(topLeft.x), minY: round(topLeft.y), maxX: round(bottomRight.x), maxY: round(bottomRight.y) },
  land: paths(land),
  lakes: paths(lakes),
  rivers: paths(rivers),
  labels: LABELS.map(({ text, kind, lng, lat }) => {
    const p = project(lng, lat)
    return { text, kind, x: round(p.x), y: round(p.y) }
  }),
}

const out = path.resolve(import.meta.dirname, '../src/map/basemap.generated.ts')
await writeFile(
  out,
  [
    '// npm run basemap -w mobile이 만든다. 고치지 말 것.',
    '// Natural Earth 1:50m 육지·호수·강(퍼블릭 도메인, https://www.naturalearthdata.com), 서경 10도~동경 65도, 북위 5~50도.',
    "// 좌표는 reader-core의 project()(북위 33도 기준 등장방형, 위도 1도 = 10단위)로 바꾼 값이다.",
    "export type BasemapLabel = { text: string; kind: 'sea' | 'river'; x: number; y: number }",
    `export const BASEMAP: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; land: string; lakes: string; rivers: string; labels: BasemapLabel[] } = ${JSON.stringify(basemap)}`,
    '',
  ].join('\n'),
)
const kb = (text: string) => `${Math.round(text.length / 1024)}KB`
console.log(`바탕 지도: 육지 ${kb(basemap.land)}, 호수 ${kb(basemap.lakes)}, 강 ${kb(basemap.rivers)} → ${out}`)
```

Run: `npm run basemap -w mobile`
Expected: `바탕 지도: 육지 …KB, 호수 …KB, 강 …KB` 출력, 합계 300KB 안쪽. `v5.1.2` 태그가 없으면 `SOURCE`의 태그를 `master`로 바꿔 다시 돌린다.

- [ ] **Step 2: 지도 그리기**

```tsx path=mobile/src/map/MapView.tsx
import { memo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg'
import {
  clampCamera,
  panCamera,
  project,
  SPAN_DEGREES,
  spanOf,
  viewBoxOf,
  zoomCamera,
  type Camera,
  type MapPoint,
  type MappedPlace,
  type Route,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import type { Palette } from '../theme/palette'
import { BASEMAP } from './basemap.generated'

// 가장 가까이(경도 4.4도 폭)부터 가장 멀리(경도 70도 폭)까지 본다.
export const CAMERA_LIMITS = { minSpan: spanOf(SPAN_DEGREES.closest), maxSpan: spanOf(70) }

export function clampToBasemap(camera: Camera): Camera {
  return clampCamera(camera, BASEMAP.bounds, CAMERA_LIMITS)
}

export function placeLabel(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

type Props = {
  route: Route
  camera: Camera
  onCameraChange: (camera: Camera) => void
  // 사용자가 지도를 끌거나 벌렸을 때
  onInteract?: () => void
  // 화면 비율(세로 ÷ 가로)을 알게 되면 알린다.
  onAspect?: (aspect: number) => void
}

// 바탕 지도(Natural Earth)와 지나온 길을 SVG로 그린다. 한 손가락으로 끌고 두 손가락으로 벌려 확대한다.
export default function MapView({ route, camera, onCameraChange, onInteract, onAspect }: Props) {
  const { palette } = useSettings()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const last = useRef({ x: 0, y: 0, scale: 1 })
  const aspect = size.width > 0 ? size.height / size.width : 1
  // 화면 1px이 지도 몇 단위인지. 선 굵기와 글자 크기를 화면 기준으로 고정하는 데 쓴다.
  const unit = size.width > 0 ? camera.span / size.width : 1

  function apply(next: Camera) {
    const clamped = clampToBasemap(next)
    cameraRef.current = clamped
    onCameraChange(clamped)
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .onStart(() => {
      last.current.x = 0
      last.current.y = 0
      onInteract?.()
    })
    .onUpdate((event) => {
      const dx = event.translationX - last.current.x
      const dy = event.translationY - last.current.y
      last.current.x = event.translationX
      last.current.y = event.translationY
      apply(panCamera(cameraRef.current, dx, dy, size.width))
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      last.current.scale = 1
      onInteract?.()
    })
    .onUpdate((event) => {
      const factor = event.scale / last.current.scale
      last.current.scale = event.scale
      const focus = size.width > 0 ? { fx: event.focalX / size.width, fy: event.focalY / size.height } : undefined
      apply(zoomCamera(cameraRef.current, factor, aspect, focus))
    })

  const view = viewBoxOf(camera, aspect)

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View
        style={styles.canvas}
        accessibilityLabel="지나온 장소를 표시한 지도"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setSize({ width, height })
          if (width > 0) onAspect?.(height / width)
        }}
      >
        {size.width > 0 && (
          <Svg width={size.width} height={size.height} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}>
            <Basemap palette={palette} unit={unit} />
            <RouteLayer route={route} palette={palette} unit={unit} />
          </Svg>
        )}
      </View>
    </GestureDetector>
  )
}

const Basemap = memo(function Basemap({ palette, unit }: { palette: Palette; unit: number }) {
  const { bounds } = BASEMAP
  const margin = 2000
  return (
    <G>
      <Rect
        x={bounds.minX - margin}
        y={bounds.minY - margin}
        width={bounds.maxX - bounds.minX + margin * 2}
        height={bounds.maxY - bounds.minY + margin * 2}
        fill={palette.mapSea}
      />
      <Path d={BASEMAP.land} fill={palette.mapLand} fillRule="evenodd" />
      <Path d={BASEMAP.lakes} fill={palette.mapSea} />
      <Path d={BASEMAP.rivers} fill="none" stroke={palette.mapRiver} strokeWidth={1.2 * unit} strokeLinecap="round" strokeLinejoin="round" />
      {BASEMAP.labels.map((label) => (
        <SvgText
          key={label.text}
          x={label.x}
          y={label.y}
          fontSize={(label.kind === 'sea' ? 13 : 11) * unit}
          fontStyle="italic"
          fill={palette.mapLabel}
          textAnchor="middle"
        >
          {label.text}
        </SvgText>
      ))}
    </G>
  )
})

function at(place: MappedPlace): MapPoint {
  return project(place.lng, place.lat)
}

function RouteLayer({ route, palette, unit }: { route: Route; palette: Palette; unit: number }) {
  const { visited, current, next } = route
  // 같은 장소를 다시 지나가도 이름은 한 번만 쓴다. 현재 위치의 이름이 우선이다.
  const labeled = new Set<string>(current ? [current.id] : [])
  const dots = visited.slice(0, -1).map((place, index) => {
    const show = !labeled.has(place.id)
    labeled.add(place.id)
    return { place, show, key: `${place.id}-${index}` }
  })
  const showNext = next !== null && !labeled.has(next.id)

  return (
    <G>
      {visited.length > 1 && (
        <Polyline
          points={visited.map((place) => `${at(place).x},${at(place).y}`).join(' ')}
          fill="none"
          stroke={palette.accent}
          strokeWidth={4 * unit}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {current && next && (
        <Polyline
          points={`${at(current).x},${at(current).y} ${at(next).x},${at(next).y}`}
          fill="none"
          stroke={palette.accent}
          strokeWidth={3 * unit}
          strokeDasharray={`${6 * unit} ${8 * unit}`}
          opacity={0.6}
        />
      )}
      {dots.map(({ place, show, key }) => (
        <G key={key}>
          <Circle cx={at(place).x} cy={at(place).y} r={5 * unit} fill={palette.accent} />
          {show && <PlaceLabel text={placeLabel(place)} point={at(place)} below unit={unit} palette={palette} />}
        </G>
      ))}
      {next && (
        <G>
          <Circle cx={at(next).x} cy={at(next).y} r={5 * unit} fill="none" stroke={palette.accent} strokeWidth={2 * unit} opacity={0.6} />
          {showNext && <PlaceLabel text={placeLabel(next)} point={at(next)} below unit={unit} palette={palette} />}
        </G>
      )}
      {current && (
        <G>
          <Circle cx={at(current).x} cy={at(current).y} r={14 * unit} fill={palette.accent} opacity={0.2} />
          <Circle cx={at(current).x} cy={at(current).y} r={7 * unit} fill={palette.accent} stroke="#ffffff" strokeWidth={2 * unit} />
          <PlaceLabel text={placeLabel(current)} point={at(current)} unit={unit} palette={palette} strong />
        </G>
      )}
    </G>
  )
}

// 장소 이름. 바탕색 테두리를 먼저 굵게 그려 지도 위에서도 읽히게 한다.
function PlaceLabel({
  text,
  point,
  unit,
  palette,
  below = false,
  strong = false,
}: {
  text: string
  point: MapPoint
  unit: number
  palette: Palette
  below?: boolean
  strong?: boolean
}) {
  const y = below ? point.y + 20 * unit : point.y - 14 * unit
  const fontSize = (strong ? 15 : 12) * unit
  const weight = strong ? '700' : '400'
  return (
    <G>
      <SvgText
        x={point.x}
        y={y}
        fontSize={fontSize}
        fontWeight={weight}
        textAnchor="middle"
        fill={palette.halo}
        stroke={palette.halo}
        strokeWidth={4 * unit}
        strokeLinejoin="round"
      >
        {text}
      </SvgText>
      <SvgText x={point.x} y={y} fontSize={fontSize} fontWeight={weight} textAnchor="middle" fill={palette.ink}>
        {text}
      </SvgText>
    </G>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
})
```

- [ ] **Step 3: 지도 화면(장소 전환 안내 포함)**

```tsx path=mobile/src/map/MapScreen.tsx
import { useEffect, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  cameraAt,
  fitCamera,
  flashTiming,
  flyCamera,
  project,
  REGION_CAMERA,
  SPAN_DEGREES,
  spanOf,
  zoomCamera,
  type Camera,
  type PlaceChange,
  type Route,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { RoundButton } from '../ui/IconButton'
import { OverlayHeader } from '../ui/OverlayScreen'
import { useReduceMotion } from '../ui/useReduceMotion'
import MapView, { clampToBasemap, placeLabel } from './MapView'

type Props = {
  route: Route
  // 장면이 바뀌어 장소가 달라져서 저절로 열렸을 때 그 변화. 지도가 이전 장소에서 새 장소로 날아간 뒤 잠시 머물고 저절로 닫힌다.
  // 그동안 지도를 만지면 닫히지 않고 그대로 남는다.
  auto: PlaceChange | null
  onClose: () => void
}

// 지나온 장소와 다음 장소가 모두 보이는 범위
function routeCamera(route: Route, aspect: number): Camera {
  const points = [...route.visited, ...(route.next ? [route.next] : [])].map((place) => project(place.lng, place.lat))
  return fitCamera(points, aspect, {
    padding: 0.15,
    minSpan: spanOf(SPAN_DEGREES.closest),
    single: spanOf(SPAN_DEGREES.place),
    empty: REGION_CAMERA,
  })
}

function startCamera(auto: PlaceChange): Camera {
  return auto.from ? cameraAt(auto.from.lng, auto.from.lat, SPAN_DEGREES.from) : REGION_CAMERA
}

export default function MapScreen({ route, auto, onClose }: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const reduce = useReduceMotion()
  const [camera, setCamera] = useState<Camera>(() => (auto ? startCamera(auto) : REGION_CAMERA))
  const [aspect, setAspect] = useState(1)
  // 사용자가 지도를 만져서 저절로 닫히지 않게 됨
  const [pinned, setPinned] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const frame = useRef<number | null>(null)
  const fitted = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // 단추로 연 지도는 화면 비율을 안 뒤 한 번 지나온 길에 맞춘다.
  function handleAspect(next: number) {
    setAspect(next)
    if (!auto && !fitted.current) {
      fitted.current = true
      setCamera(clampToBasemap(routeCamera(route, next)))
    }
  }

  // 저절로 열렸을 때: 이전 장소(없으면 넓은 범위)를 잠깐 보여 준 뒤 새 장소로 날아간다. 동작 줄이기면 바로 옮긴다.
  useEffect(() => {
    if (!auto) return
    const timing = flashTiming(reduce)
    const from = startCamera(auto)
    const to = cameraAt(auto.to.lng, auto.to.lat, SPAN_DEGREES.place)
    const lead = setTimeout(() => {
      if (timing.fly === 0) {
        setCamera(to)
        return
      }
      const began = Date.now()
      const step = () => {
        const t = Math.min(1, (Date.now() - began) / timing.fly)
        setCamera(flyCamera(from, to, t))
        frame.current = t < 1 ? requestAnimationFrame(step) : null
      }
      frame.current = requestAnimationFrame(step)
    }, timing.lead)
    return () => {
      clearTimeout(lead)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [auto, reduce])

  // 도착 후 잠시 머물다가 사라진다. 사용자가 만지면 멈춘다.
  useEffect(() => {
    if (!auto || pinned) return
    const timing = flashTiming(reduce)
    const arrive = timing.lead + timing.fly
    const fade = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: timing.fade, useNativeDriver: Platform.OS !== 'web' }).start()
    }, arrive + timing.hold)
    const close = setTimeout(() => closeRef.current(), arrive + timing.hold + timing.fade)
    return () => {
      clearTimeout(fade)
      clearTimeout(close)
    }
  }, [auto, pinned, reduce, opacity])

  function pin() {
    if (!auto || pinned) return
    setPinned(true)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    opacity.stopAnimation()
    opacity.setValue(1)
  }

  function zoom(factor: number) {
    pin()
    setCamera((current) => clampToBasemap(zoomCamera(current, factor, aspect)))
  }

  const { current } = route
  const note =
    auto && !pinned
      ? '장소가 바뀌어 잠시 보여 드려요. 곧 닫히고, 지도를 만지면 그대로 열려 있어요.'
      : '오늘날의 해안선과 강 위에 표시했어요. 추정 위치는 정확하지 않을 수 있어요.'

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.paper, paddingTop: insets.top, opacity }]}
      accessibilityViewIsModal
      onStartShouldSetResponderCapture={() => {
        pin()
        return false
      }}
    >
      <OverlayHeader title="여정 지도" backLabel="지도 닫기" onBack={onClose} />

      <View style={styles.canvas}>
        <MapView route={route} camera={camera} onCameraChange={setCamera} onInteract={pin} onAspect={handleAspect} />
        <View style={styles.zoom}>
          <RoundButton name="plus" label="지도 확대" onPress={() => zoom(1.6)} />
          <RoundButton name="minus" label="지도 축소" onPress={() => zoom(1 / 1.6)} />
        </View>
      </View>

      {current ? (
        <View style={styles.info}>
          <Text style={[styles.infoLabel, { color: palette.inkFaint }]}>{auto ? '새 장소' : '지금 위치'}</Text>
          <Text style={[styles.infoName, { color: palette.ink }]}>
            {auto?.from ? <Text style={{ color: palette.inkSoft }}>{placeLabel(auto.from)} → </Text> : null}
            {placeLabel(current)}
          </Text>
          {current.description ? (
            <Text style={[styles.infoDescription, { color: palette.inkSoft }]}>{current.description}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.info, styles.empty, { color: palette.inkFaint }]}>아직 지도에 표시할 장소가 없어요</Text>
      )}
      <Text
        style={[styles.note, { color: palette.inkFaint, paddingBottom: 12 + insets.bottom }]}
        accessibilityLiveRegion={auto ? 'polite' : 'none'}
      >
        {note}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  zoom: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  info: { paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  infoLabel: { fontSize: 12 },
  infoName: { fontFamily: fonts.serif, fontSize: 18 },
  infoDescription: { fontSize: 14, lineHeight: 22.4 },
  empty: { fontSize: 14 },
  note: { paddingTop: 12, paddingHorizontal: 16, fontSize: 12 },
})
```

- [ ] **Step 4: 형 검사와 커밋**

Run: `npm run typecheck -w mobile` → 오류 없음

```bash
git add mobile/scripts/build-basemap.mts mobile/src/map mobile/package.json package-lock.json
git commit -m "feat(mobile): Natural Earth 바탕 지도를 SVG로 그린 여정 지도와 장소 전환 안내"
```

---

### Task 9: 읽기 화면

**Files:**
- Create: `mobile/src/reader/{useNarration,ScenePane,VersePane,ReaderScreen}.tsx|ts`
- Modify: `mobile/src/app/_layout.tsx`, `mobile/src/app/read.tsx`

- [ ] **Step 1: 낭독**

```ts path=mobile/src/reader/useNarration.ts
import { useAudioPlayer } from 'expo-audio'
import { useCallback, useEffect, useRef, useState } from 'react'

// 절 단위 낭독 파일(파이프라인 tts 단계가 만든 mp3)을 이어 재생한다.
// onVerseEnd: 한 절을 다 읽었을 때 불린다. 이어 읽을 절의 음성을 돌려주면 계속 읽고, null이면 멈춘다.
// rate: 낭독 속도(1이 보통). 재생을 시작할 때와 값이 바뀔 때 적용한다.
// 화면을 꺼도 이어 읽는 백그라운드 재생과 잠금 화면 조작은 4단계에서 더한다.
export function useNarration(onVerseEnd: () => number | null, rate = 1) {
  const player = useAudioPlayer(null)
  const [playing, setPlaying] = useState(false)
  const onVerseEndRef = useRef(onVerseEnd)
  const rateRef = useRef(rate)

  useEffect(() => {
    onVerseEndRef.current = onVerseEnd
  })

  useEffect(() => {
    rateRef.current = rate
    player.setPlaybackRate(rate)
  }, [rate, player])

  const stop = useCallback(() => {
    player.pause()
    setPlaying(false)
  }, [player])

  const play = useCallback(
    (source: number) => {
      player.replace(source)
      player.setPlaybackRate(rateRef.current)
      player.play()
      setPlaying(true)
    },
    [player],
  )

  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (!status.didJustFinish) return
      const next = onVerseEndRef.current()
      if (next !== null) play(next)
      else stop()
    })
    return () => subscription.remove()
  }, [player, play, stop])

  return { playing, play, stop }
}
```

- [ ] **Step 2: 장면 그림**

```tsx path=mobile/src/reader/ScenePane.tsx
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hueOf, type ReviewStatus, type Scene, type Verse } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors } from '../theme/palette'
import { RoundButton } from '../ui/IconButton'

const badgeText: Partial<Record<ReviewStatus, string>> = { draft: '검수 전', flagged: '확인 필요' }

// 이 글자 수보다 긴 절은 자막 글자를 줄여 그림 위에 다 들어가게 한다.
const longVerse = 60
// 그림을 이만큼(px) 옆으로 밀면 다음·이전 장면으로 넘어간다.
const swipeDistance = 60

type Props = {
  scene: Scene
  imageVersionId: string | null
  sceneNumber: number
  sceneCount: number
  verse: Verse | undefined
  playing: boolean
  canPlay: boolean
  onTogglePlay: () => void
  onOpenMap: () => void
  onOpenSheet: () => void
  // 1이면 다음 장면, -1이면 이전 장면
  onSwipe: (direction: 1 | -1) => void
}

// 화면 위쪽 절반: 장면 그림, 지도·해설·낭독·자막 단추, 그림 위 자막과 장면 제목
export default function ScenePane({
  scene,
  imageVersionId,
  sceneNumber,
  sceneCount,
  verse,
  playing,
  canPlay,
  onTogglePlay,
  onOpenMap,
  onOpenSheet,
  onSwipe,
}: Props) {
  const { palette, verseScale, subtitles, setSubtitles } = useSettings()
  const insets = useSafeAreaInsets()
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), palette)
  const badge = badgeText[scene.reviewStatus]
  // 소리가 없는 절에서는 재생 단추를 흐리게 둔다.
  const playDisabled = !playing && !canPlay
  const long = (verse?.text.length ?? 0) > longVerse
  const subtitleSize = (long ? 14 : 16) * verseScale

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      if (event.translationX <= -swipeDistance) onSwipe(1)
      else if (event.translationX >= swipeDistance) onSwipe(-1)
    })

  return (
    <GestureDetector gesture={swipe}>
      <View style={[styles.pane, { backgroundColor: palette.accentSoft }]}>
        {image !== null ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={{ duration: 450, effect: 'cross-dissolve' }}
            accessibilityLabel={`${scene.title}. 옆으로 밀면 다른 장면으로 넘어가요`}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: placeholder.background }]}>
            <Text style={[styles.placeholderText, { color: placeholder.text }]}>그림 준비 중</Text>
          </View>
        )}

        {/* 상태 표시줄 글자가 밝은 그림 위에서도 보이게 위쪽을 살짝 어둡게 한다. */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0)']}
          style={[styles.topShade, { height: insets.top + 28 }]}
          pointerEvents="none"
        />

        <View style={[styles.leftButtons, { top: insets.top + 12 }]}>
          <RoundButton name="map" label="여정 지도 보기" onPress={onOpenMap} />
          <RoundButton name="question" label="이 장면 해설 보기" onPress={onOpenSheet} />
        </View>

        <View style={[styles.rightButtons, { top: insets.top + 12 }]}>
          {playing && <Text style={styles.aiVoice}>AI 음성</Text>}
          <RoundButton
            name={playing ? 'pause' : 'play'}
            label={playing ? 'AI 음성 읽기 멈춤' : 'AI 음성으로 듣기'}
            disabled={playDisabled}
            onPress={onTogglePlay}
          />
          <RoundButton name="subtitles" label="그림 위 자막" toggled={subtitles} onPress={() => setSubtitles(!subtitles)} />
        </View>

        <LinearGradient colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.45)']} style={styles.bottom} pointerEvents="none">
          {subtitles && verse ? (
            <View style={styles.subtitle}>
              <Text style={[styles.subtitleText, { fontSize: subtitleSize, lineHeight: subtitleSize * (long ? 1.5 : 1.55) }]}>
                <Text style={styles.subtitleNumber}>{verse.verse} </Text>
                {verse.text}
              </Text>
            </View>
          ) : null}
          <View style={styles.caption}>
            <Text style={styles.title} numberOfLines={1}>
              {scene.title}
            </Text>
            <View style={styles.meta}>
              {badge ? <Text style={[styles.badge, { backgroundColor: palette.warnSoft, color: palette.warn }]}>{badge}</Text> : null}
              <Text style={styles.count}>
                {sceneNumber} / {sceneCount}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  pane: { flex: 1, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 13 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  leftButtons: { position: 'absolute', left: 12, gap: 8 },
  rightButtons: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiVoice: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color: '#ffffff',
    fontSize: 11,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 20 },
  subtitle: { marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  subtitleText: {
    color: '#ffffff',
    fontFamily: fonts.serif,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitleNumber: { fontFamily: fonts.sans, fontSize: 11, opacity: 0.8 },
  caption: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  title: { flex: 1, color: '#ffffff', fontFamily: fonts.serif, fontSize: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  count: { color: '#ffffff', fontSize: 12 },
})
```

- [ ] **Step 3: 본문**

```tsx path=mobile/src/reader/VersePane.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  findActiveIndex,
  findSceneIndex,
  splitVerse,
  type Chapter,
  type Character,
  type Entity,
  type Gloss,
  type Place,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

// 스크롤 영역의 위에서 이만큼 내려온 곳이 기준선이다. 기준선에 걸린 절이 지금 절이다.
const lineOffset = 24

type Props = {
  chapter: Chapter
  // 다음 장 번호. 마지막 장이면 undefined
  nextChapter: number | undefined
  verse: number
  // 낭독 중에는 스크롤이 지금 절을 따라가고, 스크롤로 지금 절을 바꾸지 않는다.
  following: boolean
  onVerseChange: (verse: number) => void
  onChapterChange: (chapter: number) => void
  // 본문의 인물·장소 이름을 이을 때 쓴다.
  characters: Character[]
  places: Place[]
  onOpenEntity: (entity: Entity) => void
  onOpenContents: () => void
  onOpenSettings: () => void
  onOpenChapters: () => void
}

// 화면 아래쪽 절반: 장의 본문. 장이나 이동(목차, 장면 넘기기)이 바뀌면 ReaderScreen이 key로 새로 그린다.
export default function VersePane({
  chapter,
  nextChapter,
  verse,
  following,
  onVerseChange,
  onChapterChange,
  characters,
  places,
  onOpenEntity,
  onOpenContents,
  onOpenSettings,
  onOpenChapters,
}: Props) {
  const { palette, verseScale } = useSettings()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  // 장면 블록의 위치(스크롤 내용 기준)와 절의 위치(블록 기준)
  const blockTops = useRef(new Map<string, number>())
  const verseTops = useRef(new Map<number, number>())
  const [viewport, setViewport] = useState(0)
  // 본문에서 누른 낱말의 풀이. 다른 낱말을 누르면 바뀌고, 닫기를 누르면 사라진다.
  const [openGloss, setOpenGloss] = useState<Gloss | null>(null)
  // 처음 그릴 때 지금 절로 한 번 옮겼는지
  const placed = useRef(false)
  const initialVerse = useRef(verse)

  const blocks = useMemo(
    () =>
      chapter.scenes.map((scene) => ({
        scene,
        verses: chapter.verses.filter((v) => v.verse >= scene.verseStart && v.verse <= scene.verseEnd),
      })),
    [chapter],
  )
  // 화면에 놓인 순서대로의 절 번호
  const order = useMemo(() => blocks.flatMap((block) => block.verses.map((v) => v.verse)), [blocks])
  const activeScene = findSceneIndex(chapter.scenes, verse)

  const topOf = useCallback(
    (number: number): number | null => {
      const scene = chapter.scenes.find((item) => number >= item.verseStart && number <= item.verseEnd)
      const block = scene ? blockTops.current.get(scene.id) : undefined
      const inner = verseTops.current.get(number)
      return block === undefined || inner === undefined ? null : block + inner
    },
    [chapter.scenes],
  )

  // 절을 기준선에 맞추는 스크롤 위치. 첫 절이면 맨 위다.
  const scrollYFor = useCallback(
    (number: number): number | null => {
      if (number === order[0]) return 0
      const top = topOf(number)
      return top === null ? null : Math.max(0, top - lineOffset + 1)
    },
    [order, topOf],
  )

  // 모든 블록과 절의 자리를 잰 뒤 한 번만 지금 절로 옮긴다.
  function placeInitially() {
    if (placed.current || blockTops.current.size < blocks.length || verseTops.current.size < order.length) return
    placed.current = true
    const y = scrollYFor(initialVerse.current)
    if (y !== null && y > 0) scrollRef.current?.scrollTo({ y, animated: false })
  }

  // 낭독 중에는 지금 절이 바뀔 때마다 기준선까지 부드럽게 따라간다.
  useEffect(() => {
    if (!following || !placed.current) return
    const y = scrollYFor(verse)
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: true })
  }, [following, verse, scrollYFor])

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (following || !placed.current) return
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
    const offsets = order.map((number) => topOf(number) ?? 0)
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 1
    const next = order[findActiveIndex(offsets, contentOffset.y, lineOffset, atBottom)]
    if (next !== undefined && next !== verse) onVerseChange(next)
  }

  const size = 17 * verseScale

  return (
    <View style={[styles.pane, { backgroundColor: palette.paper }]}>
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`장 고르기. 지금 창세기 ${chapter.chapter}장`}
          onPress={onOpenChapters}
          style={styles.chapterButton}
        >
          <Text style={[styles.chapterText, { color: palette.ink }]}>창세기 {chapter.chapter}장</Text>
          <Icon name="chevronDown" size={16} color={palette.inkSoft} />
        </Pressable>
        <View style={styles.headerButtons}>
          <IconButton name="list" label="목차" color={palette.ink} onPress={onOpenContents} />
          <IconButton name="gear" label="읽기 설정" color={palette.ink} onPress={onOpenSettings} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
      >
        {blocks.map(({ scene, verses }, index) => {
          const active = index === activeScene
          return (
            <View
              key={scene.id}
              onLayout={(event) => {
                blockTops.current.set(scene.id, event.nativeEvent.layout.y)
                placeInitially()
              }}
              style={[styles.block, { borderLeftColor: active ? palette.accent : 'transparent' }]}
            >
              {verses.map((v) => {
                const parts = splitVerse(
                  v.text,
                  scene.glossary.filter((gloss) => gloss.verse === v.verse),
                  chapter.chapter,
                  characters,
                  places,
                )
                return (
                  <View
                    key={v.verse}
                    onLayout={(event) => {
                      verseTops.current.set(v.verse, event.nativeEvent.layout.y)
                      placeInitially()
                    }}
                    style={[styles.verseBox, v.verse === verse && { backgroundColor: palette.accentSoft }]}
                  >
                    <Text
                      style={[styles.verse, { fontSize: size, lineHeight: size * 1.75, color: active ? palette.ink : palette.inkSoft }]}
                    >
                      <Text style={[styles.verseNumber, { color: palette.accent }]}>{v.verse} </Text>
                      {parts.map((part, partIndex) => {
                        const { gloss, entity } = part
                        if (gloss) {
                          return (
                            <Text
                              key={partIndex}
                              accessibilityRole="button"
                              accessibilityLabel={`${part.text} 뜻 보기`}
                              onPress={() => setOpenGloss(gloss)}
                              style={[styles.gloss, { textDecorationColor: palette.accent }]}
                            >
                              {part.text}
                            </Text>
                          )
                        }
                        if (entity) {
                          return (
                            <Text
                              key={partIndex}
                              accessibilityRole="button"
                              accessibilityLabel={`${part.text} ${entity.kind === 'place' ? '장소' : '인물'} 카드 보기`}
                              onPress={() => onOpenEntity(entity)}
                              style={[styles.name, { textDecorationColor: palette.accent }]}
                            >
                              {part.text}
                            </Text>
                          )
                        }
                        return <Text key={partIndex}>{part.text}</Text>
                      })}
                    </Text>
                  </View>
                )
              })}
            </View>
          )
        })}

        {nextChapter !== undefined && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChapterChange(nextChapter)}
            style={[styles.nextChapter, { borderColor: palette.line, backgroundColor: palette.surface }]}
          >
            <Text style={[styles.nextChapterText, { color: palette.ink }]}>창세기 {nextChapter}장으로</Text>
          </Pressable>
        )}

        {/* 마지막 절도 기준선까지 올라올 수 있도록 끝에 빈 공간을 둔다. */}
        <View style={{ height: Math.max(0, viewport - lineOffset) }} />
      </ScrollView>

      {openGloss && (
        <View
          style={[styles.glossCard, { backgroundColor: palette.surface, bottom: 12 + insets.bottom }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.glossBody, { color: palette.ink }]}>
            <Text style={[styles.glossWord, { color: palette.accent }]}>{openGloss.word} </Text>
            {openGloss.meaning}
          </Text>
          <IconButton name="close" label="낱말 풀이 닫기" color={palette.ink} onPress={() => setOpenGloss(null)} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10 },
  chapterText: { fontSize: 15, fontWeight: '600' },
  headerButtons: { flexDirection: 'row' },
  scroll: { flex: 1 },
  content: { paddingTop: 8, paddingHorizontal: 14 },
  block: { paddingVertical: 10, paddingLeft: 12, borderLeftWidth: 2 },
  verseBox: { marginBottom: 8, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  verse: { fontFamily: fonts.serif },
  verseNumber: { fontFamily: fonts.sans, fontSize: 11 },
  gloss: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  name: { textDecorationLine: 'underline', textDecorationStyle: 'solid' },
  nextChapter: { marginTop: 16, padding: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center' },
  nextChapterText: { fontSize: 15, fontWeight: '600' },
  glossCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  glossBody: { flex: 1, paddingTop: 8, fontSize: 14, lineHeight: 21.7 },
  glossWord: { fontWeight: '700' },
})
```

- [ ] **Step 4: 읽기 화면 조립**

```tsx path=mobile/src/reader/ReaderScreen.tsx
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import {
  adjacentScenePosition,
  buildRoute,
  findSceneIndex,
  initialPosition,
  loadPosition,
  loadReadScenes,
  markRead,
  nextPosition,
  placeChange,
  savePosition,
  saveReadScenes,
  startOfChapter,
  verseAt,
  type Bundle,
  type Entity,
  type PlaceChange,
  type Position,
} from 'reader-core'
import { audioSource } from '../content/bundle'
import MapScreen from '../map/MapScreen'
import { useSettings } from '../settings/SettingsContext'
import { kv } from '../storage/kv'
import BackgroundSheet from './BackgroundSheet'
import ChapterPicker from './ChapterPicker'
import ContentsScreen, { type ContentsTab } from './ContentsScreen'
import EntityCard from './EntityCard'
import ScenePane from './ScenePane'
import SettingsSheet from './SettingsSheet'
import { useNarration } from './useNarration'
import VersePane from './VersePane'

// entity의 back: 목차(연표)에서 연 카드면 닫을 때 목차로 돌아간다.
type Overlay =
  | 'none'
  | 'map'
  | 'sheet'
  | 'contents'
  | 'settings'
  | 'chapters'
  | { kind: 'entity'; entity: Entity; back: 'contents' | null }

// 읽기 화면: 위에 장면 그림, 아래에 본문. 웹 목업 ReaderScreen과 같은 흐름이다.
export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  const { settings, palette } = useSettings()
  // 지금 읽는 곳은 절 단위로 들고, 장면은 절에서 정한다.
  const [position, setPosition] = useState(() => initialPosition(bundle.chapters, loadPosition(kv)))
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [readScenes, setReadScenes] = useState(() => loadReadScenes(kv))
  const [contentsTab, setContentsTab] = useState<ContentsTab>('scenes')
  // 목차·장면 넘기기로 옮길 때마다 늘려 본문을 새로 그린다. 그래야 같은 장 안에서도 그 절로 스크롤한다.
  const [jumpCount, setJumpCount] = useState(0)
  // 장면이 바뀌면서 장소가 달라지면 여정 지도를 저절로 열어 새 장소로 옮긴 뒤 닫는다. 그때의 변화를 든다.
  const [autoMap, setAutoMap] = useState<PlaceChange | null>(null)
  // 마지막으로 장소가 있던 장면의 장소 id. undefined는 아직 첫 장면도 보지 않은 상태라 처음 열 때는 지도를 열지 않는다.
  const previousPlaceRef = useRef<string | null | undefined>(undefined)

  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const sceneIndex = findSceneIndex(chapter.scenes, position.verse)
  const scene = chapter.scenes[sceneIndex]!
  const verse = verseAt(bundle.chapters, position)
  const audio = audioSource(verse?.audio)
  const route = useMemo(() => buildRoute(bundle.chapters, bundle.places, scene.id), [bundle, scene.id])
  const nextChapter = bundle.chapters.find((c) => c.chapter > chapter.chapter && c.verses.length > 0)?.chapter

  // 한 절을 다 읽으면 다음 절(장의 끝이면 다음 장의 첫 절)로 넘어가 이어 읽는다.
  const narration = useNarration(() => {
    const next = nextPosition(bundle.chapters, position.chapter, position.verse)
    if (!next) return null
    setPosition(next)
    return audioSource(verseAt(bundle.chapters, next)?.audio)
  }, settings.speed)

  useEffect(() => {
    savePosition(kv, position)
  }, [position])

  // 장면의 마지막 절까지 오면 그 장면을 읽은 것으로 적는다.
  useEffect(() => {
    if (position.verse >= scene.verseEnd) setReadScenes((current) => markRead(current, scene.id))
  }, [position, scene.id, scene.verseEnd])

  useEffect(() => {
    saveReadScenes(kv, readScenes)
  }, [readScenes])

  // 다른 덮개(해설 시트 등)를 보고 있을 때는 끼어들지 않는다. 설정에서 껐으면 열지 않는다.
  useEffect(() => {
    const previous = previousPlaceRef.current
    if (scene.placeId !== null || previous === undefined) previousPlaceRef.current = scene.placeId
    if (previous === undefined || !settings.placeFlash) return
    const change = placeChange(bundle.places, previous, scene.placeId)
    if (!change || (overlay !== 'none' && overlay !== 'map')) return
    // 출발 장소는 여정에서 바로 앞의 장소다. 장을 건너뛰어 왔거나 장소 없는 장면에서 열어도 여정을 따라 날아간다.
    const from = route.visited.length >= 2 ? route.visited[route.visited.length - 2]! : change.from
    setAutoMap({ ...change, from })
    setOverlay('map')
  }, [scene.id, scene.placeId, bundle.places, overlay, route, settings.placeFlash])

  function openOverlay(next: Exclude<Overlay, 'none'>) {
    setAutoMap(null)
    setOverlay(next)
  }

  // 목차에서 연 인물 카드는 닫으면 목차로 돌아가고, 나머지는 모두 닫힌다.
  function closeOverlay() {
    setAutoMap(null)
    if (typeof overlay === 'object' && overlay.back === 'contents') setOverlay('contents')
    else setOverlay('none')
  }

  // 안드로이드 뒤로 가기는 열린 덮개를 닫는다.
  useEffect(() => {
    if (overlay === 'none') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeOverlay()
      return true
    })
    return () => subscription.remove()
    // closeOverlay는 overlay에만 기대므로 overlay가 바뀔 때 다시 단다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])

  function goToChapter(next: number) {
    narration.stop()
    const target = bundle.chapters.find((c) => c.chapter === next)
    if (target) setPosition(startOfChapter(target))
  }

  function jumpTo(next: Position) {
    narration.stop()
    setPosition(next)
    setJumpCount((count) => count + 1)
    closeOverlay()
  }

  function swipeScene(direction: 1 | -1) {
    const target = adjacentScenePosition(bundle.chapters, position, direction)
    if (target) jumpTo(target)
  }

  // 본문의 이름에서 열면 처음 여는 카드, 카드 안의 관계에서 열면 지금 카드를 바꾼다.
  function openEntity(entity: Entity) {
    const back = typeof overlay === 'object' ? overlay.back : overlay === 'contents' ? 'contents' : null
    openOverlay({ kind: 'entity', entity, back })
  }

  function togglePlay() {
    if (narration.playing) narration.stop()
    else if (audio !== null) narration.play(audio)
  }

  const covered = overlay !== 'none'
  // 목차와 지도는 바탕이 밝은(어두운 화면이면 어두운) 전체 화면이고, 나머지는 그림이 위에 있다.
  const fullScreen = overlay === 'map' || overlay === 'contents'

  return (
    <View style={[styles.reader, { backgroundColor: palette.paper }]}>
      <StatusBar style={fullScreen ? (palette.dark ? 'light' : 'dark') : 'light'} />
      <View
        style={styles.panes}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={covered}
      >
        <ScenePane
          scene={scene}
          imageVersionId={bundle.defaultImageVersion}
          sceneNumber={sceneIndex + 1}
          sceneCount={chapter.scenes.length}
          verse={verse}
          playing={narration.playing}
          canPlay={audio !== null}
          onTogglePlay={togglePlay}
          onOpenMap={() => openOverlay('map')}
          onOpenSheet={() => openOverlay('sheet')}
          onSwipe={swipeScene}
        />
        <VersePane
          key={`${chapter.chapter}-${jumpCount}`}
          chapter={chapter}
          nextChapter={nextChapter}
          verse={position.verse}
          following={narration.playing}
          onVerseChange={(next) => setPosition({ chapter: chapter.chapter, verse: next })}
          onChapterChange={goToChapter}
          characters={bundle.characters}
          places={bundle.places}
          onOpenEntity={openEntity}
          onOpenContents={() => openOverlay('contents')}
          onOpenSettings={() => openOverlay('settings')}
          onOpenChapters={() => openOverlay('chapters')}
        />
      </View>

      {overlay === 'map' && <MapScreen route={route} auto={autoMap} onClose={closeOverlay} />}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={closeOverlay} />}
      {overlay === 'contents' && (
        <ContentsScreen
          bundle={bundle}
          currentChapter={chapter.chapter}
          currentSceneId={scene.id}
          sceneCharacters={scene.characters}
          readScenes={readScenes}
          tab={contentsTab}
          onTabChange={setContentsTab}
          onJump={jumpTo}
          onOpenEntity={openEntity}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'settings' && <SettingsSheet verse={verse} onClose={closeOverlay} />}
      {overlay === 'chapters' && (
        <ChapterPicker
          chapters={bundle.chapters}
          current={chapter.chapter}
          readScenes={readScenes}
          onPick={(next) => {
            closeOverlay()
            goToChapter(next)
          }}
          onClose={closeOverlay}
        />
      )}
      {typeof overlay === 'object' && (
        <EntityCard
          key={`${overlay.entity.kind}-${overlay.entity.id}`}
          entity={overlay.entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={scene.characters}
          onOpenEntity={openEntity}
          onOpenMap={() => openOverlay('map')}
          onClose={closeOverlay}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  reader: { flex: 1 },
  panes: { flex: 1 },
})
```

- [ ] **Step 5: 경로를 이어 붙인다**

```tsx path=mobile/src/app/_layout.tsx
import { NanumMyeongjo_400Regular, NanumMyeongjo_700Bold, useFonts } from '@expo-google-fonts/nanum-myeongjo'
import { setAudioModeAsync } from 'expo-audio'
import { Stack } from 'expo-router'
import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SettingsProvider, useSettings } from '../settings/SettingsContext'

export default function RootLayout() {
  const [loaded, error] = useFonts({ NanumMyeongjo_400Regular, NanumMyeongjo_700Bold })

  // 무음 모드에서도 낭독이 들리게 한다(iOS).
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined)
  }, [])

  // 글꼴을 못 불러와도 기기 글꼴로 연다.
  if (!loaded && !error) return null

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SettingsProvider>
          <Frame />
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// 넓은 화면(웹 미리 보기)에서는 폰 너비로 가운데에 둔다.
function Frame() {
  const { palette } = useSettings()
  return (
    <View style={[styles.root, { backgroundColor: palette.backdrop }]}>
      <View style={[styles.frame, { backgroundColor: palette.paper }]}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frame: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', overflow: 'hidden' },
})
```

```tsx path=mobile/src/app/read.tsx
import { StyleSheet, Text, View } from 'react-native'
import { content } from '../content/bundle'
import ReaderScreen from '../reader/ReaderScreen'
import { useSettings } from '../settings/SettingsContext'

export default function ReadRoute() {
  const { palette } = useSettings()
  if (content.error !== null) {
    return (
      <View style={[styles.status, { backgroundColor: palette.paper }]}>
        <Text style={{ color: palette.inkSoft }}>콘텐츠를 불러오지 못했어요</Text>
        <Text style={{ color: palette.inkFaint, fontSize: 12 }}>{content.error}</Text>
      </View>
    )
  }
  return <ReaderScreen bundle={content.bundle} />
}

const styles = StyleSheet.create({
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
})
```

- [ ] **Step 6: 형 검사**

Run: `npm run typecheck -w mobile`
Expected: 오류 없음.

- [ ] **Step 7: Expo 웹으로 확인한다**

`preview_start` name `mobile-web`(이미 떠 있으면 새로 고침). 브라우저 창에서 다음을 차례로 본다. 화면 캡처가 안 되면 `read_page`·`javascript_tool`로 DOM을 본다.

1. 콘솔 오류가 없고, 위에 장면 그림·제목·"1 / 8", 아래에 창세기 1장 본문이 나온다.
2. 본문을 스크롤하면 지금 절 바탕색이 따라 바뀌고, 그림 위 자막과 장면(그림·제목)이 바뀐다.
3. 밑줄 친 낱말을 누르면 아래에 풀이 카드가 뜨고 닫힌다. 2장 이후의 인물 이름을 누르면 인물 카드가 열리고 관계 이름으로 카드가 바뀐다.
4. 목차를 열어 다른 장의 장면을 누르면 그 장면 첫 절로 옮겨 간다. 연표 탭에서 이름을 누르면 카드가 열리고, 닫으면 목차로 돌아간다.
5. 읽기 설정에서 글자 크기와 어두운 화면을 바꾸면 바로 반영되고, 새로 고침해도 남는다.
6. 장 고르기로 3장을 고른 뒤 그림을 왼쪽으로 끌면 다음 장면으로 넘어간다.
7. 2장 에덴 장면(장소 있음)으로 가면 지도가 저절로 열려 에덴으로 날아간 뒤 약 3초 뒤 닫힌다. 지도 단추로 열면 지나온 길이 보이고 +/− 단추와 끌기로 움직인다.
8. 재생 단추를 누르면 절 음성이 나오고 본문이 따라 스크롤된다. 멈춤이 된다.
9. 웹 목업(`preview_start` name `app`)도 새로 고침해 여전히 도는지 본다.

문제가 보이면 고친 뒤 이 단계를 다시 한다.

- [ ] **Step 8: 커밋**

```bash
git add mobile
git commit -m "feat(mobile): 읽기 화면 (장면 그림, 본문, 낱말·이름 연결, 덮개들, 낭독, 장면 넘기기)"
```

---

### Task 10: 문서와 마무리

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-09-native-app-design.md`

- [ ] **Step 1: README에 앱 실행법을 적는다**

README의 명령 목록 아래에 "네이티브 앱(mobile)" 절을 더한다: `npm run pipeline -- build` → `npm run content -w mobile` → `npm run web -w mobile`(Expo 웹, http://localhost:8081) 또는 `npm run android -w mobile`(Android SDK 필요), 바탕 지도를 다시 만들 때 `npm run basemap -w mobile`, 형 검사 `npm run typecheck -w mobile`. 그리고 `packages/reader-core`가 웹·앱 공용 읽기 모듈이라는 한 줄.

- [ ] **Step 2: 설계 문서에 1단계 완료를 적는다**

설계 문서 3절 표 아래에 "1단계 구현 완료(2026-10-09). 장면 사이는 그림을 좌우로 밀어 넘긴다(목차로도 옮긴다). 글자 크기는 슬라이더 대신 다섯 단계 단추." 문장을 더하고, 6절 1~4 문단의 "장면 사이는 화면 아래 버튼과 좌우 밀기로 넘긴다"를 "장면 사이는 그림을 좌우로 밀어 넘긴다"로 고친다.

- [ ] **Step 3: 전체 시험과 커밋**

Run: `npm test && npm run typecheck -w mobile && npm run build -w app`
Expected: 모두 성공

```bash
git add README.md docs
git commit -m "docs: 네이티브 앱 1단계 실행법과 완료 표시"
```
