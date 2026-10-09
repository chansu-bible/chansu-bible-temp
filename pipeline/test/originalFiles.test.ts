import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readOriginal } from '../src/original/files.ts'
import { displayPath } from '../src/paths.ts'

const original = { chapters: [{ chapter: 1, verses: [{ verse: 1, words: [{ text: 'א', strong: 'H7225', morph: 'HR/Ncfsa' }] }] }] }

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'original-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// 책의 원어 파일을 읽다 난 오류의 글을 돌려준다.
async function failure(book: 'genesis' | 'exodus'): Promise<string> {
  try {
    await readOriginal(book, dir)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('오류가 나지 않았습니다')
}

describe('readOriginal', () => {
  it('책의 원어 파일을 읽는다', async () => {
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify(original))
    await writeFile(path.join(dir, 'exodus.json'), JSON.stringify({ chapters: [] }))
    expect(await readOriginal('genesis', dir)).toEqual(original)
    expect((await readOriginal('exodus', dir)).chapters).toEqual([])
  })

  it('형식에 맞지 않으면 파일 이름을 앞에 붙여 오류를 낸다', async () => {
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify({ chapters: [{ chapter: 1 }] }))
    expect((await failure('genesis')).startsWith(`${displayPath(path.join(dir, 'genesis.json'))}: `)).toBe(true)
  })

  it('깨진 JSON이어도 파일 이름을 앞에 붙인다', async () => {
    await writeFile(path.join(dir, 'exodus.json'), '{ 깨진 JSON')
    expect((await failure('exodus')).startsWith(`${displayPath(path.join(dir, 'exodus.json'))}: `)).toBe(true)
  })

  it('파일이 없어도 어느 파일인지 알린다', async () => {
    const message = await failure('genesis')
    expect(message.startsWith(`${displayPath(path.join(dir, 'genesis.json'))}: `)).toBe(true)
    expect(message).toContain('ENOENT')
  })
})
