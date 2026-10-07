import type { Bundle } from './types.ts'

export async function loadBundle(): Promise<Bundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}content/genesis.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bundle = (await response.json()) as Bundle
  if (bundle.schemaVersion !== 1) throw new Error(`묶음 형식이 다릅니다 (schemaVersion ${bundle.schemaVersion})`)
  if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) throw new Error('묶음에 장이 없습니다')
  return fillMissing(bundle)
}

// 인물·시대는 나중에 더한 키라 옛 묶음에는 없다. 없으면 빈 배열로 채워 화면이 그대로 그려지게 한다.
export function fillMissing(bundle: Bundle): Bundle {
  return {
    ...bundle,
    characters: Array.isArray(bundle.characters) ? bundle.characters : [],
    eras: Array.isArray(bundle.eras) ? bundle.eras : [],
    chapters: bundle.chapters.map((chapter) => ({
      ...chapter,
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        characters: Array.isArray(scene.characters) ? scene.characters : [],
      })),
    })),
  }
}
