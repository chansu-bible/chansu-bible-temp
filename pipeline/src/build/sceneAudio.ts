import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { joinMp3 } from '../tts/mp3.ts'

// 장면 낭독을 이을 때 절에서 보는 것: 절 번호와 절 낭독 파일(묶음 안 경로, 없으면 null)
type VerseAudio = { verse: number; audio: string | null }

// 장면 낭독에 들어가는 절 낭독 파일(묶음 안 경로)을 차례대로. joinSceneAudio가 이 파일들을 이어 붙인다.
// 앱은 장면마다 이 파일 하나를 재생한다. 화면을 꺼도 절마다 파일을 바꾸지 않아 끊기지 않고, 잠금 화면에는 장면 단위로 보인다.
export function sceneAudioParts(scene: { verseStart: number; verseEnd: number }, verses: readonly VerseAudio[]): string[] {
  return verses.flatMap((verse) =>
    verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd && verse.audio !== null ? [verse.audio] : [],
  )
}

// 장면 낭독 바이트. 장면에 든 절 낭독(audioDir 안의 파일)을 차례로 이어 붙인다. 책 묶음(writeBundle)과 장 꾸러미(pack)가 함께 쓴다.
// 앱 콘텐츠 폴더를 지우고 쓰는 writeBundle과 떨어진 모듈이라, 꾸러미가 묶음을 쓰는 모듈을 끌어오지 않는다.
// 모든 낭독이 같은 고정 비트레이트 MP3라 프레임을 잇기만 하면 된다.
// verses는 buildChapter가 만든 장의 절이다. 절 낭독 경로(묶음 경로)가 붙어 있어야 하고, 그 파일 이름을 audioDir에서 찾는다.
// 꾸러미처럼 절 낭독을 null로 바꾼 절을 주면 이을 것이 없어 던진다.
// 비었거나 MP3가 아니거나 형식이 다른 절 낭독도 길이를 재는 데는 걸리지 않아(길이만 null이다) 이을 때 비로소 드러난다. 그때 장면 id와 절 낭독 파일을 밝혀 던진다.
export async function joinSceneAudio(
  scene: { id: string; verseStart: number; verseEnd: number },
  verses: readonly VerseAudio[],
  audioDir: string,
): Promise<Buffer> {
  const names = sceneAudioParts(scene, verses).map((file) => path.basename(file))
  if (names.length === 0) throw new Error(`${scene.id}: 장면 낭독에 들어갈 절 낭독이 없습니다`)
  try {
    const parts = await Promise.all(names.map((name) => readFile(path.join(audioDir, name))))
    const joined = joinMp3(parts)
    return Buffer.from(joined.buffer, joined.byteOffset, joined.byteLength)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${scene.id}: 장면 낭독을 잇지 못했습니다(${names.join(', ')}): ${message}`)
  }
}
