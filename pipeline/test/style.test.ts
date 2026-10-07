import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mimeType, readStyle, referencePaths, writeStyle } from '../src/images/style.ts'
import type { Style } from '../src/schema.ts'

const style: Style = {
  description: '수채화풍',
  promptPrefix: 'Watercolor illustration.',
  promptRules: 'No text in the image.',
  references: [{ file: 'brush.jpg', label: '붓질', source: '퍼블릭 도메인' }],
  referenceInstruction: 'Images are style references.',
}

let dir: string
let file: string
let refsDir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'style-test-'))
  file = path.join(dir, 'style.json')
  refsDir = dir
  await writeFile(path.join(dir, 'brush.jpg'), Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readStyle', () => {
  it('화풍을 읽는다', async () => {
    await writeFile(file, JSON.stringify(style))
    expect(await readStyle(file, { refsDir })).toEqual(style)
  })

  it('참고 이미지 파일이 없으면 오류를 낸다', async () => {
    await writeFile(file, JSON.stringify({ ...style, references: [{ file: 'none.png', label: '', source: '' }] }))
    await expect(readStyle(file, { refsDir })).rejects.toThrow('화풍 참고 이미지가 없습니다: none.png')
  })

  it('requireFiles가 false면 파일이 없어도 읽는다', async () => {
    const missing = { ...style, references: [{ file: 'none.png', label: '', source: '' }] }
    await writeFile(file, JSON.stringify(missing))
    expect((await readStyle(file, { refsDir, requireFiles: false })).references[0]!.file).toBe('none.png')
  })

  it('예전 문자열 참고 이미지 형식은 거부한다', async () => {
    await writeFile(file, JSON.stringify({ ...style, references: ['brush.jpg'] }))
    await expect(readStyle(file, { refsDir })).rejects.toThrow()
  })
})

describe('writeStyle', () => {
  it('두 칸 들여쓰기와 끝 줄바꿈으로 쓴다', async () => {
    await writeStyle(style, { file, refsDir })
    expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(style, null, 2)}\n`)
  })

  it('없는 참고 파일이면 쓰지 않는다', async () => {
    const bad = { ...style, references: [{ file: 'none.png', label: '', source: '' }] }
    await expect(writeStyle(bad, { file, refsDir })).rejects.toThrow('화풍 참고 이미지가 없습니다: none.png')
    await expect(readFile(file, 'utf8')).rejects.toThrow()
  })

  it('스키마에 맞지 않으면 쓰지 않는다', async () => {
    await expect(writeStyle({ ...style, promptPrefix: '' }, { file, refsDir })).rejects.toThrow()
  })

  it('같은 참고 파일이 두 번 있으면 거부한다', async () => {
    const twice = { ...style, references: [style.references[0]!, style.references[0]!] }
    await expect(writeStyle(twice, { file, refsDir })).rejects.toThrow('화풍 참고 이미지가 두 번 있습니다: brush.jpg')
  })
})

describe('referencePaths', () => {
  it('참고 이미지 경로를 순서대로 돌려준다', () => {
    const two = { ...style, references: [...style.references, { file: 'sky.png', label: '', source: '' }] }
    expect(referencePaths(two, '/refs')).toEqual([path.join('/refs', 'brush.jpg'), path.join('/refs', 'sky.png')])
  })
})

describe('mimeType', () => {
  it('확장자로 MIME을 정한다', () => {
    expect(mimeType('a.jpg')).toBe('image/jpeg')
    expect(mimeType('a.JPEG')).toBe('image/jpeg')
    expect(mimeType('a.png')).toBe('image/png')
    expect(mimeType('dir/a.webp')).toBe('image/webp')
  })

  it('모르는 확장자는 오류를 낸다', () => {
    expect(() => mimeType('a.gif')).toThrow('그림 확장자를 알 수 없습니다: a.gif')
  })
})
