import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSourceBooks, readSource, readSourceChapter, readVerseCounts } from '../src/source/files.ts'

const chapter = (number: number, verseCount: number) => ({
  chapter: number,
  verses: Array.from({ length: verseCount }, (_, index) => ({ verse: index + 1, text: `${number}장 ${index + 1}절` })),
})

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'pipeline-'))
  await writeFile(
    path.join(dir, 'genesis.json'),
    JSON.stringify({ book: '창세기', translation: '개역한글', chapters: [chapter(1, 3), chapter(2, 2)] }),
  )
  // 출애굽기는 2장만 받아 둔 경우
  await writeFile(path.join(dir, 'exodus.json'), JSON.stringify({ book: '출애굽기', translation: '개역한글', chapters: [chapter(2, 4)] }))
  await writeFile(path.join(dir, 'notes.json'), JSON.stringify({ memo: '책이 아닌 파일' }))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('listSourceBooks', () => {
  it('본문 파일이 있는 책을 성경 순서로 돌려주고, 책이 아닌 파일은 건너뛴다', async () => {
    await writeFile(path.join(dir, 'leviticus.json.tmp'), '{}')
    expect(await listSourceBooks(dir)).toEqual(['genesis', 'exodus'])
  })

  it('폴더가 없으면 빈 목록', async () => {
    expect(await listSourceBooks(path.join(dir, 'none'))).toEqual([])
  })
})

describe('readVerseCounts', () => {
  it('책마다 장별 절 수를 센다. 받지 않은 장은 0이다', async () => {
    expect(await readVerseCounts(dir)).toEqual(
      new Map([
        ['genesis', [3, 2]],
        ['exodus', [0, 4]],
      ]),
    )
  })
})

describe('readSource', () => {
  it('책의 본문을 읽는다', async () => {
    const source = await readSource('genesis', dir)
    expect(source.book).toBe('창세기')
    expect(source.chapters.map((item) => item.chapter)).toEqual([1, 2])
  })

  it('파일의 책 이름이 그 책이 아니면 오류', async () => {
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify({ book: '출애굽기', translation: '개역한글', chapters: [] }))
    await expect(readSource('genesis', dir)).rejects.toThrow('책 이름(출애굽기)이 창세기가 아닙니다')
  })

  it('본문 파일이 없으면 source 단계를 먼저 돌리라고 한다', async () => {
    await expect(readSource('leviticus', dir)).rejects.toThrow('레위기 본문이 없습니다. 먼저 source --book leviticus를 실행하세요.')
  })

  it('형식에 맞지 않으면 파일 이름과 함께 오류', async () => {
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify({ book: '창세기' }))
    await expect(readSource('genesis', dir)).rejects.toThrow('genesis.json')
  })
})

describe('readSourceChapter', () => {
  it('한 장을 읽고, 없는 장이면 오류', async () => {
    expect((await readSourceChapter('exodus', 2, dir)).verses).toHaveLength(4)
    await expect(readSourceChapter('exodus', 1, dir)).rejects.toThrow('출애굽기 본문에 1장이 없습니다')
  })
})
