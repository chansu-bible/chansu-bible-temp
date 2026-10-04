import type { Scene, Style } from '../schema.ts'

// 참고 지시문(참고 이미지가 있을 때만) → 화풍 → 구도 → 장면 묘사 → 표현 기준 순서로 조립한다.
export function buildImagePrompt(style: Style, scene: Scene): string {
  return [
    style.references.length > 0 ? style.referenceInstruction : '',
    style.promptPrefix,
    scene.visual.shot ? `구도: ${scene.visual.shot}` : '',
    `장면: ${scene.visual.description}`,
    style.promptRules,
  ]
    .filter((part) => part !== '')
    .join('\n\n')
}
