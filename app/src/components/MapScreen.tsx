import type { MappedPlace, Route } from '../reader/route.ts'
import Icon from './Icon.tsx'

const width = 1000
const height = 700

function label(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

export default function MapScreen({ route, onClose }: { route: Route; onClose: () => void }) {
  const { visited, current, next } = route
  const passed = visited.slice(0, -1)
  const path = visited.map((place) => `${place.x * width},${place.y * height}`).join(' ')

  return (
    <div className="overlay map-screen" role="dialog" aria-modal="true" aria-label="여정 지도">
      <header className="overlay-header">
        <button type="button" className="icon-button" aria-label="지도 닫기" onClick={onClose}>
          <Icon name="back" />
        </button>
        여정 지도
      </header>

      <svg className="map-canvas" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="고대 근동 약도">
        <path className="map-sea" d="M0,230 L230,235 Q270,300 255,380 Q240,460 215,515 L150,530 L0,530 Z" />
        <path className="map-sea" d="M840,560 Q900,600 1000,640 L1000,700 L860,700 Q830,620 840,560 Z" />
        <polyline className="map-river" points="432,140 386,233 455,303 545,373 655,443 773,513 841,560" />
        <polyline className="map-river" points="455,187 568,233 595,266 655,406 773,490 791,525" />
        <text className="map-label" x="60" y="400">
          지중해
        </text>
        <text className="map-label" x="870" y="680">
          페르시아 만
        </text>
        <text className="map-label" x="300" y="330">
          유프라테스 강
        </text>
        <text className="map-label" x="640" y="300">
          티그리스 강
        </text>

        {visited.length > 1 && <polyline className="map-route" points={path} />}
        {current && next && (
          <line
            className="map-route next"
            x1={current.x * width}
            y1={current.y * height}
            x2={next.x * width}
            y2={next.y * height}
          />
        )}
        {passed.map((place, index) => (
          <g key={`${place.id}-${index}`}>
            <circle className="map-dot" cx={place.x * width} cy={place.y * height} r="9" />
            <text className="map-place passed" x={place.x * width} y={place.y * height + 40}>
              {label(place)}
            </text>
          </g>
        ))}
        {next && (
          <g>
            <circle className="map-dot next" cx={next.x * width} cy={next.y * height} r="9" />
            <text className="map-place passed" x={next.x * width} y={next.y * height + 40}>
              {label(next)}
            </text>
          </g>
        )}
        {current && (
          <g>
            <circle className="map-halo" cx={current.x * width} cy={current.y * height} r="26" />
            <circle className="map-dot" cx={current.x * width} cy={current.y * height} r="13" />
            <text className="map-place" x={current.x * width} y={current.y * height - 36}>
              {label(current)}
            </text>
          </g>
        )}
      </svg>

      {current ? (
        <div className="map-info">
          <span className="map-info-label">지금 위치</span>
          <span className="map-info-name">{label(current)}</span>
          <span className="map-info-desc">{current.description}</span>
        </div>
      ) : (
        <p className="map-info empty">아직 지도에 표시할 장소가 없어요</p>
      )}
      <p className="map-note">단순하게 그린 약도예요. 실제 거리와 다를 수 있어요.</p>
    </div>
  )
}
