import { describe, expect, it } from 'vitest'
import { runCli } from './runCli.ts'

// CLI를 띄우는 데 1초쯤 걸려서 시험들을 한꺼번에 돌린다.
describe.concurrent('CLI source', () => {
  it('--chapter는 거절하고 위키문헌에 닿지 않는다', async () => {
    // 그냥 두면 책 전체를 받아 content/source/genesis.json(1~10장)을 50장으로 바꾼다.
    const message = 'source는 --chapter 대신 --chapters를 씁니다(예: --chapters 3, --chapters 1-10)'
    const [withBook, withoutBook] = await Promise.all([
      runCli(['source', '--book', 'genesis', '--chapter', '3']),
      // 책 id가 없는 것보다 먼저 본다.
      runCli(['source', '--chapter', '3']),
    ])
    for (const result of [withBook, withoutBook]) {
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain(message)
      expect(result.stderr).not.toContain('fetch 호출')
    }
  }, 60_000)

  it('--chapters는 받으러 간다(시험에서는 fetch가 막혀 있어 받지 못한다)', async () => {
    // 이 시험은 일부러 받는 길로 들어간다. fetch를 막은 것이 뚫려도 커밋된 genesis.json(1~10장)을 같은 글로 다시 쓰는 데 그치게 1~10장으로 받는다.
    const result = await runCli(['source', '--book', 'genesis', '--chapters', '1-10'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('fetch 호출: https://ko.wikisource.org/w/index.php?title=개역한글판/창세기&action=raw')
    expect(result.stderr).toContain('창세기 본문을 가져오지 못했습니다: 개역한글판/창세기 (fetch blocked)')
  }, 60_000)

  it('--chapters 값이 틀리면 받으러 가지 않고, parseChapterRange의 오류를 그대로 알린다', async () => {
    const result = await runCli(['source', '--book', 'ruth', '--chapters', 'x'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('장 범위는 3-7이나 3처럼 씁니다: x')
    expect(result.stderr).not.toContain('fetch 호출')
  }, 60_000)
})
