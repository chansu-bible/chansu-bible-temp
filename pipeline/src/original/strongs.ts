import { attribute } from './xml.ts'

// 스트롱 히브리어 사전(openscriptures/strongs의 StrongHebrewG.xml, 퍼블릭 도메인)에서 항목을 읽는다.
// 쓰는 것: 원형, 음역, 스트롱 품사, 정의(explanation), KJV 번역어(translation). TWOT 번호와 개요는 쓰지 않는다.
export type StrongsEntry = { strong: string; lemma: string; xlit: string; pos: string; definition: string; usage: string }

// 태그를 지우고 공백을 하나로 모은다. 안의 <w .../> 참조는 그 원형으로 바꾼다.
function plainText(xml: string): string {
  return xml
    .replace(/<w [^>]*lemma="([^"]*)"[^>]*\/>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseStrongs(xml: string, wanted: ReadonlySet<string>): Map<string, StrongsEntry> {
  const entries = new Map<string, StrongsEntry>()
  for (const entry of xml.matchAll(/<div type="entry" n="(\d+)">([\s\S]*?)<\/div>/g)) {
    const strong = `H${Number(entry[1])}`
    if (!wanted.has(strong)) continue
    const body = entry[2]!
    const head = /<w ([^>]*ID="H\d+"[^>]*)>/.exec(body)?.[1] ?? ''
    entries.set(strong, {
      strong,
      lemma: attribute(head, 'lemma') ?? '',
      xlit: attribute(head, 'xlit') ?? '',
      pos: attribute(head, 'morph') ?? '',
      definition: plainText(/<note type="explanation">([\s\S]*?)<\/note>/.exec(body)?.[1] ?? ''),
      usage: plainText(/<note type="translation">([\s\S]*?)<\/note>/.exec(body)?.[1] ?? ''),
    })
  }
  return entries
}
