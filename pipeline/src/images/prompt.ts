import type { Scene, Style } from '../schema.ts'

export function buildImagePrompt(style: Style, scene: Scene): string {
  return [style.promptPrefix, `장면: ${scene.visual.description}`, style.promptRules].join('\n\n')
}
