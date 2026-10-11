// CLI(src/cli.ts)를 새 프로세스로 띄우는 시험 도구. cliSource·cliRefusals 시험이 같이 쓴다.
import { execFile } from 'node:child_process'
import path from 'node:path'

const pipelineDir = path.resolve(import.meta.dirname, '..')
const cli = path.join(pipelineDir, 'src', 'cli.ts')
// CLI는 위키문헌에 닿지 않게 fetch를 막고 띄운다. 막아 두지 않으면 검사가 틀렸을 때 content/source의 본문 파일을 실제로 바꾼다.
const blockFetch = `data:text/javascript,${encodeURIComponent(
  "globalThis.fetch = async (url) => { console.error('fetch 호출: ' + decodeURIComponent(String(url))); throw new Error('fetch blocked') }",
)}`

const cliTimeoutMs = 30_000
// CLI 시험 하나의 제한 시간. 멈춘 CLI를 runCli가 먼저 끊어 까닭을 알리도록 CLI의 제한(cliTimeoutMs)보다 길다.
export const cliTestTimeoutMs = 2 * cliTimeoutMs

export function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const command = ['--import', 'tsx', '--import', blockFetch, cli, ...args]
    execFile(process.execPath, command, { cwd: pipelineDir, timeout: cliTimeoutMs }, (error, stdout, stderr) => {
      // 시간이 지나 죽인 것은 종료 코드 1로 끝난 것과 구별한다.
      if (error?.killed) reject(new Error(`CLI가 ${cliTimeoutMs / 1000}초 안에 끝나지 않아 멈췄습니다: ${args.join(' ')}`))
      else resolve({ exitCode: error ? Number(error.code ?? 1) : 0, stdout, stderr })
    })
  })
}
