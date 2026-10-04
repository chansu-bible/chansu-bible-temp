import { fetchSource } from './source/fetchSource.ts'

const commands: Record<string, () => Promise<void>> = {
  async source() {
    const source = await fetchSource()
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
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
