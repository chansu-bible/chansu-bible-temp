import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { flashTiming, type PlaceChange } from '../reader/placeChange.ts'
import type { MappedPlace, Route } from '../reader/route.ts'
import Icon from './Icon.tsx'

// 아직 지나온 장소가 없을 때 보여줄 범위: 고대 근동 일대
const defaultCenter: L.LatLngTuple = [33.5, 42]
const defaultZoom = 4
// 저절로 열렸을 때 이전 장소를 보여 주는 배율
const fromZoom = 5
const singlePlaceZoom = 6

function label(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

function point(place: MappedPlace): L.LatLngTuple {
  return [place.lat, place.lng]
}

// 지나온 길과 장소 표식을 그린다. 보는 범위는 여기서 정하지 않는다.
function drawRoute(map: L.Map, route: Route, color: string): void {
  const { visited, current, next } = route

  if (visited.length > 1) L.polyline(visited.map(point), { color, weight: 4 }).addTo(map)
  if (current && next) {
    L.polyline([point(current), point(next)], { color, weight: 3, dashArray: '6 8', opacity: 0.6 }).addTo(map)
  }

  // 같은 장소를 다시 지나가도 이름은 한 번만 쓴다. 현재 위치의 이름이 우선이다.
  const labeled = new Set<string>(current ? [current.id] : [])
  for (const place of visited.slice(0, -1)) {
    const dot = L.circleMarker(point(place), { radius: 5, stroke: false, fillColor: color, fillOpacity: 1 }).addTo(map)
    if (labeled.has(place.id)) continue
    labeled.add(place.id)
    dot.bindTooltip(label(place), { permanent: true, direction: 'bottom', className: 'map-tooltip' })
  }
  if (next) {
    const dot = L.circleMarker(point(next), { radius: 5, color, weight: 2, opacity: 0.6, fill: false }).addTo(map)
    if (!labeled.has(next.id)) {
      dot.bindTooltip(label(next), { permanent: true, direction: 'bottom', className: 'map-tooltip' })
    }
  }
  if (current) {
    L.circleMarker(point(current), { radius: 14, stroke: false, fillColor: color, fillOpacity: 0.2 }).addTo(map)
    L.circleMarker(point(current), { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(label(current), { permanent: true, direction: 'top', className: 'map-tooltip current' })
  }
}

// 지나온 장소와 다음 장소가 모두 보이게 범위를 맞춘다.
function frameRoute(map: L.Map, route: Route): void {
  const points = [...route.visited, ...(route.next ? [route.next] : [])].map(point)
  if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 7 })
  else if (points.length === 1) map.setView(points[0], singlePlaceZoom)
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Props = {
  route: Route
  onClose: () => void
  // 장면이 바뀌어 장소가 달라져서 저절로 열렸을 때 그 변화. 지도가 이전 장소에서 새 장소로 날아간 뒤 잠시 머물고 저절로 닫힌다.
  // 그동안 지도를 만지거나 키를 누르면 닫히지 않고 그대로 남는다.
  auto?: PlaceChange | null
}

export default function MapScreen({ route, onClose, auto = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 저절로 닫히기 전에 사라지는 중
  const [leaving, setLeaving] = useState(false)
  // 사용자가 지도를 만져서 저절로 닫히지 않게 됨
  const [pinned, setPinned] = useState(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const { current } = route

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = L.map(container, { zoomControl: false }).setView(defaultCenter, defaultZoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 10,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
    }).addTo(map)

    const accent = getComputedStyle(container).getPropertyValue('--accent').trim() || '#8a5a2b'
    drawRoute(map, route, accent)

    if (!auto) {
      frameRoute(map, route)
      return () => {
        map.remove()
      }
    }

    // 저절로 열렸을 때: 이전 장소(없으면 넓은 범위)를 잠깐 보여 준 뒤 새 장소로 날아간다. 움직임 줄이기면 바로 옮긴다.
    const reduced = reducedMotion()
    const timing = flashTiming(reduced)
    const to = point(auto.to)
    if (auto.from) map.setView(point(auto.from), fromZoom)
    const timer = window.setTimeout(() => {
      if (reduced) map.setView(to, singlePlaceZoom, { animate: false })
      else map.flyTo(to, singlePlaceZoom, { duration: timing.fly / 1000 })
    }, timing.lead)

    return () => {
      window.clearTimeout(timer)
      map.remove()
    }
  }, [route, auto])

  // 저절로 열린 지도는 도착 후 잠시 머물다가 사라진다. 사용자가 만지면 멈춘다.
  useEffect(() => {
    if (!auto || pinned) return
    const timing = flashTiming(reducedMotion())
    const arrive = timing.lead + timing.fly
    const fade = window.setTimeout(() => setLeaving(true), arrive + timing.hold)
    const close = window.setTimeout(() => closeRef.current(), arrive + timing.hold + timing.fade)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(close)
    }
  }, [auto, pinned])

  function pin() {
    if (!auto || pinned) return
    setPinned(true)
    setLeaving(false)
  }

  const className = ['overlay map-screen', auto ? 'auto' : '', leaving ? 'leaving' : ''].filter(Boolean).join(' ')
  const note =
    auto && !pinned
      ? '장소가 바뀌어 잠시 보여 드려요. 곧 닫히고, 지도를 만지면 그대로 열려 있어요.'
      : '오늘날의 지도 위에 표시했어요. 추정 위치는 정확하지 않을 수 있어요.'

  return (
    <div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label="여정 지도"
      onPointerDown={pin}
      onKeyDown={pin}
      onWheel={pin}
    >
      <header className="overlay-header">
        <button type="button" className="icon-button" aria-label="지도 닫기" autoFocus={!auto} onClick={onClose}>
          <Icon name="back" />
        </button>
        여정 지도
      </header>

      <div ref={containerRef} className="map-canvas" aria-label="지나온 장소를 표시한 지도" />

      {current ? (
        <div className="map-info">
          <span className="map-info-label">{auto ? '새 장소' : '지금 위치'}</span>
          <span className="map-info-name">
            {auto?.from && <span className="map-info-from">{label(auto.from)} → </span>}
            {label(current)}
          </span>
          <span className="map-info-desc">{current.description}</span>
        </div>
      ) : (
        <p className="map-info empty">아직 지도에 표시할 장소가 없어요</p>
      )}
      <p className="map-note" role={auto ? 'status' : undefined}>
        {note}
      </p>
    </div>
  )
}
