import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const contentDir = path.join(repoRoot, 'content')
export const sourceFile = path.join(contentDir, 'source', 'genesis.json')
// 설정집. characters.json, places.json, eras.json, things.json, proposals.json이 있다.
export const storyBibleDir = path.join(contentDir, 'story-bible')
export const styleFile = path.join(storyBibleDir, 'style.json')
export const refsDir = path.join(storyBibleDir, 'refs')
export const envFile = path.join(repoRoot, '.env')

export const scenesDir = path.join(contentDir, 'scenes')
export function sceneFilePath(chapter: number, dir: string = scenesDir): string {
  return path.join(dir, `genesis-${String(chapter).padStart(2, '0')}.json`)
}
export const imagesDir = path.join(contentDir, 'images')
export const imageVersionsFile = path.join(imagesDir, 'versions.json')
export const audioDir = path.join(contentDir, 'audio')
// LLM 실행 기록. 날짜별 YYYY-MM-DD.jsonl, 한 줄이 한 호출이다. 커밋하지 않는다.
export const runsDir = path.join(contentDir, 'runs')
export const appContentDir = path.join(repoRoot, 'app', 'public', 'content')
