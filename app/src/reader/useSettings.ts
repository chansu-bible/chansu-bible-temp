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
