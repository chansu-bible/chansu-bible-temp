// Natural Earth 1:50m(퍼블릭 도메인)의 육지·호수·강을 근동 일대로 잘라 여정 지도의 바탕 SVG 경로로 바꾼다.
// 실행: npm run basemap -w mobile  →  src/map/basemap.generated.ts (만든 파일은 커밋한다)
import bboxClip from '@turf/bbox-clip'
import simplify from '@turf/simplify'
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { project } from 'reader-core'

// 서경 10도~동경 65도, 북위 5~50도: 다시스(스페인)부터 이란, 구스(에티오피아)부터 흑해까지
const BBOX: [number, number, number, number] = [-10, 5, 65, 50]
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
// 단순화 허용 오차(도). 폰 화면에서 가장 가까이 볼 때(경도 4.4도 폭)도 각이 보이지 않을 만큼
const TOLERANCE = 0.02

// 바다와 큰 강의 이름. 강 이름은 개역한글을 따른다.
const LABELS = [
  { text: '지중해', kind: 'sea', lng: 18, lat: 34.2 },
  { text: '홍해', kind: 'sea', lng: 38.6, lat: 20.5 },
  { text: '페르시아 만', kind: 'sea', lng: 51.2, lat: 27 },
  { text: '흑해', kind: 'sea', lng: 34.5, lat: 43.2 },
  { text: '카스피 해', kind: 'sea', lng: 50.6, lat: 41.8 },
  { text: '유브라데', kind: 'river', lng: 40.2, lat: 35.6 },
  { text: '힛데겔', kind: 'river', lng: 43.9, lat: 35.2 },
  { text: '나일', kind: 'river', lng: 31.9, lat: 26.8 },
] as const

type Shape = Polygon | MultiPolygon | LineString | MultiLineString

async function load(name: string): Promise<FeatureCollection<Shape>> {
  const response = await fetch(SOURCE + name)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return (await response.json()) as FeatureCollection<Shape>
}

const round = (value: number) => Math.round(value * 10) / 10

function point([lng, lat]: Position): string {
  const p = project(lng!, lat!)
  return `${round(p.x)} ${round(p.y)}`
}

function line(coordinates: Position[], close: boolean): string {
  return coordinates.length < 2 ? '' : `M${coordinates.map(point).join('L')}${close ? 'Z' : ''}`
}

// 잘라 낸 뒤 고리가 될 수 없는 조각(점 4개 미만)은 버린다.
const rings = (polygon: Position[][]) => polygon.filter((ring) => ring.length >= 4)

function toPath(feature: Feature<Shape>): string {
  const clipped = bboxClip(feature as Feature<Polygon | MultiPolygon | LineString | MultiLineString>, BBOX)
  const geometry = clipped.geometry as Shape
  if (geometry.type === 'Polygon') geometry.coordinates = rings(geometry.coordinates)
  if (geometry.type === 'MultiPolygon') geometry.coordinates = geometry.coordinates.map(rings).filter((polygon) => polygon.length > 0)
  if (geometry.type === 'MultiLineString') geometry.coordinates = geometry.coordinates.filter((part) => part.length >= 2)
  if (geometry.coordinates.length === 0) return ''

  let shape = geometry
  try {
    shape = simplify({ ...clipped, geometry } as Feature<Shape>, { tolerance: TOLERANCE }).geometry as Shape
  } catch {
    // 단순화할 수 없는 작은 조각은 그대로 쓴다.
  }
  switch (shape.type) {
    case 'Polygon':
      return rings(shape.coordinates).map((ring) => line(ring, true)).join('')
    case 'MultiPolygon':
      return shape.coordinates.flatMap(rings).map((ring) => line(ring, true)).join('')
    case 'LineString':
      return line(shape.coordinates, false)
    case 'MultiLineString':
      return shape.coordinates.map((part) => line(part, false)).join('')
  }
}

const paths = (collection: FeatureCollection<Shape>) => collection.features.map(toPath).join('')

const [land, lakes, rivers] = await Promise.all([
  load('ne_50m_land.geojson'),
  load('ne_50m_lakes.geojson'),
  load('ne_50m_rivers_lake_centerlines.geojson'),
])

const [west, south, east, north] = BBOX
const topLeft = project(west, north)
const bottomRight = project(east, south)
const basemap = {
  bounds: { minX: round(topLeft.x), minY: round(topLeft.y), maxX: round(bottomRight.x), maxY: round(bottomRight.y) },
  land: paths(land),
  lakes: paths(lakes),
  rivers: paths(rivers),
  labels: LABELS.map(({ text, kind, lng, lat }) => {
    const p = project(lng, lat)
    return { text, kind, x: round(p.x), y: round(p.y) }
  }),
}

const out = path.resolve(import.meta.dirname, '../src/map/basemap.generated.ts')
await mkdir(path.dirname(out), { recursive: true })
await writeFile(
  out,
  [
    '// npm run basemap -w mobile이 만든다. 고치지 말 것.',
    '// Natural Earth 1:50m 육지·호수·강(퍼블릭 도메인, https://www.naturalearthdata.com), 서경 10도~동경 65도, 북위 5~50도.',
    "// 좌표는 reader-core의 project()(북위 33도 기준 등장방형, 위도 1도 = 10단위)로 바꾼 값이다.",
    "export type BasemapLabel = { text: string; kind: 'sea' | 'river'; x: number; y: number }",
    `export const BASEMAP: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; land: string; lakes: string; rivers: string; labels: BasemapLabel[] } = ${JSON.stringify(basemap)}`,
    '',
  ].join('\n'),
)
const kb = (text: string) => `${Math.round(text.length / 1024)}KB`
console.log(`바탕 지도: 육지 ${kb(basemap.land)}, 호수 ${kb(basemap.lakes)}, 강 ${kb(basemap.rivers)} → ${out}`)
