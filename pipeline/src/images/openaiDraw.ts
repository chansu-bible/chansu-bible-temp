import OpenAI from 'openai'
import type { DrawImage } from './generateImages.ts'

type Quality = OpenAI.Images.ImageGenerateParams['quality']

export function createOpenAiDraw(): DrawImage {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다. 리포 루트의 .env 파일에 넣어 주세요.')

  const client = new OpenAI({ apiKey, maxRetries: 3 })
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
  const quality = (process.env.OPENAI_IMAGE_QUALITY || 'high') as Quality

  return async (prompt) => {
    const response = await client.images.generate({
      model,
      prompt,
      size: '1024x1024',
      quality,
      output_format: 'jpeg',
      output_compression: 85,
    })
    const data = response.data?.[0]?.b64_json
    if (!data) throw new Error('응답에 그림이 없습니다')
    return Buffer.from(data, 'base64')
  }
}
