import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readBundles } from '../src/ask/bundles.ts'

const bundleOf = (bookId: string | undefined, book: string) => ({ bookId, book, chapters: [], characters: [], places: [], things: [] })

describe('readBundles', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'chansu-bundles-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value))

  it('<책 id>.json만 성경 순서로 읽고 다른 파일과 폴더는 건너뛴다', () => {
    // 이름 순서(exodus, genesis, numbers)와 만든 순서, 성경 순서가 모두 다르다.
    write('numbers.json', bundleOf('numbers', '민수기'))
    write('genesis.json', bundleOf('genesis', '창세기'))
    write('exodus.json', bundleOf('exodus', '출애굽기'))
    write('notes.json', { memo: '책이 아니다' })
    write('not-a-book.json', bundleOf('genesis', '창세기'))
    write('genesis.json.bak', bundleOf('genesis', '창세기'))
    writeFileSync(path.join(dir, 'readme.txt'), '책 묶음이 아니다')
    // 폴더는 이름이 책 id.json이어도 읽지 않는다.
    mkdirSync(path.join(dir, 'leviticus.json'))
    mkdirSync(path.join(dir, 'audio'))
    mkdirSync(path.join(dir, 'images'))
    expect(readBundles(dir).map((bundle) => bundle.bookId)).toEqual(['genesis', 'exodus', 'numbers'])
  })

  it('묶음이 없거나 폴더가 없으면 빈 목록이다', () => {
    write('notes.json', { memo: '책이 아니다' })
    expect(readBundles(dir)).toEqual([])
    expect(readBundles(path.join(dir, 'missing'))).toEqual([])
  })

  it('bookId가 없는 옛 묶음은 파일 이름의 책으로 채우고, 파일 이름과 다르면 멈춘다', () => {
    write('genesis.json', bundleOf(undefined, '창세기'))
    expect(readBundles(dir)).toMatchObject([{ bookId: 'genesis', book: '창세기' }])

    // 창세기 묶음을 출애굽기 파일로 복사하면 대목 id가 겹친다.
    write('exodus.json', bundleOf('genesis', '창세기'))
    expect(() => readBundles(dir)).toThrow(/exodus\.json.*bookId\(genesis\)/)
  })
})
