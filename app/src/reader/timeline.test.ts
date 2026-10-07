import { describe, expect, it } from 'vitest'
import type { Character, Era } from '../content/types.ts'
import { OPEN_SPAN, timelineLayout } from './timeline.ts'

function person(id: string, born: number | null, died: number | null): Character {
  return {
    id,
    name: id,
    aliases: [],
    gender: '남',
    firstAppearance: '5:1',
    years: { born, died },
    relations: [],
    attire: [],
    notes: '',
    sources: [],
  }
}

function era(id: string, from: number | null, to: number | null): Era {
  return { id, name: id, range: { from: '1:1', to: '1:1' }, years: { from, to }, description: '', present: [], absent: [] }
}

describe('timelineLayout', () => {
  it('0년부터 2000년까지 500년마다 눈금을 높이에 맞춰 둔다', () => {
    const layout = timelineLayout([], [], { height: 1000 })
    expect(layout.ticks).toEqual([
      { year: 0, top: 0 },
      { year: 500, top: 250 },
      { year: 1000, top: 500 },
      { year: 1500, top: 750 },
      { year: 2000, top: 1000 },
    ])
  })

  it('막대의 top은 태어난 해, height는 산 햇수다', () => {
    const layout = timelineLayout([person('seth', 130, 1042)], [], { height: 1000 })
    expect(layout.bars).toEqual([
      { id: 'seth', name: 'seth', born: 130, died: 1042, top: 65, height: 456, open: false },
    ])
  })

  it('태어난 해가 없는 인물은 빼고, 태어난 순서로 늘어놓는다', () => {
    const layout = timelineLayout(
      [person('noah', 1056, 2006), person('cain', null, null), person('adam', 0, 930), person('seth', 130, 1042)],
      [],
      { height: 1000 },
    )
    expect(layout.bars.map((bar) => bar.id)).toEqual(['adam', 'seth', 'noah'])
  })

  it('죽은 해가 없으면 태어난 해부터 정해진 길이의 열린 막대다(에녹)', () => {
    const layout = timelineLayout([person('enoch', 622, null)], [], { height: 1000 })
    expect(layout.bars[0]).toEqual({
      id: 'enoch',
      name: 'enoch',
      born: 622,
      died: null,
      top: 311,
      height: OPEN_SPAN / 2,
      open: true,
    })
    expect(OPEN_SPAN).toBe(120)
  })

  it('2000년을 넘게 산 인물이 있으면 그 해까지 눈금 범위를 늘린다', () => {
    const layout = timelineLayout([person('noah', 1056, 2006)], [], { height: 2006 })
    expect(layout.maxYear).toBe(2006)
    expect(layout.bars[0].top + layout.bars[0].height).toBe(2006)
    expect(layout.ticks.map((tick) => tick.year)).toEqual([0, 500, 1000, 1500, 2000])
    expect(layout.ticks.at(-1)!.top).toBe(2000)
  })

  it('햇수가 양쪽 다 있는 시대만 띠로 그리고, 홍수는 따로 표시한다', () => {
    const layout = timelineLayout(
      [],
      [era('creation-week', 0, 0), era('eden', null, null), era('before-flood', null, 1656), era('flood', 1656, 1657)],
      { height: 1000 },
    )
    expect(layout.bands).toEqual([
      { id: 'creation-week', name: 'creation-week', from: 0, to: 0, top: 0, height: 0, flood: false },
      { id: 'flood', name: 'flood', from: 1656, to: 1657, top: 828, height: 0.5, flood: true },
    ])
  })
})
