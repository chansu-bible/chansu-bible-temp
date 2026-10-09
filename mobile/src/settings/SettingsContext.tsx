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
