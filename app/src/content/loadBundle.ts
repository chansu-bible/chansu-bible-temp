import type { Bundle } from './types.ts'

export async function loadBundle(): Promise<Bundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}content/genesis.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const bundle = (await response.json()) as Bundle
  if (bundle.schemaVersion !== 1) throw new Error(`묶음 형식이 다릅니다 (schemaVersion ${bundle.schemaVersion})`)
  if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) throw new Error('묶음에 장이 없습니다')
  return bundle
}
