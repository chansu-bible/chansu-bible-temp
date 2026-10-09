// 여정 지도의 투영과 보는 범위 계산. 앱은 이 단위로 그린 SVG 지도(바탕 지도와 장소)를 보여 준다.

// 북위 33도를 표준 위선으로 하는 등장방형 투영이다. 근동 일대(북위 5~50도)만 그려서 왜곡이 작다.
const standardParallel = 33
const cosPhi = Math.cos((standardParallel * Math.PI) / 180)
// 위도 1도가 지도 10단위다.
export const MAP_UNITS_PER_DEGREE = 10

export type MapPoint = { x: number; y: number }

export function project(lng: number, lat: number): MapPoint {
  return { x: lng * cosPhi * MAP_UNITS_PER_DEGREE, y: -lat * MAP_UNITS_PER_DEGREE }
}

// 보는 범위. x, y는 가운데, span은 보이는 가로 폭(지도 단위)이다.
export type Camera = { x: number; y: number; span: number }

// 보이는 가로 폭(경도 몇 도). 웹 목업 지도(Leaflet)의 배율 4·5·6·7을 폰 너비(약 400px)로 옮긴 값이다.
// region: 처음 열 때의 근동 전체, from: 장소 전환 때 출발 장소, place: 장소 하나, closest: 가장 가까이
export const SPAN_DEGREES = { region: 35, from: 17.5, place: 8.8, closest: 4.4 } as const

export function spanOf(degrees: number): number {
  return degrees * cosPhi * MAP_UNITS_PER_DEGREE
}

export function cameraAt(lng: number, lat: number, spanDegrees: number): Camera {
  return { ...project(lng, lat), span: spanOf(spanDegrees) }
}

// 아직 지나온 장소가 없을 때 보여 줄 범위: 고대 근동 일대(북위 33.5도, 동경 42도)
export const REGION_CAMERA: Camera = cameraAt(42, 33.5, SPAN_DEGREES.region)

export type ViewBox = { x: number; y: number; width: number; height: number }

// aspect는 화면의 세로 ÷ 가로다.
export function viewBoxOf(camera: Camera, aspect: number): ViewBox {
  const width = camera.span
  const height = camera.span * aspect
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height }
}

export type FitOptions = { padding: number; minSpan: number; single: number; empty: Camera }

// 점들이 모두 보이는 범위. 양쪽에 padding(폭의 비율)만큼 여백을 두고 minSpan보다 좁히지 않는다.
// 점이 하나(또는 모두 한 자리)면 그 점을 가운데에 두고 single 폭으로, 점이 없으면 empty로 본다.
export function fitCamera(points: MapPoint[], aspect: number, options: FitOptions): Camera {
  if (points.length === 0) return options.empty
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  if (maxX === minX && maxY === minY) return { ...center, span: options.single }
  const needed = Math.max(maxX - minX, (maxY - minY) / aspect)
  return { ...center, span: Math.max(options.minSpan, needed * (1 + 2 * options.padding)) }
}

// 0 → 1로 가는 동안 천천히 출발해 천천히 멈춘다.
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

// from에서 to로 날아가는 도중의 범위(t는 0~1). 멀리 갈수록 중간에 더 넓게 보았다가 다시 다가간다.
export function flyCamera(from: Camera, to: Camera, t: number): Camera {
  const e = easeInOut(Math.min(1, Math.max(0, t)))
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const lift = Math.min(1, distance / Math.max(from.span, to.span))
  const logSpan = Math.log(from.span) + (Math.log(to.span) - Math.log(from.span)) * e
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    span: Math.exp(logSpan) * (1 + lift * Math.sin(Math.PI * e)),
  }
}

// 화면을 dx, dy 픽셀 끌었을 때의 범위. 지도가 손가락을 따라오므로 가운데는 반대로 움직인다.
export function panCamera(camera: Camera, dx: number, dy: number, widthPixels: number): Camera {
  if (widthPixels <= 0) return camera
  const unit = camera.span / widthPixels
  return { ...camera, x: camera.x - dx * unit, y: camera.y - dy * unit }
}

// factor배 확대한 범위(2면 두 배 가까이). focus는 화면에서 제자리에 남길 점(가로·세로 0~1 비율)이고 기본은 가운데다.
export function zoomCamera(
  camera: Camera,
  factor: number,
  aspect: number,
  focus: { fx: number; fy: number } = { fx: 0.5, fy: 0.5 },
): Camera {
  if (factor <= 0) return camera
  const view = viewBoxOf(camera, aspect)
  const anchor = { x: view.x + view.width * focus.fx, y: view.y + view.height * focus.fy }
  return {
    x: anchor.x + (camera.x - anchor.x) / factor,
    y: anchor.y + (camera.y - anchor.y) / factor,
    span: camera.span / factor,
  }
}

export type MapBounds = { minX: number; minY: number; maxX: number; maxY: number }

// 가운데가 바탕 지도 밖으로 나가지 않게, 너무 멀거나 가까이 보지 않게 막는다.
export function clampCamera(camera: Camera, bounds: MapBounds, limits: { minSpan: number; maxSpan: number }): Camera {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, camera.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, camera.y)),
    span: Math.min(limits.maxSpan, Math.max(limits.minSpan, camera.span)),
  }
}
