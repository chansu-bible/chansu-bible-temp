import type { Chapter, Place } from '../content/types.ts'

export type MappedPlace = Place & { lat: number; lng: number }

export type Route = { visited: MappedPlace[]; current: MappedPlace | null; next: MappedPlace | null }

export function isMapped(place: Place): place is MappedPlace {
  return place.lat !== null && place.lng !== null
}

export function buildRoute(chapters: Chapter[], places: Place[], currentSceneId: string): Route {
  const mapped = new Map(places.filter(isMapped).map((place) => [place.id, place]))
  const visited: MappedPlace[] = []
  let next: MappedPlace | null = null
  let reachedCurrent = false

  for (const scene of chapters.flatMap((chapter) => chapter.scenes)) {
    const place = scene.placeId ? (mapped.get(scene.placeId) ?? null) : null
    if (reachedCurrent) {
      if (place && visited.length > 0 && place.id !== visited.at(-1)?.id) {
        next = place
        break
      }
      continue
    }
    if (place && place.id !== visited.at(-1)?.id) visited.push(place)
    if (scene.id === currentSceneId) reachedCurrent = true
  }

  return { visited, current: visited.at(-1) ?? null, next }
}
