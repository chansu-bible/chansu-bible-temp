import { describe, expect, it } from 'vitest'
import { runCli } from './runCli.ts'

// 틀린 인자는 파일을 쓰거나 API를 부르는 일에 닿기 전에 거절한다. 거절한 호출은 아무것도 출력하지 않고 네트워크에도 닿지 않는다.
// 거절되지 않으면 단계가 실제로 돌아 content를 바꾸거나 유료 호출을 하게 되니, 이 시험의 인자를 바꿀 때는 조심한다.
async function expectRefused(args: string[], message: string): Promise<void> {
  const result = await runCli(args)
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain(message)
  expect(result.stdout).toBe('')
  expect(result.stderr).not.toContain('fetch 호출')
}

const timeoutMs = 60_000
const unknownBook = '알 수 없는 책입니다: nope. 책 id는 reader-core의 books.ts에 있습니다.'

// CLI를 띄우는 데 1초쯤 걸려서 시험들을 한꺼번에 돌린다.
describe.concurrent('CLI 인자 거절', () => {
  // 한 책만 만드는 줄 알고 쓰기 쉽다. 받으면 앱 콘텐츠 폴더를 비우고 다시 쓰는 build가 다른 책 묶음을 지운다.
  it('build는 --book을 받지 않는다', async () => {
    await expectRefused(['build', '--book', 'genesis'], 'build는 본문이 있는 모든 책을 함께 만듭니다. --book은 받지 않습니다.')
  }, timeoutMs)

  // 모든 책이 함께 쓰는 사전을 채우는 단계다. 받으면 책을 고른 줄 알고 모델을 부른다.
  it('original-gloss는 --book을 받지 않는다', async () => {
    await expectRefused(
      ['original-gloss', '--book', 'genesis'],
      'original-gloss는 모든 책이 함께 쓰는 사전을 채웁니다. --book은 받지 않습니다.',
    )
  }, timeoutMs)

  // 장마다 도는 단계들이다. 모두 책 id부터 확인한다.
  it.each(['canon', 'scenario', 'review-text', 'images', 'tts', 'quiz'])(
    '%s 단계는 알 수 없는 책 id를 books.ts 안내와 함께 거절한다',
    async (stage) => {
      await expectRefused([stage, '--book', 'nope', '--chapter', '1'], unknownBook)
    },
    timeoutMs,
  )

  it('canon은 --chapter가 없으면 거절한다', async () => {
    await expectRefused(['canon', '--book', 'genesis'], '--chapter <장 번호>가 필요합니다')
  }, timeoutMs)
})
