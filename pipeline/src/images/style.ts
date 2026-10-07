import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { refsDir as defaultRefsDir, styleFile } from '../paths.ts'
import { StyleSchema, type Style } from '../schema.ts'

// 모든 참고 이미지가 refs 폴더에 있고 같은 파일이 두 번 들어 있지 않은지 확인한다.
function assertReferences(style: Style, dir: string): void {
  const seen = new Set<string>()
  for (const reference of style.references) {
    if (seen.has(reference.file)) throw new Error(`화풍 참고 이미지가 두 번 있습니다: ${reference.file}`)
    seen.add(reference.file)
    if (!existsSync(path.join(dir, reference.file))) throw new Error(`화풍 참고 이미지가 없습니다: ${reference.file}`)
  }
}

// 화풍을 읽는다. requireFiles(기본 true)면 참고 이미지 파일이 실제로 있는지도 확인한다.
export async function readStyle(
  file: string = styleFile,
  options: { refsDir?: string; requireFiles?: boolean } = {},
): Promise<Style> {
  const style = StyleSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  if (options.requireFiles ?? true) assertReferences(style, options.refsDir ?? defaultRefsDir)
  return style
}

// 검증한 뒤 쓴다. 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거친다.
export async function writeStyle(style: Style, options: { file?: string; refsDir?: string } = {}): Promise<void> {
  const file = options.file ?? styleFile
  const parsed = StyleSchema.parse(style)
  assertReferences(parsed, options.refsDir ?? defaultRefsDir)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await rename(`${file}.tmp`, file)
}

// 모델에 함께 보낼 참고 이미지 파일 경로
export function referencePaths(style: Style, dir: string = defaultRefsDir): string[] {
  return style.references.map((reference) => path.join(dir, reference.file))
}

export function mimeType(file: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  switch (path.extname(file).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      throw new Error(`그림 확장자를 알 수 없습니다: ${path.basename(file)}`)
  }
}
