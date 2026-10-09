import { describe, expect, it } from 'vitest'
import {
  cameraAt,
  clampCamera,
  easeInOut,
  fitCamera,
  flyCamera,
  panCamera,
  project,
  REGION_CAMERA,
  SPAN_DEGREES,
  spanOf,
  viewBoxOf,
  zoomCamera,
  type Camera,
} from './mapView.ts'

const cos33 = Math.cos((33 * Math.PI) / 180)

function expectCamera(actual: Camera, expected: Camera) {
  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
  expect(actual.span).toBeCloseTo(expected.span)
}

describe('project', () => {
  it('경도는 북위 33도의 코사인을 곱해 펴고, 위도는 뒤집어 위쪽이 작은 y가 되게 한다', () => {
    const point = project(40, 33)
    expect(point.x).toBeCloseTo(40 * cos33 * 10)
    expect(point.y).toBeCloseTo(-330)
    expect(project(40, 35).y).toBeLessThan(project(40, 30).y)
  })
})

describe('범위', () => {
  it('spanOf는 경도 폭(도)을 지도 단위로 바꾼다', () => {
    expect(spanOf(10)).toBeCloseTo(10 * cos33 * 10)
  })

  it('cameraAt은 장소를 가운데에 둔다', () => {
    const camera = cameraAt(47.43, 31.02, SPAN_DEGREES.place)
    expect(camera.x).toBeCloseTo(project(47.43, 31.02).x)
    expect(camera.y).toBeCloseTo(project(47.43, 31.02).y)
    expect(camera.span).toBeCloseTo(spanOf(8.8))
  })

  it('viewBoxOf는 가운데와 폭, 화면 비율(세로÷가로)로 보는 상자를 만든다', () => {
    expect(viewBoxOf({ x: 100, y: -300, span: 200 }, 0.5)).toEqual({ x: 0, y: -350, width: 200, height: 100 })
  })
})

describe('fitCamera', () => {
  const options = { padding: 0.1, minSpan: 10, single: 50, empty: REGION_CAMERA }

  it('점이 없으면 empty를 준다', () => {
    expect(fitCamera([], 1, options)).toBe(REGION_CAMERA)
  })

  it('점이 하나면 그 점을 가운데에 두고 single 폭으로 본다', () => {
    expect(fitCamera([{ x: 5, y: 6 }], 1, options)).toEqual({ x: 5, y: 6, span: 50 })
  })

  it('가로로 퍼진 점은 가로 폭에 여백을 더한다', () => {
    expectCamera(fitCamera([{ x: 0, y: 0 }, { x: 100, y: 10 }], 1, options), { x: 50, y: 5, span: 120 })
  })

  it('세로로 퍼진 점은 화면 비율로 나눈 세로 폭을 쓴다', () => {
    // 세로 80, 화면 세로가 가로의 2배 → 필요한 가로 폭 40, 여백을 더해 48
    expectCamera(fitCamera([{ x: 0, y: 0 }, { x: 10, y: 80 }], 2, options), { x: 5, y: 40, span: 48 })
  })

  it('minSpan보다 좁히지 않는다', () => {
    expect(fitCamera([{ x: 0, y: 0 }, { x: 2, y: 0 }], 1, options).span).toBe(10)
  })
})

describe('flyCamera', () => {
  const from: Camera = { x: 0, y: 0, span: 100 }
  const to: Camera = { x: 400, y: 0, span: 50 }

  it('처음과 끝은 출발·도착 범위다', () => {
    expectCamera(flyCamera(from, to, 0), from)
    expectCamera(flyCamera(from, to, 1), to)
  })

  it('가운데쯤에서는 두 곳의 중간이고, 멀리 갈 때는 더 넓게 본다', () => {
    const middle = flyCamera(from, to, 0.5)
    expect(middle.x).toBeCloseTo(200)
    expect(middle.span).toBeGreaterThan(100)
  })

  it('t가 0~1을 벗어나면 끝으로 자른다', () => {
    expectCamera(flyCamera(from, to, 2), to)
  })

  it('easeInOut은 0, 절반, 1을 지난다', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(1)).toBe(1)
  })
})

describe('손가락으로 옮기기', () => {
  it('오른쪽으로 끌면 지도가 따라오므로 가운데는 왼쪽으로 간다', () => {
    expect(panCamera({ x: 0, y: 0, span: 200 }, 100, -40, 400)).toEqual({ x: -50, y: 20, span: 200 })
  })

  it('화면 폭을 모르면 그대로 둔다', () => {
    const camera = { x: 1, y: 2, span: 3 }
    expect(panCamera(camera, 10, 10, 0)).toBe(camera)
  })

  it('가운데를 기준으로 두 배 확대하면 폭이 반이 된다', () => {
    expect(zoomCamera({ x: 10, y: 20, span: 100 }, 2, 1)).toEqual({ x: 10, y: 20, span: 50 })
  })

  it('왼쪽 위를 기준으로 확대하면 왼쪽 위 모서리가 그대로 남는다', () => {
    const camera = { x: 0, y: 0, span: 100 }
    const before = viewBoxOf(camera, 1)
    const after = viewBoxOf(zoomCamera(camera, 2, 1, { fx: 0, fy: 0 }), 1)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(after.width).toBeCloseTo(50)
  })

  it('clampCamera는 바탕 지도 범위와 배율을 넘지 않게 자른다', () => {
    const bounds = { minX: 0, minY: -100, maxX: 100, maxY: 0 }
    expect(clampCamera({ x: 999, y: -999, span: 1 }, bounds, { minSpan: 5, maxSpan: 50 })).toEqual({
      x: 100,
      y: -100,
      span: 5,
    })
  })
})
