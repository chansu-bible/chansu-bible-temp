import { fillMissing, validateBundle, type Bundle } from 'reader-core'

export async function loadBundle(): Promise<Bundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}content/genesis.json`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return fillMissing(validateBundle(await response.json()))
}
