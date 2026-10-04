import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { MappedPlace, Route } from '../reader/route.ts'
import Icon from './Icon.tsx'

// 아직 지나온 장소가 없을 때 보여줄 범위: 고대 근동 일대
const defaultCenter: L.LatLngTuple = [33.5, 42]
const defaultZoom = 4
const singlePlaceZoom = 6

function label(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

function point(place: MappedPlace): L.LatLngTuple {
  return [place.lat, place.lng]
}

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

  const points = [...visited, ...(next ? [next] : [])].map(point)
  if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 7 })
  else if (points.length === 1) map.setView(points[0], singlePlaceZoom)
}

export default function MapScreen({ route, onClose }: { route: Route; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
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

    return () => {
      map.remove()
    }
  }, [route])

  return (
    <div className="overlay map-screen" role="dialog" aria-modal="true" aria-label="여정 지도">
      <header className="overlay-header">
        <button type="button" className="icon-button" aria-label="지도 닫기" autoFocus onClick={onClose}>
          <Icon name="back" />
        </button>
        여정 지도
      </header>

      <div ref={containerRef} className="map-canvas" aria-label="지나온 장소를 표시한 지도" />

      {current ? (
        <div className="map-info">
          <span className="map-info-label">지금 위치</span>
          <span className="map-info-name">{label(current)}</span>
          <span className="map-info-desc">{current.description}</span>
        </div>
      ) : (
        <p className="map-info empty">아직 지도에 표시할 장소가 없어요</p>
      )}
      <p className="map-note">오늘날의 지도 위에 표시했어요. 추정 위치는 정확하지 않을 수 있어요.</p>
    </div>
  )
}
