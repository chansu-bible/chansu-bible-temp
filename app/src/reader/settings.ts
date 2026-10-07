import { useCallback, useEffect, useState } from 'react'

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
    fontScale: [1, 2, 3, 4, 5].includes(saved.fontScale as number)
      ? (saved.fontScale as FontScale)
      : DEFAULT_SETTINGS.fontScale,
    theme: THEMES.includes(saved.theme as Theme) ? (saved.theme as Theme) : DEFAULT_SETTINGS.theme,
    speed: SPEEDS.includes(saved.speed as Speed) ? (saved.speed as Speed) : DEFAULT_SETTINGS.speed,
    placeFlash: typeof saved.placeFlash === 'boolean' ? saved.placeFlash : DEFAULT_SETTINGS.placeFlash,
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(key))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(key, JSON.stringify(settings))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 설정 저장을 건너뛴다.
  }
}

// 설정 상태와 바꾸는 함수. 바꾸면 바로 저장하고, 어두운 화면 설정은 문서 루트에 적는다.
// 글자 크기는 verseScale로 돌려주어 .reader의 --verse-scale에 쓰게 한다.
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings)

  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial }
      saveSettings(next)
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
