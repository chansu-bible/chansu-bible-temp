import { memo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg'
import {
  clampCamera,
  panCamera,
  project,
  SPAN_DEGREES,
  spanOf,
  viewBoxOf,
  zoomCamera,
  type Camera,
  type MapPoint,
  type MappedPlace,
  type Route,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import type { Palette } from '../theme/palette'
import { BASEMAP } from './basemap.generated'

// 가장 가까이(경도 4.4도 폭)부터 가장 멀리(경도 70도 폭)까지 본다.
export const CAMERA_LIMITS = { minSpan: spanOf(SPAN_DEGREES.closest), maxSpan: spanOf(70) }

export function clampToBasemap(camera: Camera): Camera {
  return clampCamera(camera, BASEMAP.bounds, CAMERA_LIMITS)
}

export function placeLabel(place: MappedPlace): string {
  return place.estimated ? `${place.name} (추정)` : place.name
}

type Props = {
  route: Route
  camera: Camera
  onCameraChange: (camera: Camera) => void
  // 사용자가 지도를 끌거나 벌렸을 때
  onInteract?: () => void
  // 화면 비율(세로 ÷ 가로)을 알게 되면 알린다.
  onAspect?: (aspect: number) => void
}

// 바탕 지도(Natural Earth)와 지나온 길을 SVG로 그린다. 한 손가락으로 끌고 두 손가락으로 벌려 확대한다.
export default function MapView({ route, camera, onCameraChange, onInteract, onAspect }: Props) {
  const { palette } = useSettings()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const last = useRef({ x: 0, y: 0, scale: 1 })
  const aspect = size.width > 0 ? size.height / size.width : 1
  // 화면 1px이 지도 몇 단위인지. 선 굵기와 글자 크기를 화면 기준으로 고정하는 데 쓴다.
  const unit = size.width > 0 ? camera.span / size.width : 1

  function apply(next: Camera) {
    const clamped = clampToBasemap(next)
    cameraRef.current = clamped
    onCameraChange(clamped)
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .onStart(() => {
      last.current.x = 0
      last.current.y = 0
      onInteract?.()
    })
    .onUpdate((event) => {
      const dx = event.translationX - last.current.x
      const dy = event.translationY - last.current.y
      last.current.x = event.translationX
      last.current.y = event.translationY
      apply(panCamera(cameraRef.current, dx, dy, size.width))
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => {
      last.current.scale = 1
      onInteract?.()
    })
    .onUpdate((event) => {
      const factor = event.scale / last.current.scale
      last.current.scale = event.scale
      const focus = size.width > 0 ? { fx: event.focalX / size.width, fy: event.focalY / size.height } : undefined
      apply(zoomCamera(cameraRef.current, factor, aspect, focus))
    })

  const view = viewBoxOf(camera, aspect)

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <View
        style={styles.canvas}
        accessibilityLabel="지나온 장소를 표시한 지도"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setSize({ width, height })
          if (width > 0) onAspect?.(height / width)
        }}
      >
        {size.width > 0 && (
          <Svg width={size.width} height={size.height} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}>
            <Basemap palette={palette} unit={unit} />
            <RouteLayer route={route} palette={palette} unit={unit} />
          </Svg>
        )}
      </View>
    </GestureDetector>
  )
}

const Basemap = memo(function Basemap({ palette, unit }: { palette: Palette; unit: number }) {
  const { bounds } = BASEMAP
  const margin = 2000
  return (
    <G>
      <Rect
        x={bounds.minX - margin}
        y={bounds.minY - margin}
        width={bounds.maxX - bounds.minX + margin * 2}
        height={bounds.maxY - bounds.minY + margin * 2}
        fill={palette.mapSea}
      />
      <Path d={BASEMAP.land} fill={palette.mapLand} fillRule="evenodd" />
      <Path d={BASEMAP.lakes} fill={palette.mapSea} />
      <Path d={BASEMAP.rivers} fill="none" stroke={palette.mapRiver} strokeWidth={1.2 * unit} strokeLinecap="round" strokeLinejoin="round" />
      {BASEMAP.labels.map((label) => (
        <SvgText
          key={label.text}
          x={label.x}
          y={label.y}
          fontSize={(label.kind === 'sea' ? 13 : 11) * unit}
          fontStyle="italic"
          fill={palette.mapLabel}
          textAnchor="middle"
        >
          {label.text}
        </SvgText>
      ))}
    </G>
  )
})

