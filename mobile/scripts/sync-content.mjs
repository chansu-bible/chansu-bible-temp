// 웹 묶음(app/public/content, 파이프라인 build의 결과)에서 앱에 넣을 것만 assets/content로 복사하고,
// 그림·음성 경로를 require() 표로 바꾼 src/content/assets.generated.ts를 만든다.
// 그림은 기본 그림 버전만 넣는다(웹의 그림 버전 전환은 시험용이라 앱에는 두지 않는다).
// 바뀐 파일만 복사하고 필요 없어진 파일만 지운다. Metro가 떠 있는 동안 돌려도(형 검사가 먼저 부른다) 파일이 잠깐 사라지지 않게.
// 실행: npm run content -w mobile  (먼저 npm run pipeline -- build)
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const mobile = path.resolve(import.meta.dirname, '..')
const source = path.resolve(mobile, '../app/public/content')
const target = path.join(mobile, 'assets/content')
const generated = path.join(mobile, 'src/content/assets.generated.ts')

if (!existsSync(path.join(source, 'genesis.json'))) {
  console.error('app/public/content/genesis.json이 없습니다. 먼저 npm run pipeline -- build를 실행하세요.')
  process.exit(1)
}

const bundle = JSON.parse(await readFile(path.join(source, 'genesis.json'), 'utf8'))
const version = bundle.defaultImageVersion
const images = []
const audio = []
for (const chapter of bundle.chapters) {
  for (const scene of chapter.scenes) {
    const image = version ? scene.images[version] : undefined
    if (image) images.push(image)
  }
  for (const verse of chapter.verses) if (verse.audio) audio.push(verse.audio)
}

// 묶음 안 경로는 content/로 시작한다(docs/content-bundle.md). 앞의 content/를 떼면 묶음 폴더 기준이다.
const inBundle = (file) => file.replace(/^content\//, '')

// 내용이 같으면 쓰지 않는다.
async function writeIfChanged(file, bytes) {
  const current = await readFile(file).catch(() => null)
  if (current && Buffer.compare(current, bytes) === 0) return false
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return true
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const wanted = new Set(['genesis.json', ...[...images, ...audio].map(inBundle)].map((file) => path.join(target, file)))
let copied = 0
for (const file of wanted) {
  const from = path.join(source, path.relative(target, file))
  if (await writeIfChanged(file, await readFile(from))) copied++
}
let removed = 0
for await (const file of walk(target)) {
  if (!wanted.has(file)) {
    await rm(file)
    removed++
  }
}

const entry = (file) => `  ${JSON.stringify(file)}: require(${JSON.stringify(`../../assets/content/${inBundle(file)}`)}),`
const table = [
  '// npm run content -w mobile이 만든다. 고치지 말 것.',
  '// 묶음 안 경로(content/...) → 앱에 넣은 자원',
  'export const imageAssets: Record<string, number> = {',
  ...images.map(entry),
  '}',
  '',
  'export const audioAssets: Record<string, number> = {',
  ...audio.map(entry),
  '}',
  '',
].join('\n')
await writeIfChanged(generated, Buffer.from(table))
console.log(`묶음과 그림 ${images.length}개(버전 ${version}), 음성 ${audio.length}개를 앱에 넣었습니다(새로 복사 ${copied}, 지움 ${removed})`)
