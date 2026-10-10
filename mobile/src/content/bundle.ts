import { fillMissing, validateBundle, type Bundle } from 'reader-core'
import { audioAssets, imageAssets } from './assets.generated'

type Loaded = { bundle: Bundle; error: null } | { bundle: null; error: string }

// 묶음은 앱 안에 들어 있다(npm run content가 복사). 앱이 시작할 때 한 번 읽고 검사한다.
function load(): Loaded {
  try {
    return { bundle: fillMissing(validateBundle(require('../../assets/content/genesis.json'))), error: null }
  } catch (error) {
    return { bundle: null, error: error instanceof Error ? error.message : String(error) }
  }
}

export const content = load()

// 묶음 안 경로(content/images/...)의 그림. 앱에 없으면 null이다.
export function imageSource(file: string | undefined): number | null {
  return file ? (imageAssets[file] ?? null) : null
}

// 묶음 안 경로(content/audio/...)의 절 낭독. 앱에 없으면 null이다.
export function audioSource(file: string | null | undefined): number | null {
  return file ? (audioAssets[file] ?? null) : null
}
