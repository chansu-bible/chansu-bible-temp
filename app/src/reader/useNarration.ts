import { useCallback, useEffect, useRef, useState } from 'react'
import type { Verse } from '../content/types.ts'

export function verseAudioUrl(verse: Verse | undefined): string | null {
  // 낭독 파일 필드가 아직 없는 묶음도 있으므로 값이 없으면 null로 본다.
  return verse?.audio ? import.meta.env.BASE_URL + verse.audio : null
}

// onVerseEnd: 한 절을 다 읽었을 때 불린다. 이어 읽을 절의 소리 주소를 돌려주면 계속 읽고, null이면 멈춘다.
// rate: 낭독 속도(1이 보통). 재생을 시작할 때와 값이 바뀔 때 적용한다.
export function useNarration(onVerseEnd: () => string | null, rate = 1) {
  const [playing, setPlaying] = useState(false)
  // 휴대폰의 자동 재생 제한 때문에 사용자가 누른 재생을 다음 절까지 이어 가려면 같은 audio 요소를 계속 써야 한다.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // 재생을 시작할 때마다 늘린다. 지난 시도의 play() 실패가 지금 재생을 멈추지 않게 한다.
  const attemptRef = useRef(0)
  const onVerseEndRef = useRef(onVerseEnd)
  const rateRef = useRef(rate)

  useEffect(() => {
    onVerseEndRef.current = onVerseEnd
  })

  useEffect(() => {
    rateRef.current = rate
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const stop = useCallback(() => {
    attemptRef.current++
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  const play = useCallback(
    (src: string) => {
      const audio = (audioRef.current ??= new Audio())
      const attempt = ++attemptRef.current
      audio.src = src
      // src를 바꾸면 브라우저가 속도를 기본값으로 되돌리기도 해서 매번 다시 적는다.
      audio.defaultPlaybackRate = rateRef.current
      audio.playbackRate = rateRef.current
      setPlaying(true)
      audio.play().catch(() => {
        if (attemptRef.current === attempt) stop()
      })
    },
    [stop],
  )

  useEffect(() => {
    const audio = (audioRef.current ??= new Audio())
    function handleEnded() {
      const next = onVerseEndRef.current()
      if (next) play(next)
      else stop()
    }
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', stop)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', stop)
      audio.pause()
    }
  }, [play, stop])

  return { playing, play, stop }
}
