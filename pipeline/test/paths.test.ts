import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listBookFiles } from '../src/paths.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'paths-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function touch(...names: string[]): Promise<void> {
  for (const name of names) await writeFile(path.join(dir, name), '{}')
}

describe('listBookFiles', () => {
  it('책 파일이 있는 책을 파일 이름순이 아니라 성경 순서로 돌려준다', async () => {
    await touch('revelation.json', 'psalms.json', 'genesis.json', '1-samuel.json', 'exodus.json')
    expect(await listBookFiles(dir)).toEqual(['genesis', 'exodus', '1-samuel', 'psalms', 'revelation'])
  })

  it('책 파일이 아닌 파일은 건너뛴다', async () => {
    // 사전, 안내 글, 책이 아닌 JSON, 임시 파일, 장 파일, 책 id가 아닌 이름
    await touch('genesis.json', 'lexicon.json', 'README.md', 'notes.json', 'exodus.json.tmp', 'leviticus-01.json', 'Numbers.json', 'genesis')
    expect(await listBookFiles(dir)).toEqual(['genesis'])
  })

  it('책 파일이 하나도 없거나 폴더가 없으면 빈 목록', async () => {
    expect(await listBookFiles(dir)).toEqual([])
    await touch('lexicon.json', 'README.md')
    expect(await listBookFiles(dir)).toEqual([])
    expect(await listBookFiles(path.join(dir, 'none'))).toEqual([])
  })
})
