// 웹 묶음(app/public/content, 파이프라인 build의 결과)에서 앱에 넣을 것만 assets/content로 복사하고,
// 그림·음성 경로를 require() 표로 바꾼 src/content/assets.generated.ts를 만든다.
// 그림은 기본 그림 버전만 넣는다(웹의 그림 버전 전환은 시험용이라 앱에는 두지 않는다).
// 실행: npm run content -w mobile  (먼저 npm run pipeline -- build)
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(path.join(source, 'genesis.json'), path.join(target, 'genesis.json'))
for (const file of [...images, ...audio]) {
  const to = path.join(target, inBundle(file))
  await mkdir(path.dirname(to), { recursive: true })
  await cp(path.join(source, inBundle(file)), to)
}

const entry = (file) => `  ${JSON.stringify(file)}: require(${JSON.stringify(`../../assets/content/${inBundle(file)}`)}),`
await mkdir(path.dirname(generated), { recursive: true })
await writeFile(
  generated,
  [
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
  ].join('\n'),
)
console.log(`묶음과 그림 ${images.length}개(버전 ${version}), 음성 ${audio.length}개를 앱에 넣었습니다`)
