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
    original: null,
    quiz: [],
    verses: [verse(1, 1, 1000), verse(1, 2, 2000), verse(1, 3, null), verse(1, 4, 1500), verse(1, 5, null)],
    scenes: [scene('a', 1, 2, true), scene('b', 3, 4, true), scene('c', 5, 5, false)],
  },
  {
    chapter: 2,
    original: null,
    quiz: [],
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
