import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { flashTiming, type PlaceChange } from '../reader/placeChange.ts'
import type { MappedPlace } from '../reader/route.ts'

// 이전 장소가 없을 때 출발하는 범위: 고대 근동 일대
const defaultCenter: L.LatLngTuple = [33.5, 42]
const wideZoom = 4
const fromZoom = 5
const placeZoom = 6

function label(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

function point(place: MappedPlace): L.LatLngTuple {
  return [place.lat, place.lng]
}

// 장면이 바뀌어 장소가 달라졌을 때 그림 위에 잠깐 뜨는 지도. 이전 장소에서 새 장소로 날아간 뒤 머물다가 사라진다.
// 탭하면 바로 닫힌다. 장면 그림 위의 버튼은 이 지도보다 위에 있어 그대로 누를 수 있다.
export default function PlaceFlash({ change, onDone }: { change: PlaceChange; onDone: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  // 부모가 onDone을 매번 새로 만들어도 지도를 다시 만들지 않게 ref로 든다.
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timing = flashTiming(reduced)
    const accent = getComputedStyle(container).getPropertyValue('--accent').trim() || '#8a5a2b'
    const to = point(change.to)

    const map = L.map(container, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    })
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 10,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map)

    if (change.from) {
      const from = point(change.from)
      map.setView(from, fromZoom)
      L.polyline([from, to], { color: accent, weight: 3, dashArray: '6 8', opacity: 0.7 }).addTo(map)
      L.circleMarker(from, { radius: 5, stroke: false, fillColor: accent, fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(label(change.from), { permanent: true, direction: 'bottom', className: 'map-tooltip' })
    } else {
      map.setView(defaultCenter, wideZoom)
    }
    L.circleMarker(to, { radius: 14, stroke: false, fillColor: accent, fillOpacity: 0.2 }).addTo(map)
    L.circleMarker(to, { radius: 7, color: '#fff', weight: 2, fillColor: accent, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(label(change.to), { permanent: true, direction: 'top', className: 'map-tooltip current' })
    map.invalidateSize()

    const timers: number[] = []
    const after = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms))
    const arrive = timing.lead + timing.fly
    // 출발 위치를 잠깐 보여 준 뒤 새 장소로 날아간다. 움직임 줄이기면 바로 옮긴다.
    after(timing.lead, () => {
      if (reduced) map.setView(to, placeZoom, { animate: false })
      else map.flyTo(to, placeZoom, { duration: timing.fly / 1000 })
    })
    after(arrive + timing.hold, () => setLeaving(true))
    after(arrive + timing.hold + timing.fade, () => doneRef.current())

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
      map.remove()
    }
  }, [change])

  return (
    <div className={leaving ? 'place-flash leaving' : 'place-flash'}>
      <div ref={containerRef} className="place-flash-map" aria-hidden="true" />
      <button type="button" className="place-flash-close" aria-label="장소 안내 닫기" onClick={() => doneRef.current()} />
      <p className="place-flash-label" role="status">
        <span className="place-flash-kicker">장소</span>
        {change.from && (
          <>
            <span className="place-flash-from">{label(change.from)}</span>
            <span className="place-flash-arrow" aria-hidden="true">
              →
            </span>
          </>
        )}
        <strong>{label(change.to)}</strong>
      </p>
    </div>
  )
}
