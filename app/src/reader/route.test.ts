import { describe, expect, it } from 'vitest'
import type { Chapter, Place, Scene } from '../content/types.ts'
import { buildRoute } from './route.ts'

function scene(id: string, placeId: string | null): Scene {
  return {
    id,
    verseStart: 1,
    verseEnd: 1,
    title: id,
    commentary: null,
    background: null,
    history: [],
    placeId,
    images: {},
    reviewStatus: 'none',
  }
}

function chapter(number: number, scenes: Scene[]): Chapter {
  return { chapter: number, verses: [], scenes }
}

const eden: Place = { id: 'eden', name: '에덴', description: '', estimated: true, lat: 31, lng: 47.4 }
const nod: Place = { id: 'nod', name: '놋', description: '', estimated: true, lat: 31, lng: 49 }
const ararat: Place = { id: 'ararat', name: '아라랏 산', description: '', estimated: false, lat: 39.7, lng: 44.3 }
const unmapped: Place = { id: 'somewhere', name: '어딘가', description: '', estimated: true, lat: null, lng: null }
const places = [eden, nod, ararat, unmapped]

describe('buildRoute', () => {
  it('아직 장소가 나오지 않았으면 비어 있고 다음 장소도 없다', () => {
    const chapters = [chapter(1, [scene('a', null), scene('b', 'eden')])]
    expect(buildRoute(chapters, places, 'a')).toEqual({ visited: [], current: null, next: null })
  })

  it('같은 장소가 연달아 나오면 하나로 합친다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'eden'), scene('c', 'nod')])]
    expect(buildRoute(chapters, places, 'b').visited).toEqual([eden])
  })

  it('장소가 없는 장면에서는 직전 위치를 유지한다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', null)])]
    expect(buildRoute(chapters, places, 'b').current).toEqual(eden)
  })

  it('장을 넘어가며 지나온 장소를 순서대로 모은다', () => {
    const chapters = [chapter(1, [scene('a', 'eden')]), chapter(2, [scene('b', 'nod'), scene('c', 'ararat')])]
    const route = buildRoute(chapters, places, 'c')
    expect(route.visited).toEqual([eden, nod, ararat])
    expect(route.current).toEqual(ararat)
    expect(route.next).toBeNull()
  })

  it('다음 장소는 현재 위치와 다른 첫 장소다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'eden'), scene('c', null), scene('d', 'nod')])]
    expect(buildRoute(chapters, places, 'a').next).toEqual(nod)
  })

  it('다시 돌아온 장소는 한 번 더 넣는다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'nod'), scene('c', 'eden')])]
    expect(buildRoute(chapters, places, 'c').visited).toEqual([eden, nod, eden])
  })

  it('좌표가 없는 장소는 건너뛴다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'somewhere')])]
    expect(buildRoute(chapters, places, 'b').visited).toEqual([eden])
  })

  it('다음 장소가 이미 지나온 곳이어도 다음 장소로 보여준다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'nod'), scene('c', 'eden')])]
    expect(buildRoute(chapters, places, 'b').next).toEqual(eden)
  })

  it('다음 장소를 찾을 때 좌표가 없는 장소는 건너뛴다', () => {
    const chapters = [chapter(1, [scene('a', 'eden'), scene('b', 'somewhere'), scene('c', 'nod')])]
    expect(buildRoute(chapters, places, 'a').next).toEqual(nod)
  })
})
