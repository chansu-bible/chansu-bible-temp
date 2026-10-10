import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadAskIndex, readBundles } from '../src/ask/bundles.ts'

// 링크를 만들 수 없는 곳(관리자 권한이 없는 Windows)에서는 링크 시험을 건너뛴다.
const canSymlink = (() => {
  const probe = mkdtempSync(path.join(tmpdir(), 'server-link-'))
  try {
    symlinkSync(path.join(probe, 'target.json'), path.join(probe, 'link.json'), 'file')
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
})()

const bundleOf = (bookId: string | undefined, book: string) => ({ bookId, book, chapters: [], characters: [], places: [], things: [] })
// 본문 절이 하나 있어서 대목이 나오는 묶음
const withVerse = (bookId: string, book: string) => ({
  ...bundleOf(bookId, book),
  chapters: [{ chapter: 1, verses: [{ verse: 1, text: '태초에 하나님이 천지를 창조하시니라' }], scenes: [] }],
})

describe('책 묶음 폴더', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'chansu-bundles-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value))

  describe('readBundles', () => {
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

    it('읽지 못하는 JSON이면 그 파일 이름을 넣은 오류를 던진다', () => {
      // 쓰다 만 파일: 끝이 잘렸다.
      writeFileSync(path.join(dir, 'genesis.json'), JSON.stringify(bundleOf('genesis', '창세기')).slice(0, 30))
      expect(() => readBundles(dir)).toThrow(/genesis\.json을 읽지 못했습니다/)
    })

    it('책 묶음 모양이 아니면 그 파일 이름을 넣은 오류를 던진다', () => {
      const noName = { bookId: 'genesis', chapters: [], characters: [], places: [], things: [] }
      const wrongShapes = [{}, { memo: '책이 아니다' }, null, [], '책', noName, { ...bundleOf('genesis', '창세기'), chapters: {} }]
      for (const value of wrongShapes) {
        write('genesis.json', value)
        expect(() => readBundles(dir)).toThrow(/genesis\.json은 책 묶음 모양이 아닙니다/)
      }
    })

    it('폴더가 아니라 파일을 가리키면 오류를 던진다', () => {
      write('notes.json', { memo: '책이 아니다' })
      expect(() => readBundles(path.join(dir, 'notes.json'))).toThrow(/notes\.json/)
    })

    it.skipIf(!canSymlink)('링크인 <책 id>.json은 가리키는 파일을 따라가 읽는다', () => {
      // 묶음 폴더 밖에 있는 진짜 파일을 가리킨다.
      const store = mkdtempSync(path.join(tmpdir(), 'chansu-store-'))
      try {
        const real = path.join(store, 'bundle.json')
        writeFileSync(real, JSON.stringify(withVerse('genesis', '창세기')))
        symlinkSync(real, path.join(dir, 'genesis.json'), 'file')
        expect(readBundles(dir)).toMatchObject([{ bookId: 'genesis', book: '창세기', chapters: [{ chapter: 1, verses: [{ verse: 1 }] }] }])
      } finally {
        rmSync(store, { recursive: true, force: true })
      }
    })
  })

  describe('loadAskIndex', () => {
    let warnings: string[] = []
    beforeEach(() => {
      warnings = []
    })
    const load = (target = dir) => loadAskIndex(target, (message) => warnings.push(message))
    // 경고의 앞머리: 어느 폴더인지 밝힌다.
    const turnedOff = (target: string) => `묶음 폴더(${target})의 책 묶음을 쓰지 못해 질문하기를 끕니다. `

    it('묶음이 있으면 모든 책의 색인을 돌려주고 경고는 없다', () => {
      write('exodus.json', withVerse('exodus', '출애굽기'))
      write('genesis.json', withVerse('genesis', '창세기'))
      const index = load()
      expect(index?.books).toEqual(['genesis', 'exodus'])
      expect(index?.passages.map((passage) => passage.label)).toEqual(['본문 창세기 1:1', '본문 출애굽기 1:1'])
      expect(warnings).toEqual([])
    })

    it('책 묶음이 없으면 먼저 build를 하라는 경고와 함께 null이다', () => {
      write('notes.json', { memo: '책이 아니다' })
      const missing = path.join(dir, 'missing')
      expect(load()).toBeNull()
      expect(load(missing)).toBeNull()
      expect(warnings).toEqual(
        [dir, missing].map((target) => `묶음 폴더(${target})에 책 묶음이 없어 질문하기를 끕니다. 먼저 npm run pipeline -- build를 하세요.`),
      )
    })

    it('묶음 하나가 읽히지 않으면 성한 묶음이 있어도 질문하기를 통째로 끄고 어느 파일인지 알린다', () => {
      write('genesis.json', withVerse('genesis', '창세기'))
      writeFileSync(path.join(dir, 'exodus.json'), '{"bookId":"exodus","book":"출애굽')
      expect(load()).toBeNull()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.startsWith(turnedOff(dir))).toBe(true)
      expect(warnings[0]).toMatch(/exodus\.json을 읽지 못했습니다/)
    })

    it('모양이 다른 묶음, 책이 맞지 않는 묶음, 폴더가 아닌 경로도 경고와 함께 null이다', () => {
      write('genesis.json', {})
      expect(load()).toBeNull()
      expect(warnings.pop()).toMatch(/genesis\.json은 책 묶음 모양이 아닙니다/)

      write('genesis.json', withVerse('exodus', '출애굽기'))
      expect(load()).toBeNull()
      expect(warnings.pop()).toMatch(/genesis\.json의 bookId\(exodus\)/)

      write('notes.json', { memo: '책이 아니다' })
      const notFolder = path.join(dir, 'notes.json')
      expect(load(notFolder)).toBeNull()
      const warning = warnings.pop()!
      expect(warning.startsWith(turnedOff(notFolder))).toBe(true)
      // 앞머리를 뺀 이유에도 그 경로가 든다.
      expect(warning.slice(turnedOff(notFolder).length)).toMatch(/notes\.json/)
      expect(warnings).toEqual([])
    })

    it('겉모양은 맞아도 대목을 만들다 실패하면 질문하기만 꺼진다', () => {
      // 장에 본문 절 목록이 없다.
      write('genesis.json', { ...bundleOf('genesis', '창세기'), chapters: [{ chapter: 1 }] })
      expect(load()).toBeNull()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.startsWith(turnedOff(dir))).toBe(true)
      // 어느 파일로 대목을 만들다 실패했는지 밝힌다.
      expect(warnings[0]).toContain('genesis.json으로 대목을 만들지 못했습니다')
    })

    it('본문 절의 글이 문자열이 아니면 질문하기만 꺼지고, 어느 파일의 몇 장 몇 절인지 알린다', () => {
      // 성한 묶음이 앞에 있어도 문제의 둘째 묶음을 밝힌다. 글이 null이거나 숫자이거나 아예 없는 절이다.
      write('genesis.json', withVerse('genesis', '창세기'))
      for (const text of [null, 15, undefined]) {
        write('exodus.json', { ...bundleOf('exodus', '출애굽기'), chapters: [{ chapter: 2, verses: [{ verse: 3, text }], scenes: [] }] })
        expect(load()).toBeNull()
        const warning = warnings.pop()!
        expect(warning.startsWith(turnedOff(dir))).toBe(true)
        expect(warning).toContain('exodus.json으로 대목을 만들지 못했습니다: 2장 3절의 본문이 글이 아닙니다')
      }
      expect(warnings).toEqual([])
    })

    it.skipIf(!canSymlink)('가리키는 파일이 없는 링크면 질문하기를 끄고 어느 파일인지 알린다', () => {
      // 가리키는 파일이 옮겨지거나 지워진 링크
      symlinkSync(path.join(dir, 'moved', 'genesis.json'), path.join(dir, 'genesis.json'), 'file')
      expect(load()).toBeNull()
      expect(warnings).toHaveLength(1)
      expect(warnings[0]!.startsWith(turnedOff(dir))).toBe(true)
      expect(warnings[0]).toMatch(/genesis\.json을 읽지 못했습니다/)
    })
  })
})
