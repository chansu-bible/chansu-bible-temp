# 맥미니 배포

맥미니(SSH 이름 `mainserver`)에 Postgres, 운영 키클락, 동기화·질문하기 서버, 입구(Caddy)를 Docker Compose로 띄운다. 밖에서는 Tailscale Funnel 주소 `https://mainserver.<tailnet>.ts.net` 하나로만 닿는다. 다른 포트는 모두 맥미니 자신(`127.0.0.1`)에만 열린다. 설계는 [macmini-deploy-design.md](../docs/superpowers/specs/2026-10-10-macmini-deploy-design.md)에 있다.

1~10절은 처음 한 번 하는 일이고, 11~15절은 그 뒤에 하는 일이다.

- 명령은 따로 적지 않으면 맥미니의 리포 루트(`~/chansu-bible`)에서 돌린다. PC에서 돌리는 명령에는 그렇다고 적는다.
- 맥미니 명령은 `ssh mainserver`로 들어간 셸에서 `cd ~/chansu-bible` 뒤에 돌린다. `ssh mainserver 'deploy/update.sh'`처럼 명령을 붙여 보내면 셸 설정(`~/.zprofile`)을 읽지 않아 `npm`과 `docker`를 찾지 못한다.
- `deploy/`의 스크립트는 `sudo` 없이 돌린다. root 소유 파일이 생기면 다음 번에 막힌다.
- `<tailnet>`처럼 꺾쇠로 쓴 곳은 자기 값으로 바꾼다. 비밀번호와 키는 이 문서에도 리포에도 쓰지 않는다.

## 1. 준비물

- Apple Silicon 맥미니와 그 관리자 계정
- PC의 `~/.ssh/config`에 있는 SSH 이름 `mainserver`. 맥미니의 원격 로그인(SSH)을 켜 둔다.
- Tailscale 계정, 앱을 빌드할 Expo 계정, 질문하기를 켤 OpenAI 키

## 2. 설치

```bash
brew install node@22 git
```

