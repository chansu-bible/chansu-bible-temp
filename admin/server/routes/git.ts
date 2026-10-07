import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Hono } from 'hono'
import { paths } from 'pipeline'
import { HttpError } from '../errors.ts'

const run = promisify(execFile)

export type GitStatus = { branch: string; changes: { path: string; status: string }[] }

// `git status --porcelain=v1 -b` 출력을 읽는다.
export function parseGitStatus(output: string): GitStatus {
  let branch = ''
  const changes: GitStatus['changes'] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      if (head.startsWith('No commits yet on ')) branch = head.slice('No commits yet on '.length)
      else if (head.startsWith('HEAD (no branch)')) branch = 'HEAD (브랜치 아님)'
      else branch = head.split('...')[0]!.split(' ')[0]!
      continue
    }
    const status = line.slice(0, 2).trim()
    let file = line.slice(3)
    // 이름 바꿈은 "옛 -> 새"로 나온다. 새 이름을 쓴다.
    const arrow = file.indexOf(' -> ')
    if (arrow >= 0) file = file.slice(arrow + 4)
    if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1)
    changes.push({ path: file, status })
  }
  return { branch, changes }
}

export function gitRoutes(): Hono {
  const app = new Hono()

  app.get('/status', async (c) => {
    try {
      const { stdout } = await run('git', ['-c', 'core.quotePath=false', 'status', '--porcelain=v1', '-b'], {
        cwd: paths.repoRoot,
        maxBuffer: 10 * 1024 * 1024,
      })
      return c.json(parseGitStatus(stdout))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new HttpError(500, `git status를 읽지 못했습니다: ${message}`)
    }
  })

  return app
}
