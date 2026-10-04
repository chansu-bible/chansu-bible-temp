import { writeBundle } from './build/writeBundle.ts'
import { fetchSource } from './source/fetchSource.ts'

const commands: Record<string, () => Promise<void>> = {
  async source() {
    const source = await fetchSource()
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
  },
  async build() {
    const bundle = await writeBundle()
    const sceneCount = bundle.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
    console.log(`묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
  },
}

const command = commands[process.argv[2] ?? '']
if (!command) {
  console.error(`사용법: npm run pipeline -- <${Object.keys(commands).join(' | ')}>`)
  process.exit(1)
}

try {
  await command()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
