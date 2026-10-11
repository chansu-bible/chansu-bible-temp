// 태그의 속성 글(lemma="b/7225" morph="HR/Ncfsa")에서 그 이름의 속성 값을 읽는다. 속성이 없으면 null이다.
// 이름은 대소문자를 가리고 앞이 낱말 경계여야 하므로 type은 subType에, id는 osisID에 걸리지 않는다.
export function attribute(attributes: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? null
}
