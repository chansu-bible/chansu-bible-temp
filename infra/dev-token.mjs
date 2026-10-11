// 개발용: realm 파일의 시험 계정으로 키클락에서 액세스 토큰을 받아 출력한다. 서버를 손으로 시험할 때 쓴다.
//   TOKEN=$(node infra/dev-token.mjs)
import { readFileSync } from 'node:fs'

const realm = JSON.parse(readFileSync(new URL('./keycloak/chansu-bible-realm.json', import.meta.url), 'utf8'))
const username = process.argv[2] ?? 'tester'
const user = realm.users.find((item) => item.username === username)
if (!user) throw new Error(`realm 파일에 ${username} 사용자가 없습니다`)

const issuer = process.env.AUTH_ISSUER ?? 'http://localhost:8080/realms/chansu-bible'
const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: 'chansu-bible-test',
    username: user.username,
    password: user.credentials[0].value,
    scope: 'openid',
  }),
})
const body = await response.json()
if (!response.ok) {
  console.error('토큰을 받지 못했습니다:', body)
  process.exit(1)
}
console.log(body.access_token)
