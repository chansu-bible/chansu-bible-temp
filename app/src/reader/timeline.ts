import type { Character, Era } from '../content/types.ts'

// 죽은 해가 본문에 없는 인물(데려간 에녹)의 막대 길이(년). 점선으로 그린다.
export const OPEN_SPAN = 120

// 눈금 간격과 기본 범위(창조 원년 기준)
const tickStep = 500
const minYears = 2000

export type TimelineTick = { year: number; top: number }

// open: 죽은 해가 없어 OPEN_SPAN만큼 열린 막대로 그린다.
export type TimelineBar = {
  id: string
  name: string
  born: number
  died: number | null
  top: number
  height: number
  open: boolean
}

// flood: 홍수 띠(파란 줄)
export type TimelineBand = { id: string; name: string; from: number; to: number; top: number; height: number; flood: boolean }

export type TimelineLayout = { maxYear: number; ticks: TimelineTick[]; bars: TimelineBar[]; bands: TimelineBand[] }

// 인물의 생몰년과 시대를 세로 연표의 픽셀 위치로 바꾼다. 0년이 맨 위(top 0), maxYear가 height다.
// 범위는 0~2000년이고, 그보다 오래 산 인물(노아 2006년)이 있으면 그 해까지 늘린다.
export function timelineLayout(characters: Character[], eras: Era[], { height }: { height: number }): TimelineLayout {
  const born = characters
    .filter((character) => character.years.born !== null)
    .map((character, order) => ({ character, born: character.years.born!, order }))
    .sort((a, b) => a.born - b.born || a.order - b.order)

  const ends = born.map(({ character, born }) => character.years.died ?? born + OPEN_SPAN)
  const maxYear = Math.max(minYears, ...ends)
  const top = (year: number) => (year / maxYear) * height

  const ticks: TimelineTick[] = []
  for (let year = 0; year <= maxYear; year += tickStep) ticks.push({ year, top: top(year) })

  const bars: TimelineBar[] = born.map(({ character, born }, index) => ({
    id: character.id,
    name: character.name,
    born,
    died: character.years.died,
    top: top(born),
    height: top(ends[index]) - top(born),
    open: character.years.died === null,
  }))

  const bands: TimelineBand[] = eras
    .filter((era) => era.years.from !== null && era.years.to !== null)
    .map((era) => {
      const from = era.years.from!
      const to = era.years.to!
      return {
        id: era.id,
        name: era.name,
        from,
        to,
        top: top(from),
        height: top(to) - top(from),
        flood: era.id === 'flood' || era.name === '홍수',
      }
    })

  return { maxYear, ticks, bars, bands }
}
