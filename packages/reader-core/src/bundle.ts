import type { Bundle } from './types.ts'

// 묶음 본체가 이 앱이 읽을 수 있는 형식인지 본다. 아니면 오류를 던진다. 형식은 docs/content-bundle.md에 있다.
export function validateBundle(value: unknown): Bundle {
  if (typeof value !== 'object' || value === null) throw new Error('묶음이 비어 있습니다')
  const bundle = value as Bundle
  if (bundle.schemaVersion !== 1) throw new Error(`묶음 형식이 다릅니다 (schemaVersion ${String(bundle.schemaVersion)})`)
  if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) throw new Error('묶음에 장이 없습니다')
  return bundle
}

// 인물·시대·물건·낭독 길이·장면 낭독은 나중에 더한 키라 옛 묶음에는 없다. 없으면 빈 값으로 채워 화면이 그대로 그려지게 한다.
export function fillMissing(bundle: Bundle): Bundle {
  return {
    ...bundle,
    characters: Array.isArray(bundle.characters) ? bundle.characters : [],
    eras: Array.isArray(bundle.eras) ? bundle.eras : [],
    things: Array.isArray(bundle.things) ? bundle.things : [],
    chapters: bundle.chapters.map((chapter) => ({
      ...chapter,
      verses: chapter.verses.map((verse) => ({ ...verse, audioMs: verse.audioMs ?? null })),
      scenes: chapter.scenes.map((scene) => ({
        ...scene,
        characters: Array.isArray(scene.characters) ? scene.characters : [],
        audio: scene.audio ?? null,
        audioMs: scene.audioMs ?? null,
      })),
    })),
  }
}
