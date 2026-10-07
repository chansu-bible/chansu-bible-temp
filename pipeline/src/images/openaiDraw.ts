import { createReadStream } from 'node:fs'
import path from 'node:path'
import OpenAI, { toFile } from 'openai'
import type { DrawImage } from './generateImages.ts'
import { mimeType } from './style.ts'

type Quality = 'low' | 'medium' | 'high' | 'auto'

export function createOpenAiDraw(): DrawImage {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다. 리포 루트의 .env 파일에 넣어 주세요.')

  const client = new OpenAI({ apiKey, maxRetries: 3 })
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
  const quality = (process.env.OPENAI_IMAGE_QUALITY || 'high') as Quality

  return async (prompt, references) => {
    const common = { model, prompt, size: '1024x1024', quality, output_format: 'jpeg', output_compression: 85 } as const
    // 화풍 참고 이미지가 있으면 편집 엔드포인트로 함께 보낸다.
    const response =
      references.length > 0
        ? await client.images.edit({
            ...common,
            image: await Promise.all(
              references.map((file) => toFile(createReadStream(file), path.basename(file), { type: mimeType(file) })),
            ),
          })
        : await client.images.generate(common)
    const data = response.data?.[0]?.b64_json
    if (!data) throw new Error('응답에 그림이 없습니다')
    return Buffer.from(data, 'base64')
  }
}
