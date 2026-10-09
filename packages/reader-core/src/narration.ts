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
