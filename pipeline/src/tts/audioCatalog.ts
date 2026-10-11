import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { mp3DurationMs } from './mp3.ts'

// 한 번에 읽는 파일 수. 낭독이 수만 개로 늘어도 열린 파일과 메모리가 이 수를 넘지 않게 한다.
const BATCH = 32

// 낭독 파일(*.mp3)마다 재생 길이를 잰다. 홈 화면의 "낭독으로 들으면 N분" 안내와 공개 점검(절 낭독)에 쓴다.
// 비었거나 MP3가 아니어서 길이를 잴 수 없는 파일은 이름만 있고 길이가 null이다. 폴더가 없으면 빈 목록이다.
// 결과는 이름순이다. 폴더 목록의 순서는 운영체제마다 달라서, 목록 순서 그대로 두면 같은 폴더가 컴퓨터마다 다른 순서로 읽힌다.
export async function readAudioCatalog(dir: string): Promise<Map<string, number | null>> {
  if (!existsSync(dir)) return new Map()
  // 기본 정렬은 UTF-16 코드 단위 순서라 로케일에 따라 달라지지 않는다.
  const names = (await readdir(dir)).filter((name) => name.endsWith('.mp3')).sort()
  const entries: (readonly [string, number | null])[] = []
  for (let start = 0; start < names.length; start += BATCH) {
    const batch = names.slice(start, start + BATCH)
    entries.push(...(await Promise.all(batch.map(async (name) => [name, mp3DurationMs(await readFile(path.join(dir, name)))] as const))))
  }
  return new Map(entries)
}
