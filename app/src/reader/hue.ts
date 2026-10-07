// 그림이 없는 동안에도 장면이 바뀌는 것이 보이도록 장면마다 다른 바탕색을 쓴다.
export function hueOf(id: string): number {
  let sum = 0
  for (const char of id) sum += char.charCodeAt(0)
  return (sum * 47) % 360
}