function at(place: MappedPlace): MapPoint {
  return project(place.lng, place.lat)
}

function RouteLayer({ route, palette, unit }: { route: Route; palette: Palette; unit: number }) {
  const { visited, current, next } = route
  // 같은 장소를 다시 지나가도 이름은 한 번만 쓴다. 현재 위치의 이름이 우선이다.
  const labeled = new Set<string>(current ? [current.id] : [])
  const dots = visited.slice(0, -1).map((place, index) => {
    const show = !labeled.has(place.id)
    labeled.add(place.id)
    return { place, show, key: `${place.id}-${index}` }
  })
  const showNext = next !== null && !labeled.has(next.id)

  return (
    <G>
      {visited.length > 1 && (
        <Polyline
          points={visited.map((place) => `${at(place).x},${at(place).y}`).join(' ')}
          fill="none"
          stroke={palette.accent}
          strokeWidth={4 * unit}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {current && next && (
        <Polyline
          points={`${at(current).x},${at(current).y} ${at(next).x},${at(next).y}`}
          fill="none"
          stroke={palette.accent}
          strokeWidth={3 * unit}
          strokeDasharray={`${6 * unit} ${8 * unit}`}
          opacity={0.6}
        />
      )}
      {dots.map(({ place, show, key }) => (
        <G key={key}>
          <Circle cx={at(place).x} cy={at(place).y} r={5 * unit} fill={palette.accent} />
          {show && <PlaceLabel text={placeLabel(place)} point={at(place)} below unit={unit} palette={palette} />}
        </G>
      ))}
      {next && (
        <G>
          <Circle cx={at(next).x} cy={at(next).y} r={5 * unit} fill="none" stroke={palette.accent} strokeWidth={2 * unit} opacity={0.6} />
          {showNext && <PlaceLabel text={placeLabel(next)} point={at(next)} below unit={unit} palette={palette} />}
        </G>
      )}
      {current && (
        <G>
          <Circle cx={at(current).x} cy={at(current).y} r={14 * unit} fill={palette.accent} opacity={0.2} />
          <Circle cx={at(current).x} cy={at(current).y} r={7 * unit} fill={palette.accent} stroke="#ffffff" strokeWidth={2 * unit} />
          <PlaceLabel text={placeLabel(current)} point={at(current)} unit={unit} palette={palette} strong />
        </G>
      )}
    </G>
  )
}

// 장소 이름. 바탕색 테두리를 먼저 굵게 그려 지도 위에서도 읽히게 한다.
function PlaceLabel({
  text,
  point,
  unit,
  palette,
  below = false,
  strong = false,
}: {
  text: string
  point: MapPoint
  unit: number
  palette: Palette
  below?: boolean
  strong?: boolean
}) {
  const y = below ? point.y + 20 * unit : point.y - 14 * unit
  const fontSize = (strong ? 15 : 12) * unit
  const weight = strong ? '700' : '400'
  return (
    <G>
      <SvgText
        x={point.x}
        y={y}
        fontSize={fontSize}
        fontWeight={weight}
        textAnchor="middle"
        fill={palette.halo}
        stroke={palette.halo}
        strokeWidth={4 * unit}
        strokeLinejoin="round"
      >
        {text}
      </SvgText>
      <SvgText x={point.x} y={y} fontSize={fontSize} fontWeight={weight} textAnchor="middle" fill={palette.ink}>
        {text}
      </SvgText>
    </G>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
})
