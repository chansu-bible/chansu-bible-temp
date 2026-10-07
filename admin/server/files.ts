import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from 'hono'
import { mimeType } from 'pipeline'
import { HttpError } from './errors.ts'

// 이름 앞부분 최대 길이. uniqueName이 "-2" 같은 꼬리를 붙여도 파일 이름 규칙(80자)을 넘지 않게 여유를 둔다.
const MAX_STEM = 70

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

// 올린 파일 이름을 참고 이미지 이름 규칙에 맞게 고친다. 확장자는 내용으로 정한 ext로 바꾼다.
// 남는 글자가 없으면(한글 이름 등) ref-YYYYMMDD-HHMMSS로 짓는다.
export function sanitizeReferenceName(original: string, ext: 'jpg' | 'png' | 'webp'): string {
  const stem = path.parse(path.basename(original)).name
  const cleaned = stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_STEM)
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  return `${cleaned || `ref-${timestamp()}`}.${ext}`
}

// 폴더에 같은 이름이 있거나 taken에 있으면 "-2", "-3"을 붙인다.
export function uniqueName(dir: string, name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken)
  const ext = path.extname(name)
  const stem = name.slice(0, name.length - ext.length)
  const free = (candidate: string) => !used.has(candidate) && !existsSync(path.join(dir, candidate))
  if (free(name)) return name
  for (let index = 2; ; index += 1) {
    const candidate = `${stem}-${index}${ext}`
    if (free(candidate)) return candidate
  }
}

// 그림 파일을 바이트로 답한다. Content-Type은 확장자로 정하고, 없으면 404.
export async function serveImage(c: Context, filePath: string): Promise<Response> {
  if (!existsSync(filePath)) throw new HttpError(404, `파일이 없습니다: ${path.basename(filePath)}`)
  const bytes = new Uint8Array(await readFile(filePath))
  return c.body(bytes, 200, { 'Content-Type': mimeType(filePath) })
}
