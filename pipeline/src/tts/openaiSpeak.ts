import OpenAI from 'openai'
import type { Speak } from './generateSpeech.ts'

const instructions =
  '한국어 성경 낭독입니다. 차분하고 경건한 목소리로, 서두르지 않고 또박또박 읽습니다. 문장 끝을 분명하게 맺습니다.'

export function createOpenAiSpeak(): Speak {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다. 리포 루트의 .env 파일에 넣어 주세요.')

  const client = new OpenAI({ apiKey, maxRetries: 3 })
  const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  const voice = process.env.OPENAI_TTS_VOICE || 'cedar'

  return async (text) => {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: text,
      instructions,
      response_format: 'mp3',
    })
    return Buffer.from(await response.arrayBuffer())
  }
}
