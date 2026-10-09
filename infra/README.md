# 개발용 인프라

`docker-compose.yml`은 동기화 서버가 쓰는 Postgres와 로그인용 키클락을 이 컴퓨터(127.0.0.1)에만 띄운다. 운영용이 아니다.

```bash
npm run infra:up      # 띄우기 (키클락은 처음에 30초쯤 걸린다)
npm run server        # 동기화 서버 (http://127.0.0.1:8790)
npm run infra:down    # 멈추기 (서버 기록과 가입한 계정은 도커 볼륨에 남는다)
```

| 무엇 | 주소 | 계정 |
|---|---|---|
| 키클락 관리 화면 | http://localhost:8080/admin | admin / admin-dev |
| realm `chansu-bible` | http://localhost:8080/realms/chansu-bible | 시험 계정 `tester`(비밀번호는 `keycloak/chansu-bible-realm.json`에 있다) |
| Postgres | 127.0.0.1:5433, DB `chansu` | chansu / chansu-dev |

- 여기 적은 비밀번호는 이 컴퓨터에서만 여는 개발용이다. 다른 곳에 열 때는 모두 바꾼다.
- realm 설정은 `keycloak/chansu-bible-realm.json`이다. 키클락은 realm이 아직 없을 때만 이 파일을 읽으므로, 고친 뒤에는 `docker compose -f infra/docker-compose.yml down -v`로 볼륨까지 지우고 다시 띄운다(가입한 계정과 서버 기록도 지워진다).
- 앱 클라이언트 `chansu-bible-app`은 공개 클라이언트(PKCE)다. 돌아올 주소는 앱(`chansubible://`), Expo Go(`exp://`), Expo 웹(`http://localhost:8081`)이다.
- `chansu-bible-test`는 비밀번호로 바로 토큰을 받는 개발용 클라이언트다. 운영 realm에는 만들지 않는다.
- 안드로이드 에뮬레이터는 이 컴퓨터를 `10.0.2.2`로 부른다(앱과 서버가 이미 그 주소를 안다). 실제 폰에서 쓰려면 포트를 내부망에 열고 앱의 `EXPO_PUBLIC_AUTH_ISSUER`, `EXPO_PUBLIC_API_URL`과 서버의 `AUTH_ISSUERS`에 그 주소를 준다.

서버를 손으로 불러 보기:

```bash
TOKEN=$(node infra/dev-token.mjs)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8790/me
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"since":0,"changes":[]}' http://127.0.0.1:8790/sync
```
