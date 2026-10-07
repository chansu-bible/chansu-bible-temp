import { describe, expect, it } from 'vitest'
import type { Place } from '../content/types.ts'
import { flashTiming, placeChange } from './placeChange.ts'

const eden: Place = { id: 'eden', name: '에덴', description: '', estimated: true, lat: 31.02, lng: 47.43 }
const nod: Place = { id: 'nod', name: '놋', description: '', estimated: true, lat: 32, lng: 48 }
// 위치를 모르는 장소
const havilah: Place = { id: 'havilah', name: '하윌라', description: '', estimated: true, lat: null, lng: null }
const places = [eden, nod, havilah]

describe('placeChange', () => {
  it('장소가 없다가 생기면 from 없이 새 장소를 돌려준다', () => {
    expect(placeChange(places, null, 'eden')).toEqual({ from: null, to: eden })
  })

  it('장소가 바뀌면 이전 장소와 새 장소를 돌려준다', () => {
    expect(placeChange(places, 'eden', 'nod')).toEqual({ from: eden, to: nod })
  })

  it('같은 장소면 null', () => {
    expect(placeChange(places, 'eden', 'eden')).toBeNull()
  })

  it('새 장면에 장소가 없거나 지도에 없는 장소면 null', () => {
    expect(placeChange(places, 'eden', null)).toBeNull()
    expect(placeChange(places, 'eden', 'havilah')).toBeNull()
    expect(placeChange(places, 'eden', 'nowhere')).toBeNull()
  })

  it('이전 장소가 지도에 없으면 from은 null', () => {
    expect(placeChange(places, 'havilah', 'eden')).toEqual({ from: null, to: eden })
  })
})

describe('flashTiming', () => {
  it('움직임 줄이기면 날아가는 시간과 효과가 0이고, 아니면 모두 양수다', () => {
    const reduced = flashTiming(true)
    expect(reduced.lead).toBe(0)
    expect(reduced.fly).toBe(0)
    expect(reduced.fade).toBe(0)
    expect(reduced.hold).toBeGreaterThan(0)
    const normal = flashTiming(false)
    for (const value of Object.values(normal)) expect(value).toBeGreaterThan(0)
  })
})
