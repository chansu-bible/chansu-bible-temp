import path from 'node:path'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const contentDir = path.join(repoRoot, 'content')
export const sourceFile = path.join(contentDir, 'source', 'genesis.json')
export const placesFile = path.join(contentDir, 'story-bible', 'places.json')
export const styleFile = path.join(contentDir, 'story-bible', 'style.json')
export const envFile = path.join(repoRoot, '.env')

export function sceneFilePath(chapter: number): string {
  return path.join(scenesDir, `genesis-${String(chapter).padStart(2, '0')}.json`)
}
export const scenesDir = path.join(contentDir, 'scenes')
export const imagesDir = path.join(contentDir, 'images')
export const appContentDir = path.join(repoRoot, 'app', 'public', 'content')
