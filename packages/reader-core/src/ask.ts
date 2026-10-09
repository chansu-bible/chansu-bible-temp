import { josa, particle } from './josa.ts'
import type { Bundle } from './types.ts'

// 질문하기의 제안 질문: 그 장의 장소, 그 장에서 처음 나오는 인물, 그 장에서 풀이한 낱말로 하나씩
export function askSuggestions(bundle: Bundle, chapter: number): string[] {
  const target = bundle.chapters.find((item) => item.chapter === chapter)
  if (!target) return []
  const suggestions: string[] = []
  const placeId = target.scenes.find((scene) => scene.placeId !== null)?.placeId
  const place = bundle.places.find((item) => item.id === placeId)
  if (place) suggestions.push(`${josa(place.name, '은는')} 어디예요?`)
  const newcomer = bundle.characters.find((character) => character.firstAppearance.startsWith(`${chapter}:`))
  if (newcomer) suggestions.push(`${josa(newcomer.name, '은는')} 누구예요?`)
  const gloss = target.scenes.flatMap((scene) => scene.glossary)[0]
  if (gloss) suggestions.push(`'${gloss.word}'${particle(gloss.word, '은는')} 무슨 뜻이에요?`)
  return suggestions
}
