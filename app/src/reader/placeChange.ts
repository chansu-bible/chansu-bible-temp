import type { Place } from '../content/types.ts'
import { isMapped, type MappedPlace } from './route.ts'

// 장면이 바뀌면서 장소가 달라진 것. from은 이전 장소(지도에 없거나 없었으면 null), to는 새 장소다.
export type PlaceChange = { from: MappedPlace | null; to: MappedPlace }

// 지도 안내가 머무는 시간(ms). fly는 새 장소로 날아가는 시간, hold는 도착 후 머무는 시간, fade는 사라지는 시간.
export type FlashTiming = { lead: number; fly: number; hold: number; fade: number }

function mapped(places: Place[], id: string | null): MappedPlace | null {
  if (!id) return null
  const place = places.find((item) => item.id === id)
  return place && isMapped(place) ? place : null
}

// 장면이 바뀌어 장소가 달라졌는지 본다. 새 장소가 지도에 있는 곳이고 이전 장면의 장소와 다를 때만 돌려준다.
// 이전 장소가 지도에 없으면 from은 null이다.
export function placeChange(places: Place[], previousId: string | null, nextId: string | null): PlaceChange | null {
  const to = mapped(places, nextId)
  if (!to || to.id === previousId) return null
  return { from: mapped(places, previousId), to }
}

// 움직임 줄이기 설정이면 날아가지 않고 바로 옮기며, 나타나고 사라지는 효과도 없앤다.
export function flashTiming(reducedMotion: boolean): FlashTiming {
  return reducedMotion ? { lead: 0, fly: 0, hold: 2600, fade: 0 } : { lead: 500, fly: 1600, hold: 2200, fade: 400 }
}
