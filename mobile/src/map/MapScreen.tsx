import { useEffect, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  cameraAt,
  fitCamera,
  flashTiming,
  flyCamera,
  project,
  REGION_CAMERA,
  SPAN_DEGREES,
  spanOf,
  zoomCamera,
  type Camera,
  type PlaceChange,
  type Route,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { RoundButton } from '../ui/IconButton'
import { OverlayHeader } from '../ui/OverlayScreen'
import { useReduceMotion } from '../ui/useReduceMotion'
import MapView, { clampToBasemap, placeLabel } from './MapView'

type Props = {
  route: Route
  // 장면이 바뀌어 장소가 달라져서 저절로 열렸을 때 그 변화. 지도가 이전 장소에서 새 장소로 날아간 뒤 잠시 머물고 저절로 닫힌다.
  // 그동안 지도를 만지면 닫히지 않고 그대로 남는다.
  auto: PlaceChange | null
  onClose: () => void
}

// 지나온 장소와 다음 장소가 모두 보이는 범위
function routeCamera(route: Route, aspect: number): Camera {
  const points = [...route.visited, ...(route.next ? [route.next] : [])].map((place) => project(place.lng, place.lat))
  return fitCamera(points, aspect, {
    padding: 0.15,
    minSpan: spanOf(SPAN_DEGREES.closest),
    single: spanOf(SPAN_DEGREES.place),
    empty: REGION_CAMERA,
  })
}

function startCamera(auto: PlaceChange): Camera {
  return auto.from ? cameraAt(auto.from.lng, auto.from.lat, SPAN_DEGREES.from) : REGION_CAMERA
}

export default function MapScreen({ route, auto, onClose }: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const reduce = useReduceMotion()
  const [camera, setCamera] = useState<Camera>(() => (auto ? startCamera(auto) : REGION_CAMERA))
  const [aspect, setAspect] = useState(1)
  // 사용자가 지도를 만져서 저절로 닫히지 않게 됨
  const [pinned, setPinned] = useState(false)
  const opacity = useRef(new Animated.Value(1)).current
  const frame = useRef<number | null>(null)
  const fitted = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // 단추로 연 지도는 화면 비율을 안 뒤 한 번 지나온 길에 맞춘다.
  function handleAspect(next: number) {
    setAspect(next)
    if (!auto && !fitted.current) {
      fitted.current = true
      setCamera(clampToBasemap(routeCamera(route, next)))
    }
  }

  // 저절로 열렸을 때: 이전 장소(없으면 넓은 범위)를 잠깐 보여 준 뒤 새 장소로 날아간다. 동작 줄이기면 바로 옮긴다.
  useEffect(() => {
    if (!auto) return
    const timing = flashTiming(reduce)
    const from = startCamera(auto)
    const to = cameraAt(auto.to.lng, auto.to.lat, SPAN_DEGREES.place)
    const lead = setTimeout(() => {
      if (timing.fly === 0) {
        setCamera(to)
        return
      }
      const began = Date.now()
      const step = () => {
        const t = Math.min(1, (Date.now() - began) / timing.fly)
        setCamera(flyCamera(from, to, t))
        frame.current = t < 1 ? requestAnimationFrame(step) : null
      }
      frame.current = requestAnimationFrame(step)
    }, timing.lead)
    return () => {
      clearTimeout(lead)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [auto, reduce])

  // 도착 후 잠시 머물다가 사라진다. 사용자가 만지면 멈춘다.
  useEffect(() => {
    if (!auto || pinned) return
    const timing = flashTiming(reduce)
    const arrive = timing.lead + timing.fly
    const fade = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: timing.fade, useNativeDriver: Platform.OS !== 'web' }).start()
    }, arrive + timing.hold)
    const close = setTimeout(() => closeRef.current(), arrive + timing.hold + timing.fade)
    return () => {
      clearTimeout(fade)
      clearTimeout(close)
    }
  }, [auto, pinned, reduce, opacity])

  function pin() {
    if (!auto || pinned) return
    setPinned(true)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    opacity.stopAnimation()
    opacity.setValue(1)
  }

  function zoom(factor: number) {
    pin()
    setCamera((current) => clampToBasemap(zoomCamera(current, factor, aspect)))
  }

  const { current } = route
  const note =
    auto && !pinned
      ? '장소가 바뀌어 잠시 보여 드려요. 곧 닫히고, 지도를 만지면 그대로 열려 있어요.'
      : '오늘날의 해안선과 강 위에 표시했어요. 추정 위치는 정확하지 않을 수 있어요.'

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.paper, paddingTop: insets.top, opacity }]}
      accessibilityViewIsModal
      onStartShouldSetResponderCapture={() => {
        pin()
        return false
      }}
    >
      <OverlayHeader title="여정 지도" backLabel="지도 닫기" onBack={onClose} />

      <View style={styles.canvas}>
        <MapView route={route} camera={camera} onCameraChange={setCamera} onInteract={pin} onAspect={handleAspect} />
        <View style={styles.zoom}>
          <RoundButton name="plus" label="지도 확대" onPress={() => zoom(1.6)} />
          <RoundButton name="minus" label="지도 축소" onPress={() => zoom(1 / 1.6)} />
        </View>
      </View>

      {current ? (
        <View style={styles.info}>
          <Text style={[styles.infoLabel, { color: palette.inkFaint }]}>{auto ? '새 장소' : '지금 위치'}</Text>
          <Text style={[styles.infoName, { color: palette.ink }]}>
            {auto?.from ? <Text style={{ color: palette.inkSoft }}>{placeLabel(auto.from)} → </Text> : null}
            {placeLabel(current)}
          </Text>
          {current.description ? (
            <Text style={[styles.infoDescription, { color: palette.inkSoft }]}>{current.description}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.info, styles.empty, { color: palette.inkFaint }]}>아직 지도에 표시할 장소가 없어요</Text>
      )}
      <Text
        style={[styles.note, { color: palette.inkFaint, paddingBottom: 12 + insets.bottom }]}
        accessibilityLiveRegion={auto ? 'polite' : 'none'}
      >
        {note}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  zoom: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  info: { paddingVertical: 14, paddingHorizontal: 16, gap: 4 },
  infoLabel: { fontSize: 12 },
  infoName: { fontFamily: fonts.serif, fontSize: 18 },
  infoDescription: { fontSize: 14, lineHeight: 22.4 },
  empty: { fontSize: 14 },
  note: { paddingTop: 12, paddingHorizontal: 16, fontSize: 12 },
})
