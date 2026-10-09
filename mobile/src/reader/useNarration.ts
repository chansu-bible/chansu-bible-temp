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