- Homebrew가 없으면 [brew.sh](https://brew.sh)의 안내로 먼저 깐다.
- `node@22`는 Homebrew가 PATH에 걸어 주지 않는다. 다음 두 줄로 `~/.zprofile`(SSH로 들어간 셸)과 `~/.bash_profile`(`bash -l`)에 경로를 더한다. 새 셸을 열어 `node -v`가 `v22`로 시작하는지 본다.

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zprofile
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.bash_profile
```

Docker는 OrbStack이나 Docker Desktop 중 하나를 깐다.

```bash
brew install --cask orbstack
```

- 설정에서 로그인할 때 자동 시작을 켠다. 컨테이너는 `restart: unless-stopped`라서 Docker가 뜨면 저절로 돌아온다.
- `docker compose version`이 나오는지 본다.

Tailscale은 tailscale.com의 독립 실행 앱(CLI와 Funnel이 되는 판)을 깔고 로그인한다.

```bash
tailscale up
```

- `tailscale` 명령이 없다고 나오면 앱 안의 실행 파일(`/Applications/Tailscale.app/Contents/MacOS/Tailscale`)을 `tailscale`이라는 별칭으로 쓴다.
- Tailscale 관리 화면의 DNS에서 MagicDNS와 HTTPS 인증서를 켠다.
- Funnel은 7절에서 처음 `tailscale funnel`을 돌릴 때 나오는 안내 주소로 켠다.
- OrbStack, Docker Desktop, Tailscale은 처음 실행할 때 시스템 설정의 허용 창을 띄운다. SSH로는 누를 수 없으니 이 단계는 맥미니 화면(또는 화면 공유)에서 한다.

## 3. 잠자기 끄기와 자동 켜짐

```bash
sudo pmset -a sleep 0 disksleep 0 autorestart 1
```

- 맥미니가 잠들지 않고, 정전 뒤 전원이 돌아오면 저절로 켜진다. `pmset -g`로 확인한다.
- 켜진 뒤에 서비스가 다시 뜨려면 사용자가 로그인되어 있어야 한다. Docker가 로그인 항목이기 때문이다.
- 다시 켜진 뒤에는 Postgres가 뜰 때까지 키클락과 서버가 몇 번 다시 시작할 수 있다. 정상이다.
- 자동 로그인을 켜는 것은 선택이다(시스템 설정의 사용자 및 그룹).
- FileVault를 쓰면 자동 로그인이 안 된다. 정전 뒤에는 맥미니 앞에서 비밀번호를 넣어 로그인해야 서비스가 돌아온다.

## 4. 리포 받기

리포는 공백이 없는 경로(`~/chansu-bible`)에 둔다. `~/Documents`, `~/Desktop`, `~/Downloads` 안에는 두지 않는다. macOS 개인 정보 보호 창이 Docker의 폴더 붙이기를 막을 수 있고, launchd 명령은 공백이 든 경로를 나눠 읽기 때문이다.

```bash
git clone https://github.com/chansu-bible/chansu-bible-temp.git ~/chansu-bible
cd ~/chansu-bible && git switch feature/books-and-release
npm ci && npm run pipeline -- build
```

- main에 합친 뒤에는 `git switch main`이다. 맥미니는 GitHub에서 받으므로 그 브랜치가 푸시되어 있어야 한다.
- `build`는 책 묶음을 `app/public/content`에 만든다. 서버가 질문하기에 쓰는 자료이고, Compose가 이 폴더를 읽기 전용으로 붙인다. 띄우기 전에 만들어 둔다.

## 5. 설정

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

`deploy/.env`는 git이 빼는 파일이다. 비밀 값은 여기에만 둔다.

- `PUBLIC_URL`은 `tailscale status --json`의 `Self.DNSName`에서 끝의 `.`를 떼고 앞에 `https://`를 붙인 것이다. 끝에 `/`는 붙이지 않고, `:443`도 쓰지 않는다. 키클락의 발급자와 글자까지 맞아야 하기 때문이다.
- `PUBLIC_SCHEME`은 `https` 그대로 둔다.
- `DB_PASSWORD`와 `KC_ADMIN_PASSWORD`는 `openssl rand -hex 24`로 하나씩 따로 만든다. base64는 쓰지 않는다. `/`가 섞이면 `DATABASE_URL`이 깨진다.
- `DB_PASSWORD`, `KC_ADMIN_PASSWORD`와 `deploy/postgres/10-keycloak.sql`은 DB 볼륨을 처음 만들 때 한 번만 쓰인다. 그 뒤에 바꿔도 반영되지 않는다(14절).
- `OPENAI_API_KEY`는 PC와 다른 새 키다. 하나가 새도 다른 쪽에 영향이 없게 한다. 비워 두면 질문하기만 꺼진다.
- `ASK_DAILY_LIMIT`(계정마다 하루 20번)과 `ASK_GLOBAL_DAILY_LIMIT`(서버 전체 하루 200번)은 견본 값 그대로 써도 된다. 하루는 한국 날짜로 센다.
- `PROXY_PORT`, `KC_ADMIN_PORT`는 맥미니의 다른 서버와 포트가 겹칠 때만 바꾼다(14절). 값은 숫자만 쓴다. 따옴표, 줄 끝 주석, `export`를 붙이지 않는다.
- 7절에서 443이 아닌 포트로 Funnel을 열게 되면 `PUBLIC_URL`에도 `:8443`을 붙인다.
- 셸 설정(`~/.zprofile` 등)에서 `OPENAI_API_KEY` 같은 Compose 변수를 `export`하지 않는다. 셸에 있는 값이 `--env-file`의 값보다 앞선다.

`PUBLIC_URL` 값을 만드는 명령은 다음과 같다.

```bash
tailscale status --json | node -e 'console.log("https://" + JSON.parse(require("fs").readFileSync(0, "utf8")).Self.DNSName.replace(/\.$/, ""))'
```

비밀번호는 다음 명령을 두 번 돌려 하나씩 쓴다. 화면에 찍힌 값은 `deploy/.env`에만 옮겨 적는다.

```bash
openssl rand -hex 24
```

관리 도구와 파이프라인이 쓰는 리포 루트 `.env`는 `deploy/.env`와 따로다.

```bash
cp .env.example .env
```

- 그림, 낭독, 장면 쓰기처럼 비용이 드는 단계를 맥미니 관리 도구에서 돌릴 때만 만들고 `OPENAI_API_KEY`를 채운다. 여기에도 PC와 다른 맥미니용 키를 넣는다.
- 두 파일 모두 git이 빼는 이름이다.

## 6. 띄우기

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
docker compose -f deploy/compose.yaml --env-file deploy/.env ps
curl http://127.0.0.1:8443/health
```

- 처음에는 이미지를 받고 서버 이미지를 만드느라 몇 분 걸린다. 키클락의 첫 시작은 1~2분 걸린다.
- `ps`에서 `db`와 `server`에 `(healthy)`가 붙고 네 서비스가 모두 `Up`이면 된다.
- `curl`은 `{"ok":true}`를 돌려준다. DB까지 닿는지 보는 주소이고, 끊겼으면 503이다.
- 서버 로그(13절)에 `질문하기: 책 …권, 대목 …개` 줄이 있으면 질문하기가 켜진 것이다. `OPENAI_API_KEY가 없어 질문하기를 끕니다.`가 보이면 키가 빈 것이고, `책 묶음이 없어 질문하기를 끕니다`가 보이면 4절의 `build`를 하지 않은 것이다.
- `deploy/.env`를 고친 뒤에는 첫 명령(`up -d --build`)을 다시 돌려 반영한다.
- 처음 띄웠으면 키클락이 다 뜬 뒤 `deploy/keycloak-admin.sh`를 한 번 돌린다(8절). 그래야 관리 화면에 로그인할 수 있다.

키클락이 뜬 뒤에는 발급자를 확인한다. 응답 앞쪽의 `issuer`가 `PUBLIC_URL` 뒤에 `/auth/realms/chansu-bible`을 붙인 것이어야 한다. 키클락이 뜨기 전에는 502가 나온다.

```bash
curl -s http://127.0.0.1:8443/auth/realms/chansu-bible/.well-known/openid-configuration | head -c 300
```

## 7. 공개

```bash
tailscale funnel --bg http://127.0.0.1:8443
tailscale funnel status
```

- 처음 돌리면 Funnel을 켜라는 안내 주소가 나온다. 그 주소에서 켠 뒤 명령을 다시 돌린다.
- 폰에서 와이파이를 끄고 `https://mainserver.<tailnet>.ts.net/health`를 연다. `{"ok":true}`가 나오면 된다.
- 443을 다른 서비스가 쓰고 있으면 `--https=8443`으로 열고, 공개 주소에 `:8443`을 붙인다. `PUBLIC_URL`을 고치면 6절의 `up -d`를 다시 돌린다. 앱을 빌드할 주소(9절)에도 붙인다.

```bash
tailscale funnel --bg --https=8443 http://127.0.0.1:8443
```

## 8. 키클락 관리 화면

처음 띄운 뒤, 관리 화면을 열기 전에 맥미니에서 한 번 돌린다.

```bash
deploy/keycloak-admin.sh
```

- 관리 화면의 로그인은 관리자 realm(master)의 주소로 간다. 그 주소는 처음에 공개 주소인데, 입구가 밖에서 master를 막으므로 그대로는 로그인할 수 없다.
- 스크립트는 master의 주소를 SSH 포트 전달 주소(`http://127.0.0.1:8180/auth`)로 바꾸고, master에 로그인 실패 막기를 켠다. 임시 관리자(`admin`)로 들어가므로 그 계정을 지우기 전에 돌린다.
- 키클락이 아직 뜨는 중이면 연결 오류가 난다. 1~2분 뒤 다시 돌린다.

그다음 PC에서 포트를 전달해 연다.

```bash
# PC에서
ssh -L 8180:127.0.0.1:8180 mainserver
```

PC 브라우저에서 `http://127.0.0.1:8180/auth/admin`을 열고 `admin` / `KC_ADMIN_PASSWORD`로 로그인한다.

- `localhost`가 아니라 `127.0.0.1`로 연다. 키클락이 관리 화면과 그 로그인 주소를 `127.0.0.1`로 정해 두었기 때문이다.
- `KC_ADMIN_PORT`를 바꿨으면 PC 쪽 포트도 같은 번호로 한다. 키클락이 관리 화면 주소를 `http://127.0.0.1:<KC_ADMIN_PORT>/auth`로 못 박아 두었기 때문이다.
- 처음 만든 `admin`은 임시 관리자다. master realm의 Users에서 영구 관리자를 만들고(Credentials에서 비밀번호, Role mapping에서 `admin` 역할), 그 계정으로 다시 로그인해 임시 `admin`을 지운다.
- 그 뒤에 `deploy/keycloak-admin.sh`를 다시 돌릴 때(14절)는 영구 관리자 이름을 붙인다(`deploy/keycloak-admin.sh <이름>`). 비밀번호는 스크립트가 묻는다.
- 사용자와 가입 설정은 왼쪽 위에서 realm을 `chansu-bible`로 골라 본다.
- 밖에서는 열리지 않아야 한다. 폰(와이파이를 끄고)에서 `https://mainserver.<tailnet>.ts.net/auth/admin`이 404인지 본다.

## 9. 앱 빌드

EAS에 로그인한 컴퓨터(보통 PC)의 `mobile` 폴더에서 한다. 맥미니 주소는 EAS의 `preview` 환경 변수로 넣고 리포에는 커밋하지 않는다. `mobile/eas.json`의 `preview` 프로필이 이 환경을 쓴다.

```bash
# PC에서
cd mobile
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://mainserver.<tailnet>.ts.net --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_AUTH_ISSUER --value https://mainserver.<tailnet>.ts.net/auth/realms/chansu-bible --visibility plaintext
npx eas-cli build --platform android --profile preview
```

- 두 값은 `PUBLIC_URL`에 맞춘다. `EXPO_PUBLIC_AUTH_ISSUER`는 6절에서 본 `issuer`와 글자까지 같아야 한다.
- 앱은 빌드할 때 주소를 품는다. 주소를 바꾸면 다시 빌드한다.
- 빌드가 끝나면 EAS가 주는 주소나 QR 코드로 APK를 받아 폰에 깐다.
- 마지막 확인은 폰의 모바일 데이터(와이파이를 끈다)로 한다. 앱에서 가입, 로그인, 동기화, 질문하기가 되는지 본다.
- `development` 프로필(개발 빌드)은 지금처럼 PC의 개발 서버에 붙는다.

## 10. 관리 도구

콘텐츠 작업은 맥미니의 리포 폴더에서 한다. PC에서 포트를 전달해 연다.

```bash
# PC에서
ssh -L 5174:127.0.0.1:5174 -L 8787:127.0.0.1:8787 mainserver
```

연결된 맥미니 셸에서 관리 도구를 띄운다. SSH가 끊겨도 돌게 `tmux`를 권한다.

```bash
brew install tmux        # 처음 한 번
tmux new -s admin
cd ~/chansu-bible && npm run admin
```

PC 브라우저에서 `http://127.0.0.1:5174`를 연다.

- 관리 도구는 맥미니 자신(`127.0.0.1`)에만 열리고 로그인이 없다. 이 포트 전달 밖에서는 닿지 않는다. PC에서 `npm run admin`을 함께 띄우지 않는다(같은 포트다).
- tmux에서 빠져나오려면 Ctrl-b 뒤에 d를 누른다. SSH를 다시 연결하면 `tmux attach -t admin`으로 돌아온다.
- 콘텐츠는 맥미니에서 고치고 커밋·푸시한다. 코드는 PC에서 고친다. 같은 콘텐츠 파일을 두 곳에서 함께 고치지 않는다.
- 맥미니에서 푸시하려면 GitHub 로그인이 필요하다. `brew install gh` 뒤에 `gh auth login`을 하고, `git config --global user.name`과 `user.email`을 정한다.
- 고친 콘텐츠를 서버가 쓰게 하려면 11절의 `deploy/update.sh`로 묶음을 다시 만든다.

## 11. 올리기

PC에서 푸시한 코드와 콘텐츠를 맥미니에 반영한다. 돌리기 전에 두 가지를 한다.

- 관리 도구와 돌고 있는 파이프라인 작업을 멈춘다. `npm ci`가 `node_modules`를 지우고 새로 깐다.
- 맥미니에서 승인한 콘텐츠는 먼저 커밋·푸시한다. 맥미니의 커밋과 PC에서 푸시한 커밋이 갈라지면 `git pull --ff-only`가 멈춘다(14절).

```bash
deploy/update.sh
```

- 받기(`git pull --ff-only`)를 한 뒤에는 받은 `deploy/update.sh`로 처음부터 다시 돈다. 그래서 받기로 스크립트가 바뀌어도 새 단계를 따른다.
- 이어서 설치(`npm ci`), 묶음 만들기(`npm run pipeline -- build`), 다시 띄우기(`up -d --build` 뒤 서버와 입구 다시 시작), 상태 확인(`/health`를 최대 30번)을 차례로 한다.
- 서버는 시작할 때 묶음을 읽고, 입구(Caddy)는 설정(`deploy/caddy/Caddyfile`)을 다시 읽는 길을 꺼 두었다. 그래서 둘 다 다시 시작한다.
- 커밋하지 않은 변경이 있으면 알리고 계속한다. 빌드는 작업 폴더를 그대로 쓰므로 그 변경도 함께 올라간다.
- 끝에 `서버가 떴습니다`가 나오면 입구, 서버, DB가 모두 답한 것이다. 이어서 서버 로그 끝 다섯 줄을 보여 준다. `질문하기: 책 …권` 줄로 질문하기가 책 묶음을 읽었는지 본다.
- 키클락이 새로 만들어졌다면 로그인은 1~2분 더 걸린다.
- 상태 확인이 끝내 실패하면 `server`와 `caddy` 로그를 보는 명령을 안내하고 코드 1로 끝난다.
- DB와 키클락의 데이터는 그대로다.

### 이미지 새로 받기

가끔 기반 이미지(Postgres, 키클락, Caddy, 서버 이미지의 Node)를 새로 받아 같은 태그 안의 수정을 반영한다.

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env pull
docker compose -f deploy/compose.yaml --env-file deploy/.env build --pull
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d
docker image prune -f
```

- `up -d`는 이미지가 바뀐 컨테이너만 다시 만든다. `docker image prune -f`는 이름이 떨어진 옛 이미지를 지운다.

## 12. 백업과 되살리기

### 백업

```bash
deploy/backup.sh
```

- DB 전체(동기화 기록과 키클락 계정)를 `pg_dumpall`로 받아 압축해 `~/chansu-backups/chansu-<날짜>-<시각>.sql.gz`에 둔다. 폴더는 `BACKUP_DIR`로 바꿀 수 있다.
- 백업은 2주쯤 남는다(보통 최근 14개). 14일이 넘은 것을 지우는데(`find -mtime +14`), 그날 백업이 성공했을 때만 지운다.
- 끊긴 백업이 남긴 임시 파일(`….sql.gz.tmp`)은 하루가 지나면 다음 백업이 지운다.
- 백업 파일에는 키클락 계정 정보가 들어 있으므로 다른 사람이 읽지 못하게 둔다. 스크립트가 `umask 077`로 만든다.
- 백업은 맥미니 안에만 쌓인다. 가끔 PC로 복사해 둔다(`scp mainserver:chansu-backups/<파일> .`).
- `deploy/.env`는 백업에 들지 않는다. 비밀번호 관리자에 따로 적어 두고, 맥미니에서는 `chmod 600 deploy/.env`로 둔다.

### 매일 백업 설치

launchd가 매일 새벽 3시 30분에 `deploy/backup.sh`를 돌린다. 리포 루트에서 설치한다.

```bash
mkdir -p ~/Library/LaunchAgents
sed "s|__REPO__|$PWD|g; s|__HOME__|$HOME|g" deploy/launchd/com.chansubible.backup.plist > ~/Library/LaunchAgents/com.chansubible.backup.plist
plutil -lint ~/Library/LaunchAgents/com.chansubible.backup.plist
launchctl bootout gui/$(id -u)/com.chansubible.backup 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.chansubible.backup.plist
```

- `plutil`은 `OK`를 내야 한다.
- `bootout`은 전에 설치한 것을 내린다. 처음이면 할 일이 없어 조용히 넘어간다. 다시 설치할 때도 이 다섯 줄을 그대로 돌린다.
- `bootstrap`이 `Bootstrap failed: 5`를 내면 앞의 내리기가 덜 끝났을 수 있다. 잠깐 뒤 그 줄만 다시 돌린다.

설치한 뒤 한 번 바로 돌려 본다.

```bash
launchctl kickstart gui/$(id -u)/com.chansubible.backup
cat ~/Library/Logs/chansu-backup.log
```

- 로그에 `백업: …/chansu-….sql.gz`가 보이면 된다. `ls -lh ~/chansu-backups`로 파일도 본다.
- 상태는 `launchctl print gui/$(id -u)/com.chansubible.backup`으로 본다. `last exit code = 0`이면 지난번 백업이 성공했다.
- launchd는 사용자가 로그인해 있을 때만 돌린다. 그 시각에 맥미니가 잠들어 있었으면 깨어날 때 돈다.
- 시스템 설정 → 일반 → 로그인 항목의 "백그라운드에서 허용"에서 이 항목을 켜 둔다. 꺼 두면 돌지 않는다.

`deploy/backup.sh`는 launchd가 Docker 경로를 몰라도 되게 OrbStack(`~/.orbstack/bin`), Docker Desktop(`~/.docker/bin`, `/usr/local/bin`), Homebrew(`/opt/homebrew/bin`)의 자리를 스스로 PATH에 더한다. 그래도 로그에 `docker: command not found`가 보이면 `command -v docker`로 찾은 폴더를 `~/.bash_profile`의 PATH에 더하고 `kickstart`를 다시 돌려 본다. launchd는 `bash -l`로 돌리므로 `~/.bash_profile`을 읽는다.

### 되살리기

먼저 백업 파일이 멀쩡한지 본다. 아무것도 찍지 않고 끝나면 된다.

```bash
gunzip -t <파일>
```

새 DB 볼륨에 `db`만 띄우고, 키클락과 서버를 띄우기 전에 백업을 넣는다. 키클락이 먼저 뜨면 빈 DB에 자기 표를 만들어 백업과 부딪친다. 새 맥미니나 비어 있는 볼륨에서 하는 일이다.

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d db
docker compose -f deploy/compose.yaml --env-file deploy/.env ps
gunzip -c <파일> | docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T db psql -U chansu -d postgres
docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build
```

- `<파일>`은 `~/chansu-backups/chansu-….sql.gz`다. `ps`에서 `db`가 `(healthy)`가 된 뒤에 넣는다.
- `already exists` 오류가 몇 줄 나와도 된다. 새 DB가 처음 만들 때 이미 만든 `chansu` 역할과 `chansu`·`keycloak` 데이터베이스다.
- 되살리면 `chansu`의 DB 비밀번호도 백업을 만들 때의 값으로 돌아온다. `deploy/.env`의 `DB_PASSWORD`를 그때 값 그대로 두거나, 14절의 `ALTER USER`로 지금 값으로 바꾼다.
- 같은 맥미니에서 DB를 되돌릴 때는 옛 볼륨을 먼저 지워야 한다. 지우면 되돌릴 수 없으니 위의 `gunzip -t`를 먼저 한다.

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env down
docker volume rm chansu-bible-prod_db-data
```

## 13. 로그와 멈추기

```bash
docker compose -f deploy/compose.yaml --env-file deploy/.env logs -f server
docker compose -f deploy/compose.yaml --env-file deploy/.env down
```

- 로그는 `server` 자리에 `keycloak`, `caddy`, `db`를 넣어 볼 수 있다. 서버는 질문과 답을 남기지 않는다.
- `down`은 컨테이너만 지운다. 볼륨은 남는다. 다시 띄울 때는 6절의 `up -d`를 돌린다.
- `down -v`는 DB 볼륨(동기화 기록과 키클락 계정)을 지우므로 쓰지 않는다.

## 14. 문제 해결

- 밖에서 로그인할 때 "HTTPS required"가 나온다: `deploy/.env`의 `PUBLIC_SCHEME`이 `https`인지 본다. 입구가 `PUBLIC_SCHEME` 값을 `X-Forwarded-Proto`로 키클락에 알리기 때문이다. 그다음 Caddy와 키클락 로그를 본다.

  ```bash
  docker compose -f deploy/compose.yaml --env-file deploy/.env logs caddy keycloak
  ```

- 포트가 겹친다: `deploy/.env`의 `PROXY_PORT`(입구, 기본 8443)와 `KC_ADMIN_PORT`(키클락 관리 화면, 기본 8180)를 바꾸고 `up -d`를 다시 돌린다. `PROXY_PORT`를 바꾸면 Funnel도 새 포트로 다시 연다. `KC_ADMIN_PORT`를 바꾸면 `deploy/keycloak-admin.sh <영구 관리자 이름>`을 다시 돌려 관리자 realm의 주소도 새 번호로 바꾸고, 8절의 포트 전달도 새 번호로 한다.
- 키클락 설정을 realm 파일(`deploy/keycloak/chansu-bible-realm.json`)로 다시 넣고 싶다: realm 파일은 realm이 아직 없을 때 처음 한 번만 읽힌다. 고쳐도 이미 만든 realm에는 반영되지 않는다. 관리 화면에서 고친다.
- 사용자가 비밀번호를 잊었다: 메일 서버가 없어 비밀번호 찾기가 꺼져 있다. 관리 화면에서 `chansu-bible` realm의 Users로 그 사용자를 열고, Credentials에서 새 비밀번호를 정해 준다.
- 질문하기가 "질문하기를 지금 쓸 수 없어요"(503)를 낸다: `OPENAI_API_KEY`가 비었거나 책 묶음(`app/public/content`)이 비었다. 키를 채우고 `npm run pipeline -- build`를 돌린 뒤 `deploy/update.sh`로 다시 띄운다.
- `DB_PASSWORD`를 바꾸고 싶다: 처음 띄운 뒤에 `deploy/.env`만 고치면 DB 볼륨 안의 비밀번호는 그대로다. 그러면 서버가 `Postgres(…)에 연결하지 못했습니다`를 내며 계속 다시 시작한다. DB에서 먼저 바꾼 뒤 `deploy/.env`를 고치고 다시 띄운다. 새 값도 `openssl rand -hex 24`로 만든다.

  ```bash
  docker compose -f deploy/compose.yaml --env-file deploy/.env exec db psql -U chansu -c "ALTER USER chansu PASSWORD '<새 비밀번호>'"
  # deploy/.env의 DB_PASSWORD를 새 값으로 고친 뒤
  docker compose -f deploy/compose.yaml --env-file deploy/.env up -d
  ```

- `deploy/update.sh`의 받기(`git pull --ff-only`)가 멈춘다:
  - `Not possible to fast-forward`: 맥미니와 GitHub 양쪽에 서로 없는 커밋이 있다. `git pull --rebase`로 맥미니의 커밋을 GitHub 위로 옮기고 `git push`한 뒤 `deploy/update.sh`를 다시 돌린다.
  - `Your local changes … would be overwritten`: 맥미니에서 고친 파일이 받을 파일과 겹쳤다. 그 파일을 커밋하거나 `git stash`로 치워 두고 다시 돌린다.
  - 브랜치를 main에 합친 뒤에는 `git switch main`으로 바꿔 둔다. 합치고 지운 브랜치에서는 받을 것이 없다.
- 백업 로그에 `docker: command not found`가 보인다: 12절을 본다.

## 15. 도메인으로 옮기기

나중에 도메인을 사면 입구 앞의 Funnel만 Cloudflare 터널로 바꾼다. 바뀌는 것은 `deploy/.env`의 공개 주소와 앱 빌드의 주소다.

1. 도메인을 사서 Cloudflare에 연결하고, 맥미니에 `cloudflared` 터널을 만든다. 터널은 `127.0.0.1:8443`(Caddy)로 보낸다.
2. `deploy/.env`의 `PUBLIC_URL`을 새 주소로 바꾸고 Compose를 다시 띄운다(6절의 `up -d`). 키클락 발급자가 바뀐다.
3. EAS 환경 변수(`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH_ISSUER`)를 새 주소로 바꿔 앱을 다시 빌드한다(9절). 값을 바꿀 때는 `npx eas-cli env:update`를 쓴다.
4. 옛 주소로 받은 토큰은 서버가 받지 않는다. 쓰던 사람은 한 번 다시 로그인한다. 계정과 기록은 그대로다.
5. Funnel을 끈다. `tailscale funnel reset`은 이 맥미니의 Serve·Funnel 설정을 모두 지운다. 다른 서비스가 Funnel을 쓰고 있으면 쓰지 말고, `tailscale funnel --help`로 우리 것만 끄는 방법을 본다.

## 받아들인 위험

- 이메일을 확인하지 않으므로 남의 이메일로도 가입할 수 있다. 서버는 이메일을 쓰지 않는다.
- 키클락의 기본 `admin-cli` 클라이언트로도 비밀번호 로그인이 된다. 그래도 서버는 앱 클라이언트(`chansu-bible-app`)가 받은 토큰(`azp`)만 받고, 로그인 실패를 5번 되풀이하면 키클락이 잠시 막는다.
- 계정 열 개가 하루 20번씩 쓰면 서버 전체 한도(200)가 그날 모두에게 닫힌다. 그러면 `ASK_GLOBAL_DAILY_LIMIT`를 올리거나 가입을 잠시 끈다(키클락 관리 화면 → Realm settings → Login → User registration).
- Funnel은 대역폭에 제한이 있다. 시험 단계에만 쓰고, 사용자가 늘면 15절로 옮긴다.
