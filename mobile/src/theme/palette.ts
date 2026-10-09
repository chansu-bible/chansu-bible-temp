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
