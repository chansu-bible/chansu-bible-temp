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
      if (!Number.isFinite(ms)) return
      stopAt.current = null
      const limit = trackRef.current?.durationMs ?? ms
      void player.seekTo(Math.min(Math.max(0, ms), limit) / 1000)
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
  // 장면 길이는 묶음 값(프레임으로 잰 정확한 값)을 쓴다. 재생기의 길이는 파일을 바꾼 직전에 앞 파일 값일 수 있다.
  const durationMs = track ? track.durationMs : 0
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
