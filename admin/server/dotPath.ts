// 점 표기 경로("facts.attire", "design.hair")에 값을 넣은 새 객체를 돌려준다. 원본은 건드리지 않는다.
// 중간 객체가 없거나 객체가 아니면 새로 만든다. 배열 안은 숫자 경로로 가리킨다("facts.relations.0.type").
export function setAtPath<T>(target: T, field: string, value: unknown): T {
  const keys = field.split('.')
  if (keys.some((key) => key === '')) throw new Error(`필드 경로가 잘못되었습니다: ${field}`)
  const root = structuredClone(target) as unknown

  let current = root as Record<string, unknown>
  for (const key of keys.slice(0, -1)) {
    const next = current[key]
    if (typeof next !== 'object' || next === null) current[key] = {}
    current = current[key] as Record<string, unknown>
  }
  current[keys.at(-1)!] = structuredClone(value)
  return root as T
}
